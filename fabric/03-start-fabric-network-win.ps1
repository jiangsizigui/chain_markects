# ============================================================
# Fabric 自建链 - 纯 Windows 部署脚本（无需 WSL）
# 依赖: Docker Desktop for Windows（已运行）
# 用法: PowerShell> .\fabric\03-start-fabric-network-win.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# 路径配置（Windows 格式）
$PROJ   = "d:\mbd\blockchain-prediction-market-platform"
$TNET   = "d:\mbd\blockchain-prediction-market-platform\fabric-samples\test-network"
$CCPATH = "d:\mbd\blockchain-prediction-market-platform\fabric\chaincode\predictionmarket"
$WALLET = "d:\mbd\blockchain-prediction-market-platform\fabric\wallet"
$CONN   = "d:\mbd\blockchain-prediction-market-platform\fabric\connection-profiles"

# 在运行时动态设置真实路径（避免硬编码 Unicode 路径导致问题）
$PROJ   = $PSScriptRoot | Split-Path -Parent
$TNET   = Join-Path $PROJ "fabric-samples\test-network"
$CCPATH = Join-Path $PROJ "fabric\chaincode\predictionmarket"
$WALLET = Join-Path $PROJ "fabric\wallet"
$CONN   = Join-Path $PROJ "fabric\connection-profiles"

# Docker 路径转换（Windows \d:\... → /d/...）
function dpath([string]$w) {
    $d = $w.Replace("\", "/")
    return "/" + $d[0].ToString().ToLower() + $d.Substring(2)
}

$DTNET   = dpath $TNET
$DCCPATH = dpath $CCPATH
$DCONFIG = dpath (Join-Path $PROJ "fabric-samples\config")

# 输出函数
function OK  ([string]$m) { Write-Host "[OK]  $m" -ForegroundColor Green }
function LOG ([string]$m) { Write-Host "      $m" -ForegroundColor Gray }
function ERR ([string]$m) { Write-Host "[ERR] $m" -ForegroundColor Red; exit 1 }
function STEP([string]$m) { Write-Host "`n>>>  $m" -ForegroundColor Cyan }

# 核心工具函数：写临时 sh 文件 -> docker run -> 读取输出
function DockerBash([string]$Script, [string[]]$Vols, [string]$Img="hyperledger/fabric-peer:2.5", [bool]$UseNet=$true) {
    $sh   = [System.IO.Path]::GetTempFileName() + ".sh"
    $unix = $Script -replace "`r`n","`n"
    [System.IO.File]::WriteAllText($sh, $unix, [System.Text.Encoding]::UTF8)
    $dsh  = dpath $sh
    $run  = @("run","--rm")
    if ($UseNet) { $run += @("--network","fabric_test") }
    foreach ($v in $Vols)  { $run += @("-v",$v) }
    $run += @("-v","${dsh}:/run.sh",$Img,"sh","/run.sh")
    $out = & docker @run 2>&1
    Remove-Item $sh -Force -ErrorAction SilentlyContinue
    return $out
}

# ============================================================
STEP "1/9  检查 Docker"
# ============================================================
$ver = docker version --format "{{.Server.Version}}" 2>&1
if ($LASTEXITCODE -ne 0) { ERR "Docker Desktop 未运行，请先启动" }
OK "Docker $ver"

# ============================================================
STEP "2/9  停止旧网络"
# ============================================================
Set-Location $TNET
docker compose -f compose-ca.yaml -f compose-test-net.yaml down 2>&1 | Out-Null
docker network rm fabric_test 2>&1 | Out-Null
OK "旧网络已清理"

# ============================================================
STEP "3/9  生成通道 Genesis Block"
# ============================================================
New-Item -ItemType Directory -Path (Join-Path $TNET "channel-artifacts") -Force | Out-Null
$blk = Join-Path $TNET "channel-artifacts\mychannel.block"

if (Test-Path $blk) {
    OK "mychannel.block 已存在，跳过生成"
} else {
    LOG "拉取 fabric-tools 镜像..."
    docker pull hyperledger/fabric-tools:2.5 2>&1 | Out-Null

    $s = "configtxgen -profile ChannelUsingRaft -outputBlock /ca/mychannel.block -channelID mychannel --configPath /ctxcfg"
    $out = DockerBash -Script $s -Img "hyperledger/fabric-tools:2.5" -UseNet $false -Vols @(
        "${DTNET}/channel-artifacts:/ca",
        "${DTNET}/configtx:/ctxcfg",
        "${DTNET}/organizations:/orgs"
    )
    if (-not (Test-Path $blk)) { ERR "configtxgen 失败: $($out -join ' ')" }
    OK "mychannel.block 生成成功"
}

# ============================================================
STEP "4/9  启动 Fabric 容器"
# ============================================================
LOG "启动 orderer + 2 peer + 3 CA（首次下载约 5-10 分钟）..."
Set-Location $TNET
docker compose -f compose-ca.yaml -f compose-test-net.yaml up -d

LOG "等待 20 秒..."
Start-Sleep 20

foreach ($c in @("orderer.example.com","peer0.org1.example.com","peer0.org2.example.com","ca_org1","ca_org2","ca_orderer")) {
    $fmt = '{{.State.Running}}'
    $r = docker inspect -f $fmt $c 2>&1
    if ($r -match "true") { LOG "* $c 运行中" }
    else { ERR "$c 未运行: docker logs $c" }
}
OK "所有节点已启动"

# ============================================================
STEP "5/9  Orderer 加入通道"
# ============================================================
$s = @(
    "ORDERER_CA=/orgs/ordererOrganizations/example.com/tls/ca.crt",
    "ORDERER_CERT=/orgs/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt",
    "ORDERER_KEY=/orgs/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.key",
    "osnadmin channel join --channelID mychannel --config-block /ca/mychannel.block -o orderer.example.com:7053 --ca-file `$ORDERER_CA --client-cert `$ORDERER_CERT --client-key `$ORDERER_KEY"
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DTNET}/channel-artifacts:/ca","${DTNET}/organizations:/orgs")
LOG "osnadmin: $($out -join ' ')"
OK "Orderer 加入通道完成"

# ============================================================
STEP "6/9  Peer 加入通道"
# ============================================================
$s1 = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer channel join -b /ca/mychannel.block"
) -join "`n"
$out = DockerBash -Script $s1 -Vols @("${DTNET}/channel-artifacts:/ca","${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org1: $($out -join ' ')"

$s2 = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org2.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org2.example.com:9051",
    "export CORE_PEER_LOCALMSPID=Org2MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer channel join -b /ca/mychannel.block"
) -join "`n"
$out = DockerBash -Script $s2 -Vols @("${DTNET}/channel-artifacts:/ca","${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org2: $($out -join ' ')"
OK "所有节点已加入通道"

# ============================================================
STEP "7/9  安装链码依赖"
# ============================================================
Set-Location $CCPATH
npm install --production 2>&1 | Out-Null
Set-Location $PROJ
OK "链码 npm 依赖安装完成"

# ============================================================
STEP "8/9  打包 / 安装 / 批准 / 提交链码"
# ============================================================

# 8a: 打包
$s = "peer lifecycle chaincode package /cc/predictionmarket.tar.gz --path /chaincode --lang node --label predictionmarket_1.0"
$out = DockerBash -Script $s -Vols @("${DCCPATH}:/chaincode","${DCCPATH}:/cc","${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "打包: $($out -join ' ')"

# 8b: Org1 安装
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer lifecycle chaincode install /cc/predictionmarket.tar.gz"
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DCCPATH}:/cc","${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org1 安装: $($out -join ' ')"

# 8c: Org2 安装
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org2.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org2.example.com:9051",
    "export CORE_PEER_LOCALMSPID=Org2MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer lifecycle chaincode install /cc/predictionmarket.tar.gz"
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DCCPATH}:/cc","${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org2 安装: $($out -join ' ')"

# 8d: 查询 Package ID
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer lifecycle chaincode queryinstalled"
) -join "`n"
$qout = DockerBash -Script $s -Vols @("${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")

$pkgId = ""
foreach ($line in $qout) {
    if ($line -match "(predictionmarket_1\.0:[a-f0-9]+)") { $pkgId = $Matches[1]; break }
}
if (-not $pkgId) { ERR "未提取到 Package ID。queryinstalled 输出:`n$($qout -join [System.Environment]::NewLine)" }
LOG "Package ID: $pkgId"

# 8e: Org1 批准
$approveCmd = "peer lifecycle chaincode approveformyorg -o orderer.example.com:7050 --channelID mychannel --name predictionmarket --version 1.0 --package-id $pkgId --sequence 1 --tls --cafile " + [char]36 + "ORDERER_CA"
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export ORDERER_CA=/orgs/ordererOrganizations/example.com/tls/ca.crt",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    $approveCmd
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org1 批准: $($out -join ' ')"

# 8f: Org2 批准
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org2.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org2.example.com:9051",
    "export CORE_PEER_LOCALMSPID=Org2MSP",
    "export ORDERER_CA=/orgs/ordererOrganizations/example.com/tls/ca.crt",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    $approveCmd
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "Org2 批准: $($out -join ' ')"

# 8g: 提交链码
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export ORDERER_CA=/orgs/ordererOrganizations/example.com/tls/ca.crt",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    ("peer lifecycle chaincode commit -o orderer.example.com:7050 --channelID mychannel --name predictionmarket --version 1.0 --sequence 1 --tls --cafile " + [char]36 + "ORDERER_CA --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles /orgs/peerOrganizations/org1.example.com/tls/ca.crt --peerAddresses peer0.org2.example.com:9051 --tlsRootCertFiles /orgs/peerOrganizations/org2.example.com/tls/ca.crt")
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "提交: $($out -join ' ')"

Start-Sleep 5

# 8h: 验证
$s = @(
    "export CORE_PEER_TLS_ENABLED=true",
    "export CORE_PEER_TLS_ROOTCERT_FILE=/orgs/peerOrganizations/org1.example.com/tls/ca.crt",
    "export CORE_PEER_MSPCONFIGPATH=/orgs/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
    "export CORE_PEER_ADDRESS=peer0.org1.example.com:7051",
    "export CORE_PEER_LOCALMSPID=Org1MSP",
    "export FABRIC_CFG_PATH=/etc/hyperledger/fabric",
    "peer lifecycle chaincode querycommitted --channelID mychannel --name predictionmarket"
) -join "`n"
$out = DockerBash -Script $s -Vols @("${DTNET}/organizations:/orgs","${DCONFIG}:/etc/hyperledger/fabric")
LOG "querycommitted: $($out -join ' ')"
if ($out -match "predictionmarket") { OK "链码验证成功！" }
else { LOG "验证结果不确定，请手动确认" }

# ============================================================
STEP "9/9  导出连接配置 + Wallet"
# ============================================================
New-Item -ItemType Directory -Path $CONN   -Force | Out-Null
New-Item -ItemType Directory -Path $WALLET -Force | Out-Null

$connSrc = Join-Path $TNET "organizations\peerOrganizations\org1.example.com\connection-org1.json"
$connDst = Join-Path $CONN "connection-org1.json"

if (Test-Path $connSrc) {
    Copy-Item -LiteralPath $connSrc -Destination $connDst -Force
    OK "连接配置已复制: $connDst"
} else {
    ERR "未找到连接配置: $connSrc"
}

node (Join-Path $PROJ "fabric\scripts\enrollAdmin-win.js") 2>&1 | Out-Null
OK "Wallet identity 已写入: $WALLET\admin.id"

# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Fabric 网络部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Channel    : mychannel"
Write-Host "  Chaincode  : predictionmarket v1.0"
Write-Host "  Connection : $connDst"
Write-Host "  Wallet     : $WALLET"
Write-Host ""
Write-Host "请编辑 .env 填入以下内容：" -ForegroundColor Yellow
Write-Host "  FABRIC_ENABLED=true"
Write-Host "  FABRIC_CONNECTION_PROFILE=$connDst"
Write-Host "  FABRIC_WALLET_PATH=$WALLET"
Write-Host "  FABRIC_IDENTITY=admin"
Write-Host "  FABRIC_CHANNEL=mychannel"
Write-Host "  FABRIC_CHAINCODE=predictionmarket"
Write-Host ""
Write-Host "停止网络：" -ForegroundColor Gray
Write-Host ("  cd " + $TNET + "; docker compose -f compose-ca.yaml -f compose-test-net.yaml down") -ForegroundColor Gray
