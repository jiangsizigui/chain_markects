import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { createServer as createHttpServer } from "node:http";
import { GoogleGenAI } from "@google/genai";
import initSqlJs from "sql.js";
import fs from "node:fs";
import crypto from "node:crypto";
import { ethers } from "ethers";
import { WebSocketServer } from "ws";
import "dotenv/config";
import { 
  Market, MarketStatus, OutcomeType, Order, OrderSide, OrderStatus, OrderType,
  Trade, Position, Wallet 
} from "./src/types";

type FabricContractLike = {
  submitTransaction: (...args: string[]) => Promise<Uint8Array>;
  evaluateTransaction: (...args: string[]) => Promise<Uint8Array>;
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const SERVER_BUILD = new Date().toISOString();

  type AIProviderId = "openai" | "qwen" | "gemini";
  type AIKeyConfig = { label?: string; apiKey: string };
  type AIProviderConfig = {
    id: AIProviderId;
    enabled: boolean;
    model: string;
    baseUrl?: string; // OpenAI-compatible
    keys: AIKeyConfig[]; // 支持多 key（轮询）
  };
  type AISettings = {
    mode?: "manual" | "assist" | "auto";
    systemPrompt: string;
    reviewPrompt: string;
    settlePrompt: string;
    retrieval?: {
      enabled: boolean;
      provider: "tavily" | "serpapi" | "bing";
      apiKey: string;
      maxResults: number;
    };
    crossValidate: boolean;
    providers: AIProviderConfig[];
  };
  type BotStrategy = "market_maker" | "momentum" | "noise";
  type BotConfig = {
    id: string;
    name: string;
    enabled: boolean;
    strategy: BotStrategy;
    marketIds: number[];
    intensity: number; // 1-10
    maxOrderSize: number;
    riskPreference: number; // 0-100
    horizon: "short" | "medium" | "long";
    // 自动执行配置
    intervalSeconds: number; // 执行间隔（秒），0表示禁用自动执行
    // 执行状态追踪
    lastRunAt: string | null;
    lastTradeCount: number;
    totalTrades: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  };
  type DatasetRecord = {
    id: string;
    name: string;
    source: "platform" | "upload";
    schema: Array<{ name: string; type: "number" | "string" | "boolean" | "date" | "unknown" }>;
    rowCount: number;
    sample: any[];
    createdAt: string;
  };
  type AnalysisJob = {
    id: string;
    model: string;
    payload: any;
    status: "pending" | "running" | "done" | "error";
    progress: number;
    result?: any;
    error?: string;
    createdAt: string;
    updatedAt: string;
  };
  type FabricUser = {
    userId: string;
    password: string;
    role: "user" | "admin";
    createdAt: string;
  };

  app.use(cors());
  app.use(express.json());

  // --- Persistence (SQLite via sql.js) ---
  const DATA_DIR = path.join(process.cwd(), "data");
  const DB_PATH = path.join(DATA_DIR, "persist.sqlite");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      // sql.js will load wasm from node_modules
      return path.join(process.cwd(), "node_modules", "sql.js", "dist", file);
    }
  });

  const loadDbFile = (): Uint8Array | undefined => {
    if (!fs.existsSync(DB_PATH)) return undefined;
    return new Uint8Array(fs.readFileSync(DB_PATH));
  };

  const db = new SQL.Database(loadDbFile());
  db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

  const kvGet = <T>(key: string, fallback: T): T => {
    const stmt = db.prepare("SELECT value FROM kv WHERE key = ?");
    stmt.bind([key]);
    try {
      if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return JSON.parse(row.value as string) as T;
      }
      return fallback;
    } finally {
      stmt.free();
    }
  };

  const kvSet = (key: string, value: unknown) => {
    const v = JSON.stringify(value);
    db.run("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, v]);
    scheduleFlush();
  };

  let flushTimer: NodeJS.Timeout | null = null;
  const flushDb = () => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushDb();
    }, 300);
  };

  const seededMarkets: Market[] = [
    // 1 政治与政策
    {
      id: 1,
      title: "美国是否会在2026年1月1日前通过新的全国性AI监管法案？",
      description:
        "近年来人工智能监管问题受到全球关注，美国政府和国会正在讨论多项AI监管框架。本市场用于预测美国是否会在指定日期前通过新的联邦层面AI监管法律。\n\n结算条件：\n- 若美国国会通过相关法案并由总统签署成为正式法律，则结果为 YES\n- 若截至2026年1月1日未通过相关法律，则结果为 NO",
      endTime: "2026-01-01T00:00:00Z",
      resolutionSource: "美国国会/白宫官方公告",
      status: MarketStatus.OPEN,
      category: "政治与政策",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 2,
      title: "欧盟是否会在2025年底前正式实施新的数字市场监管政策？",
      description:
        "欧盟近年来持续推进数字市场监管，例如《数字市场法案》（DMA）等。本市场预测欧盟是否会在规定时间内实施新的重要数字市场监管政策。\n\n结算条件：\n- 若欧盟官方机构宣布并实施新的数字市场监管政策，则为 YES\n- 若未实施，则为 NO",
      endTime: "2025-12-31T23:59:59Z",
      resolutionSource: "欧盟官方公报/欧盟委员会公告",
      status: MarketStatus.OPEN,
      category: "政治与政策",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    // 2 经济与金融
    {
      id: 3,
      title: "比特币价格是否会在2025年12月31日前超过100,000美元？",
      description:
        "比特币价格波动较大，市场普遍关注其未来走势。本市场预测比特币价格是否会突破10万美元。\n\n结算条件：\n- 若在任意时间点主流交易所平均价格超过100,000美元，则为 YES\n- 若未达到该价格，则为 NO",
      endTime: "2025-12-31T23:59:59Z",
      resolutionSource: "主流加密货币交易所平均价格",
      status: MarketStatus.OPEN,
      category: "经济与金融",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 4,
      title: "美国联邦储备委员会是否会在2025年内至少降息两次？",
      description:
        "利率政策对全球金融市场具有重要影响。本市场预测美联储是否会在2025年内至少进行两次降息。\n\n结算条件：\n- 若美联储在2025年内至少宣布两次降息，则为 YES\n- 若降息少于两次或未降息，则为 NO",
      endTime: "2025-12-31T23:59:59Z",
      resolutionSource: "美联储官方利率决议",
      status: MarketStatus.OPEN,
      category: "经济与金融",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    // 3 科技发展
    {
      id: 5,
      title: "某大型科技公司是否会在2025年底前发布新一代人工智能模型？",
      description:
        "人工智能技术发展迅速，大型科技公司持续发布新模型。本市场预测该公司是否会在指定时间内发布新一代AI模型。\n\n结算条件：\n- 若公司官方发布新一代AI模型产品，则为 YES\n- 若未发布，则为 NO",
      endTime: "2025-12-31T23:59:59Z",
      resolutionSource: "公司官方发布/新闻稿",
      status: MarketStatus.OPEN,
      category: "科技发展",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 6,
      title: "自动驾驶出租车是否会在2026年前在至少三个大型城市实现商业运营？",
      description:
        "自动驾驶技术正在逐步落地，本市场预测自动驾驶出租车服务是否会在多个城市实现商业化运营。\n\n结算条件：\n- 若至少三个大型城市正式允许自动驾驶出租车商业运营，则为 YES\n- 若少于三个城市，则为 NO",
      endTime: "2026-01-01T00:00:00Z",
      resolutionSource: "城市监管部门公告/运营方公告",
      status: MarketStatus.OPEN,
      category: "科技发展",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    // 4 全球事件
    {
      id: 7,
      title: "全球可再生能源发电比例是否会在2030年前达到50%？",
      description:
        "全球正在推动能源转型，本市场预测可再生能源发电比例是否达到关键水平。\n\n结算条件：\n- 若权威能源机构数据显示比例达到50%或以上，则为 YES\n- 若未达到，则为 NO",
      endTime: "2030-01-01T00:00:00Z",
      resolutionSource: "国际能源机构（IEA）",
      status: MarketStatus.OPEN,
      category: "全球事件",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 8,
      title: "联合国是否会在2026年前通过新的全球气候合作协议？",
      description:
        "全球气候问题需要国际合作，本市场预测是否会出现新的国际气候合作协议。\n\n结算条件：\n- 若联合国框架下签署新的全球气候协议，则为 YES\n- 若未签署，则为 NO",
      endTime: "2026-01-01T00:00:00Z",
      resolutionSource: "联合国/UNFCCC 官方公告",
      status: MarketStatus.OPEN,
      category: "全球事件",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    // 5 娱乐与文化
    {
      id: 9,
      title: "某年度奥斯卡最佳影片是否会由流媒体平台制作的电影获得？",
      description:
        "近年来流媒体平台在电影制作领域影响力不断提升。本市场预测奥斯卡最佳影片是否来自流媒体平台。\n\n结算条件：\n- 若获奖电影由流媒体平台制作或发行，则为 YES\n- 否则为 NO",
      endTime: "2026-03-31T23:59:59Z",
      resolutionSource: "奥斯卡官方获奖名单",
      status: MarketStatus.OPEN,
      category: "娱乐与文化",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 10,
      title: "某电影是否会在上映首月全球票房超过10亿美元？",
      description:
        "大型商业电影经常挑战票房纪录，本市场预测某电影票房表现。\n\n结算条件：\n- 若上映首月全球票房超过10亿美元，则为 YES\n- 若未达到，则为 NO\n\n数据来源：官方票房统计机构。",
      endTime: "2026-12-31T23:59:59Z",
      resolutionSource: "官方票房统计机构",
      status: MarketStatus.OPEN,
      category: "娱乐与文化",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    // 6 体育赛事
    {
      id: 11,
      title: "某国家是否会在下一届世界杯中进入四强？",
      description:
        "世界杯是全球关注度最高的体育赛事之一，本市场预测某国家队的比赛表现。\n\n结算条件：\n- 若该国家队进入四强，则为 YES\n- 否则为 NO",
      endTime: "2026-12-31T23:59:59Z",
      resolutionSource: "FIFA 官方赛事结果",
      status: MarketStatus.OPEN,
      category: "体育赛事",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    },
    {
      id: 12,
      title: "某运动员是否会在下一赛季打破历史得分纪录？",
      description:
        "体育赛事中经常出现新的纪录，本市场预测某运动员表现。\n\n结算条件：\n- 若正式比赛中打破历史纪录，则为 YES\n- 否则为 NO",
      endTime: "2026-12-31T23:59:59Z",
      resolutionSource: "官方赛事统计/联盟官方数据",
      status: MarketStatus.OPEN,
      category: "体育赛事",
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    }
  ];

  // --- In-Memory State (Loaded from DB) ---
  let markets: Market[] = kvGet<Market[]>("markets", seededMarkets);

  let orders: Order[] = kvGet<Order[]>("orders", []);
  let trades: Trade[] = kvGet<Trade[]>("trades", []);
  let positions: Position[] = kvGet<Position[]>("positions", []);
  let wallets: Wallet[] = kvGet<Wallet[]>("wallets", []);
  let admins: string[] = kvGet<string[]>("admins", []);
  let adminTokens: Record<string, { address: string; expiresAt: string }> = kvGet("adminTokens", {});
  let bots: BotConfig[] = kvGet<BotConfig[]>("bots", []);

  // --- Bot Timer Management ---
  const botTimers: Map<string, NodeJS.Timeout> = new Map();

  // 启动单个bot的定时器
  const startBotTimer = (bot: BotConfig) => {
    if (!bot.enabled || bot.intervalSeconds <= 0) return;
    stopBotTimer(bot.id); // 先停止旧的
    const interval = Math.max(3000, bot.intervalSeconds * 1000); // 最小3秒
    const timerId = setInterval(() => {
      try {
        runSingleBot(bot.id);
      } catch (e) {
        console.error(`Bot ${bot.name} execution error:`, e);
      }
    }, interval);
    botTimers.set(bot.id, timerId);
    console.log(`[Bot] Started ${bot.name} with interval ${bot.intervalSeconds}s`);
  };

  // 停止单个bot的定时器
  const stopBotTimer = (botId: string) => {
    const existing = botTimers.get(botId);
    if (existing) {
      clearInterval(existing);
      botTimers.delete(botId);
      console.log(`[Bot] Stopped timer for ${botId}`);
    }
  };

  // 为所有启用的bot启动定时器（服务启动时调用）
  const startAllBotTimers = () => {
    bots.forEach(bot => {
      if (bot.enabled && bot.intervalSeconds > 0) {
        startBotTimer(bot);
      }
    });
  };
  let datasets: DatasetRecord[] = kvGet<DatasetRecord[]>("datasets", []);
  let datasetRows: Record<string, any[]> = kvGet<Record<string, any[]>>("datasetRows", {});
  let analysisJobs: AnalysisJob[] = kvGet<AnalysisJob[]>("analysisJobs", []);
  let fabricUsers: FabricUser[] = kvGet<FabricUser[]>("fabricUsers", []);

  const defaultAISettings: AISettings = {
    mode: "assist",
    systemPrompt:
      "你是预测市场平台的审核与结算助手。你必须输出严格 JSON（不包裹 Markdown），不得输出多余文本。",
    reviewPrompt:
      `请审核预测市场问题是否清晰可判定，且不包含违法、极端、侵权、个人隐私等高风险内容。\n` +
      `仅输出 JSON：{"recommend":"APPROVE"|"REJECT","reasons":"...","suggestion":"..."}`,
    settlePrompt:
      `你将基于"预测市场题目 + 联网检索证据摘要"判断事件是否发生，并输出严格 JSON（禁止包裹在代码块中）。\n` +
      `仅输出 JSON：{"outcome":"YES"|"NO","reasons":"简要原因（引用证据编号）","sources":[{"title":"...","url":"..."}]}`,
    retrieval: {
      enabled: false,
      provider: "tavily",
      apiKey: "",
      maxResults: 5
    },
    crossValidate: true,
    providers: [
      // ===== 🌟 国内免费模型（推荐，无需代理）=====
      {
        id: "siliconflow",
        enabled: true,  // 默认启用，SiliconFlow 国内直连
        model: "Qwen/Qwen2.5-7B-Instruct",
        baseUrl: "https://api.siliconflow.cn/v1",
        keys: process.env.SILICONFLOW_API_KEY ? [{ label: "env", apiKey: process.env.SILICONFLOW_API_KEY }] : []
      },
      {
        id: "qwen",
        enabled: false,
        model: "qwen-plus",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        keys: process.env.DASHSCOPE_API_KEY ? [{ label: "env", apiKey: process.env.DASHSCOPE_API_KEY }] : []
      },
      {
        id: "deepseek",
        enabled: false,
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
        keys: process.env.DEEPSEEK_API_KEY ? [{ label: "env", apiKey: process.env.DEEPSEEK_API_KEY }] : []
      },
      {
        id: "zhipu",
        enabled: false,
        model: "glm-4-flash",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        keys: process.env.ZHIPU_API_KEY ? [{ label: "env", apiKey: process.env.ZHIPU_API_KEY }] : []
      },
      {
        id: "moonshot",
        enabled: false,
        model: "moonshot-v1-8k",
        baseUrl: "https://api.moonshot.cn/v1",
        keys: process.env.MOONSHOT_API_KEY ? [{ label: "env", apiKey: process.env.MOONSHOT_API_KEY }] : []
      },
      // ===== 国际模型（需代理）=====
      {
        id: "gemini",
        enabled: false,
        model: "gemini-2.0-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        keys: process.env.GEMINI_API_KEY ? [{ label: "env", apiKey: process.env.GEMINI_API_KEY }] : []
      },
      {
        id: "openai",
        enabled: false,
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        keys: process.env.OPENAI_API_KEY ? [{ label: "env", apiKey: process.env.OPENAI_API_KEY }] : []
      }
    ]
  };

  let aiSettings: AISettings = kvGet<AISettings>("aiSettings", defaultAISettings);
  if (!aiSettings?.providers?.length) {
    aiSettings = defaultAISettings;
    kvSet("aiSettings", aiSettings);
  }

  // 启动时：将 .env 中的各 provider Key 补注入到已有 aiSettings 里
  // 只补入没有 Key 的 provider，不覆盖手动配置的 Key
  const envKeyMap: Record<string, string | undefined> = {
    siliconflow: process.env.SILICONFLOW_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    qwen: process.env.DASHSCOPE_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    zhipu: process.env.ZHIPU_API_KEY,
    moonshot: process.env.MOONSHOT_API_KEY,
  };
  let settingsPatched = false;
  aiSettings.providers = aiSettings.providers.map(p => {
    const envKey = envKeyMap[p.id];
    if (envKey) {
      // 如果已有 env 标签的 key，更新它（env 变量可能改变）
      const hasEnvLabel = p.keys?.some(k => k.label === "env");
      if (hasEnvLabel) {
        settingsPatched = true;
        return { ...p, enabled: true, keys: [{ label: "env", apiKey: envKey }, ...p.keys.filter(k => k.label !== "env")] };
      }
      // 如果没有任何 key，补入 env key
      if (!p.keys || p.keys.length === 0) {
        settingsPatched = true;
        return { ...p, enabled: true, keys: [{ label: "env", apiKey: envKey }] };
      }
    }
    return p;
  });
  if (settingsPatched) kvSet("aiSettings", aiSettings);

  // 若数据库仍是旧题库（不包含新分类/新题目），自动迁移到新题库（保留最小惊讶：仅当明显不匹配时覆盖）
  const newCategories = new Set(["政治与政策", "经济与金融", "科技发展", "全球事件", "娱乐与文化", "体育赛事"]);
  const hasNewCategory = markets.some(m => newCategories.has(m.category));
  const hasNewSeedTitle = markets.some(m => (m.title || "").includes("美国是否会在2026年1月1日前通过新的全国性AI监管法案"));
  const looksLikeOldSeed = markets.some(m => (m.title || "").includes("PMT 代币会在本月内突破"));
  if (!hasNewCategory && !hasNewSeedTitle && looksLikeOldSeed) {
    markets = seededMarkets;
    kvSet("markets", markets);
  }

  if (fabricUsers.length === 0) {
    fabricUsers = [
      {
        userId: "admin",
        password: process.env.ADMIN_SECRET || "admin123",
        role: "admin",
        createdAt: new Date().toISOString()
      }
    ];
    kvSet("fabricUsers", fabricUsers);
  }

  let fabricContract: FabricContractLike | null = null;
  let fabricReady = false;
  let fabricLastError = "";
  let fabricMockMode = false; // Mock 模式标志

  // 检查是否启用 Fabric Mock 模式（当 FABRIC_ENABLED=false 或配置不完整时启用）
  const useFabricMock = () => {
    const enabled = process.env.FABRIC_ENABLED !== 'false';
    const hasProfile = !!process.env.FABRIC_CONNECTION_PROFILE;
    return !enabled || !hasProfile;
  };

  // Mock Fabric 实现：当 Fabric 不可用时，使用本地 SQLite 存储作为账本
  const mockFabricContract: FabricContractLike = {
    submitTransaction: async (fn: string, ...args: string[]) => {
      const payload = args[0] || '{}';
      const data = JSON.parse(payload);

      if (fn === 'CreateTrade') {
        // 将交易存储到 SQLite kv 表
        const key = `fabric_trade_${data.id || Date.now()}`;
        kvSet(key, { ...data, fabric_timestamp: new Date().toISOString() });
        console.log(`[Fabric Mock] CreateTrade: ${data.id}`);
      } else if (fn === 'CreateOrder') {
        const key = `fabric_order_${data.id || Date.now()}`;
        kvSet(key, { ...data, fabric_timestamp: new Date().toISOString() });
        console.log(`[Fabric Mock] CreateOrder: ${data.id}`);
      }

      return new Uint8Array(Buffer.from(JSON.stringify({ ok: true })));
    },
    evaluateTransaction: async (fn: string, ...args: string[]) => {
      const marketId = args[0];
      if (fn === 'QueryTradesByMarket') {
        // 从 SQLite kv 表查询交易
        const allTrades: any[] = [];
        const tradeKeys: string[] = kvGet("fabric_trade_keys", []);
        for (const k of tradeKeys) {
          const t = kvGet<any>(k, null);
          if (t && t.marketId === parseInt(marketId)) {
            allTrades.push(t);
          }
        }
        return new Uint8Array(Buffer.from(JSON.stringify(allTrades)));
      }
      return new Uint8Array(Buffer.from(JSON.stringify([])));
    }
  };

  const initFabricGateway = async () => {
    // 如果启用 Mock 模式，直接返回 Mock 合约
    if (useFabricMock()) {
      fabricMockMode = true;
      fabricReady = true;
      fabricContract = mockFabricContract;
      fabricLastError = "";
      console.log("[Fabric] 运行在 Mock 模式（使用本地 SQLite 存储）");
      return fabricContract;
    }

    if (fabricReady && fabricContract && !fabricMockMode) return fabricContract;
    try {
      const connectionProfilePath = process.env.FABRIC_CONNECTION_PROFILE || "";
      const walletPath = process.env.FABRIC_WALLET_PATH || path.join(process.cwd(), "fabric", "wallet");
      const identity = process.env.FABRIC_IDENTITY || "appUser";
      const channelName = process.env.FABRIC_CHANNEL || "mychannel";
      const chaincodeName = process.env.FABRIC_CHAINCODE || "predictionmarket";
      if (!connectionProfilePath || !fs.existsSync(connectionProfilePath)) {
        throw new Error("缺少 FABRIC_CONNECTION_PROFILE 或文件不存在");
      }
      const { Wallets, Gateway } = await import("fabric-network");
      const ccp = JSON.parse(fs.readFileSync(connectionProfilePath, "utf8"));
      const wallet = await Wallets.newFileSystemWallet(walletPath);
      const id = await wallet.get(identity);
      if (!id) throw new Error(`wallet 中不存在 identity: ${identity}`);
      const gateway = new Gateway();
      await gateway.connect(ccp, {
        wallet,
        identity,
        discovery: { enabled: true, asLocalhost: true }
      });
      const network = await gateway.getNetwork(channelName);
      fabricContract = network.getContract(chaincodeName) as unknown as FabricContractLike;
      fabricReady = true;
      fabricMockMode = false;
      fabricLastError = "";
      console.log("[Fabric] 已连接到真实 Fabric 网络");
      return fabricContract;
    } catch (e: any) {
      fabricReady = false;
      fabricContract = null;
      fabricLastError = String(e?.message || e);
      fabricMockMode = true;
      console.warn(`[Fabric] 连接失败，自动切换到 Mock 模式: ${fabricLastError}`);
      fabricContract = mockFabricContract;
      fabricReady = true;
      return fabricContract;
    }
  };

  const fabricCreateTrade = async (trade: Trade) => {
    const c = await initFabricGateway();
    if (!c) throw new Error(fabricLastError || "Fabric gateway not ready");
    const payload = JSON.stringify(trade);
    await c.submitTransaction("CreateTrade", payload);
  };

  const fabricCreateOrder = async (order: Order) => {
    const c = await initFabricGateway();
    if (!c) throw new Error(fabricLastError || "Fabric gateway not ready");
    const payload = JSON.stringify(order);
    // 最小实现：若链码未实现 CreateOrder，捕获并忽略
    try {
      await c.submitTransaction("CreateOrder", payload);
    } catch {}
  };

  const fabricQueryTradesByMarket = async (marketId: number) => {
    const c = await initFabricGateway();
    if (!c) throw new Error(fabricLastError || "Fabric gateway not ready");
    const out = await c.evaluateTransaction("QueryTradesByMarket", String(marketId));
    const text = Buffer.from(out).toString("utf8");
    return JSON.parse(text || "[]");
  };

  // 将市场数据同步上链
  const fabricCreateMarket = async (market: Market) => {
    const c = await initFabricGateway();
    if (!c) return; // Mock 模式下直接跳过
    try {
      const payload = JSON.stringify({
        id: market.id,
        question: market.question,
        category: market.category,
        endTime: market.endTime,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        status: market.status,
        createdAt: market.createdAt
      });
      await c.submitTransaction("CreateMarket", payload);
    } catch (e: any) {
      // 如果是 Mock 模式或链码未部署，静默忽略
      if (!fabricMockMode) {
        console.warn("[Fabric] CreateMarket 失败:", e?.message);
      }
    }
  };

  // 结算市场 - 同步上链
  const fabricResolveMarket = async (marketId: number, outcome: boolean) => {
    const c = await initFabricGateway();
    if (!c) return;
    try {
      await c.submitTransaction("ResolveMarket", String(marketId), outcome ? "YES" : "NO");
    } catch (e: any) {
      if (!fabricMockMode) {
        console.warn("[Fabric] ResolveMarket 失败:", e?.message);
      }
    }
  };

  // 查询账本统计
  const fabricGetLedgerStats = async () => {
    const c = await initFabricGateway();
    if (!c) return null;
    try {
      const out = await c.evaluateTransaction("GetLedgerStats");
      return JSON.parse(Buffer.from(out).toString("utf8"));
    } catch {
      return null;
    }
  };

  // 查询所有上链市场
  const fabricGetAllMarkets = async () => {
    const c = await initFabricGateway();
    if (!c) return [];
    try {
      const out = await c.evaluateTransaction("GetAllMarkets");
      return JSON.parse(Buffer.from(out).toString("utf8") || "[]");
    } catch {
      return [];
    }
  };

  // 注入演示成交与市场统计（用于分析看板可用性展示）
  const seedDemoAnalyticsData = () => {
    const demoUsers = [
      "0xaaa0000000000000000000000000000000000001",
      "0xbbb0000000000000000000000000000000000002",
      "0xccc0000000000000000000000000000000000003",
      "0xddd0000000000000000000000000000000000004",
      "0xeee0000000000000000000000000000000000005"
    ];
    const now = Date.now();
    const demoTradeRows = [
      { marketId: 1, price: 58, amount: 120, outcome: OutcomeType.YES, h: 72 },
      { marketId: 1, price: 61, amount: 90, outcome: OutcomeType.YES, h: 60 },
      { marketId: 1, price: 56, amount: 80, outcome: OutcomeType.NO, h: 48 },
      { marketId: 2, price: 47, amount: 100, outcome: OutcomeType.NO, h: 70 },
      { marketId: 2, price: 45, amount: 110, outcome: OutcomeType.NO, h: 54 },
      { marketId: 3, price: 66, amount: 200, outcome: OutcomeType.YES, h: 50 },
      { marketId: 3, price: 69, amount: 170, outcome: OutcomeType.YES, h: 36 },
      { marketId: 4, price: 52, amount: 130, outcome: OutcomeType.YES, h: 32 },
      { marketId: 4, price: 49, amount: 90, outcome: OutcomeType.NO, h: 26 },
      { marketId: 5, price: 63, amount: 150, outcome: OutcomeType.YES, h: 28 },
      { marketId: 5, price: 65, amount: 140, outcome: OutcomeType.YES, h: 20 },
      { marketId: 6, price: 40, amount: 110, outcome: OutcomeType.NO, h: 24 },
      { marketId: 7, price: 54, amount: 90, outcome: OutcomeType.YES, h: 22 },
      { marketId: 8, price: 51, amount: 95, outcome: OutcomeType.YES, h: 16 },
      { marketId: 9, price: 46, amount: 85, outcome: OutcomeType.NO, h: 14 },
      { marketId: 10, price: 57, amount: 125, outcome: OutcomeType.YES, h: 12 },
      { marketId: 11, price: 44, amount: 105, outcome: OutcomeType.NO, h: 10 },
      { marketId: 12, price: 59, amount: 115, outcome: OutcomeType.YES, h: 8 }
    ];

    trades = demoTradeRows.map((r, i) => {
      const buyerId = demoUsers[i % demoUsers.length];
      const sellerId = demoUsers[(i + 1) % demoUsers.length];
      return {
        id: `seed-trade-${i + 1}`,
        marketId: r.marketId,
        price: r.price,
        amount: r.amount,
        buyerId,
        sellerId,
        outcome: r.outcome,
        timestamp: new Date(now - r.h * 3600 * 1000).toISOString(),
        buyerSide: OrderSide.BUY,
        sellerSide: OrderSide.SELL,
        buyerOutcome: r.outcome,
        sellerOutcome: r.outcome,
        buyerPrice: r.price,
        sellerPrice: r.price
      };
    });

    const byMarket = new Map<number, Trade[]>();
    trades.forEach(t => {
      const arr = byMarket.get(t.marketId) || [];
      arr.push(t);
      byMarket.set(t.marketId, arr);
    });
    markets = markets.map(m => {
      const arr = byMarket.get(m.id) || [];
      if (arr.length === 0) return m;
      const latest = arr[arr.length - 1];
      const yesTrades = arr.filter(t => t.outcome === OutcomeType.YES);
      const noTrades = arr.filter(t => t.outcome === OutcomeType.NO);
      const yesPrice =
        yesTrades.length > 0 ? Math.round(yesTrades.reduce((s, t) => s + t.price, 0) / yesTrades.length) : m.yesPrice;
      const noPrice =
        noTrades.length > 0 ? Math.round(noTrades.reduce((s, t) => s + t.price, 0) / noTrades.length) : (100 - yesPrice);
      const users = new Set<string>();
      arr.forEach(t => {
        users.add(t.buyerId.toLowerCase());
        users.add(t.sellerId.toLowerCase());
      });
      return {
        ...m,
        yesPrice: latest.outcome === OutcomeType.YES ? latest.price : yesPrice,
        noPrice: latest.outcome === OutcomeType.NO ? latest.price : noPrice,
        volume: arr.reduce((s, t) => s + t.amount, 0),
        participants: users.size
      };
    });

    kvSet("trades", trades);
    kvSet("markets", markets);
  };

  const appendSimulatedTrades = (count: number) => {
    if (markets.length === 0 || count <= 0) return;
    const now = Date.now();
    const users = [
      "0xsim000000000000000000000000000000000001",
      "0xsim000000000000000000000000000000000002",
      "0xsim000000000000000000000000000000000003",
      "0xsim000000000000000000000000000000000004",
      "0xsim000000000000000000000000000000000005",
      "0xsim000000000000000000000000000000000006"
    ];

    for (let i = 0; i < count; i += 1) {
      const m = markets[Math.floor(Math.random() * markets.length)];
      const outcome = Math.random() > 0.5 ? OutcomeType.YES : OutcomeType.NO;
      const driftBase = outcome === OutcomeType.YES ? (m.yesPrice || 50) : (m.noPrice || 50);
      const price = Math.max(1, Math.min(99, Math.round(driftBase + (Math.random() * 10 - 5))));
      const amount = Math.max(10, Math.round(20 + Math.random() * 220));
      const buyerId = users[Math.floor(Math.random() * users.length)];
      let sellerId = users[Math.floor(Math.random() * users.length)];
      if (sellerId === buyerId) sellerId = users[(users.indexOf(buyerId) + 1) % users.length];

      trades.push({
        id: `sim-trade-${Date.now()}-${i}-${Math.floor(Math.random() * 99999)}`,
        marketId: m.id,
        price,
        amount,
        buyerId,
        sellerId,
        outcome,
        timestamp: new Date(now - Math.floor(Math.random() * 7 * 24 * 3600 * 1000)).toISOString(),
        buyerSide: OrderSide.BUY,
        sellerSide: OrderSide.SELL,
        buyerOutcome: outcome,
        sellerOutcome: outcome,
        buyerPrice: price,
        sellerPrice: price
      });
    }

    const byMarket = new Map<number, Trade[]>();
    trades.forEach(t => {
      const arr = byMarket.get(t.marketId) || [];
      arr.push(t);
      byMarket.set(t.marketId, arr);
    });
    markets = markets.map(m => {
      const arr = byMarket.get(m.id) || [];
      if (arr.length === 0) return m;
      const latest = arr[arr.length - 1];
      const usersSet = new Set<string>();
      arr.forEach(t => {
        usersSet.add(t.buyerId.toLowerCase());
        usersSet.add(t.sellerId.toLowerCase());
      });
      return {
        ...m,
        yesPrice: latest.outcome === OutcomeType.YES ? latest.price : m.yesPrice,
        noPrice: latest.outcome === OutcomeType.NO ? latest.price : m.noPrice,
        volume: arr.reduce((s, t) => s + t.amount, 0),
        participants: usersSet.size
      };
    });

    kvSet("trades", trades);
    kvSet("markets", markets);
  };

  // 执行单个bot的逻辑
  const runSingleBot = (botId: string): number => {
    const bot = bots.find(b => b.id === botId);
    if (!bot || !bot.enabled) return 0;

    const marketPool = bot.marketIds.length > 0
      ? markets.filter(m => bot.marketIds.includes(m.id) && m.status === MarketStatus.OPEN)
      : markets.filter(m => m.status === MarketStatus.OPEN);
    if (marketPool.length === 0) return 0;

    const prevTradeCount = trades.length;
    const m = marketPool[Math.floor(Math.random() * marketPool.length)];
    const baseCount = Math.max(1, Math.floor(bot.intensity));
    const horizonMul = bot.horizon === "short" ? 1.6 : bot.horizon === "long" ? 0.8 : 1.1;
    const riskMul = 0.6 + (bot.riskPreference / 100) * 1.4; // 0.6 ~ 2.0
    const simulateCount = Math.min(40, Math.max(1, Math.round(baseCount * 2 * horizonMul * riskMul)));
    appendSimulatedTrades(simulateCount);
    // 小幅漂移，避免静态价格
    const driftRange = 1 + Math.round((bot.riskPreference / 100) * 4); // 1~5
    m.yesPrice = Math.max(1, Math.min(99, Math.round(m.yesPrice + (Math.random() * (driftRange * 2) - driftRange))));
    m.noPrice = 100 - m.yesPrice;

    // 更新bot执行状态
    const tradeCount = trades.length - prevTradeCount;
    bot.lastRunAt = new Date().toISOString();
    bot.lastTradeCount = tradeCount;
    bot.totalTrades = (bot.totalTrades || 0) + tradeCount;
    bot.lastError = null;
    kvSet("bots", bots);
    persistAll();

    return tradeCount;
  };

  // 手动触发所有活跃bot执行一次
  const runBotsOnce = (): number => {
    const activeBots = bots.filter(b => b.enabled);
    if (activeBots.length === 0) return 0;
    let totalTrades = 0;
    activeBots.forEach(bot => {
      totalTrades += runSingleBot(bot.id);
    });
    return totalTrades;
  };

  // 全局定时器（保留用于触发手动模式的bot）
  setInterval(() => {
    try {
      // 仅在无独立定时器的bot存在时执行
      const hasAutoBots = bots.some(b => b.enabled && b.intervalSeconds > 0);
      if (!hasAutoBots) {
        runBotsOnce();
      }
    } catch (e) {
      console.error("runBotsOnce interval error:", e);
    }
  }, 5000);

  // 服务启动时，为所有启用的bot启动独立定时器
  setTimeout(() => {
    startAllBotTimers();
    console.log(`[Bot] Initialized ${botTimers.size} bot timers`);
  }, 1000);

  const buildOhlcv = (marketId: number, tfMinutes: number, limit: number) => {
    const marketTrades = trades
      .filter(t => t.marketId === marketId)
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const bucketMs = Math.max(1, tfMinutes) * 60 * 1000;
    const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number; count: number }>();
    marketTrades.forEach(t => {
      const ts = new Date(t.timestamp).getTime();
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      const prev = buckets.get(bucket);
      if (!prev) {
        buckets.set(bucket, {
          open: t.price,
          high: t.price,
          low: t.price,
          close: t.price,
          volume: t.amount,
          count: 1
        });
      } else {
        prev.high = Math.max(prev.high, t.price);
        prev.low = Math.min(prev.low, t.price);
        prev.close = t.price;
        prev.volume += t.amount;
        prev.count += 1;
      }
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-Math.max(10, limit))
      .map(([bucket, v]) => ({
        ts: new Date(bucket).toISOString(),
        open: v.open,
        high: v.high,
        low: v.low,
        close: v.close,
        volume: v.volume,
        trades: v.count
      }));
  };

  const buildDepth = (marketId: number, outcome: OutcomeType) => {
    const marketOrders = orders.filter(o => o.marketId === marketId && o.status === OrderStatus.OPEN);
    const bids = marketOrders
      .filter(o => o.outcome === outcome && o.side === OrderSide.BUY)
      .reduce((acc, o) => {
        acc[o.price] = (acc[o.price] || 0) + o.remainingAmount;
        return acc;
      }, {} as Record<number, number>);
    const asks = marketOrders
      .filter(o => o.outcome === outcome && o.side === OrderSide.SELL)
      .reduce((acc, o) => {
        acc[o.price] = (acc[o.price] || 0) + o.remainingAmount;
        return acc;
      }, {} as Record<number, number>);
    return { bids, asks };
  };

  const buildMarketStreamPayload = (marketId: number) => {
    const market = markets.find(m => m.id === marketId);
    const recentTrades = trades
      .filter(t => t.marketId === marketId)
      .slice(-30)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const candles = buildOhlcv(marketId, 1, 120);
    return {
      type: "market_update",
      marketId,
      ticker: market
        ? {
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            volume: market.volume,
            participants: market.participants
          }
        : null,
      depth: {
        YES: buildDepth(marketId, OutcomeType.YES),
        NO: buildDepth(marketId, OutcomeType.NO)
      },
      trades: recentTrades,
      candle: candles.length > 0 ? candles[candles.length - 1] : null
    };
  };

  // 若暂无成交数据，自动注入一批演示成交
  const hasAnyVolume = markets.some(m => (m.volume || 0) > 0);
  if (trades.length === 0 && !hasAnyVolume) {
    seedDemoAnalyticsData();
  }

  // --- AI Client (用于自动判定市场结果) ---
  const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  // --- Helper Functions ---
  const updateMarketLifecycle = () => {
    const now = new Date();
    markets.forEach(m => {
      if (m.status === MarketStatus.OPEN) {
        const end = new Date(m.endTime);
        if (now > end) {
          m.status = MarketStatus.CLOSED; // 已截止，等待管理员结算
        }
      }
    });
  };

  const persistAll = () => {
    kvSet("markets", markets);
    kvSet("orders", orders);
    kvSet("trades", trades);
    kvSet("positions", positions);
    kvSet("wallets", wallets);
    kvSet("admins", admins);
    kvSet("adminTokens", adminTokens);
    kvSet("bots", bots);
    kvSet("datasets", datasets);
    kvSet("datasetRows", datasetRows);
    kvSet("analysisJobs", analysisJobs);
    kvSet("fabricUsers", fabricUsers);
    kvSet("aiSettings", aiSettings);
  };

  const isAdminAddress = (address: string) =>
    admins.some(a => a.toLowerCase() === address.toLowerCase()) ||
    fabricUsers.some(u => u.userId === address.toLowerCase() && u.role === "admin");

  const requireAdminToken: express.RequestHandler = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "缺少管理员令牌" });
    }
    const token = auth.slice("Bearer ".length).trim();
    const record = adminTokens[token];
    if (!record) {
      return res.status(401).json({ error: "管理员令牌无效" });
    }
    const exp = new Date(record.expiresAt).getTime();
    if (Date.now() > exp) {
      delete adminTokens[token];
      kvSet("adminTokens", adminTokens);
      return res.status(401).json({ error: "管理员令牌已过期" });
    }
    if (!isAdminAddress(record.address)) {
      return res.status(403).json({ error: "该地址不是管理员" });
    }
    (req as any).adminAddress = record.address;
    next();
  };

  const pickKey = (p: AIProviderConfig) => {
    if (!p.keys || p.keys.length === 0) return null;
    // 简单轮询：用时间戳取模
    const idx = Math.floor(Date.now() / 1000) % p.keys.length;
    return p.keys[idx].apiKey;
  };

  const callOpenAICompatible = async (opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    system: string;
    user: string;
    timeoutMs?: number;
  }) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
    try {
      const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`
        },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user }
          ]
        }),
        signal: controller.signal
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      const content = json?.choices?.[0]?.message?.content ?? "";
      return String(content).trim();
    } finally {
      clearTimeout(t);
    }
  };

  const callGemini = async (opts: { apiKey: string; model: string; prompt: string }) => {
    // 改用 OpenAI 兼容端点，不依赖 GoogleGenAI SDK，避免代理问题
    return callOpenAICompatible({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: opts.apiKey,
      model: opts.model,
      system: "你是预测市场平台的审核与结算助手。你必须输出严格 JSON（不包裹 Markdown），不得输出多余文本。",
      user: opts.prompt,
      timeoutMs: 20000
    });
  };

  /**
   * 鲁棒 JSON 提取：处理 Gemini/LLM 包裹在 ```json ``` 代码块里的情况
   */
  const extractJSON = (raw: string): any => {
    // 1) 尝试直接解析
    try { return JSON.parse(raw); } catch {}
    // 2) 剥掉 ```json ... ``` 或 ``` ... ```
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try { return JSON.parse(fence[1].trim()); } catch {}
    }
    // 3) 找第一个 { ... } 块
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      try { return JSON.parse(raw.slice(braceStart, braceEnd + 1)); } catch {}
    }
    return null;
  };

  const runMarketReviewWithProviders = async (market: Market, extraContext: string | undefined) => {
    const enabled = aiSettings.providers.filter(p => p.enabled && p.keys && p.keys.length > 0);
    if (enabled.length === 0) {
      return { error: "未配置可用的 AI 提供商（请在管理员里配置 key 并启用）" };
    }

    const userPrompt =
      `${aiSettings.reviewPrompt}\n\n` +
      `市场标题: "${market.title}"\n` +
      `市场描述: "${market.description}"\n` +
      `结算数据来源: "${market.resolutionSource}"\n` +
      `分类: "${market.category}"\n` +
      `补充上下文: "${extraContext || ""}"\n`;

    const calls = enabled.map(async (p) => {
      const apiKey = pickKey(p);
      if (!apiKey) return { provider: p.id, ok: false, raw: "no key" };
      try {
        const raw = await callOpenAICompatible({
          baseUrl: p.baseUrl || "https://api.openai.com/v1",
          apiKey,
          model: p.model,
          system: aiSettings.systemPrompt,
          user: userPrompt,
          timeoutMs: 25000
        });
        return { provider: p.id, ok: true, raw };
      } catch (e: any) {
        return { provider: p.id, ok: false, raw: String(e?.message || e) };
      }
    });

    const results = await Promise.all(calls);
    const parsed = results
      .filter(r => r.ok)
      .map(r => {
        const obj = extractJSON(r.raw);
        return {
          provider: r.provider,
          recommend: obj?.recommend ?? null,
          reasons: obj?.reasons ?? null,
          suggestion: obj?.suggestion ?? null,
          raw: r.raw
        };
      });

    if (!aiSettings.crossValidate) {
      const first = parsed[0];
      if (!first) return { error: "AI 未返回有效结果", results };
      return { results, final: first };
    }

    const votes = { APPROVE: 0, REJECT: 0 };
    parsed.forEach(p => {
      if (p.recommend === "APPROVE") votes.APPROVE += 1;
      if (p.recommend === "REJECT") votes.REJECT += 1;
    });
    const finalRecommend = votes.REJECT > votes.APPROVE ? "REJECT" : "APPROVE";
    const finalReasons = parsed
      .filter(p => p.recommend === finalRecommend && p.reasons)
      .map(p => `【${p.provider}】${p.reasons}`)
      .join("\n");
    const finalSuggestion = parsed.find(p => p.suggestion)?.suggestion || "";
    // 如果解析全都失败，把 raw 原文展示
    const fallbackRaw = parsed.filter(p => p.raw).map(p => `【${p.provider} raw】${p.raw}`).join("\n");

    return {
      results,
      final: {
        recommend: finalRecommend,
        reasons: finalReasons || fallbackRaw || "AI 未能给出原因",
        suggestion: finalSuggestion
      },
      votes
    };
  };

  const webSearch = async (query: string) => {
    const r = aiSettings.retrieval;
    if (!r?.enabled || !r.apiKey) return [];

    if (r.provider === "tavily") {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: r.apiKey,
          query,
          max_results: r.maxResults || 5,
          include_answer: false,
          include_raw_content: false
        })
      });
      const json = await res.json();
      const results = (json?.results || []).map((x: any) => ({
        title: x.title,
        url: x.url,
        snippet: x.content
      }));
      return results;
    }

    if (r.provider === "serpapi") {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", r.apiKey);
      const res = await fetch(url.toString());
      const json = await res.json();
      const results = (json?.organic_results || []).slice(0, r.maxResults || 5).map((x: any) => ({
        title: x.title,
        url: x.link,
        snippet: x.snippet
      }));
      return results;
    }

    if (r.provider === "bing") {
      const url = new URL("https://api.bing.microsoft.com/v7.0/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(r.maxResults || 5));
      const res = await fetch(url.toString(), {
        headers: { "Ocp-Apim-Subscription-Key": r.apiKey }
      });
      const json = await res.json();
      const results = (json?.webPages?.value || []).map((x: any) => ({
        title: x.name,
        url: x.url,
        snippet: x.snippet
      }));
      return results;
    }

    return [];
  };

  const runSettleSuggestion = async (market: Market) => {
    const enabled = aiSettings.providers.filter(p => p.enabled && p.keys && p.keys.length > 0);
    if (enabled.length === 0) return { error: "未配置可用的 AI 提供商（请在管理员里配置 key 并启用）" };

    // 用题目做搜索 query（可根据需要加上时间/机构）
    const query = `${market.title} ${new Date().getFullYear()}`;
    const searchResults = await webSearch(query);
    const evidenceText = searchResults
      .map((r: any, i: number) => `(${i + 1}) ${r.title}\n${r.snippet}\n${r.url}`)
      .join("\n\n");

    const userPrompt =
      `${aiSettings.settlePrompt}\n\n` +
      `预测市场题目: "${market.title}"\n` +
      `市场描述: "${market.description}"\n` +
      `结算数据来源: "${market.resolutionSource}"\n` +
      `当前时间: "${new Date().toISOString()}"\n\n` +
      `联网检索结果（证据摘要）：\n${evidenceText || "（未配置检索或未获取到结果）"}\n\n` +
      `请输出：\n` +
      `1) outcome: YES 或 NO\n` +
      `2) reasons: 简要原因（引用以上证据编号）\n` +
      `3) sources: 证据链接列表\n` +
      `仅输出 JSON：{"outcome":"YES"|"NO","reasons":"...","sources":[{"title":"...","url":"..."}]}`;

    const calls = enabled.map(async (p) => {
      const apiKey = pickKey(p);
      if (!apiKey) return { provider: p.id, ok: false, raw: "no key" };
      try {
        const raw = await callOpenAICompatible({
          baseUrl: p.baseUrl || "https://api.openai.com/v1",
          apiKey,
          model: p.model,
          system: aiSettings.systemPrompt,
          user: userPrompt,
          timeoutMs: 25000
        });
        return { provider: p.id, ok: true, raw };
      } catch (e: any) {
        return { provider: p.id, ok: false, raw: String(e?.message || e) };
      }
    });

    const results = await Promise.all(calls);
    const parsed = results
      .filter(r => r.ok)
      .map(r => {
        const obj = extractJSON(r.raw);
        return {
          provider: r.provider,
          outcome: obj?.outcome ?? null,
          reasons: obj?.reasons ?? null,
          sources: obj?.sources ?? null,
          raw: r.raw
        };
      });

    const vote = { YES: 0, NO: 0 };
    parsed.forEach(p => {
      if (p.outcome === "YES") vote.YES += 1;
      if (p.outcome === "NO") vote.NO += 1;
    });
    const finalOutcome = vote.NO > vote.YES ? "NO" : "YES";
    const finalReasons = parsed
      .filter(p => p.outcome === finalOutcome && p.reasons)
      .map(p => `【${p.provider}】${p.reasons}`)
      .join("\n");
    // 解析全部失败时降级展示原始内容
    const fallbackRaw = parsed.filter(p => p.raw && p.raw !== "no key").map(p => `【${p.provider}】${p.raw.slice(0, 300)}`).join("\n");

    const flatSources =
      (parsed.find(p => Array.isArray(p.sources))?.sources || []).slice(0, 5);

    const evidence = {
      query,
      sources: searchResults,
      ai: {
        outcome: finalOutcome,
        reasons: finalReasons || fallbackRaw || "AI 未能给出原因",
        sources: flatSources
      }
    };

    return { results, final: evidence.ai, evidence, vote };
  };

  const getWallet = (userId: string): Wallet => {
    let wallet = wallets.find(w => w.userId.toLowerCase() === userId.toLowerCase());
    if (!wallet) {
      wallet = { userId: userId.toLowerCase(), balance: 10000, lockedBalance: 0 };
      wallets.push(wallet);
    }
    return wallet;
  };

  const getPosition = (userId: string, marketId: number): Position => {
    let pos = positions.find(p => p.userId.toLowerCase() === userId.toLowerCase() && p.marketId === marketId);
    if (!pos) {
      pos = { 
        userId: userId.toLowerCase(), 
        marketId, 
        yesAmount: 0, 
        noAmount: 0, 
        lockedYesAmount: 0,
        lockedNoAmount: 0,
        avgYesPrice: 0, 
        avgNoPrice: 0 
      };
      positions.push(pos);
    }
    return pos;
  };

  const cleanupParticipants = (marketId: number) => {
    // 参与人数：统计在 orders/trades 中出现过的地址数量（简化）
    const participants = new Set<string>();
    orders.filter(o => o.marketId === marketId).forEach(o => participants.add(o.userId.toLowerCase()));
    trades.filter(t => t.marketId === marketId).forEach(t => {
      participants.add(t.buyerId.toLowerCase());
      participants.add(t.sellerId.toLowerCase());
    });
    const market = markets.find(m => m.id === marketId);
    if (market) market.participants = participants.size;
  };

  const matchOrders = (marketId: number) => {
    // 归一化撮合：把 NO 的买卖映射为 YES 基础订单簿的反向订单
    // BUY NO 视为做空，更贴近股票“多/空”的直觉
    const eff = (o: Order) => {
      const baseSide = o.baseSide || o.side;
      const isMkt = !!o.baseIsMarket || o.type === OrderType.MARKET;
      if (isMkt) return baseSide === OrderSide.BUY ? 1000 : -1;
      return o.basePrice ?? o.price;
    };

    const buyOrders = orders
      .filter(o => o.marketId === marketId && o.status === OrderStatus.OPEN && (o.baseOutcome || OutcomeType.YES) === OutcomeType.YES && (o.baseSide || o.side) === OrderSide.BUY)
      .sort((a, b) => eff(b) - eff(a) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const sellOrders = orders
      .filter(o => o.marketId === marketId && o.status === OrderStatus.OPEN && (o.baseOutcome || OutcomeType.YES) === OutcomeType.YES && (o.baseSide || o.side) === OrderSide.SELL)
      .sort((a, b) => eff(a) - eff(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    while (buyOrders.length > 0 && sellOrders.length > 0) {
      const buy = buyOrders[0];
      const sell = sellOrders[0];

      // 防止自成交：同一用户挂在买卖两边时，移除较晚进入簿的一侧，保持真实磋商行为
      if (buy.userId.toLowerCase() === sell.userId.toLowerCase()) {
        const buyTs = new Date(buy.createdAt).getTime();
        const sellTs = new Date(sell.createdAt).getTime();
        if (buyTs >= sellTs) {
          buy.status = OrderStatus.CANCELLED;
          buy.remainingAmount = 0;
          buyOrders.shift();
        } else {
          sell.status = OrderStatus.CANCELLED;
          sell.remainingAmount = 0;
          sellOrders.shift();
        }
        continue;
      }

      const buyPx = eff(buy);
      const sellPx = eff(sell);
      if (buyPx >= sellPx) {
        const tradePrice = sell.basePrice ?? sell.price; // Maker price（YES 基础价格）
        const tradeAmount = Math.min(buy.remainingAmount, sell.remainingAmount);
        const actualCost = (tradeAmount * tradePrice) / 100;

        // Create Trade
        const buyerExecPrice = buy.outcome === OutcomeType.NO ? (100 - tradePrice) : tradePrice;
        const sellerExecPrice = sell.outcome === OutcomeType.NO ? (100 - tradePrice) : tradePrice;
        const trade: Trade = {
          id: Math.random().toString(36).substr(2, 9),
          marketId,
          price: tradePrice,
          amount: tradeAmount,
          buyerId: buy.userId,
          sellerId: sell.userId,
          outcome: OutcomeType.YES,
          timestamp: new Date().toISOString(),
          buyerOrderId: buy.id,
          sellerOrderId: sell.id,
          buyerOutcome: buy.outcome,
          sellerOutcome: sell.outcome,
          buyerSide: buy.side,
          sellerSide: sell.side,
          buyerPrice: buyerExecPrice,
          sellerPrice: sellerExecPrice
        };
        trades.push(trade);
        // 链上落地（异步，不阻塞撮合）
        fabricCreateTrade(trade).catch((e) => {
          console.error("fabric CreateTrade failed:", e);
        });

        // Update Orders
        buy.remainingAmount -= tradeAmount;
        sell.remainingAmount -= tradeAmount;

        if (buy.remainingAmount === 0) {
          buy.status = OrderStatus.FILLED;
          buyOrders.shift();
        }
        if (sell.remainingAmount === 0) {
          sell.status = OrderStatus.FILLED;
          sellOrders.shift();
        }

        // Update Positions & Wallets
        const buyerPos = getPosition(buy.userId, marketId);
        const sellerPos = getPosition(sell.userId, marketId);
        const buyerWallet = getWallet(buy.userId);
        const sellerWallet = getWallet(sell.userId);

        // Buyer: Deduct from lockedBalance, refund difference if any
        const maxCost = (tradeAmount * buy.price) / 100;
        buyerWallet.lockedBalance -= maxCost;
        buyerWallet.balance += (maxCost - actualCost);
        if (buy.lockedBalanceAmount !== undefined) {
          buy.lockedBalanceAmount = Math.max(0, buy.lockedBalanceAmount - maxCost);
        }

        // Seller: Add to balance, deduct from locked shares（锁定份额仅对现货部分生效，做空保证金按成交量释放）
        sellerWallet.balance += actualCost;
        if (buy.outcome === OutcomeType.YES) buyerPos.yesAmount += tradeAmount;
        else buyerPos.noAmount += tradeAmount;

        const execSpot = Math.min(sell.lockedSpotAmount || 0, tradeAmount);
        const execShort = tradeAmount - execSpot;
        if (sell.outcome === OutcomeType.YES) {
          sellerPos.lockedYesAmount = Math.max(0, sellerPos.lockedYesAmount - execSpot);
        } else {
          sellerPos.lockedNoAmount = Math.max(0, sellerPos.lockedNoAmount - execSpot);
        }
        if (sell.lockedSpotAmount !== undefined) {
          sell.lockedSpotAmount = Math.max(0, sell.lockedSpotAmount - execSpot);
        }
        if (execShort > 0) {
          const marginRelease = ((100 - sell.price) * execShort) / 100;
          sellerWallet.lockedBalance -= marginRelease;
          sellerWallet.balance += marginRelease;
          if (sell.lockedBalanceAmount !== undefined) {
            sell.lockedBalanceAmount = Math.max(0, sell.lockedBalanceAmount - marginRelease);
          }
        }

        // Update Market Price
        const market = markets.find(m => m.id === marketId);
        if (market) {
          market.yesPrice = tradePrice;
          market.noPrice = 100 - tradePrice;
          market.volume += actualCost;
        }
        cleanupParticipants(marketId);
        persistAll();
      } else {
        break;
      }
    }
  };

  // --- API Routes ---

  app.get("/api/meta", (req, res) => {
    res.json({
      ok: true,
      build: SERVER_BUILD,
      port: PORT
    });
  });

  app.get("/api/markets", (req, res) => {
    updateMarketLifecycle();
    persistAll();
    res.json(markets);
  });

  app.post("/api/markets", (req, res) => {
    const { title, description, endTime, resolutionSource, category } = req.body;

    if (!title || !description || !endTime || !resolutionSource || !category) {
      return res.status(400).json({ error: "缺少必要字段" });
    }

    const newId = markets.length > 0 ? Math.max(...markets.map(m => m.id)) + 1 : 1;

    const market: Market = {
      id: newId,
      title,
      description,
      endTime,
      resolutionSource,
      status: MarketStatus.PENDING,
      category,
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      participants: 0
    };

    markets.push(market);
    persistAll();
    // 异步同步上链（不阻塞 HTTP 响应）
    fabricCreateMarket(market).catch(() => {});
    res.json(market);
  });

  app.get("/api/orderbook/:marketId", (req, res) => {
    updateMarketLifecycle();
    persistAll();
    const marketId = parseInt(req.params.marketId);
    const marketOrders = orders.filter(o => o.marketId === marketId && o.status === OrderStatus.OPEN);
    
    const getBook = (outcome: OutcomeType) => {
      const bids = marketOrders
        .filter(o => o.outcome === outcome && o.side === OrderSide.BUY)
        .reduce((acc, o) => {
          acc[o.price] = (acc[o.price] || 0) + o.remainingAmount;
          return acc;
        }, {} as Record<number, number>);

      const asks = marketOrders
        .filter(o => o.outcome === outcome && o.side === OrderSide.SELL)
        .reduce((acc, o) => {
          acc[o.price] = (acc[o.price] || 0) + o.remainingAmount;
          return acc;
        }, {} as Record<number, number>);

      return { bids, asks };
    };

    res.json({
      YES: getBook(OutcomeType.YES),
      NO: getBook(OutcomeType.NO)
    });
  });

  app.get("/api/markets/:marketId/ohlcv", (req, res) => {
    const marketId = parseInt(req.params.marketId);
    if (Number.isNaN(marketId)) return res.status(400).json({ error: "非法 marketId" });
    const tf = parseInt(String(req.query.tf || "1"));
    const limit = parseInt(String(req.query.limit || "120"));
    const candles = buildOhlcv(marketId, Number.isNaN(tf) ? 1 : tf, Number.isNaN(limit) ? 120 : limit);
    res.json(candles);
  });

  app.post("/api/orders", (req, res) => {
    updateMarketLifecycle();
    const { userId, marketId, outcome, side, price, amount, type } = req.body;
    
    if (!userId || !marketId || !outcome || !side || !amount) {
      return res.status(400).json({ error: "参数不完整" });
    }

    const orderType: OrderType = type === OrderType.MARKET ? OrderType.MARKET : OrderType.LIMIT;
    if (orderType === OrderType.LIMIT) {
      if (typeof price !== "number" || price < 1 || price > 99) {
        return res.status(400).json({ error: "限价单价格必须在 1-99 PMT 之间" });
      }
    }

    if (amount <= 0) {
      return res.status(400).json({ error: "数量必须大于 0" });
    }

    const market = markets.find(m => m.id === marketId);
    if (!market) {
      return res.status(404).json({ error: "市场不存在" });
    }
    const now = new Date();
    const end = new Date(market.endTime);
    if (market.status !== MarketStatus.OPEN || now > end) {
      return res.status(400).json({ error: "市场已关闭或已过截止时间，无法下单" });
    }

    const wallet = getWallet(userId);
    const pos = getPosition(userId, marketId);

    const limitPrice = orderType === OrderType.LIMIT ? price : (side === OrderSide.BUY ? 99 : 1);
    let lockedBalanceAmount = 0;
    let lockedSpotAmount = 0;

    if (side === OrderSide.BUY) {
      const cost = (limitPrice * amount) / 100;
      if (wallet.balance < cost) {
        return res.status(400).json({ error: "余额不足" });
      }
      // Lock balance
      wallet.balance -= cost;
      wallet.lockedBalance += cost;
      lockedBalanceAmount = cost;
    } else {
      // SELL order: 允许做空（不要求已有份额）
      // - 若有现货份额则锁定现货
      // - 对做空部分锁定保证金（简化：按 1 - 价格）
      lockedSpotAmount = outcome === OutcomeType.YES ? Math.min(pos.yesAmount, amount) : Math.min(pos.noAmount, amount);
      const shortAmount = amount - lockedSpotAmount;
      const margin = ((100 - limitPrice) * shortAmount) / 100;
      if (wallet.balance < margin) {
        return res.status(400).json({ error: "保证金不足（做空需要锁定资金）" });
      }
      wallet.balance -= margin;
      wallet.lockedBalance += margin;
      lockedBalanceAmount = margin;

      // 若有现货份额则锁定现货，否则视为做空（结算时按结果结算）
      if (outcome === OutcomeType.YES) {
        pos.yesAmount -= lockedSpotAmount;
        pos.lockedYesAmount += lockedSpotAmount;
      } else {
        pos.noAmount -= lockedSpotAmount;
        pos.lockedNoAmount += lockedSpotAmount;
      }
    }

    // base 映射（归一化到 YES 基础簿）
    const baseFrom = (out: OutcomeType, s: OrderSide, p: number) => {
      if (out === OutcomeType.YES) return { baseOutcome: OutcomeType.YES as OutcomeType, baseSide: s, basePrice: p };
      return { baseOutcome: OutcomeType.YES as OutcomeType, baseSide: s === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY, basePrice: 100 - p };
    };
    const base = baseFrom(outcome, side, limitPrice);

    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 9),
      userId: userId.toLowerCase(),
      marketId,
      outcome,
      side,
      type: orderType,
      price: limitPrice,
      amount,
      remainingAmount: amount,
      status: OrderStatus.OPEN,
      createdAt: new Date().toISOString(),
      baseOutcome: base.baseOutcome,
      baseSide: base.baseSide,
      basePrice: base.basePrice,
      baseIsMarket: orderType === OrderType.MARKET,
      lockedBalanceAmount,
      lockedSpotAmount
    };

    orders.push(newOrder);
    fabricCreateOrder(newOrder).catch((e) => {
      console.error("fabric CreateOrder failed:", e);
    });
    persistAll();
    
    // Immediate matching
    matchOrders(marketId);

    res.json(newOrder);
  });

  app.get("/api/trades", (req, res) => {
    updateMarketLifecycle();
    persistAll();
    res.json(trades);
  });

  app.get("/api/trades/:userId", (req, res) => {
    updateMarketLifecycle();
    persistAll();
    const userId = req.params.userId.toLowerCase();
    const userTrades = trades.filter(
      t => t.buyerId.toLowerCase() === userId || t.sellerId.toLowerCase() === userId
    );
    res.json(userTrades);
  });

  app.get("/api/positions/:userId", (req, res) => {
    const userId = req.params.userId.toLowerCase();
    const userPositions = positions.filter(p => p.userId === userId && (p.yesAmount !== 0 || p.noAmount !== 0));
    res.json(userPositions);
  });

  app.get("/api/orders/:userId", (req, res) => {
    const userId = req.params.userId.toLowerCase();
    const marketIdParam = req.query.marketId as string | undefined;
    let userOrders = orders.filter(o => o.userId === userId);

    if (marketIdParam) {
      const marketId = parseInt(marketIdParam);
      if (!isNaN(marketId)) {
        userOrders = userOrders.filter(o => o.marketId === marketId);
      }
    }

    res.json(userOrders);
  });

  app.post("/api/orders/cancel", (req, res) => {
    updateMarketLifecycle();
    const { userId, orderId } = req.body;
    if (!userId || !orderId) {
      return res.status(400).json({ error: "缺少 userId 或 orderId" });
    }
    const uid = (userId as string).toLowerCase();
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ error: "订单不存在" });
    }
    if (order.userId.toLowerCase() !== uid) {
      return res.status(403).json({ error: "无权撤销该订单" });
    }
    if (order.status !== OrderStatus.OPEN) {
      return res.status(400).json({ error: "仅 OPEN 订单可撤单" });
    }

    const wallet = getWallet(uid);
    const pos = getPosition(uid, order.marketId);

    // 解锁剩余部分对应冻结
    const remaining = order.remainingAmount;
    if (order.side === OrderSide.BUY) {
      const refund = (order.price * remaining) / 100;
      wallet.lockedBalance -= refund;
      wallet.balance += refund;
      order.lockedBalanceAmount = Math.max(0, (order.lockedBalanceAmount || 0) - refund);
    } else {
      // SELL：解锁剩余现货 + 剩余做空保证金
      const remainingSpot = Math.min(order.lockedSpotAmount || 0, remaining);
      const remainingShort = remaining - remainingSpot;
      const marginRefund = ((100 - order.price) * remainingShort) / 100;
      wallet.lockedBalance -= marginRefund;
      wallet.balance += marginRefund;

      if (order.outcome === OutcomeType.YES) {
        pos.lockedYesAmount -= remainingSpot;
        pos.yesAmount += remainingSpot;
      } else {
        pos.lockedNoAmount -= remainingSpot;
        pos.noAmount += remainingSpot;
      }
      order.lockedSpotAmount = Math.max(0, (order.lockedSpotAmount || 0) - remainingSpot);
      order.lockedBalanceAmount = Math.max(0, (order.lockedBalanceAmount || 0) - marginRefund);
    }

    order.remainingAmount = 0;
    order.status = OrderStatus.CANCELLED;
    persistAll();
    res.json(order);
  });

  app.get("/api/wallet/:userId", (req, res) => {
    const userId = req.params.userId.toLowerCase();
    res.json(getWallet(userId));
  });

  app.post("/api/faucet", (req, res) => {
    const { userId } = req.body;
    const wallet = getWallet(userId);
    wallet.balance += 1000;
    persistAll();
    res.json(wallet);
  });

  // Fabric 风格身份（替代 MetaMask 连接）
  app.post("/api/fabric/auth/register", (req, res) => {
    const { userId, password } = req.body || {};
    if (!userId || !password) return res.status(400).json({ error: "缺少 userId 或 password" });
    const id = String(userId).trim().toLowerCase();
    if (fabricUsers.some(u => u.userId === id)) return res.status(400).json({ error: "用户已存在" });
    const user: FabricUser = {
      userId: id,
      password: String(password),
      role: "user",
      createdAt: new Date().toISOString()
    };
    fabricUsers.push(user);
    kvSet("fabricUsers", fabricUsers);
    getWallet(id);
    res.json({ ok: true, userId: id });
  });

  app.post("/api/fabric/auth/login", (req, res) => {
    const { userId, password } = req.body || {};
    if (!userId || !password) return res.status(400).json({ error: "缺少 userId 或 password" });
    const id = String(userId).trim().toLowerCase();
    const u = fabricUsers.find(x => x.userId === id && x.password === String(password));
    if (!u) return res.status(401).json({ error: "身份验证失败" });
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    adminTokens[token] = { address: id, expiresAt };
    kvSet("adminTokens", adminTokens);
    getWallet(id);
    res.json({ ok: true, token, userId: id, role: u.role, expiresAt });
  });

  app.get("/api/ledger/status", async (req, res) => {
    const c = await initFabricGateway();
    // 附加链上统计（真实网络时）
    let onChainStats = null;
    if (c && !fabricMockMode) {
      onChainStats = await fabricGetLedgerStats().catch(() => null);
    }
    res.json({
      ready: !!c,
      mockMode: fabricMockMode,
      channel: process.env.FABRIC_CHANNEL || "mychannel",
      chaincode: process.env.FABRIC_CHAINCODE || "predictionmarket",
      identity: process.env.FABRIC_IDENTITY || "appUser",
      fabricEnabled: process.env.FABRIC_ENABLED !== 'false',
      error: c && !fabricMockMode ? fabricLastError : "",
      onChainStats
    });
  });

  app.get("/api/ledger/query-trades/:marketId", async (req, res) => {
    const marketId = parseInt(req.params.marketId);
    if (!Number.isFinite(marketId)) return res.status(400).json({ error: "非法 marketId" });
    try {
      const out = await fabricQueryTradesByMarket(marketId);
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: "链上查询失败", details: String(e?.message || e) });
    }
  });

  // --- 结算 & 分析相关接口 ---

  // 管理员：通过钱包签名登录（需要该地址已在管理员白名单）
  app.post("/api/admin/auth/login", async (req, res) => {
    const { address, signature, nonce } = req.body;
    if (!address || !signature || !nonce) {
      return res.status(400).json({ error: "缺少 address/signature/nonce" });
    }
    if (!isAdminAddress(address)) {
      return res.status(403).json({ error: "该地址不在管理员白名单" });
    }
    const message = `PredictionMarket Admin Login\naddress:${address}\nnonce:${nonce}`;
    try {
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ error: "签名校验失败" });
      }
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(); // 12h
      adminTokens[token] = { address: address.toLowerCase(), expiresAt };
      kvSet("adminTokens", adminTokens);
      res.json({ token, expiresAt });
    } catch (e) {
      res.status(500).json({ error: "签名验证异常" });
    }
  });

  app.post("/api/admin/auth/fabric-login", (req, res) => {
    const { userId, password } = req.body || {};
    if (!userId || !password) return res.status(400).json({ error: "缺少 userId 或 password" });
    const id = String(userId).trim().toLowerCase();
    const u = fabricUsers.find(x => x.userId === id && x.password === String(password));
    if (!u || u.role !== "admin") return res.status(403).json({ error: "非管理员身份或密码错误" });
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    adminTokens[token] = { address: id, expiresAt };
    kvSet("adminTokens", adminTokens);
    res.json({ token, expiresAt });
  });

  // 管理员：通过后端添加管理员地址（引导/初始化用，仍需要 ADMIN_SECRET）
  app.post("/api/admin/bootstrap/add-admin", (req, res) => {
    const { address, adminSecret, fabricUserId, fabricPassword } = req.body;
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "管理员密钥错误" });
    }
    if (fabricUserId) {
      const id = String(fabricUserId).toLowerCase();
      const u = fabricUsers.find(x => x.userId === id);
      if (!u) {
        const user: FabricUser = {
          userId: id,
          password: String(fabricPassword || "admin123"),
          role: "admin",
          createdAt: new Date().toISOString()
        };
        fabricUsers.push(user);
      } else {
        u.role = "admin";
        if (fabricPassword) u.password = String(fabricPassword);
      }
      kvSet("fabricUsers", fabricUsers);
      return res.json({ admins, fabricAdmins: fabricUsers.filter(x => x.role === "admin").map(x => x.userId) });
    }
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "地址不合法（可改为传 fabricUserId）" });
    }
    if (!isAdminAddress(address)) {
      admins.push(address.toLowerCase());
      kvSet("admins", admins);
    }
    res.json({ admins });
  });

  // 管理员：一键重置题库与交易数据（仅用于本地测试/演示）
  app.post("/api/admin/bootstrap/reset-all", (req, res) => {
    const { adminSecret } = req.body;
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "管理员密钥错误" });
    }
    markets = seededMarkets.map(m => ({ ...m }));
    orders = [];
    trades = [];
    positions = [];
    wallets = [];
    kvSet("markets", markets);
    kvSet("orders", orders);
    kvSet("trades", trades);
    kvSet("positions", positions);
    kvSet("wallets", wallets);
    res.json({ ok: true, marketsCount: markets.length });
  });

  // 管理员：注入演示成交数据（用于分析页面展示）
  app.post("/api/admin/bootstrap/seed-demo-data", (req, res) => {
    const { adminSecret } = req.body;
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "管理员密钥错误" });
    }
    seedDemoAnalyticsData();
    res.json({ ok: true, marketsCount: markets.length, tradesCount: trades.length });
  });

  app.post("/api/admin/bootstrap/simulate-trades", (req, res) => {
    const { adminSecret, count } = req.body || {};
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "管理员密钥错误" });
    }
    const n = Math.max(1, Math.min(5000, Number(count) || 300));
    appendSimulatedTrades(n);
    res.json({ ok: true, appended: n, tradesCount: trades.length });
  });

  app.get("/api/admin/bots", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      res.json(bots);
    });
  });

  app.post("/api/admin/bots", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const body = req.body || {};
      const now = new Date().toISOString();
      const intervalSeconds = Math.max(0, Math.min(3600, Number(body.intervalSeconds) || 0));
      const bot: BotConfig = {
        id: crypto.randomBytes(8).toString("hex"),
        name: String(body.name || `Bot-${bots.length + 1}`),
        enabled: !!body.enabled,
        strategy: body.strategy === "momentum" || body.strategy === "noise" ? body.strategy : "market_maker",
        marketIds: Array.isArray(body.marketIds) ? body.marketIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x)) : [],
        intensity: Math.max(1, Math.min(10, Number(body.intensity) || 3)),
        maxOrderSize: Math.max(10, Math.min(1000, Number(body.maxOrderSize) || 200)),
        riskPreference: Math.max(0, Math.min(100, Number(body.riskPreference) || 50)),
        horizon: body.horizon === "short" || body.horizon === "long" ? body.horizon : "medium",
        intervalSeconds,
        lastRunAt: null,
        lastTradeCount: 0,
        totalTrades: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now
      };
      bots.push(bot);
      kvSet("bots", bots);
      // 启动定时器
      if (bot.enabled && bot.intervalSeconds > 0) {
        startBotTimer(bot);
      }
      res.json(bot);
    });
  });

  app.patch("/api/admin/bots/:id", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const bot = bots.find(b => b.id === req.params.id);
      if (!bot) return res.status(404).json({ error: "机器人不存在" });
      const body = req.body || {};
      const prevEnabled = bot.enabled;
      const prevInterval = bot.intervalSeconds;
      if (typeof body.name === "string") bot.name = body.name;
      if (typeof body.enabled === "boolean") bot.enabled = body.enabled;
      if (body.strategy === "market_maker" || body.strategy === "momentum" || body.strategy === "noise") bot.strategy = body.strategy;
      if (Array.isArray(body.marketIds)) bot.marketIds = body.marketIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x));
      if (typeof body.intensity === "number") bot.intensity = Math.max(1, Math.min(10, body.intensity));
      if (typeof body.maxOrderSize === "number") bot.maxOrderSize = Math.max(10, Math.min(1000, body.maxOrderSize));
      if (typeof body.riskPreference === "number") bot.riskPreference = Math.max(0, Math.min(100, body.riskPreference));
      if (body.horizon === "short" || body.horizon === "medium" || body.horizon === "long") bot.horizon = body.horizon;
      if (typeof body.intervalSeconds === "number") bot.intervalSeconds = Math.max(0, Math.min(3600, body.intervalSeconds));
      bot.updatedAt = new Date().toISOString();
      kvSet("bots", bots);
      // 管理定时器
      const shouldRun = bot.enabled && bot.intervalSeconds > 0;
      const wasRunning = prevEnabled && prevInterval > 0;
      if (shouldRun && (!wasRunning || prevInterval !== bot.intervalSeconds)) {
        startBotTimer(bot);
      } else if (!shouldRun && wasRunning) {
        stopBotTimer(bot.id);
      }
      res.json(bot);
    });
  });

  app.post("/api/admin/bots/:id/start", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const bot = bots.find(b => b.id === req.params.id);
      if (!bot) return res.status(404).json({ error: "机器人不存在" });
      bot.enabled = true;
      bot.updatedAt = new Date().toISOString();
      kvSet("bots", bots);
      // 启动定时器
      if (bot.intervalSeconds > 0) {
        startBotTimer(bot);
      }
      res.json({ ok: true, bot });
    });
  });

  app.post("/api/admin/bots/:id/stop", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const bot = bots.find(b => b.id === req.params.id);
      if (!bot) return res.status(404).json({ error: "机器人不存在" });
      bot.enabled = false;
      bot.updatedAt = new Date().toISOString();
      kvSet("bots", bots);
      stopBotTimer(bot.id); // 停止定时器
      res.json({ ok: true, bot });
    });
  });

  app.delete("/api/admin/bots/:id", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const idx = bots.findIndex(b => b.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "机器人不存在" });
      const [removed] = bots.splice(idx, 1);
      kvSet("bots", bots);
      stopBotTimer(removed.id); // 清理定时器
      res.json({ ok: true, removed });
    });
  });

  app.post("/api/admin/bots/run-once", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const prevCount = trades.length;
      const botResults: Record<string, { trades: number; error: string | null }> = {};
      bots.filter(b => b.enabled).forEach(bot => {
        try {
          botResults[bot.name] = { trades: runSingleBot(bot.id), error: null };
        } catch (e) {
          botResults[bot.name] = { trades: 0, error: String(e) };
        }
      });
      persistAll();
      res.json({
        ok: true,
        totalTrades: trades.length - prevCount,
        tradesCount: trades.length,
        botsCount: Object.keys(botResults).length,
        results: botResults,
        timestamp: new Date().toISOString()
      });
    });
  });

  const inferSchema = (rows: any[]) => {
    const keys = new Set<string>();
    rows.slice(0, 200).forEach((r: any) => {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        Object.keys(r).forEach(k => keys.add(k));
      }
    });
    const schema = Array.from(keys).map((k) => {
      const vals = rows.map((r: any) => r?.[k]).filter((v: any) => v !== undefined && v !== null).slice(0, 100);
      let type: "number" | "string" | "boolean" | "date" | "unknown" = "unknown";
      if (vals.length > 0) {
        if (vals.every(v => typeof v === "number")) type = "number";
        else if (vals.every(v => typeof v === "boolean")) type = "boolean";
        else if (vals.every(v => typeof v === "string")) {
          const maybeDate = vals.filter(v => !Number.isNaN(Date.parse(v))).length;
          type = maybeDate > vals.length * 0.6 ? "date" : "string";
        } else type = "string";
      }
      return { name: k, type };
    });
    return schema;
  };

  const getPlatformDatasetRows = (datasetId: string) => {
    if (datasetId === "platform_trades") return trades;
    if (datasetId === "platform_markets") return markets;
    if (datasetId === "platform_orders") return orders;
    if (datasetId === "platform_positions") return positions;
    return [];
  };

  app.get("/api/datasets", (req, res) => {
    const builtins: DatasetRecord[] = [
      {
        id: "platform_trades",
        name: "平台成交数据",
        source: "platform",
        schema: inferSchema(trades),
        rowCount: trades.length,
        sample: trades.slice(0, 5),
        createdAt: SERVER_BUILD
      },
      {
        id: "platform_markets",
        name: "平台市场数据",
        source: "platform",
        schema: inferSchema(markets),
        rowCount: markets.length,
        sample: markets.slice(0, 5),
        createdAt: SERVER_BUILD
      },
      {
        id: "platform_orders",
        name: "平台订单数据",
        source: "platform",
        schema: inferSchema(orders),
        rowCount: orders.length,
        sample: orders.slice(0, 5),
        createdAt: SERVER_BUILD
      }
    ];
    res.json([...builtins, ...datasets]);
  });

  app.get("/api/datasets/:id/preview", (req, res) => {
    const id = req.params.id;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 30));
    const builtin = id.startsWith("platform_");
    const rows = builtin ? getPlatformDatasetRows(id) : (datasetRows[id] || []);
    if (!rows) return res.status(404).json({ error: "数据集不存在" });
    res.json({
      id,
      rowCount: rows.length,
      schema: inferSchema(rows),
      rows: rows.slice(0, limit)
    });
  });

  app.post("/api/datasets/upload", (req, res) => {
    const { name, rows } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows 必须为数组" });
    const id = `ds_${crypto.randomBytes(6).toString("hex")}`;
    const ds: DatasetRecord = {
      id,
      name: String(name || `上传数据集-${datasets.length + 1}`),
      source: "upload",
      schema: inferSchema(rows),
      rowCount: rows.length,
      sample: rows.slice(0, 5),
      createdAt: new Date().toISOString()
    };
    datasets.unshift(ds);
    datasetRows[id] = rows;
    persistAll();
    res.json(ds);
  });

  // 管理员：AI 设置（key/模型/提示词/交叉验证）
  app.get("/api/admin/ai/settings", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      // 返回时对 key 做脱敏
      const safe = {
        ...aiSettings,
        retrieval: aiSettings.retrieval
          ? {
              ...aiSettings.retrieval,
              apiKey: aiSettings.retrieval.apiKey
                ? `${aiSettings.retrieval.apiKey.slice(0, 4)}***${aiSettings.retrieval.apiKey.slice(-4)}`
                : ""
            }
          : aiSettings.retrieval,
        providers: aiSettings.providers.map(p => ({
          ...p,
          keys: (p.keys || []).map(k => ({
            label: k.label,
            apiKey: k.apiKey ? `${k.apiKey.slice(0, 4)}***${k.apiKey.slice(-4)}` : ""
          }))
        }))
      };
      res.json(safe);
    });
  });

  app.put("/api/admin/ai/settings", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const body = req.body as Partial<AISettings>;
      if (!body) return res.status(400).json({ error: "缺少配置内容" });

      // 允许更新 systemPrompt/reviewPrompt/settlePrompt/crossValidate/providers
      if (body.mode === "manual" || body.mode === "assist" || body.mode === "auto") aiSettings.mode = body.mode;
      if (typeof body.systemPrompt === "string") aiSettings.systemPrompt = body.systemPrompt;
      if (typeof body.reviewPrompt === "string") aiSettings.reviewPrompt = body.reviewPrompt;
      if (typeof body.settlePrompt === "string") aiSettings.settlePrompt = body.settlePrompt;
      if (typeof body.crossValidate === "boolean") aiSettings.crossValidate = body.crossValidate;
      if (body.retrieval && typeof body.retrieval === "object") {
        const r: any = body.retrieval;
        const provider =
          r.provider === "tavily" || r.provider === "serpapi" || r.provider === "bing"
            ? r.provider
            : aiSettings.retrieval?.provider || "tavily";
        aiSettings.retrieval = {
          enabled: !!r.enabled,
          provider,
          apiKey: typeof r.apiKey === "string" ? r.apiKey : (aiSettings.retrieval?.apiKey || ""),
          maxResults:
            typeof r.maxResults === "number" && Number.isFinite(r.maxResults)
              ? Math.max(1, Math.min(10, Math.floor(r.maxResults)))
              : (aiSettings.retrieval?.maxResults || 5)
        };
      }

      if (Array.isArray(body.providers)) {
        // 简单校验 + 合并
        // 若环境变量有 Key 且 provider 没有手动配置 key，自动补充（防止前端误覆盖）
        const envKeyMap: Record<string, string> = {
          gemini: process.env.GEMINI_API_KEY || "",
          openai: process.env.OPENAI_API_KEY || "",
          qwen: process.env.DASHSCOPE_API_KEY || "",
        };
        aiSettings.providers = body.providers.map((p: any) => {
          const hasEnvKey = !!envKeyMap[p.id];
          const currentKeys = Array.isArray(p.keys) ? p.keys.filter((k: any) => k?.apiKey) : [];
          // 若 provider 没配置任何 key 但环境变量有，自动从 env 补充
          if (currentKeys.length === 0 && hasEnvKey) {
            currentKeys.push({ label: "env", apiKey: envKeyMap[p.id] });
          }
          return {
            id: p.id,
            enabled: !!p.enabled,
            model: String(p.model || ""),
            baseUrl: p.baseUrl ? String(p.baseUrl) : undefined,
            keys: currentKeys.map((k: any) => ({ label: k.label, apiKey: String(k.apiKey) }))
          };
        });
      }

      kvSet("aiSettings", aiSettings);
      res.json({ ok: true });
    });
  });

  // 手动结算：管理员直接指定某市场结果（可附带公示依据）
  app.post("/api/admin/settle", (req, res) => {
    const { marketId, outcome, evidence } = req.body;

    if (!marketId || !outcome) {
      return res.status(400).json({ error: "缺少 marketId 或 outcome" });
    }

    // require admin token
    return requireAdminToken(req as any, res as any, () => {

    const market = markets.find(m => m.id === marketId);
    if (!market) {
      return res.status(404).json({ error: "市场不存在" });
    }

    if (market.status === MarketStatus.RESOLVED) {
      return res.status(400).json({ error: "市场已结算" });
    }

    if (outcome !== OutcomeType.YES && outcome !== OutcomeType.NO) {
      return res.status(400).json({ error: "非法 outcome" });
    }

      // 执行结算
      settleMarket(market, outcome as OutcomeType, typeof evidence === "string" ? evidence : undefined);
      persistAll();
      res.json(market);
    });
  });

  const runPythonAnalysis = async (payload: any) => {
    return await new Promise<any>(async (resolve, reject) => {
      const { spawn } = await import("child_process");
      const py = spawn("python", ["analysis.py"], {
        cwd: process.cwd()
      });
      let output = "";
      let errorOutput = "";
      py.stdout.on("data", (data) => {
        output += data.toString();
      });
      py.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      py.on("close", (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(output || "{}"));
          } catch {
            reject(new Error(`分析结果解析失败: ${output}`));
          }
        } else {
          reject(new Error(`Python 分析执行失败: ${errorOutput || output}`));
        }
      });
      py.stdin.write(JSON.stringify(payload || {}));
      py.stdin.end();
    });
  };

  // Python 数据分析：供前端 Analytics 直接调用
  app.post("/api/analyze", async (req, res) => {
    try {
      const json = await runPythonAnalysis(req.body);
      res.json(json);
    } catch (error) {
      console.error("Analyze API error:", error);
      res.status(500).json({ error: "无法调用分析引擎" });
    }
  });

  app.post("/api/analysis/jobs", async (req, res) => {
    const { model, payload } = req.body || {};
    if (!model) return res.status(400).json({ error: "缺少 model" });
    const now = new Date().toISOString();
    const job: AnalysisJob = {
      id: `job_${crypto.randomBytes(6).toString("hex")}`,
      model: String(model),
      payload: payload || {},
      status: "pending",
      progress: 0,
      createdAt: now,
      updatedAt: now
    };
    analysisJobs.unshift(job);
    persistAll();
    res.json(job);

    (async () => {
      try {
        job.status = "running";
        job.progress = 30;
        job.updatedAt = new Date().toISOString();
        persistAll();
        const result = await runPythonAnalysis({ model: job.model, ...(job.payload || {}) });
        job.status = "done";
        job.progress = 100;
        job.result = result;
        job.updatedAt = new Date().toISOString();
        persistAll();
      } catch (e: any) {
        job.status = "error";
        job.progress = 100;
        job.error = String(e?.message || e);
        job.updatedAt = new Date().toISOString();
        persistAll();
      }
    })();
  });

  app.get("/api/analysis/jobs/:id", (req, res) => {
    const job = analysisJobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: "任务不存在" });
    res.json(job);
  });

  // AI 分析辅助：对已产出的量化结果进行解释与建议
  app.post("/api/analyze/ai", async (req, res) => {
    try {
      const { model, payload, result } = req.body || {};
      if (!model || !result) return res.status(400).json({ error: "缺少 model 或 result" });
      const enabled = aiSettings.providers.filter(p => p.enabled && p.keys && p.keys.length > 0);
      if (enabled.length === 0) {
        return res.status(400).json({ error: "未配置可用 AI 提供商，请先在管理员设置中启用并填写 key" });
      }
      const provider = enabled[0];
      const apiKey = pickKey(provider);
      if (!apiKey) return res.status(400).json({ error: "当前 AI 提供商没有可用 key" });

      const prompt =
        `你是预测市场量化分析助手。请根据给定模型与输出结果，给出简洁结论。\n` +
        `输出 JSON：{"summary":"...","risks":["..."],"actions":["..."]}\n\n` +
        `模型: ${model}\n` +
        `输入: ${JSON.stringify(payload || {}, null, 2)}\n` +
        `结果: ${JSON.stringify(result || {}, null, 2)}\n`;

      let raw = "";
      if (provider.id === "gemini") {
        raw = await callGemini({ apiKey, model: provider.model, prompt: `${aiSettings.systemPrompt}\n\n${prompt}` });
      } else {
        raw = await callOpenAICompatible({
          baseUrl: provider.baseUrl || (provider.id === "openai" ? "https://api.openai.com/v1" : "https://dashscope.aliyuncs.com/compatible-mode/v1"),
          apiKey,
          model: provider.model,
          system: aiSettings.systemPrompt,
          user: prompt
        });
      }

      try {
        const parsed = JSON.parse(raw);
        return res.json({ ok: true, provider: provider.id, analysis: parsed, raw });
      } catch {
        return res.json({ ok: true, provider: provider.id, analysis: { summary: raw, risks: [], actions: [] }, raw });
      }
    } catch (e: any) {
      console.error("AI analyze error:", e);
      res.status(500).json({ error: "AI 分析失败", details: String(e?.message || e) });
    }
  });

  // 分析指标：平台情绪、波动率、流动性、效率比
  app.get("/api/analytics/factors", (req, res) => {
    // 情绪：平均 YES 价格 / 100
    const openMarkets = markets.filter(m => m.status === MarketStatus.OPEN);
    const sentiment =
      openMarkets.length > 0
        ? openMarkets.reduce((sum, m) => sum + m.yesPrice, 0) / (openMarkets.length * 100)
        : 0;

    // 波动率：基于最近 N 笔成交价格的标准差
    const recentTrades = trades.slice(-100);
    let volatility = 0;
    if (recentTrades.length > 1) {
      const prices = recentTrades.map(t => t.price / 100);
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      const variance =
        prices.reduce((s, p) => s + (p - mean) * (p - mean), 0) / prices.length;
      volatility = Math.sqrt(variance);
    }

    // 流动性评分：近 N 笔成交数量总和的简单映射
    const totalVolumeShares = recentTrades.reduce((s, t) => s + t.amount, 0);
    const liquidityScore = Math.min(100, Math.round(totalVolumeShares / 10));

    // 市场效率：用情绪接近 0.5 的程度 + 有无成交综合一个 0~1 区间
    const efficiencyBase = 1 - Math.abs(sentiment - 0.5) * 2; // 情绪越接近 0.5 越高
    const efficiencyTradeFactor = recentTrades.length > 0 ? 1 : 0.3;
    const marketEfficiency = Math.max(0, Math.min(1, efficiencyBase * efficiencyTradeFactor));

    res.json({
      sentiment,
      volatility,
      liquidityScore,
      marketEfficiency
    });
  });

  // 管理员：获取待审核/全部市场列表
  app.get("/api/admin/markets", (req, res) => {
    updateMarketLifecycle();
    return requireAdminToken(req as any, res as any, () => {
      const { status } = req.query;
      if (status && typeof status === "string") {
        return res.json(markets.filter(m => m.status === status));
      }
      res.json(markets);
    });
  });

  // 管理员：批量导入真实预测市场题目
  app.post("/api/admin/markets/import", (req, res) => {
    return requireAdminToken(req as any, res as any, () => {
      const { markets: newMarkets, replace = false } = req.body || {};
      if (!Array.isArray(newMarkets) || newMarkets.length === 0) {
        return res.status(400).json({ error: "需要提供 markets 数组" });
      }

      // 如果 replace=true，先删除所有现有市场
      if (replace) {
        markets = [];
      }

      // 找出最大ID
      const maxId = markets.length > 0 ? Math.max(...markets.map(m => m.id)) : 0;

      // 导入新市场
      const now = new Date().toISOString();
      const added = newMarkets.map((m: any, index: number) => {
        const market: Market = {
          id: replace ? (index + 1) : (maxId + index + 1),
          title: String(m.title || "").trim(),
          description: String(m.description || "").trim(),
          category: String(m.category || "其他").trim(),
          status: m.status === "RESOLVED" ? MarketStatus.RESOLVED :
                  m.status === "CLOSED" ? MarketStatus.CLOSED :
                  m.status === "PENDING" ? MarketStatus.PENDING : MarketStatus.OPEN,
          yesPrice: Math.max(0, Math.min(99, Number(m.yesPrice) || 50)),
          noPrice: Math.max(0, Math.min(99, Number(m.noPrice) || 50)),
          volume: Math.max(0, Number(m.volume) || 0),
          participants: Math.max(0, Number(m.participants) || 0),
          liquidity: Math.max(100, Number(m.liquidity) || 1000),
          resolvedOutcome: m.resolvedOutcome || null,
          resolvedAt: m.resolvedAt || null,
          endTime: m.endTime || "2026-12-31T23:59:59Z",
          resolutionSource: String(m.resolutionSource || "官方公告").trim(),
          createdAt: m.createdAt || now,
          updatedAt: now
        };
        return market;
      });

      // 删除包含"某"字的旧虚假题目
      const beforeCount = markets.length;
      markets = markets.filter(m => !m.title.includes("某") && !m.title.includes("XX") && !m.title.includes("○○"));
      const removedCount = beforeCount - markets.length;

      // 添加新市场
      markets.push(...added);
      kvSet("markets", markets);

      res.json({
        ok: true,
        added: added.length,
        removed: removedCount,
        total: markets.length,
        markets: added.map(m => ({ id: m.id, title: m.title, category: m.category }))
      });
    });
  });

  // 管理员：人工审核通过/拒绝市场
  app.post("/api/admin/markets/review", (req, res) => {
    const { marketId, approve } = req.body;
    if (!marketId || typeof approve !== "boolean") {
      return res.status(400).json({ error: "缺少 marketId 或 approve 标志" });
    }
    return requireAdminToken(req as any, res as any, () => {
    const market = markets.find(m => m.id === marketId);
    if (!market) {
      return res.status(404).json({ error: "市场不存在" });
    }
    if (market.status !== MarketStatus.PENDING) {
      return res.status(400).json({ error: "只有待审核市场可以审核" });
    }
      market.status = approve ? MarketStatus.OPEN : MarketStatus.CLOSED;
      persistAll();
      res.json(market);
    });
  });

  // 管理员：AI 辅助审核市场（只给出建议，不直接改变状态）
  app.post("/api/admin/markets/ai-review", async (req, res) => {
    const { marketId, extraContext } = req.body;
    if (!marketId) {
      return res.status(400).json({ error: "缺少 marketId" });
    }
    // require admin token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return requireAdminToken(req as any, res as any, async () => {
    const market = markets.find(m => m.id === marketId);
    if (!market) {
      return res.status(404).json({ error: "市场不存在" });
    }
    try {
      const out = await runMarketReviewWithProviders(market, extraContext);
      if ((out as any).error) return res.status(400).json(out);
      res.json(out);
    } catch (error) {
      console.error("AI market review error:", error);
      res.status(500).json({ error: "AI 审核失败" });
    }
    });
  });

  // AI 结算建议：联网检索 + 多模型推理，返回建议但不落库
  app.post("/api/admin/settle/ai-suggest", async (req, res) => {
    const { marketId } = req.body || {};
    if (!marketId) return res.status(400).json({ error: "缺少 marketId" });
    return requireAdminToken(req as any, res as any, async () => {
      const market = markets.find(m => m.id === marketId);
      if (!market) return res.status(404).json({ error: "市场不存在" });
      try {
        const out = await runSettleSuggestion(market);
        if ((out as any).error) return res.status(400).json(out);
        res.json(out);
      } catch (e) {
        console.error("AI settle suggest error:", e);
        res.status(500).json({ error: "AI 结算建议失败" });
      }
    });
  });

  // AI 自动结算：基于 AI 建议落库结算，并写入公示依据
  app.post("/api/admin/settle/ai", async (req, res) => {
    const { marketId } = req.body || {};
    if (!marketId) return res.status(400).json({ error: "缺少 marketId" });
    return requireAdminToken(req as any, res as any, async () => {
      const market = markets.find(m => m.id === marketId);
      if (!market) return res.status(404).json({ error: "市场不存在" });
      if (market.status === MarketStatus.RESOLVED) return res.status(400).json({ error: "市场已结算" });
      try {
        const out: any = await runSettleSuggestion(market);
        if (out?.error) return res.status(400).json(out);
        const final = out?.final;
        const outcome = final?.outcome === "NO" ? OutcomeType.NO : OutcomeType.YES;
        const evidence = JSON.stringify(out?.evidence || out, null, 2);
        settleMarket(market, outcome, evidence);
        persistAll();
        res.json({ market, aiOutcome: outcome, final, vote: out?.vote, evidence: out?.evidence, results: out?.results });
      } catch (e) {
        console.error("AI settle error:", e);
        res.status(500).json({ error: "AI 结算失败" });
      }
    });
  });

  // --- 辅助函数：执行市场结算，更新所有用户钱包与持仓 ---
  const settleMarket = (market: Market, outcome: OutcomeType, evidence?: string) => {
    market.status = MarketStatus.RESOLVED;
    market.resolvedOutcome = outcome;
    market.resolvedAt = new Date().toISOString();
    if (evidence) (market as any).resolvedEvidence = evidence;

    // 异步同步上链结算记录
    fabricResolveMarket(market.id, outcome === OutcomeType.YES).catch(() => {});

    // 规则：获胜方向每份价值 1 PMT，失败方向价值 0。
    positions
      .filter(p => p.marketId === market.id)
      .forEach(pos => {
        const wallet = getWallet(pos.userId);

        // 解锁被冻结的份额（全部转为失败方向的 0 价值，或先归还再结算，这里简单按当前持仓算）
        if (outcome === OutcomeType.YES) {
          const payout = pos.yesAmount; // 1 * yesAmount
          wallet.balance += payout;
        } else {
          const payout = pos.noAmount;
          wallet.balance += payout;
        }

        // 清空该市场下的持仓与冻结
        pos.yesAmount = 0;
        pos.noAmount = 0;
        pos.lockedYesAmount = 0;
        pos.lockedNoAmount = 0;
      });

    // 关闭该市场下的所有未完成订单
    orders
      .filter(o => o.marketId === market.id && o.status === OrderStatus.OPEN)
      .forEach(o => {
        o.status = OrderStatus.CANCELLED;
        // 退还对应锁定的余额或份额
        const wallet = getWallet(o.userId);
        const pos = getPosition(o.userId, o.marketId);

        // 新撮合/撤单逻辑：优先使用 lockedBalanceAmount/lockedSpotAmount
        if (typeof o.lockedBalanceAmount === "number" && o.lockedBalanceAmount > 0) {
          wallet.lockedBalance -= o.lockedBalanceAmount;
          wallet.balance += o.lockedBalanceAmount;
        } else if (o.side === OrderSide.BUY) {
          const remainingCost = (o.price * o.remainingAmount) / 100;
          wallet.lockedBalance -= remainingCost;
          wallet.balance += remainingCost;
        }

        if (typeof o.lockedSpotAmount === "number" && o.lockedSpotAmount > 0) {
          if (o.outcome === OutcomeType.YES) pos.yesAmount += o.lockedSpotAmount;
          else pos.noAmount += o.lockedSpotAmount;
        } else if (o.side === OrderSide.SELL) {
          if (o.outcome === OutcomeType.YES) {
            pos.lockedYesAmount -= o.remainingAmount;
            pos.yesAmount += o.remainingAmount;
          } else {
            pos.lockedNoAmount -= o.remainingAmount;
            pos.noAmount += o.remainingAmount;
          }
        }
        o.remainingAmount = 0;
      });
    cleanupParticipants(market.id);
  };

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/markets" });
  const wsSubs = new Map<any, number>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://127.0.0.1:${PORT}`);
    const marketId = Number(url.searchParams.get("marketId") || "0");
    if (!Number.isFinite(marketId) || marketId <= 0) {
      ws.close();
      return;
    }
    wsSubs.set(ws, marketId);
    try {
      ws.send(JSON.stringify(buildMarketStreamPayload(marketId)));
    } catch {}
    ws.on("close", () => {
      wsSubs.delete(ws);
    });
  });

  setInterval(() => {
    wsSubs.forEach((marketId, ws) => {
      if (ws.readyState !== 1) return;
      try {
        ws.send(JSON.stringify(buildMarketStreamPayload(marketId)));
      } catch {}
    });
  }, 1500);

  httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
