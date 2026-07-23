$ErrorActionPreference = "Stop"

$mysqld = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
$mysqladmin = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqladmin.exe"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

# Use drive-root mysql-data directory to prevent Windows/InnoDB path comparison bugs
$workspaceDrive = $PSScriptRoot.Substring(0, 1).ToUpper() + ":"
$datadir = Join-Path $workspaceDrive "mysql-data"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectRoot = $projectRoot.Substring(0, 1).ToUpper() + $projectRoot.Substring(1)
$password = $env:MYSQL_ROOT_PASSWORD

if (-not (Test-Path -LiteralPath $mysqld)) {
  throw "MySQL Server 8.0 was not found at $mysqld"
}
if (-not (Test-Path -LiteralPath $mysqladmin) -or -not (Test-Path -LiteralPath $mysql)) {
  throw "The MySQL 8.0 command-line tools were not found."
}

function Test-MySqlPort {
  return [bool](netstat -an | Select-String "127.0.0.1:3306.*LISTENING")
}

if (Test-MySqlPort) {
  Write-Host "MySQL is already listening on 127.0.0.1:3306."
  exit 0
}

# Auto-initialize if database files are not present
$needInit = -not (Test-Path (Join-Path $datadir "ibdata1"))
if ($needInit) {
  if (-not $password) {
    throw "MYSQL_ROOT_PASSWORD is required when initializing a new local database."
  }
  if (-not $env:SEED_PASSWORD) {
    throw "SEED_PASSWORD is required when initializing and seeding a new local database."
  }
  Write-Host "Initializing clean MySQL database at $datadir..."
  if (-not (Test-Path -Path $datadir)) {
    New-Item -Path $datadir -ItemType Directory -Force | Out-Null
  }
  & $mysqld --no-defaults --initialize-insecure --basedir="C:\Program Files\MySQL\MySQL Server 8.0" --datadir=$datadir --console
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to initialize MySQL database."
  }
}

# Clean stale pid file if exists
$pidFile = Join-Path $datadir "employee-management-mysql.pid"
if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Starting MySQL on 127.0.0.1:3306 using $datadir"
$process = [System.Diagnostics.Process]::new()
$process.StartInfo.FileName = $mysqld
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.CreateNoWindow = $true
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$process.StartInfo.Arguments = @(
  "--no-defaults",
  '--basedir="C:\Program Files\MySQL\MySQL Server 8.0"',
  "--datadir=`"$datadir`"",
  "--port=3306",
  "--bind-address=127.0.0.1",
  "--console"
) -join " "
$process.StartInfo.WorkingDirectory = $datadir
[void]$process.Start()

function Stop-StartedMySqlAndThrow([string]$message) {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  throw $message
}

Start-Sleep -Seconds 2
if ($process.HasExited) {
  $err = $process.StandardError.ReadToEnd()
  $out = $process.StandardOutput.ReadToEnd()
  throw "mysqld exited with code $($process.ExitCode). StdErr: $err. StdOut: $out"
}

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  if (Test-MySqlPort) {
    # If the database was freshly initialized, configure password, migrations, and seed data
    if ($needInit) {
      Write-Host "Fresh database detected. Configuring root password, migrations, and seeding baseline data..."
      Start-Sleep -Seconds 2
      & $mysqladmin --protocol=tcp -h 127.0.0.1 -P 3306 -u root password $password
      if ($LASTEXITCODE -ne 0) {
        Stop-StartedMySqlAndThrow "Failed to set root password."
      }

      & $mysql --protocol=tcp -h 127.0.0.1 -P 3306 -u root "--password=$password" --execute="CREATE DATABASE IF NOT EXISTS anytimediesel_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      if ($LASTEXITCODE -ne 0) {
        Stop-StartedMySqlAndThrow "Failed to create the anytimediesel_hrms database."
      }

      $encodedPassword = [uri]::EscapeDataString($password)
      $env:DATABASE_URL = "mysql://root:$encodedPassword@127.0.0.1:3306/anytimediesel_hrms"
      Write-Host "Deploying migrations..."
      $migrationProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run db:deploy" -WorkingDirectory $projectRoot -NoNewWindow -Wait -PassThru
      if ($migrationProcess.ExitCode -ne 0) {
        Stop-StartedMySqlAndThrow "Migration deployment failed with exit code $($migrationProcess.ExitCode)."
      }
      Write-Host "Seeding database..."
      $seedProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run db:seed" -WorkingDirectory $projectRoot -NoNewWindow -Wait -PassThru
      if ($seedProcess.ExitCode -ne 0) {
        Stop-StartedMySqlAndThrow "Database seeding failed with exit code $($seedProcess.ExitCode)."
      }
    }
    
    Write-Host "MySQL is ready."
    exit 0
  }
}

throw "MySQL did not start listening on port 3306 within 45 seconds."
