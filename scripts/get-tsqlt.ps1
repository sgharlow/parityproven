# Download the pinned tSQLt release from tsqlt.org, check its SHA-256, and extract it to .tmp/tsqlt/<version>/.
# tSQLt is Apache-2.0 (see THIRD-PARTY-NOTICES.md). It has no GitHub release asset; tsqlt.org is the official download.
# The pin also lives in src/cli/agreed-tests.ts (TSQLT); keep the two in step.
$ErrorActionPreference = 'Stop'
$version = 'V1.0.8083.3529'
$url = 'https://tsqlt.org/wp-content/uploads/dlm_uploads/2015/07/tSQLt_V1.0.8083.3529.zip'
$sha256 = 'AF841F357DD9189F8B197C34C5014FE0DBABD3BE34B024ED46967DAFE13D4F50'

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root '.tmp/tsqlt'
$zip = Join-Path $dir "tSQLt_$version.zip"
$out = Join-Path $dir $version
New-Item -ItemType Directory -Force -Path $dir | Out-Null

if (-not (Test-Path $zip)) {
    Write-Output "downloading tSQLt $version from $url"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
}
$actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
if ($actual -ne $sha256) {
    Remove-Item $zip
    throw "tSQLt zip SHA-256 is $actual, pinned $sha256. The file was deleted; do not use it."
}
Expand-Archive -Path $zip -DestinationPath $out -Force
Write-Output "tSQLt $version ready in $out (sha256 $actual)"
