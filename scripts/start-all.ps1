$ErrorActionPreference = "Stop"

# 1. Start MySQL database
Write-Host "Checking MySQL database..."
try {
    & (Join-Path $PSScriptRoot "start-mysql.ps1")
} catch {
    Write-Warning "Failed to start MySQL automatically: $_"
    Write-Warning "Attempting to continue anyway..."
}

# 2. Start Dev Servers
Write-Host "Starting development servers..."
npx concurrently "npm run dev" "npm run dev:backend"
