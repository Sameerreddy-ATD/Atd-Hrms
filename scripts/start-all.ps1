$ErrorActionPreference = "Stop"

# 1. Start MySQL database
Write-Host "Checking MySQL database..."
& (Join-Path $PSScriptRoot "start-mysql.ps1")

# 2. Start Dev Servers
Write-Host "Starting development servers..."
npx concurrently "npm run dev" "npm run dev:backend"
