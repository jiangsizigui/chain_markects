# Hyperledger Fabric 本地网络（基于 fabric-samples）

本目录用于在本机 Docker 启动一个最小 Fabric 测试网络，替换原 MetaMask 登录模式所需的链上基础设施。

## 前置要求

- Docker Desktop
- Git
- Bash（Git Bash / WSL）

## 一键启动（PowerShell）

```powershell
./fabric/setup-fabric-network.ps1
```

脚本会：

1. 克隆 `hyperledger/fabric-samples`（若不存在）
2. 下载 Fabric 二进制和镜像
3. 启动 `test-network`（2 org + 1 orderer + ca）
4. 创建通道 `mychannel`

## 停止网络

```powershell
./fabric/down-fabric-network.ps1
```

## 说明

- 当前业务后端已接入 Fabric 风格身份接口（`/api/fabric/auth/*`），用于替代前端 MetaMask 登录流程。
- 当前版本已支持 Fabric Gateway 调用：
  - `CreateTrade`
  - `QueryTradesByMarket`
- 需要配置环境变量（示例）：

```powershell
setx FABRIC_CONNECTION_PROFILE "D:\path\to\connection-org1.json"
setx FABRIC_WALLET_PATH "D:\path\to\wallet"
setx FABRIC_IDENTITY "appUser"
setx FABRIC_CHANNEL "mychannel"
setx FABRIC_CHAINCODE "predictionmarket"
```

- 链码样例路径：`fabric/chaincode/predictionmarket/`
