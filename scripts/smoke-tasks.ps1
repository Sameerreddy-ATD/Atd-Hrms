$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "DATABASE_URL is required." }
if (-not $env:TASK_SMOKE_PASSWORD) { throw "TASK_SMOKE_PASSWORD is required." }

$databaseUri = [uri]$env:DATABASE_URL
$databaseName = $databaseUri.AbsolutePath.TrimStart("/")
if ($databaseUri.Host -notin @("127.0.0.1", "localhost")) {
  throw "Task smoke testing is restricted to localhost."
}
if ($databaseName -notmatch "task_validation") {
  throw "The disposable database name must contain task_validation."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$port = 4012
$baseUrl = "http://127.0.0.1:$port"
$env:BACKEND_PORT = [string]$port
$env:FRONTEND_ORIGIN = "http://127.0.0.1:5173"
$env:JWT_ACCESS_SECRET = "task-validation-access-secret-123456789"
$env:JWT_REFRESH_SECRET = "task-validation-refresh-secret-123456789"
$env:NODE_ENV = "development"

$backend = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "dist-server/server/src/index.js" `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $env:TEMP "task-validation.out.log") `
  -RedirectStandardError (Join-Path $env:TEMP "task-validation.err.log") `
  -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $health = Invoke-RestMethod "$baseUrl/health"
      if ($health.ok) { $ready = $true; break }
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  if (-not $ready) { throw "Validation backend did not become ready." }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod "$baseUrl/auth/login" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      email = "dev@anytimediesel.local"
      password = $env:TASK_SMOKE_PASSWORD
    } | ConvertTo-Json) | Out-Null

  Invoke-RestMethod "$baseUrl/auth/change-password" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{ nextPassword = "TaskValidationPassword7788A" } | ConvertTo-Json) | Out-Null

  $peopleResponse = Invoke-RestMethod "$baseUrl/tasks/assignees" -WebSession $session
  $people = @($peopleResponse | ForEach-Object { $_ })
  if ($people.Count -lt 1) { throw "No active employee is available for assignment." }
  $firstPerson = $people | Select-Object -First 1

  $board = Invoke-RestMethod "$baseUrl/task-boards" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      name = "Validation Workspace"
      description = "Atomic workflow test"
      accessType = "OPEN"
      allowedRoles = @()
      memberEmployeeIds = @()
      stages = @(
        @{ name = "Planned"; color = "SLATE"; status = "TODO" }
        @{ name = "Doing"; color = "BLUE"; status = "IN_PROGRESS" }
        @{ name = "Review"; color = "VIOLET"; status = "REVIEW" }
        @{ name = "Done"; color = "EMERALD"; status = "COMPLETED" }
      )
    } | ConvertTo-Json -Depth 6)

  $task = Invoke-RestMethod "$baseUrl/tasks" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      title = "Validate task persistence"
      description = "Created in a clean database smoke test"
      assigneeEmployeeIds = @($firstPerson.id)
      priority = "HIGH"
      boardId = $board.id
      stageId = $board.stages[0].id
      startDate = "2026-07-22"
      dueDate = "2026-07-23"
    } | ConvertTo-Json -Depth 5)

  if (@($task.assignees).Count -ne 1) {
    throw "Expected exactly one task assignee, but found $(@($task.assignees).Count)."
  }

  $updated = Invoke-RestMethod "$baseUrl/tasks/$($task.id)" `
    -Method Patch `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      version = $task.version
      stageId = $board.stages[1].id
      progress = 30
    } | ConvertTo-Json)

  $conflictStatus = 0
  try {
    Invoke-RestMethod "$baseUrl/tasks/$($task.id)" `
      -Method Patch `
      -WebSession $session `
      -ContentType "application/json" `
      -Body (@{ version = $task.version; progress = 40 } | ConvertTo-Json) | Out-Null
  } catch {
    $conflictStatus = [int]$_.Exception.Response.StatusCode
  }
  if ($conflictStatus -ne 409) { throw "A stale task update did not return HTTP 409." }

  $logged = Invoke-RestMethod "$baseUrl/tasks/$($task.id)/logs" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      version = $updated.version
      message = "Implementation ready for review"
      status = "REVIEW"
      progress = 80
    } | ConvertTo-Json)

  if ($task.status -ne "TODO" -or $updated.status -ne "IN_PROGRESS" -or $logged.status -ne "REVIEW") {
    throw "Task stage and status synchronization failed."
  }
  if ($logged.version -ne 3) { throw "Task optimistic version did not increment correctly." }

  [pscustomobject]@{
    workspace = $board.name
    createdStatus = $task.status
    updatedStatus = $updated.status
    loggedStatus = $logged.status
    finalVersion = $logged.version
    activityCount = $logged.updateCount
    staleWriteHttpStatus = $conflictStatus
  } | ConvertTo-Json
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
