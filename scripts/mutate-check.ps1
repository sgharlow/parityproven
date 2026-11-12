# Plant one defect at a time in a source file, run its unit tests, and require them to fail.
# The file is restored after every run (and on error). Usage:
#   pwsh scripts/mutate-check.ps1 -File src/harness/generic/compare.ts -Test src/harness/generic/compare.test.ts -Mutants scripts/mutants-compare.json
# Mutants file: JSON array of { "name": "...", "from": "exact text", "to": "replacement" }.
param([Parameter(Mandatory)][string]$File, [Parameter(Mandatory)][string]$Test, [Parameter(Mandatory)][string]$Mutants)

Set-Location (Split-Path $PSScriptRoot -Parent)
$path = (Resolve-Path $File).Path
$original = [IO.File]::ReadAllText($path)
if (-not (Test-Path $Mutants)) { Write-Error "mutants file not found: $Mutants"; exit 2 }
$list = @(Get-Content $Mutants -Raw | ConvertFrom-Json)
if ($list.Count -eq 0) { Write-Error "no mutants in $Mutants"; exit 2 }
$missed = 0
try {
  foreach ($m in $list) {
    $from = $m.from.Replace("`r`n", "`n")
    if (-not $original.Replace("`r`n", "`n").Contains($from)) { Write-Output "SKIP (text not found): $($m.name)"; $missed++; continue }
    [IO.File]::WriteAllText($path, $original.Replace("`r`n", "`n").Replace($from, $m.to))
    $out = npx vitest run $Test 2>&1 | Out-String
    $failed = [regex]::Match($out, '(\d+) failed').Groups[1].Value
    if ($LASTEXITCODE -ne 0 -and $failed) { Write-Output ("caught   ({0,2} tests failed): {1}" -f $failed, $m.name) }
    else { Write-Output "MISSED: $($m.name)"; $missed++ }
    [IO.File]::WriteAllText($path, $original)
  }
} finally {
  [IO.File]::WriteAllText($path, $original)
}
Write-Output "$($list.Count) planted defects, $missed missed"
if ($missed -gt 0) { exit 1 }
