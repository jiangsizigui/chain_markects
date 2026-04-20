#!/bin/bash
# =============================================================
# 脚本 3/4: 启动 Fabric test-network 并部署链码
# 用途: 在 WSL Ubuntu 中启动 Docker 节点网络，部署 predictionmarket 链码
# 运行方式: 在 WSL Ubuntu 中执行（或通过 04-deploy.ps1 调用）
# =============================================================

set -e

# ---- 路径配置 ----
# WSL 中访问 Windows 路径（根据实际用户名调整）
PROJECT_DIR="/mnt/d/毕业/blockchain-prediction-market-platform"
FABRIC_SAMPLES="$PROJECT_DIR/fabric-samples"
TEST_NETWORK="$FABRIC_SAMPLES/test-network"
CHAINCODE_SRC="$PROJECT_DIR/fabric/chaincode/predictionmarket"

echo "======================================="
echo " Fabric 自建链 - 网络启动 & 链码部署"
echo "======================================="

# ---- 1. 检查依赖 ----
echo "[1/7] 检查依赖..."
command -v docker >/dev/null || { echo "错误: docker 未安装"; exit 1; }
command -v node   >/dev/null || { echo "错误: node 未安装"; exit 1; }
docker info >/dev/null 2>&1  || { echo "错误: Docker daemon 未运行，请启动 Docker Desktop"; exit 1; }
echo "  ✓ Docker $(docker version --format '{{.Server.Version}}')"
echo "  ✓ Node $(node --version)"

# ---- 2. 下载 Fabric 二进制 ----
echo "[2/7] 检查 Fabric 二进制..."
if [ ! -f "$FABRIC_SAMPLES/bin/peer" ]; then
    echo "  下载 Fabric 2.5 二进制和 Docker 镜像（首次约需 5-10 分钟）..."
    cd "$FABRIC_SAMPLES"
    # 使用 install-fabric.sh 下载（已在 fabric-samples 中）
    chmod +x install-fabric.sh
    ./install-fabric.sh --fabric-version 2.5.15 binary docker
else
    echo "  ✓ Fabric 二进制已存在"
fi

export PATH="$FABRIC_SAMPLES/bin:$PATH"
export FABRIC_CFG_PATH="$FABRIC_SAMPLES/config"

# ---- 3. 停止旧网络 ----
echo "[3/7] 停止旧网络（如有）..."
cd "$TEST_NETWORK"
./network.sh down 2>/dev/null || true
echo "  ✓ 旧网络已清理"

# ---- 4. 启动网络 ----
echo "[4/7] 启动 Fabric test-network (2 org + 1 orderer + CA)..."
./network.sh up createChannel -c mychannel -ca
echo "  ✓ 网络已启动，通道 mychannel 已创建"

# ---- 5. 安装链码依赖 ----
echo "[5/7] 准备链码..."
cd "$CHAINCODE_SRC"
npm install --production
echo "  ✓ 链码依赖安装完成"

# ---- 6. 部署链码 ----
echo "[6/7] 部署 predictionmarket 链码..."
cd "$TEST_NETWORK"
./network.sh deployCC \
    -ccn predictionmarket \
    -ccp "$CHAINCODE_SRC" \
    -ccl javascript \
    -c mychannel

echo "  ✓ 链码部署成功"

# ---- 7. 注册应用用户 & 导出连接配置 ----
echo "[7/7] 导出连接配置..."

WALLET_DIR="$PROJECT_DIR/fabric/wallet"
CONN_PROFILE_DIR="$PROJECT_DIR/fabric/connection-profiles"
mkdir -p "$WALLET_DIR" "$CONN_PROFILE_DIR"

# 复制 test-network 的连接配置
cp "$TEST_NETWORK/organizations/peerOrganizations/org1.example.com/connection-org1.json" \
   "$CONN_PROFILE_DIR/connection-org1.json" 2>/dev/null || \
cp "$TEST_NETWORK/organizations/peerOrganizations/org1.example.com/connection-org1.yaml" \
   "$CONN_PROFILE_DIR/connection-org1.yaml" 2>/dev/null || true

# 导出 Org1 CA 管理员证书到 wallet
node "$PROJECT_DIR/fabric/scripts/enrollAdmin.js"

echo ""
echo "======================================="
echo "  ✅ Fabric 网络部署完成！"
echo "======================================="
echo ""
echo "  Channel:   mychannel"
echo "  Chaincode: predictionmarket"
echo "  Org:       Org1MSP"
echo ""
echo "  连接配置: $CONN_PROFILE_DIR/connection-org1.json"
echo "  钱包路径: $WALLET_DIR"
echo ""
echo "  接下来请将以下内容填入 .env 文件："
echo "    FABRIC_ENABLED=true"
echo "    FABRIC_CONNECTION_PROFILE=$CONN_PROFILE_DIR/connection-org1.json"
echo "    FABRIC_WALLET_PATH=$WALLET_DIR"
echo "    FABRIC_IDENTITY=admin"
echo "    FABRIC_CHANNEL=mychannel"
echo "    FABRIC_CHAINCODE=predictionmarket"
echo ""
