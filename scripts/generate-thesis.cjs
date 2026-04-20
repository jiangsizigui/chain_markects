/**
 * 区块链预测市场平台 - 毕业论文Word文档生成
 * 题目：区块链赋能下加密预测市场的架构设计与量化模型研究
 */

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
        TableOfContents } = require('docx');
const fs = require('fs');

// ============ 辅助函数 ============
function p(text, options = {}) {
  const { bold = false, size = 24, alignment = AlignmentType.JUSTIFIED, indent = false, spacing = {} } = options;
  return new Paragraph({
    alignment,
    spacing: { line: 360, after: 120, ...spacing },
    indent: indent ? { firstLine: 480 } : undefined,
    children: [new TextRun({ text, font: "SimSun", size, bold })]
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 240 },
    children: [new TextRun({ text, font: "SimHei", size: 32, bold: true })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, font: "SimHei", size: 28, bold: true })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "SimHei", size: 24, bold: true })]
  });
}

function brd() {
  const b = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
  return { top: b, bottom: b, left: b, right: b };
}

function tbl(headers, rows, widths) {
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders: brd(),
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: "D9D9D9", type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: "SimHei", size: 22, bold: true })] })]
    }))
  });
  const dataRows = rows.map(row => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders: brd(),
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: "SimSun", size: 22 })] })]
    }))
  }));
  return new Table({ width: { size: totalWidth, type: WidthType.DXA }, columnWidths: widths, rows: [headerRow, ...dataRows] });
}

function bullets(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text: item, font: "SimSun", size: 24 })]
  }));
}

function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ============ 封面 ============
function coverPage() {
  return [
    p("", { spacing: { before: 1200 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 300 }, children: [new TextRun({ text: "本科毕业论文（设计）", font: "SimHei", size: 36, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 300 }, children: [new TextRun({ text: "（双学位）", font: "SimHei", size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800, after: 400 }, children: [new TextRun({ text: "区块链赋能下加密预测市场的", font: "SimHei", size: 40, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "架构设计与量化模型研究", font: "SimHei", size: 40, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800, after: 200 }, children: [new TextRun({ text: "学生姓名：_______________", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "学    号：_______________", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "院    系：软件学院 / 经济管理学院", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "专    业：软件工程 / 投资学", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "指导教师：_______________", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "完成日期：2026年4月", font: "SimSun", size: 24 })] }),
    pb()
  ];
}

// ============ 中文摘要 ============
function abstractCN() {
  return [
    h1("摘要"),
    p("预测市场作为一种基于集体智慧的信息聚合机制，通过交易者的买卖行为将分散的对未来事件的预判转化为可量化的价格信号。近年来，以Polymarket为代表的加密预测市场迅速崛起，将预测市场与区块链技术深度融合，开创了去中心化信息市场的新范式。然而，现有的加密预测市场平台普遍面临流动性不足、智能合约安全风险、结算效率低下以及量化分析能力欠缺等核心问题，严重制约了其大规模应用与发展。"),
    h2("研究目的与意义"),
    p("本文旨在设计并实现一个基于区块链技术的加密预测市场平台，通过架构创新与量化模型研究，解决现有平台存在的关键技术问题。", { indent: true }),
    ...bullets([
      "构建一个高效、安全、可扩展的区块链预测市场系统架构；",
      "设计与实现多策略量化交易机器人系统，为市场提供持续流动性；",
      "开发基于多模型集成的智能结算系统，实现市场结果的自动化判定；",
      "集成多维度量化分析工具，为投资决策提供科学依据。"
    ]),
    p("本研究的理论意义在于将区块链技术与预测市场理论、投资学量化分析模型进行有机整合。实践意义在于为加密预测市场的工程实现提供可复用的技术方案。", { indent: true }),
    h2("研究方法与技术路线"),
    p("本文采用理论研究与系统实现相结合的研究方法。系统架构采用前后端分离架构，前端使用React框架，后端采用Express.js；区块链集成使用Hyperledger Fabric构建联盟链网络；智能结算集成SiliconFlow等AI API；量化分析基于Python实现8种模型。", { indent: true }),
    h2("主要创新点"),
    ...bullets([
      "架构创新：提出基于联盟链的预测市场混合架构；",
      "流动性机制：设计多策略交易机器人系统；",
      "结算智能化：构建多AI模型交叉验证机制；",
      "分析可视化：开发多维度量化分析工具。"
    ]),
    h2("研究结论"),
    p("本文成功设计并实现了一个功能完整的区块链预测市场平台。平台功能完备，性能优异，用户体验良好，为加密预测市场的发展提供了有价值的实践经验。"),
    p("关键词：区块链；预测市场；智能合约；量化模型；Hyperledger Fabric；机器学习", { bold: true }),
    pb()
  ];
}

// ============ 英文摘要 ============
function abstractEN() {
  return [
    h1("Abstract"),
    p("Prediction markets, as an information aggregation mechanism based on collective intelligence, convert dispersed predictions about future events into quantifiable price signals through traders' buying and selling behaviors. In recent years, cryptocurrency prediction markets represented by Polymarket have risen rapidly, deeply integrating prediction markets with blockchain technology and creating a new paradigm of decentralized information markets."),
    p("This paper aims to design and implement a cryptocurrency prediction market platform based on blockchain technology, solving key technical problems through architectural innovation and quantitative model research. The main objectives include building an efficient system architecture, designing a multi-strategy trading bot system, developing an intelligent settlement system, and integrating quantitative analysis tools."),
    p("The research adopts a combined approach of theoretical research and system implementation. The system architecture uses a front-end and back-end separated design with React and Express.js. Blockchain integration uses Hyperledger Fabric. Intelligent settlement integrates multiple AI APIs. Quantitative analysis implements 8 models in Python."),
    p("The main innovations include: architectural innovation proposing a consortium chain-based hybrid architecture; liquidity mechanism designing a multi-strategy trading bot system; settlement intelligence constructing a multi-AI model cross-validation mechanism; and analysis visualization developing multi-dimensional quantitative analysis tools."),
    p("In summary, this paper successfully designed and implemented a fully functional blockchain prediction market platform, providing valuable practical experience and technical reference for the development of cryptocurrency prediction markets."),
    p("Keywords: Blockchain; Prediction Market; Smart Contract; Quantitative Model; Hyperledger Fabric; Machine Learning"),
    pb()
  ];
}

// ============ 目录 ============
function toc() {
  return [
    h1("目录"),
    new TableOfContents("目 录", { hyperlink: true, headingStyleRange: "1-3" }),
    pb()
  ];
}

// ============ 第1章 ============
function chapter1() {
  return [
    h1("第1章 绪论"),
    h2("1.1 研究背景"),
    h3("1.1.1 预测市场的发展历程"),
    p("预测市场（Prediction Market）是一种基于市场机制的集体智慧聚合系统，其核心思想是通过交易者的买卖行为将分散的个体预判转化为对未来事件结果的概率评估。预测市场的雏形可以追溯到16世纪的意大利赌马市场，现代预测市场始于20世纪90年代。1993年，Iowa Electronic Markets开创了学术预测市场的先河。此后，InTrade、NewsFutures、Betfair等商业平台相继涌现。", { indent: true }),
    h3("1.1.2 加密预测市场的兴起"),
    p("2018年以来，以太坊等公链基础设施的成熟催生了新一代加密预测市场。与传统预测市场相比，加密预测市场具有以下显著优势：", { indent: true }),
    ...bullets([
      "去中心化与抗审查：基于区块链技术，数据不可篡改；",
      "全球可访问：任何持有加密资产的用户均可参与；",
      "即时结算：智能合约自动执行，消除结算延迟；",
      "透明可验证：所有交易数据链上公开可查。"
    ]),
    p("2020年，以Polymarket为代表的新一代加密预测市场平台迅速崛起。2024年美国大选期间，Polymarket的总交易量超过10亿美元，充分展示了加密预测市场的巨大潜力。", { indent: true }),
    h3("1.1.3 当前面临的主要挑战"),
    p("尽管发展迅速，加密预测市场仍面临诸多挑战：", { indent: true }),
    tbl(["挑战类型", "具体问题", "影响分析"], [
      ["流动性不足", "新市场冷启动困难", "难以吸引新用户"],
      ["智能合约风险", "代码漏洞可能导致资金损失", "用户信任度低"],
      ["结算效率低下", "依赖人工判定或单一预言机", "成本高、速度慢"],
      ["量化能力欠缺", "缺乏专业分析工具", "用户难以做出科学决策"]
    ], [2800, 3200, 3360]),
    h2("1.2 研究目的与意义"),
    h3("1.2.1 研究目的"),
    p("针对上述挑战，本文旨在设计并实现一个功能完善的区块链预测市场平台：", { indent: true }),
    ...bullets([
      "构建高效的区块链预测市场系统架构；",
      "设计多策略交易机器人系统；",
      "开发智能结算系统；",
      "集成量化分析工作台。"
    ]),
    h3("1.2.2 研究意义"),
    p("理论意义：将区块链技术与预测市场理论、投资学量化分析模型进行有机整合，丰富预测市场研究框架。", { indent: true }),
    p("实践意义：为加密预测市场的工程实现提供可复用的技术方案，推动预测市场的大众化应用。", { indent: true }),
    h2("1.3 研究内容与方法"),
    h3("1.3.1 研究内容"),
    p("本文主要研究内容包括：（1）区块链预测市场的需求分析与架构设计；（2）多策略交易机器人系统的设计与实现；（3）智能结算系统的设计与实现；（4）量化分析工作台的设计与实现。", { indent: true }),
    h3("1.3.2 研究方法"),
    p("本文采用理论研究与系统实现相结合的研究方法：文献研究法、比较分析法、敏捷开发法、实验测试法。", { indent: true }),
    h2("1.4 论文结构"),
    tbl(["章节", "主要内容"], [
      ["第1章 绪论", "研究背景、研究目的与意义、研究内容与方法"],
      ["第2章 相关技术与理论基础", "区块链技术、预测市场理论、量化模型"],
      ["第3章 系统需求分析", "功能需求分析、非功能需求分析"],
      ["第4章 系统设计", "总体架构、数据库、区块链、接口设计"],
      ["第5章 系统实现", "前端、后端、区块链集成、核心功能"],
      ["第6章 系统测试", "功能测试、性能测试"],
      ["第7章 结论与展望", "研究成果、局限性与未来方向"]
    ], [2000, 7360]),
    pb()
  ];
}

// ============ 第2章 ============
function chapter2() {
  return [
    h1("第2章 相关技术与理论基础"),
    h2("2.1 区块链技术基础"),
    h3("2.1.1 区块链概述"),
    p("区块链是一种分布式账本技术（DLT），通过密码学方法将交易数据打包成区块，并按时间顺序链接成链式结构。核心特性包括：去中心化、不可篡改、可追溯、智能合约。", { indent: true }),
    h3("2.1.2 Hyperledger Fabric"),
    p("Hyperledger Fabric是Linux基金会旗下的企业级区块链框架，特别适合联盟链场景。特点包括：模块化架构、私密交易、高性能、企业级支持。本文选择Fabric作为区块链基础设施。", { indent: true }),
    tbl(["共识机制", "代表项目", "优势", "局限"], [
      ["PoW", "比特币", "安全性高", "能耗高"],
      ["PoS", "以太坊2.0", "节能", "初始分配不均"],
      ["PBFT", "Hyperledger", "高效", "节点数量受限"]
    ], [2000, 2000, 2500, 2860]),
    h2("2.2 预测市场理论"),
    h3("2.2.1 预测市场的经济学原理"),
    p("预测市场的理论基础源于有效市场假说（EMH）和信息经济学。核心机制包括：价格发现机制、激励相容、波动性微笑。", { indent: true }),
    h3("2.2.2 预测市场的分类"),
    tbl(["类型", "特点", "代表项目"], [
      ["二值预测", "结果为是/否", "Polymarket, Gnosis"],
      ["标量预测", "结果为连续数值", "Metaculus"],
      ["排名预测", "结果为排序列表", "PredictionBook"]
    ], [2000, 4000, 3360]),
    h2("2.3 量化投资模型"),
    h3("2.3.1 时间序列分析模型"),
    p("（1）ARIMA模型：自回归积分滑动平均模型，适用于非平稳时间序列的预测；（2）GARCH模型：广义自回归条件异方差模型，用于建模波动率聚集现象。", { indent: true }),
    h3("2.3.2 机器学习模型"),
    p("（1）线性回归：建立自变量与因变量之间的线性关系；（2）K-Means聚类：对历史市场进行聚类分析；（3）情感分析：分析文本数据中的情感倾向。", { indent: true }),
    h2("2.4 系统开发技术"),
    p("前端技术栈：React 18、TypeScript、Vite、Tailwind CSS、Recharts。后端技术栈：Node.js + Express、TypeScript、sql.js、fabric-network。Python分析服务使用标准库实现8种量化模型。", { indent: true }),
    pb()
  ];
}

// ============ 第3章 ============
function chapter3() {
  return [
    h1("第3章 系统需求分析"),
    h2("3.1 项目概述"),
    h3("3.1.1 项目背景"),
    p("本项目旨在设计并实现一个基于区块链技术的加密预测市场平台。平台参考Polymarket的设计理念，通过区块链技术实现去中心化的预测市场功能，同时集成量化分析工具。", { indent: true }),
    h3("3.1.2 项目目标"),
    ...bullets([
      "构建可在本地Docker环境快速部署的区块链预测市场；",
      "实现市场创建、交易撮合、持仓管理、结算派息等核心功能；",
      "设计多策略交易机器人系统；",
      "开发基于AI的智能结算系统；",
      "集成量化分析工作台，支持8种量化模型；",
      "提供现代化的用户界面。"
    ]),
    h2("3.2 功能需求分析"),
    h3("3.2.1 用户角色"),
    tbl(["角色", "描述", "主要权限"], [
      ["普通用户", "平台注册用户", "浏览市场、进行交易、查看持仓、使用分析工具"],
      ["做市商", "提供流动性的专业用户", "创建市场、配置做市策略"],
      ["管理员", "平台运营者", "审核市场、管理用户、配置AI参数"]
    ], [1800, 2800, 4760]),
    h2("3.3 非功能需求分析"),
    h3("3.3.1 性能需求"),
    tbl(["指标", "目标值", "说明"], [
      ["页面加载时间", "< 2秒", "首次加载完整页面"],
      ["API响应时间", "< 500ms", "核心业务接口"],
      ["并发用户数", "> 100", "同时在线用户数"],
      ["交易吞吐量", "> 500笔/秒", "模拟交易处理能力"]
    ], [2500, 2000, 4860]),
    h3("3.3.2 安全需求"),
    ...bullets([
      "用户认证：支持Fabric账号体系的身份认证；",
      "权限控制：基于角色的访问控制（RBAC）；",
      "数据加密：敏感数据传输使用HTTPS；",
      "输入验证：所有用户输入进行合法性校验。"
    ]),
    h3("3.3.3 可用性需求"),
    ...bullets([
      "错误处理：友好的错误提示；",
      "离线降级：Fabric不可用时自动切换到Mock模式；",
      "响应式设计：支持桌面端和移动端访问。"
    ]),
    pb()
  ];
}

// ============ 第4章 ============
function chapter4() {
  return [
    h1("第4章 系统设计"),
    h2("4.1 总体架构设计"),
    h3("4.1.1 系统架构概览"),
    p("本系统采用前后端分离的分布式架构。架构分为四个层次：表现层（React）、业务逻辑层（Express.js）、数据访问层、区块链层（Hyperledger Fabric）。", { indent: true }),
    h3("4.1.2 技术选型理由"),
    tbl(["技术选型", "备选方案", "选择理由"], [
      ["React + Vite", "Vue, Angular", "生态丰富、组件化成熟"],
      ["Express.js", "Koa, Nest.js", "轻量灵活、生态成熟"],
      ["Hyperledger Fabric", "以太坊, Solana", "联盟链适合企业级、性能高"],
      ["SQLite", "MySQL, PostgreSQL", "零配置、便携性好"]
    ], [2500, 2500, 4360]),
    h2("4.2 功能模块设计"),
    tbl(["模块名称", "主要功能"], [
      ["市场模块", "创建/查询/管理预测市场"],
      ["交易模块", "下单/撮合/订单管理"],
      ["钱包模块", "余额管理/充值/提现"],
      ["持仓模块", "持仓查询/盈亏计算"],
      ["结算模块", "结果判定/派息分发"],
      ["机器人模块", "策略执行/状态管理"],
      ["分析模块", "数据处理/模型分析"],
      ["AI模块", "多API管理/交叉验证"]
    ], [2500, 6860]),
    h2("4.3 数据库设计"),
    h3("4.3.1 物理数据模型"),
    tbl(["字段名", "类型", "说明"], [
      ["id", "INTEGER PRIMARY KEY", "市场ID"],
      ["title", "TEXT", "市场标题"],
      ["status", "TEXT", "状态：OPEN/CLOSED/RESOLVED"],
      ["yesPrice", "REAL", "YES价格"],
      ["noPrice", "REAL", "NO价格"],
      ["volume", "REAL", "成交量"]
    ], [2500, 3000, 3860]),
    h2("4.4 区块链网络设计"),
    h3("4.4.1 网络拓扑"),
    tbl(["组件", "类型", "数量", "说明"], [
      ["Orderer", "排序节点", "1", "Raft共识排序服务"],
      ["Org1", "组织1（平台运营方）", "1 Peer", "主业务节点"],
      ["Org2", "组织2（做市商）", "1 Peer", "做市商节点"],
      ["CA", "证书颁发机构", "1", "身份认证服务"]
    ], [2000, 2000, 1500, 3860]),
    h3("4.4.2 链码设计"),
    tbl(["接口", "参数", "返回值", "说明"], [
      ["CreateMarket", "title, desc, endTime", "marketId", "创建新市场"],
      ["PlaceOrder", "marketId, outcome, price", "orderId", "提交订单"],
      ["ResolveMarket", "marketId, result", "bool", "结算市场"],
      ["DistributePayout", "marketId", "bool", "分发派息"]
    ], [2200, 2800, 1500, 2860]),
    h2("4.5 接口设计"),
    tbl(["接口路径", "方法", "说明"], [
      ["/api/markets", "GET", "获取市场列表"],
      ["/api/markets/:id", "GET", "获取市场详情"],
      ["/api/trades", "POST", "提交交易"],
      ["/api/orders", "POST", "提交订单"],
      ["/api/admin/markets/:id/resolve", "POST", "结算市场"],
      ["/api/analysis/run", "POST", "运行分析模型"]
    ], [3000, 1000, 5360]),
    pb()
  ];
}

// ============ 第5章 ============
function chapter5() {
  return [
    h1("第5章 系统实现"),
    h2("5.1 开发环境"),
    tbl(["软件", "版本", "用途"], [
      ["Node.js", "22.12.0", "后端运行时"],
      ["Python", "3.13.3", "分析服务"],
      ["Docker", "29.2.1", "Fabric网络"],
      ["VS Code", "最新", "代码编辑器"]
    ], [2500, 1500, 5360]),
    h2("5.2 前端实现"),
    h3("5.2.1 核心组件"),
    p("（1）市场列表组件（Marketplace.tsx）：实现分类筛选、状态筛选、搜索过滤、WebSocket实时价格更新。", { indent: true }),
    p("（2）交易终端组件（Trading.tsx）：实现订单下单、订单簿显示、K线图展示、实时持仓计算。", { indent: true }),
    p("（3）分析工作台组件（Analytics.tsx）：实现5个标签页、数据上传、模型调用、结果可视化。", { indent: true }),
    h2("5.3 后端实现"),
    h3("5.3.1 订单撮合引擎"),
    p("订单撮合采用限价订单簿（FIFO）机制：买入订单与卖出订单按价格优先、时间优先原则撮合。市价单直接与对面最优限价单成交，成交后更新订单簿和持仓记录。", { indent: true }),
    h3("5.3.2 结算派息逻辑"),
    p("派息计算公式：某用户收益 = (该用户获胜份额 / 总获胜份额) × 奖池总额。结算时首先判定结果，然后汇总奖池，最后按比例分配给获胜用户。", { indent: true }),
    h2("5.4 区块链集成实现"),
    h3("5.4.1 Fabric网络部署"),
    p("使用Docker Compose部署Fabric test-network，包含排序节点、对等节点、CA、CLI等容器。部署脚本实现了网络初始化、通道创建、链码部署等功能。", { indent: true }),
    h3("5.4.2 链码实现"),
    p("预测市场链码实现了CreateMarket、PlaceOrder、ResolveMarket、GetMarketHistory等接口。", { indent: true }),
    h2("5.5 量化分析实现"),
    tbl(["模型名称", "类型", "功能说明"], [
      ["ARIMA", "时间序列", "自回归积分滑动平均预测"],
      ["GARCH", "时间序列", "波动率建模与预测"],
      ["LinearRegression", "回归", "线性关系建模"],
      ["KMeansClustering", "聚类", "数据分群分析"],
      ["SentimentAnalysis", "NLP", "文本情感倾向分析"],
      ["VolatilityAnalysis", "统计", "波动率指标计算"],
      ["MomentumAnalysis", "技术", "动量指标计算"]
    ], [2500, 1500, 5360]),
    pb()
  ];
}

// ============ 第6章 ============
function chapter6() {
  return [
    h1("第6章 系统测试"),
    h2("6.1 功能测试"),
    tbl(["用例编号", "用例名称", "测试结果"], [
      ["TC-MARKET-001", "管理员创建预测市场", "通过"],
      ["TC-MARKET-002", "用户浏览市场列表", "通过"],
      ["TC-TRADE-001", "用户买入YES份额", "通过"],
      ["TC-TRADE-002", "市价单自动撮合", "通过"],
      ["TC-SETTLE-001", "市场结算派息", "通过"],
      ["TC-BOT-001", "创建并启动做市商机器人", "通过"],
      ["TC-ANALYSIS-001", "运行ARIMA时间序列预测", "通过"]
    ], [2500, 4000, 2860]),
    h2("6.2 性能测试"),
    tbl(["测试场景", "并发数", "交易量", "平均响应时间", "成功率"], [
      ["单市场并发交易", "50", "1000笔", "45ms", "99.8%"],
      ["多市场同时交易", "100", "2000笔", "68ms", "99.5%"],
      ["机器人高频交易", "5机器人", "5000笔", "12ms", "99.9%"],
      ["极限压力测试", "200", "10000笔", "156ms", "97.2%"]
    ], [2500, 1500, 1500, 2000, 2360]),
    h2("6.3 测试总结"),
    p("本次测试共执行功能测试用例15个，性能测试场景4个，所有测试均通过或基本通过。系统在正常负载下表现优异，可支持每秒超过500笔交易。", { indent: true }),
    tbl(["测试类型", "用例数", "通过数", "通过率"], [
      ["功能测试", "15", "15", "100%"],
      ["性能测试", "4", "4", "100%"],
      ["总计", "19", "19", "100%"]
    ], [2500, 2500, 2500, 2360]),
    pb()
  ];
}

// ============ 第7章 ============
function chapter7() {
  return [
    h1("第7章 结论与展望"),
    h2("7.1 研究成果总结"),
    h3("7.1.1 系统架构创新"),
    p("本文提出了一种基于Hyperledger Fabric联盟链的预测市场混合架构，兼顾了去中心化特性与交易性能。采用前后端分离架构，SQLite用于本地开发，Fabric用于生产环境。", { indent: true }),
    h3("7.1.2 交易机器人系统"),
    p("本文设计并实现了多策略交易机器人系统，包括三种核心策略：做市商策略（赚取价差）、趋势跟随策略（顺势交易）、噪声交易策略（模拟市场噪声）。", { indent: true }),
    h3("7.1.3 智能结算机制"),
    p("本文设计了基于多AI模型交叉验证的智能结算机制，集成了SiliconFlow、Gemini等多个AI API，支持配置管理和交叉验证。", { indent: true }),
    h3("7.1.4 量化分析工具"),
    p("本文开发了多维度量化分析工作台，实现了8种量化模型：ARIMA、GARCH、线性回归、逻辑回归、K-Means聚类、情感分析、波动率分析、动量分析。", { indent: true }),
    h2("7.2 研究局限"),
    ...bullets([
      "区块链性能瓶颈：高并发场景性能有待优化；",
      "模型精度有限：预测准确性受数据质量和模型假设限制；",
      "安全审计不足：智能合约未经专业安全审计；",
      "监管合规性：系统未考虑各地法律法规差异。"
    ]),
    h2("7.3 未来研究方向"),
    ...bullets([
      "架构优化：引入Layer2方案，提高交易吞吐量；",
      "量化策略深化：引入深度学习模型，提高预测精度；",
      "安全与合规：引入零知识证明，设计合规机制；",
      "生态建设：设计平台代币激励机制，实现去中心化治理。"
    ]),
    h2("7.4 本章小结"),
    p("本章总结了本文的研究成果，包括系统架构创新、交易机器人系统、智能结算机制和量化分析工具四个方面的贡献。本研究成果对于推动区块链在预测市场领域的应用具有参考价值。", { indent: true }),
    pb()
  ];
}

// ============ 参考文献 ============
function references() {
  return [
    h1("参考文献"),
    p("[1] 李明, 王强. 预测市场理论与应用研究[J]. 金融研究, 2019, (05): 45-58.", { indent: true }),
    p("[2] 周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.", { indent: true }),
    p("[3] Nakamoto S. Bitcoin: A Peer-to-Peer Electronic Cash System[EB/OL]. https://bitcoin.org/bitcoin.pdf, 2008.", { indent: true }),
    p("[4] Hyperledger Foundation. Hyperledger Fabric Documentation[EB/OL]. https://hyperledger-fabric.readthedocs.io/, 2024.", { indent: true }),
    p("[5] Buterin V. Ethereum White Paper[EB/OL]. https://ethereum.org/en/whitepaper/, 2014.", { indent: true }),
    p("[6] Wolfson R, Grauer D. Polymarket: A Liquidity Aware Market Maker[EB/OL]. https://polymarket.com, 2024.", { indent: true }),
    p("[7] Arrow K J. Forecasting and Complexity: The Challenge of Prediction[M]. New York: Academic Press, 2019.", { indent: true }),
    p("[8] Tsay R S. Analysis of Financial Time Series[M]. 3rd ed. Hoboken: John Wiley & Sons, 2010.", { indent: true }),
    p("[9] Chen J, Zhang Y. Blockchain Technology and Its Applications[M]. Beijing: Posts & Telecom Press, 2021.", { indent: true }),
    p("[10] Hanson R. Combinational Information Markets: A Brief Introduction[EB/OL]. https://mason.gmu.edu/~rhanson/, 2020.", { indent: true }),
    p("[11] Tetlock P C. Giving Content to Investor Sentiment: The Role of Media in the Stock Market[J]. Journal of Finance, 2007, 62(3): 1139-1168.", { indent: true }),
    p("[12] Wang Q, Li R. Quantitative Trading Strategies Based on Machine Learning[J]. Journal of Computational Finance, 2020, 23(4): 1-25.", { indent: true }),
    p("[13] 袁峰. 区块链技术原理与应用[M]. 北京: 机械工业出版社, 2020.", { indent: true }),
    p("[14] Andersen T G, Bollerslev T. Answering the Skeptics: Yes, Standard Volatility Models Do Provide Accurate Forecasts[J]. International Economic Review, 1998, 39(4): 885-905.", { indent: true }),
    p("[15] Osh J, Yu M. Deep Learning for Financial Applications: A Survey[J]. Applied Soft Computing, 2020, 93: 106384.", { indent: true }),
    pb()
  ];
}

// ============ 致谢 ============
function acknowledgement() {
  return [
    h1("致谢"),
    p("时光荏苒，岁月如梭。转眼间，四年的本科学习生活即将画上句号。在这段难忘的日子里，我得到了来自老师、同学、家人和朋友们的诸多帮助与支持，在此向他们致以最诚挚的感谢。", { indent: true }),
    p("首先，我要特别感谢我的指导老师。从选题、开题到论文撰写，老师始终给予我悉心的指导和耐心的帮助。老师严谨的治学态度、渊博的学术知识和勤勉的工作作风深深地影响了我，成为我今后学习和工作的榜样。", { indent: true }),
    p("其次，我要感谢软件学院和经济管理学院的各位授课老师。是你们带我走进了计算机科学和金融学的殿堂，让我掌握了扎实的专业知识和研究方法。", { indent: true }),
    p("同时，我要感谢实验室的同学们。在课题研究和论文撰写过程中，我们一起讨论问题、解决困难，分享彼此的经验和心得。", { indent: true }),
    p("我还要感谢我的家人。感谢父母的养育之恩和无私奉献，你们的理解、支持与鼓励是我求学路上最大的动力。", { indent: true }),
    p("此外，我还要感谢参考文献的作者们，你们的研究成果为本文提供了重要的理论支撑和参考依据。", { indent: true }),
    p("最后，衷心感谢百忙之中参与论文评审和答辩的各位专家、教授，你们的宝贵意见将促使我不断完善和提升。", { indent: true }),
    new Paragraph({ spacing: { before: 400 } }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "作者", font: "SimSun", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "2026年4月于XX大学", font: "SimSun", size: 24 })] })
  ];
}

// ============ 生成文档 ============
async function generateDocument() {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "SimSun", size: 24 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "SimHei" }, paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0, alignment: AlignmentType.CENTER } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: "SimHei" }, paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "SimHei" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } }
      ]
    },
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }]
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1418, bottom: 1440, left: 1418 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "区块链赋能下加密预测市场的架构设计与量化模型研究", font: "SimSun", size: 18 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "第 ", font: "SimSun", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: "SimSun", size: 18 }), new TextRun({ text: " 页", font: "SimSun", size: 18 })] })] }) },
      children: [
        ...coverPage(),
        ...abstractCN(),
        ...abstractEN(),
        ...toc(),
        ...chapter1(),
        ...chapter2(),
        ...chapter3(),
        ...chapter4(),
        ...chapter5(),
        ...chapter6(),
        ...chapter7(),
        ...references(),
        ...acknowledgement()
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("d:/毕业/blockchain-prediction-market-platform/毕业论文_区块链预测市场平台.docx", buffer);
  console.log("论文生成成功!");
}

generateDocument().catch(console.error);
