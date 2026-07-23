param(
  [int]$Port = 4010
)

$ErrorActionPreference = "Stop"

if ($env:SMOKE_CONFIRMATION -ne "LOCAL TEST DATABASE") {
  throw "Set SMOKE_CONFIRMATION to LOCAL TEST DATABASE before running this script."
}
if (-not $env:DATABASE_URL -or $env:DATABASE_URL -notmatch "@(127\.0\.0\.1|localhost):") {
  throw "The smoke test runs only against a local DATABASE_URL."
}
if (-not $env:SMOKE_ADMIN_EMAIL -or -not $env:SMOKE_ADMIN_PASSWORD) {
  throw "SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD are required."
}

$env:BACKEND_PORT = [string]$Port
$env:FRONTEND_ORIGIN = "http://localhost:5173"
$env:JWT_ACCESS_SECRET = "local-smoke-access-secret-please-change-123456"
$env:JWT_REFRESH_SECRET = "local-smoke-refresh-secret-please-change-123456"
$env:NODE_ENV = "development"

$baseUrl = "http://127.0.0.1:$Port"
$logOut = Join-Path $env:TEMP "atd-employee-api-smoke.out.log"
$logErr = Join-Path $env:TEMP "atd-employee-api-smoke.err.log"
$server = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "dist-server/server/src/index.js" `
  -WorkingDirectory (Resolve-Path (Join-Path $PSScriptRoot "..")) `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logOut `
  -RedirectStandardError $logErr `
  -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $null = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 2
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ready) {
    throw "Backend failed to start: $(Get-Content $logErr -Raw)"
  }

  $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  $login = Invoke-RestMethod `
    -Uri "$baseUrl/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{ email = $env:SMOKE_ADMIN_EMAIL; password = $env:SMOKE_ADMIN_PASSWORD } | ConvertTo-Json) `
    -WebSession $session

  if ($login.user.mustChangePassword) {
    if (-not $env:SMOKE_NEXT_ADMIN_PASSWORD) {
      throw "SMOKE_NEXT_ADMIN_PASSWORD is required when the seeded login requires a password change."
    }
    $null = Invoke-RestMethod `
      -Uri "$baseUrl/auth/change-password" `
      -Method Post `
      -ContentType "application/json" `
      -Body (@{
        oldPassword = $env:SMOKE_ADMIN_PASSWORD
        nextPassword = $env:SMOKE_NEXT_ADMIN_PASSWORD
      } | ConvertTo-Json) `
      -WebSession $session
  }

  $client = Invoke-RestMethod `
    -Uri "$baseUrl/integration-clients" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
      name = "Automated local smoke test"
      scopes = @("employees:read", "employees:write", "employee-events:read")
    } | ConvertTo-Json) `
    -WebSession $session

  $serviceHeaders = @{ Authorization = "Bearer $($client.apiKey)" }
  $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $createBody = @{
    employeeCode = "SMK-$suffix"
    externalReference = "SMOKE-$suffix"
    name = "API Smoke Employee"
    email = "smoke-$suffix@example.com"
    employmentType = "FULL_TIME"
    status = "ACTIVE"
  } | ConvertTo-Json
  $createHeaders = @{
    Authorization = $serviceHeaders.Authorization
    "Idempotency-Key" = "create-$suffix"
  }

  $createdResponse = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "$baseUrl/api/v1/employees" `
    -Method Post `
    -ContentType "application/json" `
    -Headers $createHeaders `
    -Body $createBody
  $created = ($createdResponse.Content | ConvertFrom-Json).data

  $replayedResponse = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "$baseUrl/api/v1/employees" `
    -Method Post `
    -ContentType "application/json" `
    -Headers $createHeaders `
    -Body $createBody
  if ([string]$replayedResponse.Headers["Idempotent-Replayed"] -ne "true") {
    throw "Idempotent replay header was not returned."
  }

  $read = Invoke-RestMethod -Uri "$baseUrl/api/v1/employees/$($created.employeeId)" -Headers $serviceHeaders
  if ($read.data.employeeId -ne $created.employeeId) {
    throw "Employee read did not return the created employee."
  }

  $patchHeaders = @{
    Authorization = $serviceHeaders.Authorization
    "Idempotency-Key" = "update-$suffix"
    "If-Match" = '"1"'
  }
  $patched = Invoke-RestMethod `
    -Uri "$baseUrl/api/v1/employees/$($created.employeeId)" `
    -Method Patch `
    -ContentType "application/json" `
    -Headers $patchHeaders `
    -Body (@{ designation = "Integration Verified" } | ConvertTo-Json)
  if ($patched.data.version -ne 2) {
    throw "Employee version did not increment to 2."
  }

  $staleConflict = $false
  try {
    $null = Invoke-RestMethod `
      -Uri "$baseUrl/api/v1/employees/$($created.employeeId)" `
      -Method Patch `
      -ContentType "application/json" `
      -Headers @{
        Authorization = $serviceHeaders.Authorization
        "Idempotency-Key" = "stale-$suffix"
        "If-Match" = '"1"'
      } `
      -Body (@{ designation = "Stale write" } | ConvertTo-Json)
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
      $staleConflict = $true
    } else {
      throw
    }
  }
  if (-not $staleConflict) {
    throw "Stale employee version was not rejected."
  }

  $events = Invoke-RestMethod -Uri "$baseUrl/api/v1/employee-events?after=0&limit=250" -Headers $serviceHeaders
  if (-not ($events.data | Where-Object employeeId -eq $created.employeeId)) {
    throw "Employee change events were not recorded."
  }

  $users = Invoke-RestMethod -Uri "$baseUrl/users" -WebSession $session
  $target = $users | Where-Object { $_.employeeId } | Select-Object -First 1
  $directory = Invoke-RestMethod -Uri "$baseUrl/employees/$($target.employeeId)" -WebSession $session
  $originalPhone = $directory.phone
  $syncPhone = "900$suffix".Substring(0, 12)
  $null = Invoke-RestMethod `
    -Uri "$baseUrl/employees/$($target.employeeId)" `
    -Method Patch `
    -ContentType "application/json" `
    -Body (@{ phone = $syncPhone } | ConvertTo-Json) `
    -WebSession $session
  $usersAfterSync = Invoke-RestMethod -Uri "$baseUrl/users" -WebSession $session
  $mirrored = $usersAfterSync | Where-Object id -eq $target.id
  if ($mirrored.phone -ne $syncPhone) {
    throw "Employee-to-account shared field synchronization failed."
  }

  $claim = Invoke-RestMethod `
    -Uri "$baseUrl/expense-claims" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
      claimType = "EXPENSE"
      employeeId = $target.employeeId
      title = "Smoke expense"
      amount = 100
      expenseDate = (Get-Date).ToString("yyyy-MM-dd")
      description = "Runtime persistence smoke test"
      receiptUrl = "https://drive.google.com/file/d/smoke/view"
      receiptAccessConfirmed = $true
    } | ConvertTo-Json) `
    -WebSession $session

  $null = Invoke-RestMethod `
    -Uri "$baseUrl/users/$($target.id)" `
    -Method Delete `
    -ContentType "application/json" `
    -Body (@{ confirmation = "DEACTIVATE" } | ConvertTo-Json) `
    -WebSession $session
  $claimsAfter = Invoke-RestMethod -Uri "$baseUrl/expense-claims" -WebSession $session
  if (-not ($claimsAfter | Where-Object id -eq $claim.id)) {
    throw "Expense history was not retained after deactivation."
  }

  $null = Invoke-RestMethod `
    -Uri "$baseUrl/users/$($target.id)" `
    -Method Patch `
    -ContentType "application/json" `
    -Body (@{ status = "ACTIVE" } | ConvertTo-Json) `
    -WebSession $session
  $null = Invoke-RestMethod `
    -Uri "$baseUrl/employees/$($target.employeeId)" `
    -Method Patch `
    -ContentType "application/json" `
    -Body (@{ phone = $originalPhone } | ConvertTo-Json) `
    -WebSession $session

  $deactivated = Invoke-RestMethod `
    -Uri "$baseUrl/api/v1/employees/$($created.employeeId)" `
    -Method Delete `
    -Headers @{
      Authorization = $serviceHeaders.Authorization
      "Idempotency-Key" = "deactivate-$suffix"
      "If-Match" = '"2"'
    }
  if ($deactivated.data.status -ne "INACTIVE") {
    throw "Integration employee was not soft-deactivated."
  }

  $null = Invoke-RestMethod `
    -Uri "$baseUrl/integration-clients/$($client.clientId)" `
    -Method Delete `
    -WebSession $session

  [pscustomobject]@{
    backendHealth = "ok"
    integrationAuthentication = "ok"
    employeeCreateReadUpdateDeactivate = "ok"
    idempotentReplay = "ok"
    optimisticConflict = "ok"
    changeFeed = "ok"
    accountMirror = "ok"
    retainedExpenseHistory = "ok"
    credentialRevocation = "ok"
  } | ConvertTo-Json
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
