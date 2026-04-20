#!/bin/bash
# =============================================================
# enrollAdmin.js 的 bash 预处理 + 管理员注册脚本
# 在部署脚本中自动调用
# =============================================================

set -e

PROJECT_DIR="/mnt/d/毕业/blockchain-prediction-market-platform"
TEST_NETWORK="$PROJECT_DIR/fabric-samples/test-network"
WALLET_DIR="$PROJECT_DIR/fabric/wallet"

mkdir -p "$WALLET_DIR"

# 直接从 test-network 的 MSP 目录复制管理员凭证到 wallet 目录
# （使用文件系统 wallet，无需 CA 注册）
ORG1_MSP="$TEST_NETWORK/organizations/peerOrganizations/org1.example.com"

CERT="$ORG1_MSP/users/Admin@org1.example.com/msp/signcerts/cert.pem"
KEY=$(ls "$ORG1_MSP/users/Admin@org1.example.com/msp/keystore/"*_sk 2>/dev/null | head -1)

if [ -z "$KEY" ]; then
    KEY=$(ls "$ORG1_MSP/users/Admin@org1.example.com/msp/keystore/" | head -1)
    KEY="$ORG1_MSP/users/Admin@org1.example.com/msp/keystore/$KEY"
fi

# 写入 fabric-network 格式的 wallet identity 文件
IDENTITY_FILE="$WALLET_DIR/admin.id"
cat > "$IDENTITY_FILE" <<EOF
{
    "credentials": {
        "certificate": $(cat "$CERT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
        "privateKey": $(cat "$KEY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
    },
    "mspId": "Org1MSP",
    "type": "X.509",
    "version": 1
}
EOF

echo "  ✓ 管理员身份已写入: $IDENTITY_FILE"
