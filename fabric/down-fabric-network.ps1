$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$samplesDir = Join-Path $root "fabric-samples"

if (!(Test-Path $samplesDir)) {
  Write-Host "fabric-samples not found, nothing to stop." -ForegroundColor Yellow
  exit 0
}

Set-Location (Join-Path $samplesDir "test-network")
bash .\network.sh down
Write-Host "Fabric test network stopped." -ForegroundColor Green
