$ErrorActionPreference = "Stop"

if ($env:RESET_SMOKE_CONFIRMATION -ne "DISPOSABLE LOCAL RESET DATABASE") {
  throw "Set RESET_SMOKE_CONFIRMATION=DISPOSABLE LOCAL RESET DATABASE to continue."
}
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required."
}

$databaseUri = [uri]$env:DATABASE_URL
$databaseName = $databaseUri.AbsolutePath.TrimStart("/")
if ($databaseUri.Host -notin @("127.0.0.1", "localhost")) {
  throw "Reset smoke testing is restricted to localhost."
}
if ($databaseName -notmatch "reset_validation") {
  throw "The disposable database name must contain reset_validation."
}
if (-not $env:RESET_SMOKE_SEED_PASSWORD) {
  throw "RESET_SMOKE_SEED_PASSWORD must match the password used to seed the disposable database."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$port = 4011
$baseUrl = "http://127.0.0.1:$port"
$nextPassword = "ResetValidation6677A"

$env:BACKEND_PORT = [string]$port
$env:FRONTEND_ORIGIN = "http://127.0.0.1:5173"
$env:JWT_ACCESS_SECRET = "reset-validation-access-secret-123456789"
$env:JWT_REFRESH_SECRET = "reset-validation-refresh-secret-123456789"
$env:NODE_ENV = "development"

function Get-ApiRowCount($rows) {
  return @($rows | Where-Object { $null -ne $_ }).Count
}

function Get-ApiRows([string]$url, $session) {
  $response = Invoke-WebRequest $url -WebSession $session -UseBasicParsing
  if ($response.Content.Trim() -eq "[]") { return }
  $parsed = $response.Content | ConvertFrom-Json
  foreach ($row in $parsed) { Write-Output $row }
}

$backend = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "dist-server/server/src/index.js" `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $env:TEMP "atd-reset-validation.out.log") `
  -RedirectStandardError (Join-Path $env:TEMP "atd-reset-validation.err.log") `
  -PassThru

try {
  $health = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $health = Invoke-RestMethod "$baseUrl/health"
      if ($health.ok) { break }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $health.ok) { throw "Validation backend did not become ready." }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod "$baseUrl/auth/login" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      email = "dev@anytimediesel.local"
      password = $env:RESET_SMOKE_SEED_PASSWORD
    } | ConvertTo-Json) | Out-Null

  Invoke-RestMethod "$baseUrl/auth/change-password" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{ nextPassword = $nextPassword } | ConvertTo-Json) | Out-Null

  $beforeUsers = @(Get-ApiRows "$baseUrl/users" $session)
  $beforeEmployees = @(Get-ApiRows "$baseUrl/employees" $session)
  $beforeBranches = @(Get-ApiRows "$baseUrl/branches" $session)
  $beforeDepartments = @(Get-ApiRows "$baseUrl/departments" $session)
  $beforeLeaveTypes = @(Get-ApiRows "$baseUrl/leave/types" $session)

  $reset = Invoke-RestMethod "$baseUrl/system/reset-test-data" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      confirmation = "DELETE ALL TEST DATA"
      password = $nextPassword
    } | ConvertTo-Json)

  $me = Invoke-RestMethod "$baseUrl/auth/me" -WebSession $session
  $afterUsers = @(Get-ApiRows "$baseUrl/users" $session)
  $afterEmployees = @(Get-ApiRows "$baseUrl/employees" $session)
  $afterBranches = @(Get-ApiRows "$baseUrl/branches" $session)
  $afterDepartments = @(Get-ApiRows "$baseUrl/departments" $session)
  $afterLeaveTypes = @(Get-ApiRows "$baseUrl/leave/types" $session)

  if ((Get-ApiRowCount $afterUsers) -ne 1) { throw "Expected one preserved Developer Admin login." }
  if ((Get-ApiRowCount $afterEmployees) -ne 0) { throw "Expected seeded employees to be removed." }
  if ((Get-ApiRowCount $afterBranches) -ne (Get-ApiRowCount $beforeBranches)) {
    throw "Branch preservation failed."
  }
  if ((Get-ApiRowCount $afterDepartments) -ne (Get-ApiRowCount $beforeDepartments)) {
    throw "Department preservation failed."
  }
  if ((Get-ApiRowCount $afterLeaveTypes) -ne (Get-ApiRowCount $beforeLeaveTypes)) {
    throw "Leave-policy preservation failed."
  }
  if ($me.user.id -ne $reset.preserved.developerAdminUserId) {
    throw "The acting Developer Admin session did not survive the reset."
  }

  $executiveUnit = $afterDepartments | Where-Object name -eq "Executive Leadership" | Select-Object -First 1
  $primaryBranch = $afterBranches | Select-Object -First 1
  if (-not $executiveUnit -or -not $primaryBranch) {
    throw "Preserved organization setup is incomplete."
  }

  $newUser = Invoke-RestMethod "$baseUrl/users" `
    -Method Post `
    -WebSession $session `
    -ContentType "application/json" `
    -Body (@{
      name = "Real Company CEO"
      email = "real.ceo@validation.local"
      password = "RealCompany5566A"
      departmentId = $executiveUnit.id
      designation = "Chief Executive Officer"
      organizationLevel = "HEAD"
      homeBranchId = $primaryBranch.id
      joiningDate = "2026-07-22"
      attendanceMode = "BOTH"
    } | ConvertTo-Json)

  $finalUsers = @(Get-ApiRows "$baseUrl/users" $session)
  $finalEmployees = @(Get-ApiRows "$baseUrl/employees" $session)

  [pscustomobject]@{
    backendHealth = $health.ok
    sessionSurvivedReset = $true
    before = @{
      users = (Get-ApiRowCount $beforeUsers)
      employees = (Get-ApiRowCount $beforeEmployees)
      branches = (Get-ApiRowCount $beforeBranches)
      departments = (Get-ApiRowCount $beforeDepartments)
      leaveTypes = (Get-ApiRowCount $beforeLeaveTypes)
    }
    deleted = @{
      users = $reset.deletedUsers
      employees = $reset.deletedEmployees
    }
    afterReset = @{
      users = (Get-ApiRowCount $afterUsers)
      employees = 0
      branches = (Get-ApiRowCount $afterBranches)
      departments = (Get-ApiRowCount $afterDepartments)
      leaveTypes = (Get-ApiRowCount $afterLeaveTypes)
    }
    firstRealAccount = @{
      role = $newUser.role
      users = (Get-ApiRowCount $finalUsers)
      employees = (Get-ApiRowCount $finalEmployees)
    }
  } | ConvertTo-Json -Depth 5
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
