$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$samplesDir = Join-Path $root "fabric-samples"

if (!(Test-Path $samplesDir)) {
  git clone https://github.com/hyperledger/fabric-samples.git $samplesDir
}

Set-Location $samplesDir

if (Test-Path ".\scripts\bootstrap.sh") {
  bash .\scripts\bootstrap.sh
} else {
  Write-Host "bootstrap.sh not found in fabric-samples/scripts" -ForegroundColor Red
  exit 1
}

Set-Location ".\test-network"
bash .\network.sh down
bash .\network.sh up createChannel -ca

Write-Host "Fabric test network is up (mychannel)." -ForegroundColor Green
