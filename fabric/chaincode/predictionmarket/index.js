'use strict';

const { Contract } = require('fabric-contract-api');

class PredictionMarketContract extends Contract {
  async CreateTrade(ctx, tradeJson) {
    const trade = JSON.parse(tradeJson);
    if (!trade || !trade.id) {
      throw new Error('invalid trade payload');
    }
    const key = `TRADE_${trade.id}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(trade)));
    const idxKey = `TRADE_MARKET_${trade.marketId}_${trade.id}`;
    await ctx.stub.putState(idxKey, Buffer.from('1'));
    return JSON.stringify({ ok: true, key });
  }

  async CreateOrder(ctx, orderJson) {
    const order = JSON.parse(orderJson);
    if (!order || !order.id) {
      throw new Error('invalid order payload');
    }
    const key = `ORDER_${order.id}`;
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(order)));
    return JSON.stringify({ ok: true, key });
  }

  async QueryTradesByMarket(ctx, marketId) {
    const prefix = `TRADE_MARKET_${marketId}_`;
    const iter = await ctx.stub.getStateByRange(prefix, `${prefix}~`);
    const ids = [];
    while (true) {
      const r = await iter.next();
      if (r.value && r.value.key) {
        const parts = r.value.key.split('_');
        const tradeId = parts.slice(3).join('_');
        ids.push(tradeId);
      }
      if (r.done) break;
    }
    await iter.close();
    const out = [];
    for (const id of ids) {
      const b = await ctx.stub.getState(`TRADE_${id}`);
      if (b && b.length > 0) {
        out.push(JSON.parse(b.toString()));
      }
    }
    return JSON.stringify(out);
  }
}

module.exports = PredictionMarketContract;
