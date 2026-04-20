# 预测市场平台 - 功能完善方案

> 文档版本：v1.0
> 创建日期：2026-04-17
> 目的：对比任务书规格与实际实现差距，制定补充计划

---

## 一、系统设计目标回顾

本平台任务书要求实现一个 **Polymarket 风格预测市场交易平台**，核心功能包括：

1. 预测市场创建与管理员审核（AI 辅助）
2. 多用户账号体系（类 MetaMask 登录）
3. 订单撮合交易（限价单 + 市价单）
4. 交易机器人（自动做市 / 趋势 / 噪声策略）
5. AI 自动结算（联网检索 + 多模型判定）
6. 数据分析工作台（8 种量化模型 + AI 解读）
7. 区块链账本（Hyperledger Fabric 自建链）
8. 结算后收益自动发放

---

## 二、现状评估

| 功能模块 | 文档描述 | 实际状态 | 差距 |
|----------|----------|----------|------|
| 市场创建与审核 | AI 审核 + 管理员审核 | ✅ 已实现，Admin 4 Tab 完整 | 无 |
| 多账号登录 | 类 MetaMask 模态框 | ✅ AuthModal 实现 | 无 |
| 订单撮合 | 限价单 + 做市商 | ✅ server.ts 撮合逻辑 | 无 |
| 交易机器人 | 自动套利 | ⚠️ 有 UI，**自动执行未完成** | 较大 |
| AI 结算 | 联网检索 + 多模型判定 | ⚠️ AI 可用，**依赖 Google API** | 中等 |
| 数据分析 | 8 种量化模型 + 可视化 | ⚠️ 有分析，**展示不完整** | 中等 |
| 区块链账本 | Fabric 自建链 | ✅ Mock 模式，真实 Fabric 未部署 | 小 |
| 收益发放 | 结算后自动发放 | ❌ **未实现** | 较大 |
| AI 多模型 | 支持多种模型 | ❌ **仅有 Gemini，Google API 不通** | 较大 |

---

## 三、需要完善的功能

### 【P0】国内免费 AI API 接入（阻塞性问题）

**问题**：Gemini API 依赖 Google 服务，在中国大陆无法访问（503 APISIX 错误）

**解决方案**：接入国内免费/低价 AI API，按优先级：

| 提供商 | 模型 | 免费额度 | baseUrl |
|--------|------|----------|---------|
| **硅基流动** (SiliconFlow) | Qwen/QwQ/DeepSeek | 2000万 tokens/月 | `https://api.siliconflow.cn/v1` |
| **火山引擎** (Volcengine) | doubao-pro | 有免费试用 | `https://ark.cn-beijing.volcengine.com` |
| **阿里云百炼** | qwen-plus | 有免费额度 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

**实施计划**：
- [ ] 在 .env 增加 SILICONFLOW_API_KEY 等配置项
- [ ] server.ts defaultAISettings 增加 SiliconFlow provider（默认启用）
- [ ] 前端 Admin AI 配置 Tab 显示所有 provider 状态，支持启用/禁用
- [ ] 文档更新 DEPLOYMENT.md，增加国内 API 获取指南

---

### 【P1-1】机器人自动执行

**问题**：Bots 页面仅有手动"运行一次"按钮，无自动定时执行

**解决方案**：
- [ ] Bot 配置增加 `autoRun: boolean` + `intervalSeconds: number` 字段
- [ ] server.ts 启动时启动 setInterval 定时调度
- [ ] 前端显示 Bot 运行状态（运行中/已停止）、下次执行时间
- [ ] 支持 3 种策略自动执行（market_maker / momentum / noise）

---

### 【P1-2】结算后收益自动发放

**问题**：市场结算后持有 YES 份额的用户无法获得收益

**解决方案**：
- [ ] 在 `POST /api/admin/settle` 结算后，遍历所有持有该市场 YES 仓位的用户
- [ ] 按 `YES_shares × 1 - fee` 发放到用户余额
- [ ] 记录发放流水（存入 trades 表）

---

### 【P2】量化分析展示优化

**问题**：Analytics 页面分析模型结果展示不直观，模型对比不够

**解决方案**：
- [ ] 增加雷达图（多维度对比各模型信号强度）
- [ ] 增加热力图（市场情绪随时间变化）
- [ ] 增加策略信号汇总面板（综合 8 个模型给出统一信号）
- [ ] 模型结果导出 CSV 功能

---

### 【P3】文档更新

**问题**：DEVELOPMENT.md 和 DEPLOYMENT.md 内容陈旧，未反映最新架构

**解决方案**：
- [ ] 更新 DEVELOPMENT.md，反映纯 Windows 部署（无需 WSL）
- [ ] 更新 DEPLOYMENT.md，增加国内 AI API 获取指南
- [ ] 合并两份文档，统一入口

---

## 四、实施顺序

```
第1步：国内 AI API（SiliconFlow）→ 解除阻塞
第2步：机器人自动执行 + 收益发放
第3步：量化分析展示优化
第4步：文档更新
第5步：毕业论文编写
```

---

## 五、SiliconFlow 接入详细方案

### 为什么选 SiliconFlow

- 有免费额度（2000万 tokens/月，学生足够）
- API 兼容 OpenAI 格式，代码无需大改
- 国内服务器，无需代理
- 支持 Qwen2.5、DeepSeek 等主流模型

### .env 新增配置

```env
# ========== 国内免费 AI API（推荐）==========
# 硅基流动（https://www.siliconflow.cn/）- 2000万 tokens/月免费
SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 火山引擎（如需备用）
VOLCENGINE_API_KEY=your_volcengine_key
```

### server.ts 修改

```typescript
// 增加 SiliconFlow provider 到默认 AI 配置
{
  id: "siliconflow",
  enabled: true,  // 默认启用
  model: "Qwen/Qwen2.5-7B-Instruct",  // 免费模型
  baseUrl: "https://api.siliconflow.cn/v1",
  keys: [{ label: "env", apiKey: process.env.SILICONFLOW_API_KEY || "" }]
}
```

---

*方案制定：2026-04-17*
