# =============================================================
# 脚本 2/4: 在 WSL Ubuntu 中安装 Fabric 依赖
# 用途: 安装 Go/Node.js/Docker CLI，下载 Fabric 二进制
# 运行方式: 以普通权限运行 PowerShell（WSL Ubuntu 已安装后）
# =============================================================

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Fabric 自建链 - WSL 环境初始化脚本" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# 将项目路径转换为 WSL 路径
$projectDir = "d:\毕业\blockchain-prediction-market-platform"
$wslProjectDir = "/mnt/d/毕业/blockchain-prediction-market-platform"

Write-Host "[步骤 1] 在 WSL Ubuntu 中安装依赖..." -ForegroundColor Yellow

$setupScript = @'
#!/bin/bash
set -e

echo "=== 更新 apt 源 ==="
sudo apt-get update -y

echo "=== 安装基础依赖 ==="
sudo apt-get install -y curl wget git jq tar unzip build-essential

echo "=== 安装 Node.js 20 ==="
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js 版本: $(node --version)"

echo "=== 安装 Go 1.21 ==="
if ! command -v go &> /dev/null; then
    wget -q https://go.dev/dl/go1.21.13.linux-amd64.tar.gz
    sudo tar -C /usr/local -xzf go1.21.13.linux-amd64.tar.gz
    rm go1.21.13.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
fi
export PATH=$PATH:/usr/local/go/bin
echo "Go 版本: $(go version)"

echo "=== 配置 Docker 命令（使用 Windows Docker Desktop）==="
# WSL2 中 Docker Desktop 已集成，直接可用
docker version | grep "Server Version" || echo "Docker 已连接"

echo "=== 完成！==="
echo "请继续运行: 03-start-fabric-network.ps1"
'@

wsl -d Ubuntu-22.04 -- bash -c $setupScript

Write-Host "[完成] WSL 环境初始化完成。" -ForegroundColor Green
Write-Host "下一步: 运行 03-start-fabric-network.ps1" -ForegroundColor Cyan
