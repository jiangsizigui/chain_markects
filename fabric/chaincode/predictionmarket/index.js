'use strict';
/**
 * PredictionMarket Chaincode
 * 区块链预测市场链码 - Hyperledger Fabric JavaScript
 *
 * 支持的交易函数:
 *   写操作 (submitTransaction):
 *     - CreateMarket(marketJson)          创建预测市场
 *     - ResolveMarket(marketId, outcome)  结算市场 (YES=true, NO=false)
 *     - CreateTrade(tradeJson)            记录成交
 *     - CreateOrder(orderJson)            记录订单
 *     - UpdateMarketPrice(marketId, yesPrice, noPrice)  更新市场价格
 *
 *   读操作 (evaluateTransaction):
 *     - GetMarket(marketId)               查询单个市场
 *     - GetAllMarkets()                   查询所有市场
 *     - QueryTradesByMarket(marketId)     查询市场成交记录
 *     - QueryOrdersByMarket(marketId)     查询市场订单
 *     - GetLedgerStats()                  获取账本统计
 */

const { Contract } = require('fabric-contract-api');

class PredictionMarketContract extends Contract {

  // =============================================
  //  市场管理
  // =============================================

  /**
   * CreateMarket - 创建预测市场
   * @param {string} marketJson - JSON 格式市场数据
   * {
   *   id: number, question: string, category: string,
   *   endTime: string (ISO), yesPrice: number, noPrice: number,
   *   createdAt: string
   * }
   */
  async CreateMarket(ctx, marketJson) {
    const market = JSON.parse(marketJson);
    if (!market || !market.id) {
      throw new Error('无效的市场数据：缺少 id 字段');
    }

    const key = `MARKET_${market.id}`;
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      throw new Error(`市场 ${market.id} 已存在`);
    }

    market.resolved     = market.resolved     ?? false;
    market.totalVolume  = market.totalVolume  ?? 0;
    market.tradeCount   = market.tradeCount   ?? 0;
    market.createdOnChain = new Date().toISOString();

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(market)));

    // 建立索引 (category)
    const idxKey = `MARKET_CAT_${market.category || 'unknown'}_${market.id}`;
    await ctx.stub.putState(idxKey, Buffer.from('1'));

    ctx.stub.setEvent('MarketCreated', Buffer.from(JSON.stringify({ id: market.id, question: market.question })));
    return JSON.stringify({ ok: true, key, market });
  }

  /**
   * ResolveMarket - 结算市场
   * @param {string} marketId
   * @param {string} outcome - "YES" | "NO"
   */
  async ResolveMarket(ctx, marketId, outcome) {
    const key = `MARKET_${marketId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`市场 ${marketId} 不存在`);
    }

    const market = JSON.parse(data.toString());
    if (market.resolved) {
      throw new Error(`市场 ${marketId} 已结算`);
    }

    const isYes = outcome === 'YES' || outcome === 'true' || outcome === true;
    market.resolved     = true;
    market.outcome      = isYes ? 'YES' : 'NO';
    market.resolvedAt   = new Date().toISOString();
    market.status       = 'resolved';

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(market)));

    ctx.stub.setEvent('MarketResolved', Buffer.from(JSON.stringify({
      id: marketId, outcome: market.outcome, resolvedAt: market.resolvedAt
    })));

    return JSON.stringify({ ok: true, marketId, outcome: market.outcome });
  }

  /**
   * UpdateMarketPrice - 更新市场价格
   */
  async UpdateMarketPrice(ctx, marketId, yesPrice, noPrice) {
    const key = `MARKET_${marketId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`市场 ${marketId} 不存在`);
    }

    const market = JSON.parse(data.toString());
    market.yesPrice      = parseFloat(yesPrice);
    market.noPrice       = parseFloat(noPrice);
    market.lastUpdatedAt = new Date().toISOString();

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(market)));
    return JSON.stringify({ ok: true });
  }

  /**
   * GetMarket - 查询单个市场
   */
  async GetMarket(ctx, marketId) {
    const key = `MARKET_${marketId}`;
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`市场 ${marketId} 不存在`);
    }
    return data.toString();
  }

  /**
   * GetAllMarkets - 查询所有市场
   */
  async GetAllMarkets(ctx) {
    const prefix = 'MARKET_';
    const iter = await ctx.stub.getStateByRange(prefix, `${prefix}~`);
    const markets = [];

    while (true) {
      const r = await iter.next();
      if (r.done) break;
      if (r.value && r.value.key && !r.value.key.includes('_CAT_')) {
        try {
          markets.push(JSON.parse(r.value.value.toString()));
        } catch (_) {}
      }
    }
    await iter.close();
    return JSON.stringify(markets);
  }

  // =============================================
  //  成交记录
  // =============================================

  /**
   * CreateTrade - 记录成交
   * @param {string} tradeJson
   * { id, marketId, side, price, amount, userId, timestamp }
   */
  async CreateTrade(ctx, tradeJson) {
    const trade = JSON.parse(tradeJson);
    if (!trade || !trade.id) {
      throw new Error('无效的成交数据：缺少 id 字段');
    }

    const key = `TRADE_${trade.id}`;
    trade.recordedAt = new Date().toISOString();
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(trade)));

    // 市场成交索引
    const idxKey = `TRADE_MARKET_${trade.marketId}_${trade.id}`;
    await ctx.stub.putState(idxKey, Buffer.from('1'));

    // 更新市场统计
    try {
      const mKey = `MARKET_${trade.marketId}`;
      const mData = await ctx.stub.getState(mKey);
      if (mData && mData.length > 0) {
        const market = JSON.parse(mData.toString());
        market.totalVolume = (market.totalVolume || 0) + (trade.amount || 0);
        market.tradeCount  = (market.tradeCount  || 0) + 1;
        market.lastTradeAt = trade.timestamp || new Date().toISOString();
        await ctx.stub.putState(mKey, Buffer.from(JSON.stringify(market)));
      }
    } catch (_) {}

    return JSON.stringify({ ok: true, key });
  }

  /**
   * QueryTradesByMarket - 查询市场成交记录
   */
  async QueryTradesByMarket(ctx, marketId) {
    const prefix = `TRADE_MARKET_${marketId}_`;
    const iter = await ctx.stub.getStateByRange(prefix, `${prefix}~`);
    const ids = [];

    while (true) {
      const r = await iter.next();
      if (r.done) break;
      if (r.value && r.value.key) {
        const parts = r.value.key.split('_');
        // key: TRADE_MARKET_{marketId}_{tradeId}  (tradeId 可能含 _)
        const tradeId = parts.slice(3).join('_');
        ids.push(tradeId);
      }
    }
    await iter.close();

    const trades = [];
    for (const id of ids) {
      const b = await ctx.stub.getState(`TRADE_${id}`);
      if (b && b.length > 0) {
        try { trades.push(JSON.parse(b.toString())); } catch (_) {}
      }
    }
    return JSON.stringify(trades);
  }

  // =============================================
  //  订单记录
  // =============================================

  /**
   * CreateOrder - 记录订单
   * @param {string} orderJson
   * { id, marketId, side, type, price, amount, userId, status, timestamp }
   */
  async CreateOrder(ctx, orderJson) {
    const order = JSON.parse(orderJson);
    if (!order || !order.id) {
      throw new Error('无效的订单数据：缺少 id 字段');
    }

    const key = `ORDER_${order.id}`;
    order.recordedAt = new Date().toISOString();
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(order)));

    // 市场订单索引
    const idxKey = `ORDER_MARKET_${order.marketId}_${order.id}`;
    await ctx.stub.putState(idxKey, Buffer.from('1'));

    return JSON.stringify({ ok: true, key });
  }

  /**
   * QueryOrdersByMarket - 查询市场订单
   */
  async QueryOrdersByMarket(ctx, marketId) {
    const prefix = `ORDER_MARKET_${marketId}_`;
    const iter = await ctx.stub.getStateByRange(prefix, `${prefix}~`);
    const ids = [];

    while (true) {
      const r = await iter.next();
      if (r.done) break;
      if (r.value && r.value.key) {
        const parts = r.value.key.split('_');
        ids.push(parts.slice(3).join('_'));
      }
    }
    await iter.close();

    const orders = [];
    for (const id of ids) {
      const b = await ctx.stub.getState(`ORDER_${id}`);
      if (b && b.length > 0) {
        try { orders.push(JSON.parse(b.toString())); } catch (_) {}
      }
    }
    return JSON.stringify(orders);
  }

  // =============================================
  //  统计与账本信息
  // =============================================

  /**
   * GetLedgerStats - 获取账本统计
   */
  async GetLedgerStats(ctx) {
    // 统计市场数量
    let marketCount = 0, tradeCount = 0, orderCount = 0;

    const mIter = await ctx.stub.getStateByRange('MARKET_', 'MARKET_~');
    while (true) {
      const r = await mIter.next();
      if (r.done) break;
      if (r.value && r.value.key && !r.value.key.includes('_CAT_')) marketCount++;
    }
    await mIter.close();

    const tIter = await ctx.stub.getStateByRange('TRADE_', 'TRADE_~');
    while (true) {
      const r = await tIter.next();
      if (r.done) break;
      if (r.value && r.value.key && !r.value.key.includes('_MARKET_')) tradeCount++;
    }
    await tIter.close();

    const oIter = await ctx.stub.getStateByRange('ORDER_', 'ORDER_~');
    while (true) {
      const r = await oIter.next();
      if (r.done) break;
      if (r.value && r.value.key && !r.value.key.includes('_MARKET_')) orderCount++;
    }
    await oIter.close();

    return JSON.stringify({
      marketCount,
      tradeCount,
      orderCount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * InitLedger - 链码初始化（可选，部署时自动调用）
   */
  async InitLedger(ctx) {
    console.log('PredictionMarket chaincode initialized');
    return JSON.stringify({ ok: true, message: 'PredictionMarket chaincode ready' });
  }
}

module.exports = PredictionMarketContract;
