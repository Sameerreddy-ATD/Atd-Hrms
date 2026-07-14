$ErrorActionPreference = "Stop"

$mysqld = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
$mysqladmin = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqladmin.exe"

# Use drive-root mysql-data directory to prevent Windows/InnoDB path comparison bugs
$workspaceDrive = $PSScriptRoot.Substring(0, 1).ToUpper() + ":"
$datadir = Join-Path $workspaceDrive "mysql-data"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectRoot = $projectRoot.Substring(0, 1).ToUpper() + $projectRoot.Substring(1)
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

# Auto-initialize if database files are not present
$needInit = -not (Test-Path (Join-Path $datadir "ibdata1"))
if ($needInit) {
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
$pidFile = Join-Path $datadir "sameerreddy.pid"
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
        throw "Failed to set root password."
      }
      
      $env:SEED_PASSWORD = "5566"
      Write-Host "Deploying migrations..."
      Start-Process -FilePath "npm.cmd" -ArgumentList "run db:deploy" -WorkingDirectory $projectRoot -NoNewWindow -Wait
      Write-Host "Seeding database..."
      Start-Process -FilePath "npm.cmd" -ArgumentList "run db:seed" -WorkingDirectory $projectRoot -NoNewWindow -Wait
    }
    
    Write-Host "MySQL is ready."
    exit 0
  }
}

throw "MySQL did not start listening on port 3306 within 45 seconds."
