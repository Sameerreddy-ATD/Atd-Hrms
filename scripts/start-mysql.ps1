$ErrorActionPreference = "Stop"

$mysqld = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
$mysqladmin = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqladmin.exe"
$datadir = Resolve-Path (Join-Path $PSScriptRoot "..\.mysql-data-clean")
$password = if ($env:MYSQL_ROOT_PASSWORD) { $env:MYSQL_ROOT_PASSWORD } else { "5566" }

if (-not (Test-Path -LiteralPath $mysqld)) {
  throw "MySQL Server 8.0 was not found at $mysqld"
}

function Test-MySqlPort {
  return [bool](netstat -an | Select-String "127.0.0.1:3306.*LISTENING")
}

if (Test-MySqlPort) {
  Write-Host "MySQL is already listening on 127.0.0.1:3306."
  exit 0
}

if (-not (Test-Path -LiteralPath $datadir)) {
  throw "MySQL data directory was not found at $datadir."
}

# Broken local startups can leave orphan undo files that prevent MySQL from booting again.
$staleUndoFiles = @(
  "undo_002",
  "undo_1_trunc.log",
  "undo_2_trunc.log",
  "sameerreddy.pid"
)
foreach ($file in $staleUndoFiles) {
  $path = Join-Path $datadir $file
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Starting MySQL on 127.0.0.1:3306 using $datadir"
Start-Process -FilePath $mysqld -ArgumentList @(
  "--no-defaults",
  "--basedir=C:\Program Files\MySQL\MySQL Server 8.0",
  "--datadir=$datadir",
  "--port=3306",
  "--bind-address=127.0.0.1",
  "--console"
) -WindowStyle Minimized

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  if (Test-MySqlPort) {
    if (Test-Path -LiteralPath $mysqladmin) {
      & $mysqladmin --protocol=tcp -h 127.0.0.1 -P 3306 -u root "-p$password" ping *> $null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "MySQL is ready."
        exit 0
      }
    } else {
      Write-Host "MySQL is ready."
      exit 0
    }
  }
}

throw "MySQL did not start listening on port 3306 within 45 seconds."
