param(
  [string]$PostgresPassword = "5566",
  [string]$MySqlPassword = "5566"
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\15\bin\psql.exe"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$database = "anytimediesel_hrms"
$env:PGPASSWORD = $PostgresPassword

if (-not (Test-Path -LiteralPath $psql)) { throw "PostgreSQL client was not found." }
if (-not (Test-Path -LiteralPath $mysql)) { throw "MySQL client was not found." }

function Invoke-Postgres([string]$query) {
  $result = & $psql -X -q -A -t -h 127.0.0.1 -p 5432 -U postgres -d $database -c $query
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL command failed." }
  return @($result)
}

function Invoke-MySql([string]$query) {
  if ($query.Length -gt 7000) {
    $batchFile = Join-Path $PSScriptRoot ".mysql-migration-batch.sql"
    [IO.File]::WriteAllText($batchFile, $query, [Text.UTF8Encoding]::new($false))
    $sourcePath = $batchFile.Replace("\", "/")
    $result = & $mysql --batch --skip-column-names --protocol=tcp -h 127.0.0.1 -P 3306 -u root "-p$MySqlPassword" $database -e "source $sourcePath"
  } else {
    $result = & $mysql --batch --skip-column-names --protocol=tcp -h 127.0.0.1 -P 3306 -u root "-p$MySqlPassword" $database -e $query
  }
  if ($LASTEXITCODE -ne 0) { throw "MySQL command failed." }
  return @($result)
}

function Convert-ToMySqlLiteral($value) {
  if ($null -eq $value) { return "NULL" }
  if ($value -is [bool]) { return $(if ($value) { "1" } else { "0" }) }
  if ($value -is [byte] -or $value -is [int16] -or $value -is [int32] -or
      $value -is [int64] -or $value -is [decimal] -or $value -is [double] -or
      $value -is [single]) {
    return [Convert]::ToString($value, [Globalization.CultureInfo]::InvariantCulture)
  }
  if ($value -is [System.Collections.IEnumerable] -and $value -isnot [string]) {
    $value = ConvertTo-Json -InputObject $value -Compress -Depth 50
  } elseif ($value -is [pscustomobject]) {
    $value = ConvertTo-Json -InputObject $value -Compress -Depth 50
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes("$value")
  $hex = ([BitConverter]::ToString($bytes)).Replace("-", "")
  if ($hex.Length -eq 0) { return "''" }
  return "CONVERT(0x$hex USING utf8mb4)"
}

$tables = Invoke-Postgres @"
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
ORDER BY tablename;
"@

if ($tables.Count -eq 0) { throw "No PostgreSQL application tables were found." }

$nonEmptyTargets = @()
foreach ($table in $tables) {
  $targetCount = [int]((Invoke-MySql "SELECT COUNT(*) FROM ``$table``;" | Select-Object -First 1))
  if ($targetCount -ne 0) { $nonEmptyTargets += $table }
}
if ($nonEmptyTargets.Count -gt 0) {
  throw "MySQL target tables are not empty: $($nonEmptyTargets -join ', ')"
}

$sourceCounts = @{}
foreach ($table in $tables) {
  $rows = Invoke-Postgres "SELECT row_to_json(source_row)::text FROM (SELECT * FROM `"$table`") source_row;"
  $sourceCounts[$table] = $rows.Count
  if ($rows.Count -eq 0) {
    Write-Host "Skipping empty table $table"
    continue
  }

  $statements = [Collections.Generic.List[string]]::new()
  $statements.Add("SET FOREIGN_KEY_CHECKS=0")
  foreach ($json in $rows) {
    $row = $json | ConvertFrom-Json
    $properties = @($row.PSObject.Properties)
    $columns = ($properties | ForEach-Object { "``$($_.Name)``" }) -join ","
    $values = ($properties | ForEach-Object {
      if ($null -eq $_.Value) { "NULL" } else { Convert-ToMySqlLiteral ($_.Value) }
    }) -join ","
    $statements.Add("INSERT INTO ``$table`` ($columns) VALUES ($values)")
  }
  $statements.Add("SET FOREIGN_KEY_CHECKS=1")
  Invoke-MySql (($statements -join ";") + ";") | Out-Null
  Write-Host "Imported $($rows.Count) rows into $table"
}

$mismatches = @()
foreach ($table in $tables) {
  $targetCount = [int]((Invoke-MySql "SELECT COUNT(*) FROM ``$table``;" | Select-Object -First 1))
  if ($targetCount -ne $sourceCounts[$table]) {
    $mismatches += "$table (PostgreSQL=$($sourceCounts[$table]), MySQL=$targetCount)"
  }
}
if ($mismatches.Count -gt 0) {
  throw "Row-count verification failed: $($mismatches -join '; ')"
}

Write-Host "Migration complete. All $($tables.Count) table counts match."
