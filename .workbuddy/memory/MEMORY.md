# 区块链预测市场平台 - 长期记忆

## 项目概述
- 基于任务书构建的 Polymarket 风格预测市场交易平台
- 技术栈: React + Vite + TypeScript + Express + SQLite + ethers.js + Hyperledger Fabric
- 目标: 预测市场 + 交易机器人 + 数据分析工作台 + 管理员平台

## 关键决策 (2026-04-14 ~ 2026-04-15)

### Python 分析服务
- analysis.py 使用纯 Python 标准库，**不需要** numpy/pandas/scipy
- 代码中标注"轻量实现，不依赖外部库"
- 可选依赖见 requirements.txt（用于高级统计功能）

### 区块链方案：Hyperledger Fabric 自建链（2026-04-15 确定，2026-04-16 优化）
- **不使用外部 API / 测试网**，Docker 本地部署 Fabric 私有链
- **不需要 WSL Ubuntu**，纯 Windows PowerShell + Docker 完成所有操作
- 基于 fabric-samples/test-network（已下载到项目目录）
- 一键部署脚本: fabric/03-start-fabric-network-win.ps1（纯 Windows 版）

### Fabric Gateway 集成
- server.ts 使用 fabric-network v2 SDK（fabric-network^2.2.20）
- Mock 降级模式（FABRIC_ENABLED=false 时使用本地 SQLite）
- 真实模式时，关键操作异步上链（不阻塞 HTTP 响应）

### 智能合约（参考用）
- 已编写 PredictionMarket.sol 和 PlatformToken.sol
- hardhat.config.cjs 已修复（ESM 兼容）

## 文件结构
```
blockchain-prediction-market-platform/
├── server.ts           # Express 后端 + SQLite 持久化
├── src/pages/
│   ├── Marketplace.tsx # Polymarket 风格市场列表
│   ├── Trading.tsx    # 交易终端
│   ├── Wallet.tsx     # 钱包
│   ├── Analytics.tsx  # SPSS 风格数据分析工作台
│   ├── Bots.tsx       # 交易机器人管理
│   └── Admin.tsx      # 管理员平台
├── contracts/         # Solidity 智能合约（参考用）
├── fabric/
│   ├── 01-install-wsl-ubuntu.ps1    # 安装 WSL Ubuntu（管理员）
│   ├── 02-setup-fabric-in-wsl.ps1  # WSL 环境初始化
│   ├── 03-start-fabric-network.ps1 # 一键启动网络（主入口）
│   ├── down-fabric-network.ps1     # 停止网络
│   ├── chaincode/predictionmarket/ # 链码（JS）
│   └── scripts/                    # 辅助脚本
├── fabric-samples/     # Hyperledger Fabric 官方示例（已下载）
│   └── test-network/   # 2org+orderer+CA Docker 网络
├── analysis.py         # Python 量化分析（纯标准库）
├── .env.example        # 环境配置模板
├── .env                # 实际配置
├── requirements.txt    # Python 可选依赖
├── hardhat.config.cjs  # Hardhat 配置（ESM 兼容修复版）
└── docs/
    ├── DEPLOYMENT.md   # 完整部署文档
    └── DEVELOPMENT.md  # 开发与测试过程文档（v2.0）
```

## 测试状态 (2026-04-15)
- Python 分析服务：✅ 全部 8 个模型测试通过
- 智能合约编译：✅ 10 个 Solidity 文件编译成功
- 运行环境：Node.js v22.12.0, Python 3.13.3, Docker 29.2.1

## 待完成
- [ ] 以管理员权限运行 01-install-wsl-ubuntu.ps1 安装 WSL Ubuntu
- [ ] 运行 02/03 脚本完成 Fabric 网络部署
- [ ] 更新 .env FABRIC_ENABLED=true 后验证链上交互
- [x] 配置 GEMINI_API_KEY ✅（已写入 .env）
