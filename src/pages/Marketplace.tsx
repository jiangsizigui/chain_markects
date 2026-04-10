import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, Users, Clock, Plus, Loader2, RefreshCw, X, Activity, Info, Wallet as WalletIcon } from 'lucide-react';
import { Market, OutcomeType, OrderSide, Order, Position, OrderStatus, MarketStatus, OrderType } from '../types';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

export const Marketplace: React.FC<{ account: string | null }> = ({ account }) => {
  const [filter, setFilter] = useState('全部');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'OPEN' | 'CLOSED' | 'RESOLVED'>('ALL');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradePrice, setTradePrice] = useState('50');
  const [tradeType, setTradeType] = useState<OrderType>(OrderType.LIMIT);
  const [isTrading, setIsTrading] = useState(false);
  const [orderbook, setOrderbook] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [klineTf, setKlineTf] = useState(5);
  const [orderbookOutcome, setOrderbookOutcome] = useState<OutcomeType>(OutcomeType.YES);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [userPositions, setUserPositions] = useState<Position[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newMarket, setNewMarket] = useState({
    title: '',
    description: '',
    category: '政治与政策',
    endTime: '',
    resolutionSource: ''
  });

  const getMarketPriority = (status: MarketStatus) => {
    // 优先展示正在交易的市场，其次待审核，再到待结算与已结算
    if (status === MarketStatus.OPEN) return 0;
    if (status === MarketStatus.PENDING) return 1;
    if (status === MarketStatus.CLOSED) return 2;
    return 3;
  };

  const fetchMarkets = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const response = await fetch('/api/markets');
      const data = await response.json();
      setMarkets(data);
      if (selectedMarket) {
        const updated = data.find((m: Market) => m.id === selectedMarket.id);
        if (updated) setSelectedMarket(updated);
      }
    } catch (error) {
      console.error("Failed to fetch markets:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchOrderbook = async (marketId: number) => {
    try {
      const response = await fetch(`/api/orderbook/${marketId}`);
      const data = await response.json();
      setOrderbook(data);
    } catch (error) {
      console.error("Failed to fetch orderbook:", error);
    }
  };

  const fetchUserMarketData = async (marketId: number) => {
    if (!account) return;

    try {
      const [ordersRes, positionsRes] = await Promise.all([
        fetch(`/api/orders/${account}?marketId=${marketId}`),
        fetch(`/api/positions/${account}`)
      ]);

      if (ordersRes.ok) {
        const allOrders: Order[] = await ordersRes.json();
        setUserOrders(allOrders);
      }

      if (positionsRes.ok) {
        const allPositions: Position[] = await positionsRes.json();
        setUserPositions(allPositions.filter(p => p.marketId === marketId));
      }
    } catch (error) {
      console.error("Failed to fetch user market data:", error);
    }
  };

  const fetchCandles = async (marketId: number, tf = klineTf) => {
    try {
      const res = await fetch(`/api/markets/${marketId}/ohlcv?tf=${tf}&limit=120`);
      if (!res.ok) return;
      const data = await res.json();
      setCandles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch candles:', e);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  useEffect(() => {
    if (selectedMarket) {
      fetchOrderbook(selectedMarket.id);
      fetchUserMarketData(selectedMarket.id);
      fetchCandles(selectedMarket.id, klineTf);
      setOrderbookOutcome(OutcomeType.YES);

      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws/markets?marketId=${selectedMarket.id}`);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.type !== 'market_update') return;
          if (msg.ticker) {
            setSelectedMarket(prev => prev ? { ...prev, ...msg.ticker } : prev);
            setMarkets(prev => prev.map(m => (m.id === selectedMarket.id ? { ...m, ...msg.ticker } : m)));
          }
          if (msg.depth) setOrderbook(msg.depth);
          if (msg.candle) {
            setCandles(prev => {
              const next = [...prev, msg.candle];
              return next.slice(-120);
            });
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
      const fallback = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          fetchOrderbook(selectedMarket.id);
          fetchUserMarketData(selectedMarket.id);
          fetchCandles(selectedMarket.id, klineTf);
        }
      }, 3000);
      return () => {
        clearInterval(fallback);
        ws.close();
      };
    }
  }, [selectedMarket, account, klineTf]);

  const handleTrade = async (outcome: OutcomeType, side: OrderSide) => {
    if (!account) {
      alert("请先连接钱包！");
      return;
    }

    const amount = parseInt(tradeAmount);

    const price = tradeType === OrderType.LIMIT ? parseInt(tradePrice) : undefined;
    if (tradeType === OrderType.LIMIT) {
      if (typeof price !== 'number' || isNaN(price) || price < 1 || price > 99) {
        alert("请输入有效的价格 (1-99 PMT)");
        return;
      }
    }

    if (isNaN(amount) || amount <= 0) {
      alert("请输入有效的数量");
      return;
    }

    setIsTrading(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account,
          marketId: selectedMarket?.id,
          outcome,
          side,
          type: tradeType,
          price,
          amount
        })
      });

      if (response.ok) {
        alert(`订单已提交！`);
        fetchMarkets(true);
        if (selectedMarket) {
          fetchOrderbook(selectedMarket.id);
          fetchUserMarketData(selectedMarket.id);
        }
      } else {
        const err = await response.json();
        alert(`交易失败: ${err.error}`);
      }
    } catch (error) {
      console.error("Trade error:", error);
      alert("交易失败，请稍后重试。");
    } finally {
      setIsTrading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-gray-400 animate-pulse">正在从区块链与实时市场获取数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">预测市场</h1>
          <p className="text-gray-400">基于实时链上数据与市场价格的去中心化预测平台。</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fetchMarkets(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white/5 text-white border border-white/10 px-4 py-3 rounded-xl hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
          >
            <Plus size={20} />
            <span>创建市场</span>
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
        {['全部', '政治与政策', '经济与金融', '科技发展', '全球事件', '娱乐与文化', '体育赛事'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-6 py-2 rounded-full border transition-all whitespace-nowrap ${filter === cat ? 'bg-emerald-500 border-emerald-500 text-black font-semibold' : 'border-white/10 text-gray-400 hover:border-white/30'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-10 overflow-x-auto pb-2">
        {[
          { key: 'ALL', label: '全部状态' },
          { key: 'PENDING', label: '待审核' },
          { key: 'OPEN', label: '交易中' },
          { key: 'CLOSED', label: '待结算' },
          { key: 'RESOLVED', label: '已结算' }
        ].map((s: any) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-4 py-2 rounded-full border transition-all whitespace-nowrap text-xs ${
              statusFilter === s.key
                ? 'bg-white text-black border-white font-bold'
                : 'border-white/10 text-gray-400 hover:border-white/30'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets
          .filter(m => filter === '全部' || m.category === filter)
          .filter(m => statusFilter === 'ALL' || m.status === statusFilter)
          .sort((a, b) => {
            const p = getMarketPriority(a.status) - getMarketPriority(b.status);
            if (p !== 0) return p;
            if (b.volume !== a.volume) return b.volume - a.volume;
            return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
          })
          .map((market) => (
          <motion.div
            key={market.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedMarket(market);
              setTradePrice(market.yesPrice.toString());
            }}
            className="bg-[#141414] border border-white/5 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group cursor-pointer relative overflow-hidden opacity-100"
          >
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <Info size={18} className="text-emerald-500" />
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full uppercase tracking-wider">
                  {market.category}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] border border-white/10 text-gray-400">
                  {market.status === MarketStatus.PENDING && '待审核'}
                  {market.status === MarketStatus.OPEN && '交易中'}
                  {market.status === MarketStatus.CLOSED && '已关闭'}
                  {market.status === MarketStatus.RESOLVED && '已结算'}
                </span>
              </div>
            </div>
            
            <h3 className="text-xl font-bold text-white mb-6 leading-tight group-hover:text-emerald-400 transition-colors">
              {market.title}
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-xs uppercase font-bold tracking-widest">交易额</span>
                <div className="flex items-center gap-1 text-white font-mono">
                  <TrendingUp size={14} className="text-emerald-500" />
                  {market.volume.toLocaleString()} PMT
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-gray-500 text-xs uppercase font-bold tracking-widest">参与人数</span>
                <div className="flex items-center gap-1 text-white font-mono">
                  <Users size={14} className="text-blue-400" />
                  {market.participants}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
              <Clock size={14} />
              <span>截止日期 {new Date(market.endTime).toLocaleDateString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center justify-center bg-emerald-500/5 border border-emerald-500/10 py-3 rounded-xl">
                <span className="text-[10px] text-gray-500 uppercase mb-1">看好 (Yes)</span>
                <span className="text-lg font-bold text-emerald-500">{market.yesPrice} PMT</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-red-500/5 border border-red-500/10 py-3 rounded-xl">
                <span className="text-[10px] text-gray-500 uppercase mb-1">看淡 (No)</span>
                <span className="text-lg font-bold text-red-500">{market.noPrice} PMT</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Market Details Modal */}
      <AnimatePresence>
        {selectedMarket && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMarket(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col lg:flex-row"
            >
              <button 
                onClick={() => setSelectedMarket(null)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors z-10"
              >
                <X size={24} />
              </button>

              {/* Left: Info & Trading */}
              <div className="flex-1 p-8 border-b lg:border-b-0 lg:border-r border-white/5">
                <div className="flex items-center gap-3 mb-6">
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full uppercase tracking-wider">
                    {selectedMarket.category}
                  </span>
                <span className="px-2 py-1 rounded-full text-[10px] border border-white/10 text-gray-400">
                  {selectedMarket.status === MarketStatus.PENDING && '待审核'}
                  {selectedMarket.status === MarketStatus.OPEN && '交易中'}
                  {selectedMarket.status === MarketStatus.CLOSED && '已截止待结算'}
                  {selectedMarket.status === MarketStatus.RESOLVED && `已结算：${selectedMarket.resolvedOutcome || ''}`}
                </span>
                </div>

                <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
                  {selectedMarket.title}
                </h2>
                <p className="text-gray-400 mb-4">{selectedMarket.description}</p>
                {selectedMarket.status === MarketStatus.RESOLVED && selectedMarket.resolvedEvidence && (
                  <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-gray-300 space-y-2">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">结算公示依据</div>
                    <div className="whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {selectedMarket.resolvedEvidence}
                    </div>
                  </div>
                )}
                {(selectedMarket.status !== MarketStatus.OPEN || new Date(selectedMarket.endTime) < new Date()) && (
                  <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-gray-400">
                    当前市场不可交易：{selectedMarket.status === MarketStatus.PENDING ? '正在等待管理员审核。' : '市场已截止或已关闭，等待管理员结算。'}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">委托类型</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setTradeType(OrderType.LIMIT)}
                        className={`px-3 py-3 rounded-xl text-xs font-bold border transition-colors ${
                          tradeType === OrderType.LIMIT ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        限价
                      </button>
                      <button
                        onClick={() => setTradeType(OrderType.MARKET)}
                        className={`px-3 py-3 rounded-xl text-xs font-bold border transition-colors ${
                          tradeType === OrderType.MARKET ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        市价
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">限价 (PMT)</label>
                    <input 
                      type="number" 
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value)}
                      disabled={tradeType === OrderType.MARKET}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono text-xl focus:border-emerald-500 outline-none transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">数量 (Shares)</label>
                    <input 
                      type="number" 
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono text-xl focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">预计扣除金额</span>
                    <span className="text-xl font-bold text-emerald-500">
                      {tradeType === OrderType.MARKET
                        ? '--'
                        : (((parseInt(tradePrice) || 0) * (parseInt(tradeAmount) || 0) / 100).toLocaleString() + ' PMT')}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
                    {tradeType === OrderType.MARKET ? '市价单将按对手盘最优价格成交，未成交部分会保留为挂单（或需你手动撤单）。' : '计算公式: (价格 * 数量) / 100'}
                  </div>
                </div>

                {/* 用户挂单 & 持仓概览 */}
                <div className="space-y-6 mb-8">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">我的挂单</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 max-h-40 overflow-y-auto">
                      {userOrders.filter(o => o.status === OrderStatus.OPEN).length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-500">
                          当前没有待成交挂单。
                        </div>
                      ) : (
                        userOrders
                          .filter(o => o.status === OrderStatus.OPEN)
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map(o => (
                            <div key={o.id} className="px-4 py-3 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                  o.outcome === OutcomeType.YES ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {o.outcome}
                                </span>
                                <span className="text-gray-400">
                                  {o.side === OrderSide.BUY
                                    ? (o.outcome === OutcomeType.YES ? '做多' : '做空')
                                    : '卖出'} · 剩余 {o.remainingAmount} 份
                                </span>
                              </div>
                              <div className="flex items-center gap-3 font-mono">
                                <span className="text-gray-300">{o.price} PMT</span>
                                <span className="text-[10px] text-gray-500">
                                  {new Date(o.createdAt).toLocaleTimeString()}
                                </span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!account) return;
                                    if (!confirm('确认撤销该挂单？')) return;
                                    try {
                                      const res = await fetch('/api/orders/cancel', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: account, orderId: o.id })
                                      });
                                      const contentType = res.headers.get('content-type') || '';
                                      const data = contentType.includes('application/json')
                                        ? await res.json()
                                        : await res.text();
                                      if (!res.ok) {
                                        const msg =
                                          typeof data === 'string'
                                            ? data
                                            : (data?.error || '未知错误');
                                        alert(`撤单失败：${msg}`);
                                      } else {
                                        fetchMarkets(true);
                                        if (selectedMarket) {
                                          fetchOrderbook(selectedMarket.id);
                                          fetchUserMarketData(selectedMarket.id);
                                        }
                                      }
                                    } catch (err) {
                                      console.error('Cancel order error:', err);
                                      alert('撤单失败，请稍后重试');
                                    }
                                  }}
                                  className="ml-1 px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] text-gray-300"
                                >
                                  撤单
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">我的持仓</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs space-y-3">
                      {userPositions.length === 0 ? (
                        <div className="text-gray-500">
                          尚未在该市场形成正式持仓。挂单完全成交后，这里会显示 YES/NO 份额。
                        </div>
                      ) : (
                        userPositions.map((pos) => (
                          <div key={pos.marketId} className="space-y-2">
                            {(pos.yesAmount > 0 || pos.lockedYesAmount > 0) && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-400">YES 份额</span>
                                <span className="text-white font-mono">
                                  {pos.yesAmount}
                                  {pos.lockedYesAmount > 0 && (
                                    <span className="text-gray-500 text-[10px] ml-1">
                                      (冻结 {pos.lockedYesAmount})
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {(pos.noAmount > 0 || pos.lockedNoAmount > 0) && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-400">NO 份额</span>
                                <span className="text-white font-mono">
                                  {pos.noAmount}
                                  {pos.lockedNoAmount > 0 && (
                                    <span className="text-gray-500 text-[10px] ml-1">
                                      (冻结 {pos.lockedNoAmount})
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleTrade(OutcomeType.YES, OrderSide.BUY)}
                    disabled={isTrading || selectedMarket.status !== MarketStatus.OPEN || new Date(selectedMarket.endTime) < new Date()}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    做多
                  </button>
                  <button 
                    onClick={() => handleTrade(OutcomeType.NO, OrderSide.BUY)}
                    disabled={isTrading || selectedMarket.status !== MarketStatus.OPEN || new Date(selectedMarket.endTime) < new Date()}
                    className="w-full bg-red-500 hover:bg-red-400 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    做空
                  </button>
                </div>
              </div>

              {/* Right: Orderbook */}
              <div className="w-full lg:w-96 bg-white/[0.02] p-8 flex flex-col">
                <div className="flex items-center gap-2 text-white font-bold mb-6">
                  <Activity size={20} className="text-emerald-500" />
                  <span>订单簿</span>
                </div>

                <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">价格走势 / K线数据</span>
                    <div className="flex gap-1">
                      {[1, 5, 15].map(tf => (
                        <button
                          key={tf}
                          onClick={() => setKlineTf(tf)}
                          className={`px-2 py-1 rounded text-[10px] border ${klineTf === tf ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400'}`}
                        >
                          {tf}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={candles}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="ts" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '10px' }}
                          formatter={(v: any, k: any) => [v, k]}
                        />
                        <Line type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {candles.length > 0 && (
                    <div className="mt-2 text-[10px] text-gray-500">
                      最新K线 O:{candles[candles.length - 1].open} H:{candles[candles.length - 1].high} L:{candles[candles.length - 1].low} C:{candles[candles.length - 1].close}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setOrderbookOutcome(OutcomeType.YES)}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      orderbookOutcome === OutcomeType.YES
                        ? 'bg-emerald-500 text-black border-emerald-500'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-emerald-500/40'
                    }`}
                  >
                    YES
                  </button>
                  <button
                    onClick={() => setOrderbookOutcome(OutcomeType.NO)}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      orderbookOutcome === OutcomeType.NO
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-red-500/40'
                    }`}
                  >
                    NO
                  </button>
                </div>

                <div className="flex-1 space-y-8 overflow-y-auto">
                  {/* Asks (Sell Orders) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold mb-2">
                      <span>价格</span>
                      <span>数量</span>
                    </div>
                    {(orderbookOutcome === OutcomeType.YES ? orderbook?.YES?.asks : orderbook?.NO?.asks) &&
                      Object.entries(orderbookOutcome === OutcomeType.YES ? orderbook.YES.asks : orderbook.NO.asks)
                        .reverse()
                        .map(([price, amount]: any) => (
                      <div key={price} className="flex justify-between items-center h-6 relative group">
                        <div className="absolute inset-0 bg-red-500/5 origin-right" style={{ width: `${Math.min(100, (amount / 1000) * 100)}%` }} />
                        <span className="text-xs text-red-500 font-mono z-10">{price}</span>
                        <span className="text-xs text-gray-400 font-mono z-10">{amount}</span>
                      </div>
                    ))}
                  </div>

                  {/* Mid Price */}
                  <div className="py-4 border-y border-white/5 text-center">
                    <div className="text-2xl font-bold text-white">
                      {orderbookOutcome === OutcomeType.YES ? selectedMarket?.yesPrice : selectedMarket?.noPrice}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">最新成交价</div>
                  </div>

                  {/* Bids (Buy Orders) */}
                  <div className="space-y-1">
                    {(orderbookOutcome === OutcomeType.YES ? orderbook?.YES?.bids : orderbook?.NO?.bids) &&
                      Object.entries(orderbookOutcome === OutcomeType.YES ? orderbook.YES.bids : orderbook.NO.bids)
                        .reverse()
                        .map(([price, amount]: any) => (
                      <div key={price} className="flex justify-between items-center h-6 relative group">
                        <div className="absolute inset-0 bg-emerald-500/5 origin-right" style={{ width: `${Math.min(100, (amount / 1000) * 100)}%` }} />
                        <span className="text-xs text-emerald-500 font-mono z-10">{price}</span>
                        <span className="text-xs text-gray-400 font-mono z-10">{amount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <WalletIcon size={14} />
                    <span>结算规则: 预测正确得 100 PMT，错误得 0 PMT</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 创建市场弹窗 */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCreating && setShowCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl p-6 sm:p-8"
            >
              <button 
                onClick={() => !isCreating && setShowCreateModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-2xl font-bold text-white mb-2">创建新的预测市场</h2>
              <p className="text-gray-500 text-sm mb-6">
                填写一个关于未来事件的问题，并设置截止时间与结算数据来源。提交后将进入管理员审核，通过后才开放交易。
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">市场问题标题</label>
                  <input
                    type="text"
                    value={newMarket.title}
                    onChange={(e) => setNewMarket({ ...newMarket, title: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                    placeholder="例如：治理提案 #005 是否会通过？"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">事件描述</label>
                  <textarea
                    value={newMarket.description}
                    onChange={(e) => setNewMarket({ ...newMarket, description: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500 h-20"
                    placeholder="说明事件背景、触发条件以及判定标准。"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">分类</label>
                    <select
                      value={newMarket.category}
                      onChange={(e) => setNewMarket({ ...newMarket, category: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                    >
                      <option value="政治与政策">政治与政策</option>
                      <option value="经济与金融">经济与金融</option>
                      <option value="科技发展">科技发展</option>
                      <option value="全球事件">全球事件</option>
                      <option value="娱乐与文化">娱乐与文化</option>
                      <option value="体育赛事">体育赛事</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">截止时间</label>
                    <input
                      type="datetime-local"
                      value={newMarket.endTime}
                      onChange={(e) => setNewMarket({ ...newMarket, endTime: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">结算数据来源</label>
                  <input
                    type="text"
                    value={newMarket.resolutionSource}
                    onChange={(e) => setNewMarket({ ...newMarket, resolutionSource: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                    placeholder="例如：治理合约状态、官方公告链接等"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  disabled={isCreating}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 border border-white/10 hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  disabled={isCreating}
                  onClick={async () => {
                    if (!newMarket.title || !newMarket.description || !newMarket.endTime || !newMarket.resolutionSource) {
                      alert('请完整填写所有字段');
                      return;
                    }
                    setIsCreating(true);
                    try {
                      const res = await fetch('/api/markets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...newMarket,
                          endTime: new Date(newMarket.endTime).toISOString()
                        })
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        alert(`创建失败：${data.error || '未知错误'}`);
                      } else {
                        alert('市场创建成功！');
                        setShowCreateModal(false);
                        setNewMarket({
                          title: '',
                          description: '',
                          category: '政治与政策',
                          endTime: '',
                          resolutionSource: ''
                        });
                        fetchMarkets(true);
                      }
                    } catch (error) {
                      console.error('Create market error:', error);
                      alert('创建失败，请稍后重试');
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold flex items-center gap-2 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>创建市场</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
