$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL -or $env:DATABASE_URL -notmatch "@(127\.0\.0\.1|localhost):") {
  throw "UI verification runs only with a local DATABASE_URL."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:BACKEND_PORT = "4000"
$env:FRONTEND_ORIGIN = "http://127.0.0.1:5173"
$env:VITE_API_BASE_URL = "http://127.0.0.1:4000"
$env:JWT_ACCESS_SECRET = "local-browser-access-secret-please-change-123456"
$env:JWT_REFRESH_SECRET = "local-browser-refresh-secret-please-change-123456"
$env:NODE_ENV = "development"

$backend = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "dist-server/server/src/index.js" `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $env:TEMP "atd-browser-backend.out.log") `
  -RedirectStandardError (Join-Path $env:TEMP "atd-browser-backend.err.log") `
  -PassThru

$frontend = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173" `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $env:TEMP "atd-browser-frontend.out.log") `
  -RedirectStandardError (Join-Path $env:TEMP "atd-browser-frontend.err.log") `
  -PassThru

Start-Sleep -Seconds 3
$health = Invoke-RestMethod "http://127.0.0.1:4000/health"
$frontendResponse = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173"

[pscustomobject]@{
  backendPid = $backend.Id
  frontendPid = $frontend.Id
  backendReady = $health.ok
  frontendStatus = $frontendResponse.StatusCode
} | ConvertTo-Json
