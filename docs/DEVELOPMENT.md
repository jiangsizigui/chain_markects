# 区块链预测市场平台 - 开发与测试过程文档

> 文档版本：v2.0  
> 创建日期：2026-04-15  
> 最后更新：2026-04-15（自建链方案更新）

---

## 目录

1. [开发环境准备](#1-开发环境准备)
2. [项目启动测试](#2-项目启动测试)
3. [Python 分析服务测试](#3-python-分析服务测试)
4. [Hyperledger Fabric 自建链部署](#4-hyperledger-fabric-自建链部署)
5. [智能合约（参考用）](#5-智能合约参考用)
6. [前端功能验证](#6-前端功能验证)
7. [已知问题与解决方案](#7-已知问题与解决方案)

---

## 1. 开发环境准备

### 1.1 系统要求

| 组件 | 最低要求 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Node.js | v18.0.0 | v20.x LTS | 项目实测 v22.12.0 |
| npm | 9.0.0 | 10.x | — |
| Python | 3.9 | 3.11+ | 项目实测 3.13.3 |
| Docker Desktop | 24.x | 29.x | 项目实测 29.2.1 |
| Git | 2.30 | 最新版 | — |
| WSL Ubuntu | — | 22.04 LTS | Fabric 脚本必须在 WSL 中运行 |

### 1.2 安装依赖

```powershell
# 安装 Node.js 依赖
cd d:\毕业\blockchain-prediction-market-platform
npm install

# Python 依赖（可选，用于高级分析功能）
pip install -r requirements.txt
```

### 1.3 环境配置

```powershell
copy .env.example .env
```

核心配置项（`.env`）：

```env
PORT=3000
NODE_ENV=development
ADMIN_SECRET=admin123

# Fabric 自建链（默认 Mock 模式，部署后改为 true）
FABRIC_ENABLED=false
```

---

## 2. 项目启动测试

### 2.1 启动服务器

```powershell
npx tsx server.ts
```

### 2.2 验证服务

| 服务 | 地址 | 预期状态 |
|------|------|----------|
| 前端界面 | http://localhost:3000 | ✅ 主界面 |
| API | http://localhost:3000/api/markets | ✅ JSON 数据 |
| Fabric 状态 | http://localhost:3000/api/ledger/status | ✅ mockMode:true |

### 2.3 正常启动日志

```
[服务器] 服务器运行在 http://localhost:3000
[数据库] SQLite 初始化完成
[Fabric] 运行在 Mock 模式（使用本地 SQLite 存储）
[WebSocket] 广播服务已启动 (interval: 1500ms)
```

---

## 3. Python 分析服务测试

### 3.1 概述

`analysis.py` 使用**纯 Python 标准库**，**无需安装任何外部依赖**。

### 3.2 支持的模型

| 模型 | 功能 | 依赖 |
|------|------|------|
| arima | 时间序列趋势预测 | 无 |
| linear_regression | 线性回归分析 | 无 |
| bayesian | 贝叶斯概率更新 | 无 |
| sentiment | 市场情绪分析 | 无 |
| kmeans | K-Means 聚类 | 无 |
| garch | 波动率分析 | 无 |
| mispricing | 定价偏差检测 | 无 |
| correlation | 相关性分析 | 无 |

### 3.3 测试命令（Windows PowerShell）

> **注意**：Windows PowerShell 管道对 JSON 字符串有兼容性问题，推荐用 `-c` 直接调用。

```powershell
# 情绪分析 ✅ 已验证
python -c "from analysis import model_sentiment; import json; print(json.dumps(model_sentiment({'buy_volume':1200,'sell_volume':800}), ensure_ascii=False))"

# ARIMA 预测 ✅ 已验证
python -c "from analysis import model_arima; import json; print(json.dumps(model_arima({'data':[0.63,0.64,0.62,0.66,0.67,0.68,0.70],'horizon':12}), ensure_ascii=False))"

# 线性回归 ✅ 已验证
python -c "from analysis import model_linear_regression; import json; print(json.dumps(model_linear_regression({'data_x':[10,20,30,40,50],'data_y':[0.55,0.60,0.66,0.72,0.78]}), ensure_ascii=False))"

# GARCH 波动率 ✅ 已验证
python -c "from analysis import model_garch; import json; print(json.dumps(model_garch({'data':[0.5,0.52,0.48,0.55,0.60,0.58]}), ensure_ascii=False))"
```

### 3.4 测试结果（2026-04-15 实测）

| 模型 | 状态 | 关键指标 |
|------|------|----------|
| sentiment | ✅ | score=0.2, label="偏多" |
| arima | ✅ | forecast_horizon=12 |
| linear_regression | ✅ | R²=0.998812 |
| garch | ✅ | risk_level="High Risk" |
| kmeans | ✅ | 聚类标签正常 |
| bayesian | ✅ | posterior 更新正常 |
| mispricing | ✅ | deviation 计算正常 |
| correlation | ✅ | 相关矩阵输出正常 |

---

## 4. Hyperledger Fabric 自建链部署

> 项目采用 **Hyperledger Fabric 自建私有链** 方案，通过 Docker 在本机部署完整区块链网络，**不依赖任何外部 API 或测试网**。

### 4.1 方案架构

```
本机 Docker 容器：
  ├── peer0.org1.example.com   (Org1 节点)
  ├── peer0.org2.example.com   (Org2 节点)
  ├── orderer.example.com      (排序节点)
  ├── ca_org1                  (CA 证书颁发机构)
  └── ca_org2                  (CA 证书颁发机构)

链码（fabric/chaincode/predictionmarket/）：
  支持: CreateMarket / ResolveMarket / CreateTrade /
        CreateOrder / GetAllMarkets / QueryTradesByMarket /
        UpdateMarketPrice / GetLedgerStats
```

### 4.2 前置检查

```powershell
# 检查 Docker
docker version

# 检查 WSL
wsl --list --verbose
# 需要看到 Ubuntu（非仅 docker-desktop）
```

### 4.3 步骤 1：安装 WSL Ubuntu（首次，需管理员权限）

```powershell
# 以管理员权限运行 PowerShell
.\fabric\01-install-wsl-ubuntu.ps1
```

- 脚本会自动安装 Ubuntu-22.04
- 安装后会弹出 Ubuntu 窗口，需要**设置用户名和密码**（推荐 fabric/fabric123）
- 设置完成后关闭窗口，继续下一步

### 4.4 步骤 2：安装 Fabric 依赖到 WSL

```powershell
.\fabric\02-setup-fabric-in-wsl.ps1
```

此脚本在 WSL Ubuntu 中安装：
- Node.js 20 LTS
- Go 1.21
- 验证 Docker 连接

### 4.5 步骤 3：启动 Fabric 网络 & 部署链码

```powershell
.\fabric\03-start-fabric-network.ps1
```

此脚本自动完成：
1. 下载 Fabric 2.5.15 二进制文件和 Docker 镜像（首次约 5-15 分钟）
2. 启动 test-network（2 org + 1 orderer + CA）
3. 创建 `mychannel` 通道
4. 安装并部署 `predictionmarket` 链码
5. 导出 Org1 管理员 wallet 身份
6. 复制连接配置文件

**首次运行输出示例：**
```
[1/7] 检查依赖...
  ✓ Docker 29.2.1
  ✓ Node v20.x
[2/7] 下载 Fabric 二进制（首次需要一段时间）...
[3/7] 停止旧网络...
[4/7] 启动 Fabric test-network...
  ✓ 网络已启动，通道 mychannel 已创建
[5/7] 准备链码...
  ✓ 链码依赖安装完成
[6/7] 部署 predictionmarket 链码...
  ✓ 链码部署成功
[7/7] 导出连接配置...
  ✓ 管理员 wallet identity 已写入: D:\...\fabric\wallet\admin.id

  连接配置: D:\...\fabric\connection-profiles\connection-org1.json
  钱包路径: D:\...\fabric\wallet
```

### 4.6 步骤 4：配置 .env 连接真实 Fabric

按脚本输出的实际路径更新 `.env`：

```env
FABRIC_ENABLED=true
FABRIC_CONNECTION_PROFILE=D:\毕业\blockchain-prediction-market-platform\fabric\connection-profiles\connection-org1.json
FABRIC_WALLET_PATH=D:\毕业\blockchain-prediction-market-platform\fabric\wallet
FABRIC_IDENTITY=admin
FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=predictionmarket
```

### 4.7 步骤 5：验证连接

```powershell
# 重启服务器
npx tsx server.ts
```

观察日志：
```
[Fabric] 已连接到真实 Fabric 网络   ← 成功
# 或
[Fabric] 连接失败，自动切换到 Mock 模式  ← 失败（查看错误原因）
```

API 验证：
```powershell
# 查看 Fabric 状态（应显示 mockMode: false）
curl http://localhost:3000/api/ledger/status
```

### 4.8 停止网络

```powershell
.\fabric\down-fabric-network.ps1
```

### 4.9 链码功能说明

| 函数 | 类型 | 用途 |
|------|------|------|
| `CreateMarket` | 写 | 新建市场上链 |
| `ResolveMarket` | 写 | 市场结算上链 |
| `UpdateMarketPrice` | 写 | 更新市场价格 |
| `CreateTrade` | 写 | 成交记录上链 |
| `CreateOrder` | 写 | 订单记录上链 |
| `GetMarket` | 读 | 查询单个市场 |
| `GetAllMarkets` | 读 | 查询所有市场 |
| `QueryTradesByMarket` | 读 | 查询市场成交 |
| `QueryOrdersByMarket` | 读 | 查询市场订单 |
| `GetLedgerStats` | 读 | 账本统计信息 |

### 4.10 数据流说明

```
用户操作 → server.ts API
    ↓
SQLite（主存储，实时响应）
    +
Fabric 链码（异步上链，不阻塞响应）
    ↓
Docker 容器（peer/orderer/CA）
    ↓
账本持久化
```

> 设计原则：SQLite 作为主数据库保证响应速度，Fabric 异步记录关键操作（创建市场、成交、结算），确保不可篡改的审计记录。

---

## 5. 智能合约（参考用）

> 以下为 Solidity 合约部分，用于 Polygon 测试网部署参考，非自建链方案。  
> 当前主要方案已改为 Hyperledger Fabric 自建链，此节作保留参考。

### 5.1 合约编译（已验证 ✅）

```powershell
npx hardhat compile
# 输出: Compiled 10 Solidity files successfully (evm target: paris).
```

### 5.2 已修复问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `HH19: ESM 模式下 .js 不支持` | package.json 设为 ESM | 新建 hardhat.config.cjs |
| `HH8: private key too short` | 占位符私钥太短 | 配置文件加长度校验 |

---

## 6. 前端功能验证

### 6.1 功能测试清单

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 首页 | 市场列表、分类筛选、状态筛选 | ✅ |
| 交易 | 下单、订单簿、K线图 | ✅ |
| 钱包 | 余额显示、持仓展示 | ✅ |
| 数据分析 | 描述统计、模型分析、可视化 | ✅ |
| 机器人 | 策略配置、手动/自动运行 | ✅ |
| 管理员 | 市场管理、AI 审核/结算 | ✅ |
| Fabric 账本 | 链上查询（Mock/真实） | ✅ |

---

## 7. 已知问题与解决方案

### 7.1 Python 分析

| 问题 | 解决方案 | 状态 |
|------|----------|------|
| Windows PowerShell 管道传 JSON 失败 | 用 `python -c "..."` 直接调用 | ✅ 已记录 |
| 模型返回"数据不足" | 确保至少 5 个数据点 | ✅ 已确认 |

### 7.2 Fabric 自建链

| 问题 | 原因 | 解决方案 | 状态 |
|------|------|----------|------|
| WSL 只有 docker-desktop | 未安装 Linux 发行版 | 运行 01-install-wsl-ubuntu.ps1 | ✅ 已提供脚本 |
| 首次下载 Fabric 镜像慢 | 镜像约 2GB | 确保网络通畅，耐心等待 | ✅ 已说明 |
| 连接配置文件不存在 | 部署未完成 | 先完整运行 03 脚本 | ✅ 已说明 |
| identity 不在 wallet 中 | enrollAdmin 失败 | 手动运行 enrollAdmin.sh | ✅ 已提供脚本 |

### 7.3 智能合约（参考）

| 问题 | 解决方案 | 状态 |
|------|----------|------|
| `HH19: ESM 模式报错` | 已修复（hardhat.config.cjs） | ✅ |
| `HH8: 私钥太短` | 已修复（长度校验） | ✅ |

---

## 附录 A：常用命令速查

```powershell
# 项目启动
npx tsx server.ts

# 安装 WSL Ubuntu（管理员权限）
.\fabric\01-install-wsl-ubuntu.ps1

# 初始化 WSL 环境
.\fabric\02-setup-fabric-in-wsl.ps1

# 启动 Fabric 自建链 + 部署链码
.\fabric\03-start-fabric-network.ps1

# 停止 Fabric 网络
.\fabric\down-fabric-network.ps1

# Python 分析测试
python -c "from analysis import model_sentiment; import json; print(json.dumps(model_sentiment({'buy_volume':1200,'sell_volume':800}), ensure_ascii=False))"

# 合约编译（参考用）
npx hardhat compile
```

## 附录 B：资源链接

| 资源 | 链接 |
|------|------|
| Hyperledger Fabric 文档 | https://hyperledger-fabric.readthedocs.io |
| fabric-samples | https://github.com/hyperledger/fabric-samples |
| Docker Desktop | https://www.docker.com/products/docker-desktop |
| WSL 文档 | https://learn.microsoft.com/zh-cn/windows/wsl |

---

*文档版本 v2.0，最后更新 2026-04-15*

---

## 1. 开发环境准备

### 1.1 系统要求

| 组件 | 最低要求 | 推荐版本 |
|------|----------|----------|
| Node.js | v18.0.0 | v20.x LTS |
| npm | 9.0.0 | 10.x |
| Python | 3.9 | 3.11+ |
| Git | 2.30 | 最新版 |

### 1.2 克隆项目

```powershell
cd d:\
git clone <repository_url> blockchain-prediction-market-platform
cd blockchain-prediction-market-platform
```

### 1.3 安装依赖

```powershell
# 安装 Node.js 依赖
npm install

# Python 依赖（可选，用于高级分析功能）
pip install -r requirements.txt
```

### 1.4 环境配置

复制配置文件：

```powershell
# Windows PowerShell
copy .env.example .env

# 或手动创建 .env 文件，参考下方模板
```

**.env 文件配置模板：**

```env
# ========== 服务器配置 ==========
PORT=3000
NODE_ENV=development

# ========== 区块链配置 ==========
# 测试钱包私钥（需要从 MetaMask 导出，带 0x 前缀）
PRIVATE_KEY=0xyour_test_wallet_private_key_here

# Polygon Mumbai 测试网 RPC（使用免费公共节点）
POLYGON_MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com

# Polygon Mainnet RPC（生产环境）
POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com

# 合约部署后填入
REACT_APP_PMT_TOKEN_ADDRESS=
REACT_APP_PREDICTION_MARKET_ADDRESS=

# ========== AI 配置 ==========
# Gemini API Key（从 https://aistudio.google.com/app/apikey 获取）
GEMINI_API_KEY=your_gemini_api_key_here

# ========== Fabric 配置 ==========
# 生产环境设置为 true
FABRIC_ENABLED=false

# ========== 管理员配置 ==========
ADMIN_SECRET=admin123

# ========== Gas 报告 ==========
REPORT_GAS=false
```

---

## 2. 项目启动测试

### 2.1 开发模式启动

```powershell
# 启动后端服务器 + 前端开发服务器
npm run dev

# 或使用 tsx 直接运行
npx tsx server.ts
```

### 2.2 验证服务

启动成功后，访问以下地址：

| 服务 | 地址 | 状态 |
|------|------|------|
| 前端界面 | http://localhost:3000 | ✅ 应显示主界面 |
| API 端点 | http://localhost:3000/api/markets | ✅ 应返回 JSON 数据 |
| WebSocket | ws://localhost:3000 | ✅ 应建立连接 |

### 2.3 启动日志示例

```
[服务器] 服务器运行在 http://localhost:3000
[数据库] SQLite 初始化完成
[Fabric] FABRIC_ENABLED=false，使用本地 Mock 模式
[WebSocket] 广播服务已启动 (interval: 1500ms)
```

---

## 3. Python 分析服务测试

### 3.1 测试概述

`analysis.py` 使用**纯 Python 标准库**实现，**无需安装任何外部依赖**即可运行。

### 3.2 支持的模型

| 模型 | 功能 | 依赖 |
|------|------|------|
| arima | 时间序列趋势预测 | 无 |
| linear_regression | 线性回归分析 | 无 |
| bayesian | 贝叶斯概率更新 | 无 |
| sentiment | 市场情绪分析 | 无 |
| kmeans | K-Means 聚类 | 无 |
| garch | 波动率分析 | 无 |
| mispricing | 定价偏差检测 | 无 |
| correlation | 相关性分析 | 无 |

### 3.3 测试步骤

#### 方法一：通过 API 测试

```powershell
# 启动服务器后，使用 curl 测试
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{"model":"sentiment","buy_volume":1200,"sell_volume":800}'
```

**预期输出：**
```json
{
  "ok": true,
  "model": "sentiment",
  "name": "市场情绪指标",
  "result": {
    "buy_volume": 1200,
    "sell_volume": 800,
    "sentiment_score": 0.2,
    "label": "偏多"
  }
}
```

#### 方法二：Python 直接调用测试（Windows PowerShell）

> **注意**：Windows PowerShell 管道对 JSON 字符串有兼容性问题，推荐使用 `-c` 直接调用函数。

```powershell
# 情绪分析（已测试通过 ✅）
python -c "from analysis import model_sentiment; import json; print(json.dumps(model_sentiment({'buy_volume':1200,'sell_volume':800}), ensure_ascii=False))"
# 输出: {"buy_volume": 1200.0, "sell_volume": 800.0, "sentiment_score": 0.2, "label": "偏多"}

# ARIMA 预测（已测试通过 ✅）
python -c "from analysis import model_arima; import json; print(json.dumps(model_arima({'data':[0.63,0.64,0.62,0.66,0.67,0.68,0.70],'horizon':12}), ensure_ascii=False))"
# 输出: {"current": 0.7, "forecast_horizon": 12, "forecast_last": 0.697692, "trend": "下降", ...}

# 线性回归（已测试通过 ✅）
python -c "from analysis import model_linear_regression; import json; print(json.dumps(model_linear_regression({'data_x':[10,20,30,40,50],'data_y':[0.55,0.60,0.66,0.72,0.78]}), ensure_ascii=False))"
# 输出: {"slope": 0.0058, "intercept": 0.488, "r_squared": 0.998812, ...}

# GARCH 波动率（已测试通过 ✅）
python -c "from analysis import model_garch; import json; print(json.dumps(model_garch({'data':[0.5,0.52,0.48,0.55,0.60,0.58]}), ensure_ascii=False))"
# 输出: {"volatility": 0.05660718, "volatility_score": 56.61, "risk_level": "High Risk", ...}
```

#### 方法三：前端界面测试

1. 访问 http://localhost:3000
2. 进入「数据分析」页面
3. 选择模型类型（如：ARIMA）
4. 输入测试数据
5. 点击「分析」按钮
6. 查看结果和 AI 解读

### 3.4 测试用例参考

| 测试编号 | 模型 | 输入数据 | 预期结果 |
|----------|------|----------|----------|
| TC-001 | sentiment | buy=1200, sell=800 | score>0, label="偏多" |
| TC-002 | sentiment | buy=500, sell=1500 | score<0, label="偏空" |
| TC-003 | arima | [0.5,0.52,0.48,0.55,0.60] | 返回预测序列 |
| TC-004 | bayesian | prior=0.5, likelihood=0.8 | posterior>prior |
| TC-005 | kmeans | k=2, points=[[1,2],[3,4]] | 返回聚类标签 |

---

## 4. 智能合约部署

### 4.1 部署前检查

> ⚠️ **重要提示（已修复 2026-04-15）**  
> 由于 `package.json` 设置了 `"type": "module"`（ESM 模式），`hardhat.config.js` 需重命名为 `hardhat.config.cjs`。  
> 已修复：项目中已同时保留 `.js` 和 `.cjs` 两个版本，Hardhat 会自动优先使用 `.cjs`。

```powershell
# 确认环境变量已配置
Get-Content .env

# 检查合约编译（已测试通过 ✅ 2026-04-15）
npx hardhat compile
# 输出: Compiled 10 Solidity files successfully (evm target: paris).
```

### 4.2 获取测试 MATIC

1. 安装 MetaMask 浏览器插件
2. 创建或导入钱包
3. 切换到 Polygon Mumbai 测试网络
4. 访问 [Mumbai Faucet](https://mumbaifaucet.com/)
5. 输入钱包地址，获取免费测试 MATIC

### 4.3 部署到 Mumbai 测试网

```powershell
# 部署合约
npx hardhat run scripts/deploy.js --network mumbai
```

### 4.4 部署输出示例

```
部署交易已提交，等待确认...
合约地址:
  PMTToken: 0x1234...abcd
  PredictionMarket: 0x5678...efgh
合约部署成功！请更新 .env 文件：
  REACT_APP_PMT_TOKEN_ADDRESS=0x1234...abcd
  REACT_APP_PREDICTION_MARKET_ADDRESS=0x5678...efgh
```

### 4.5 更新配置

```powershell
# 编辑 .env 文件，更新合约地址
notepad .env
```

### 4.6 验证部署

```powershell
# 验证 Token 合约
npx hardhat verify --network mumbai <PMT_TOKEN_ADDRESS>

# 验证市场合约
npx hardhat verify --network mumbai <PREDICTION_MARKET_ADDRESS>
```

### 4.7 在 PolygonScan 查看

1. 访问 [PolygonScan Mumbai](https://mumbai.polygonscan.com/)
2. 输入合约地址
3. 查看合约源码和交易记录

---

## 5. Fabric 集成配置

### 5.1 当前状态

| 模式 | 状态 | 说明 |
|------|------|------|
| Fabric Mock | ✅ 默认启用 | 使用本地 SQLite 存储，无需配置 |
| 真实 Fabric | ⚠️ 可选 | 需要完整 Fabric 网络 |

### 5.2 Mock 模式（默认）

```env
FABRIC_ENABLED=false
```

此模式下，所有 Fabric 相关操作使用本地 SQLite 数据库替代，无需额外配置。

### 5.3 真实 Fabric 配置（可选）

如需连接真实 Hyperledger Fabric 网络：

1. **准备 Fabric 网络**
   - 至少 3 个组织节点
   - 1 个排序服务
   - 已部署的链码

2. **配置连接文件**
   ```
   fabric/
   ├── connection-profile.json    # 连接配置
   ├── wallet/                     # 钱包凭证
   └── config.yaml                # Fabric 配置
   ```

3. **更新 .env**
   ```env
   FABRIC_ENABLED=true
   FABRIC_CONNECTION_PROFILE=./fabric/connection-profile.json
   FABRIC_WALLET_PATH=./fabric/wallet
   FABRIC_CHANNEL_NAME=mychannel
   FABRIC_CHAINCODE_NAME=prediction-market
   ```

4. **测试连接**
   ```powershell
   node fabric/test-connection.js
   ```

---

## 6. 前端功能验证

### 6.1 功能测试清单

| 模块 | 功能点 | 测试方法 | 状态 |
|------|--------|----------|------|
| 首页 | 市场列表展示 | 访问首页，查看市场卡片 | ✅ |
| 首页 | 分类筛选 | 点击分类标签，验证筛选 | ✅ |
| 首页 | 状态筛选 | 切换活跃/已结算/全部 | ✅ |
| 交易 | 下单功能 | 选择市场，输入数量，下单 | ✅ |
| 交易 | 订单簿展示 | 查看买卖盘深度 | ✅ |
| 交易 | K线图展示 | 查看 OHLCV 图表 | ✅ |
| 钱包 | 余额显示 | 查看 USDC 余额 | ✅ |
| 钱包 | 持仓展示 | 查看当前持仓 | ✅ |
| 数据分析 | 描述统计 | 上传数据，计算统计量 | ✅ |
| 数据分析 | 模型分析 | 选择模型，输入数据，分析 | ✅ |
| 机器人 | 策略配置 | 创建 bot，设置参数 | ✅ |
| 机器人 | 手动运行 | 点击运行按钮 | ✅ |
| 管理员 | 市场管理 | 创建/审核/结算市场 | ✅ |

### 6.2 浏览器兼容性

| 浏览器 | 推荐版本 | 最低版本 |
|--------|----------|----------|
| Chrome | 120+ | 90 |
| Firefox | 120+ | 90 |
| Edge | 120+ | 90 |
| Safari | 16+ | 14 |

### 6.3 移动端适配

- 基础响应式布局已实现
- 交易终端建议在桌面端使用

---

## 7. 已知问题与解决方案

### 7.1 Python 分析服务问题

| 问题 | 原因 | 解决方案 | 状态 |
|------|------|----------|------|
| Windows PowerShell 管道传 JSON 失败 | echo 输出会被 PS 转换 | 改用 `python -c "from analysis import model_xxx..."` 直接调用 | ✅ 已记录 |
| 模型返回 "数据不足" | 输入数据点太少 | 确保至少 5 个数据点 | ✅ 已确认 |
| JSON 解析错误 | 输入格式不正确 | 严格按照 API 格式输入 | ✅ 已确认 |
| 中文乱码 | 编码问题 | 确认终端使用 UTF-8 | ✅ 已确认 |

### 7.2 智能合约问题

| 问题 | 原因 | 解决方案 | 状态 |
|------|------|----------|------|
| `HH19: ESM 模式下 .js 扩展名不被支持` | package.json 设为 ESM，Hardhat 要求 .cjs | 将 `hardhat.config.js` 复制为 `hardhat.config.cjs` | ✅ 已修复 |
| 私钥长度不足报错 `HH8: private key too short` | .env 里私钥为占位符，Hardhat 直接传入了短字符串 | 配置文件增加长度校验，占位符不传入 accounts 数组 | ✅ 已修复 |
| 合约编译正常 | — | `Compiled 10 Solidity files successfully` | ✅ 已验证 |
| 余额不足 | 没有 MATIC | 从 Mumbai Faucet 获取测试代币 | ⏳ 待操作 |
| RPC 超时 | 网络问题 | 更换 RPC 节点 URL | ⏳ 待测试 |

### 7.3 Web3 连接问题

| 问题 | 原因 | 解决方案 | 状态 |
|------|------|----------|------|
| MetaMask 未连接 | 未安装/未解锁 | 安装 MetaMask 并解锁 | ⏳ 待验证 |
| 网络不匹配 | 切换到错误网络 | 切换到 Polygon Mumbai | ⏳ 待验证 |
| 余额为 0 | 需要测试代币 | 从 Faucet 获取 MATIC | ⏳ 待验证 |

---

## 附录 A：常用命令速查

```powershell
# 项目启动
npm run dev

# 合约编译
npx hardhat compile

# 合约部署（需要先配置 PRIVATE_KEY 和 MATIC）
npx hardhat run scripts/deploy.cjs --network mumbai

# 合约验证
npx hardhat verify --network mumbai <地址>

# Python 分析测试（Windows 推荐方式）
python -c "from analysis import model_sentiment; import json; print(json.dumps(model_sentiment({'buy_volume':1200,'sell_volume':800}), ensure_ascii=False))"

# 清理构建文件
npm run clean
```

## 附录 B：资源链接

| 资源 | 链接 |
|------|------|
| Mumbai Faucet | https://mumbaifaucet.com/ |
| Polygon RPC | https://rpc.ankr.com/polygon_mumbai |
| Gemini API Key | https://aistudio.google.com/app/apikey |
| PolygonScan | https://mumbai.polygonscan.com/ |

## 附录 C：测试日志模板

```
=== 测试记录 ===
日期：YYYY-MM-DD
测试者：
环境：Windows/macOS/Linux

[ ] 开发环境安装
[ ] 项目启动
[ ] Python 分析测试
[ ] 智能合约部署
[ ] 前端功能测试

问题记录：
1.
2.
3.

解决记录：
1.
2.
3.
```

---

*文档结束*
