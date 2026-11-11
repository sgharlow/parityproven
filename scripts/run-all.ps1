# Re-run converted objects, one at a time, with a hard per-object time limit.
# Keeps Docker load to a single object at a time. Writes a one-line summary per object.
#   pwsh scripts/run-all.ps1 [-LimitSeconds 300] [-Only "A.b,C.d"] [-From "Schema.Name"]
# node is started directly and killed by process id on timeout (Stop-Job does not stop a native child).
param([int]$LimitSeconds = 300, [string]$Only = "", [string]$From = "")

Set-Location (Split-Path $PSScriptRoot -Parent)
$objects = @(node -e "import('./dist/conversions/specs.js').then(m => console.log(m.SPECS.map(s => s.schema + '.' + s.name).join('\n')))")
if ($Only) { $want = $Only -split ','; $objects = @($objects | Where-Object { $want -contains $_ }) }
if ($From) { $i = [Array]::IndexOf($objects, $From); if ($i -ge 0) { $objects = $objects[$i..($objects.Count - 1)] } }

$tmp = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$summary = Join-Path $tmp "run-all-summary.txt"
"started $(Get-Date -Format o)  ($($objects.Count) objects, limit $LimitSeconds s each)" | Set-Content $summary

foreach ($o in $objects) {
  $log = Join-Path $tmp "run-$o.log"
  $p = Start-Process -FilePath "node" -ArgumentList @("dist/cli/convert.js", "--object", $o) -NoNewWindow -PassThru `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  $done = $p.WaitForExit($LimitSeconds * 1000)
  if (-not $done) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
  $out = @(Get-Content $log -ErrorAction SilentlyContinue) + @(Get-Content "$log.err" -ErrorAction SilentlyContinue)
  $final = ($out | Where-Object { $_ -match '^final:' }) -join ' '
  $rt = ($out | Where-Object { $_ -match '^runtime:' }) -join ' '
  $pair = ($out | Where-Object { $_ -match '^pair record' }) -join ' '
  $bad = ($out | Where-Object { $_ -match 'NOT DETECTED|vacuous|rror:|MISMATCH|no planted' } | Select-Object -First 1)
  $state = if (-not $done) { "TIMEOUT" } else { "exit $($p.ExitCode)" }
  Add-Content $summary ("{0} | {1} | {2} | {3} | {4} {5}" -f $o, $state, $final, $rt, $pair, $bad)
}
"finished $(Get-Date -Format o)" | Add-Content $summary
