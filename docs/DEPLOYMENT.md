# 🚀 区块链预测市场平台 - 完整部署指南

## 📋 目录

1. [快速开始](#快速开始)
2. [环境配置](#环境配置)
3. [智能合约部署](#智能合约部署)
4. [启动平台](#启动平台)
5. [可选组件](#可选组件)
6. [生产环境](#生产环境)
7. [常见问题](#常见问题)

---

## 快速开始

### 方式一：一键启动（推荐）

```powershell
# 1. 克隆项目
git clone <your-repo-url>
cd blockchain-prediction-market-platform

# 2. 安装依赖
npm install

# 3. 复制环境配置
copy .env.example .env

# 4. 启动开发服务器
node server.ts
```

访问 http://localhost:3000

### 方式二：Docker 启动（计划中）

```powershell
docker-compose up -d
```

---

## 环境配置

### 1. 复制配置模板

```powershell
copy .env.example .env
```

### 2. 配置必要参数

编辑 `.env` 文件，填入实际值：

#### 必须配置

| 参数 | 说明 | 获取方式 |
|------|------|----------|
| `PRIVATE_KEY` | 钱包私钥（测试网用） | MetaMask → 账户详情 → 导出私钥 |
| `GEMINI_API_KEY` | AI 审核/结算功能 | [Google AI Studio](https://aistudio.google.com/app/apikey) |

#### 可选配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `FABRIC_ENABLED` | 启用 Fabric 账本 | `false`（使用本地 SQLite） |
| `ADMIN_SECRET` | 管理员密钥 | `admin123` |

### 3. 获取免费 API Key

#### Polygon Mumbai 测试网 RPC（免费）
```
https://rpc-mumbai.maticvigil.com
# 或
https://rpc.ankr.com/polygon_mumbai
```

#### Gemini API Key（免费额度）
1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 点击 "Create API Key"
3. 复制生成的 Key

---

## 智能合约部署

### 1. 安装 Hardhat（如果还没有）

```powershell
npm install --save-dev hardhat
npx hardhat init
```

### 2. 配置 .env

确保 `.env` 文件中有：
```env
PRIVATE_KEY=your_test_wallet_private_key
POLYGON_MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com
```

### 3. 部署到 Polygon Mumbai 测试网

```powershell
# 切换到项目目录
cd d:\毕业\blockchain-prediction-market-platform

# 部署合约
npx hardhat run scripts/deploy.js --network mumbai
```

### 4. 更新前端配置

部署脚本会输出合约地址，更新 `.env`：

```env
REACT_APP_PMT_TOKEN_ADDRESS=0x...  # 输出的 PMT 代币地址
REACT_APP_PREDICTION_MARKET_ADDRESS=0x...  # 输出的市场合约地址
```

### 5. 验证合约

在 [PolygonScan Mumbai](https://mumbai.polygonscan.com/) 搜索合约地址验证。

---

## 启动平台

### 开发模式

```powershell
# 启动后端 + 前端开发服务器
node server.ts
```

访问 http://localhost:3000

### 生产模式

```powershell
# 1. 构建前端
npm run build

# 2. 设置生产环境
set NODE_ENV=production

# 3. 启动服务器
node server.ts
```

---

## 可选组件

### Fabric 账本（高级）

#### 启动本地 Fabric 网络

```powershell
# 确保已安装 Docker Desktop
cd fabric

# 启动网络
./setup-fabric-network.ps1

# 停止网络
./down-fabric-network.ps1
```

#### 配置 Fabric

```env
FABRIC_ENABLED=true
FABRIC_CONNECTION_PROFILE=D:\path\to\connection-org1.json
FABRIC_WALLET_PATH=./fabric/wallet
FABRIC_IDENTITY=appUser
FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=predictionmarket
```

> **注意**：Fabric 网络需要完整的 Docker 环境，配置较复杂。日常开发建议使用 Mock 模式（`FABRIC_ENABLED=false`）。

### AI 联网检索（高级）

用于 AI 自动结算时联网检索事件结果：

```env
# Tavily（推荐，免费额度）
TAVILY_API_KEY=your_tavily_key

# 或 SerpAPI
SERPAPI_API_KEY=your_serpapi_key
```

---

## 生产环境

### 1. 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 20 GB SSD | 50 GB SSD |
| 操作系统 | Ubuntu 20.04+ / Windows Server 2019+ | Ubuntu 22.04 |

### 2. 环境变量

```env
# 生产环境必须配置
NODE_ENV=production
PORT=3000

# 区块链
PRIVATE_KEY=production_wallet_private_key
POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com

# AI
GEMINI_API_KEY=your_production_gemini_key

# 安全
ADMIN_SECRET=strong_random_secret_here
```

### 3. 使用 PM2 管理进程

```powershell
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server.ts --name prediction-market

# 查看状态
pm2 status

# 查看日志
pm2 logs prediction-market

# 重启
pm2 restart prediction-market
```

### 4. Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. SSL 证书（Let's Encrypt）

```powershell
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com
```

---

## 常见问题

### Q1: Python 分析服务报错？

**分析.py** 使用纯 Python 标准库，不需要额外安装依赖。如果遇到问题：
```powershell
# 验证 Python 环境
python --version

# 测试分析脚本
echo '{"model":"arima","data":[0.5,0.6,0.55,0.65,0.7],"horizon":5}' | python analysis.py
```

### Q2: Fabric 连接失败？

默认使用 Mock 模式，无需配置 Fabric。如果需要真实 Fabric：
```powershell
# 启动本地 Fabric 网络
cd fabric
./setup-fabric-network.ps1
```

### Q3: 区块链交易失败？

1. 检查钱包余额（测试网需要 MATIC 作为 Gas）
2. 获取测试 MATIC：https://mumbaifaucet.com/
3. 检查 RPC 是否可用

### Q4: AI 功能不可用？

1. 确认已配置 `GEMINI_API_KEY`
2. 检查 API Key 是否有额度
3. 在管理员平台启用 AI Provider

### Q5: 端口被占用？

修改 `.env` 中的端口：
```env
PORT=3001
```

### Q6: 如何重置所有数据？

使用管理员 API：
```powershell
curl -X POST http://localhost:3000/api/admin/bootstrap/reset-all
```

---

## 📞 技术支持

- **GitHub Issues**: https://github.com/your-repo/issues
- **文档**: https://github.com/your-repo/wiki

---

## 📝 部署清单

部署前请确认以下项目：

- [ ] 已安装 Node.js 18+
- [ ] 已安装 Python 3.8+（可选，用于高级分析）
- [ ] 已配置 `.env` 文件
- [ ] 已安装 npm 依赖
- [ ] （可选）已部署智能合约
- [ ] （可选）已配置 AI API Key
- [ ] 已启动服务器
- [ ] 已验证平台功能

---

**版本**: 1.0.0  
**最后更新**: 2026-04-14
