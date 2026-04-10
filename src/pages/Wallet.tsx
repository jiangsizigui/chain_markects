import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, RefreshCw, History, PieChart, Loader2, TrendingUp } from 'lucide-react';
import { Position, Wallet as WalletType, Trade } from '../types';

export const Wallet: React.FC<{ account: string | null }> = ({ account }) => {
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFauceting, setIsFauceting] = useState(false);
  const [tradeSeries, setTradeSeries] = useState<{ name: string; pnl: number }[]>([]);
  const [userTrades, setUserTrades] = useState<Trade[]>([]);

  const fetchData = async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [walletRes, posRes, tradesRes] = await Promise.all([
        fetch(`/api/wallet/${account}`),
        fetch(`/api/positions/${account}`),
        fetch(`/api/trades/${account}`)
      ]);
      
      if (walletRes.ok) setWallet(await walletRes.json());
      if (posRes.ok) setPositions(await posRes.json());
      if (tradesRes.ok) {
        const trades: Trade[] = await tradesRes.json();
        if (Array.isArray(trades) && trades.length > 0) {
          setUserTrades(trades.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          // 简单构造按时间累计净现金流序列：买入记为负支出，卖出记为正收入（以 PMT 计）
          let cumulative = 0;
          const series = trades
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(t => {
              const me = account.toLowerCase();
              const isBuyer = t.buyerId.toLowerCase() === me;
              const mySide = isBuyer ? (t.buyerSide || 'BUY') : (t.sellerSide || 'SELL');
              const myPrice = isBuyer ? (t.buyerPrice ?? t.price) : (t.sellerPrice ?? t.price);
              const cash = (myPrice * t.amount) / 100;
              cumulative += (mySide === 'BUY' ? -cash : cash);
              const time = new Date(t.timestamp);
              const label = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
              return { name: label, pnl: Number(cumulative.toFixed(4)) };
            });
          setTradeSeries(series);
        } else {
          setTradeSeries([]);
          setUserTrades([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [account]);

  const handleFaucet = async () => {
    if (!account) return;
    setIsFauceting(true);
    try {
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account })
      });

      if (response.ok) {
        const updatedWallet = await response.json();
        setWallet(updatedWallet);
        alert("领取成功！已向您的账户发放 1000 PMT。");
      }
    } catch (error) {
      console.error("Faucet error:", error);
    } finally {
      setIsFauceting(false);
    }
  };

  if (!account) {
    return (
      <div className="pt-24 pb-12 px-4 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white/5 p-8 rounded-3xl border border-white/10 flex flex-col items-center text-center max-w-md">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
            <WalletIcon size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">未连接钱包</h2>
          <p className="text-gray-400 mb-8">请先连接您的 MetaMask 钱包以查看资产、持仓和交易记录。</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Balance Card */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-[2rem] p-8 text-black relative overflow-hidden shadow-2xl shadow-emerald-500/20"
          >
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <p className="text-black/60 font-bold uppercase tracking-widest text-xs mb-1">当前余额</p>
                  <h2 className="text-5xl font-black tracking-tight">
                    {wallet?.balance.toLocaleString()} <span className="text-2xl">PMT</span>
                  </h2>
                </div>
                <button 
                  onClick={handleFaucet}
                  disabled={isFauceting}
                  className="bg-black text-white px-6 py-3 rounded-2xl font-bold hover:bg-black/80 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {isFauceting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                  <span>领取测试币</span>
                </button>
              </div>
              
              <div className="flex gap-8">
                <div>
                  <p className="text-black/60 font-bold uppercase tracking-widest text-[10px] mb-1">冻结资金</p>
                  <p className="text-xl font-bold">{wallet?.lockedBalance.toLocaleString()} PMT</p>
                </div>
                <div>
                  <p className="text-black/60 font-bold uppercase tracking-widest text-[10px] mb-1">钱包地址</p>
                  <p className="text-xl font-bold font-mono">{account.slice(0, 6)}...{account.slice(-4)}</p>
                </div>
              </div>
            </div>
            
            {/* Decorative circles */}
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -left-20 -top-20 w-64 h-64 bg-black/5 rounded-full blur-3xl" />
          </motion.div>

          {/* Positions Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-xl">
                <PieChart size={24} className="text-emerald-500" />
                <span>当前持仓</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {positions.length > 0 ? positions.map((pos, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">市场 ID: #{pos.marketId}</div>
                    <div className="flex gap-2">
                      {pos.yesAmount > 0 && <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded">YES</span>}
                      {pos.noAmount > 0 && <span className="px-2 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold rounded">NO</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {(pos.yesAmount > 0 || pos.lockedYesAmount > 0) && (
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase mb-1">YES 份额</div>
                        <div className="text-lg font-bold text-white">
                          {pos.yesAmount}
                          {pos.lockedYesAmount > 0 && <span className="text-xs text-gray-500 ml-1">(冻结 {pos.lockedYesAmount})</span>}
                        </div>
                      </div>
                    )}
                    {(pos.noAmount > 0 || pos.lockedNoAmount > 0) && (
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase mb-1">NO 份额</div>
                        <div className="text-lg font-bold text-white">
                          {pos.noAmount}
                          {pos.lockedNoAmount > 0 && <span className="text-xs text-gray-500 ml-1">(冻结 {pos.lockedNoAmount})</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-2 py-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <p className="text-gray-500">暂无持仓，前往市场大厅开始交易吧！</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Quick Actions & Stats */}
        <div className="space-y-8">
          <div className="bg-[#141414] border border-white/5 rounded-3xl p-8">
            <h3 className="text-white font-bold mb-6 flex items-center gap-2">
              <History size={20} className="text-emerald-500" />
              资产概览
            </h3>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">总资产价值</span>
                <span className="text-white font-bold">-- PMT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">历史累计净现金流</span>
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <TrendingUp size={14} />
                  {tradeSeries.length > 0 ? `${tradeSeries[tradeSeries.length - 1].pnl.toFixed(2)} PMT` : '--'}
                </span>
              </div>
              <div className="h-px bg-white/5" />
              {tradeSeries.length > 0 && (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tradeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="name" hide />
                      <YAxis stroke="#ffffff50" fontSize={10} tickFormatter={(v) => `${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '12px' }}
                        labelStyle={{ color: '#9ca3af' }}
                        formatter={(value) => [`${value} PMT`, '累计净现金流']}
                      />
                      <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">快速操作</p>
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group">
                    <ArrowUpRight size={20} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-white">充值</span>
                  </button>
                  <button className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group">
                    <ArrowDownLeft size={20} className="text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-white">提现</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-8">
            <h4 className="text-emerald-500 font-bold mb-2">安全提示</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              PMT 是本预测平台的虚拟信用代币。请妥善保管您的私钥，不要向任何人泄露。
            </p>
          </div>

          {/* 我的交易记录 */}
          <div className="bg-[#141414] border border-white/5 rounded-3xl p-8">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <History size={18} className="text-emerald-500" />
              我的交易记录
            </h3>
            <div className="max-h-64 overflow-y-auto text-xs">
              {userTrades.length === 0 ? (
                <p className="text-gray-500">暂无成交记录，完成一笔成交后，这里会展示每一笔交易明细。</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-normal pb-2">时间</th>
                      <th className="text-left font-normal pb-2">市场</th>
                      <th className="text-left font-normal pb-2">方向</th>
                      <th className="text-right font-normal pb-2">价格</th>
                      <th className="text-right font-normal pb-2">数量</th>
                      <th className="text-right font-normal pb-2">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTrades.slice(0, 40).map(t => {
                      const me = account!.toLowerCase();
                      const isBuyer = t.buyerId.toLowerCase() === me;
                      const mySide = isBuyer ? (t.buyerSide || 'BUY') : (t.sellerSide || 'SELL');
                      const myOutcome = isBuyer ? (t.buyerOutcome || t.outcome) : (t.sellerOutcome || t.outcome);
                      const myPrice = isBuyer ? (t.buyerPrice ?? t.price) : (t.sellerPrice ?? t.price);
                      const sideLabel = mySide === 'BUY' ? '买入' : '卖出';
                      const sign = mySide === 'BUY' ? '-' : '+';
                      const amountPmt = (myPrice * t.amount) / 100;
                      const time = new Date(t.timestamp);
                      const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours()}:${String(
                        time.getMinutes()
                      ).padStart(2, '0')}`;
                      return (
                        <tr key={t.id} className="border-t border-white/5">
                          <td className="py-1 pr-2 text-gray-400">{timeStr}</td>
                          <td className="py-1 pr-2 text-gray-300">#{t.marketId}</td>
                          <td className="py-1 pr-2">
                            <span className={mySide === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                              {sideLabel} {myOutcome}
                            </span>
                          </td>
                          <td className="py-1 text-right text-gray-300">{myPrice} PMT</td>
                          <td className="py-1 text-right text-gray-300">{t.amount}</td>
                          <td className="py-1 text-right">
                            <span className={mySide === 'BUY' ? 'text-red-400' : 'text-emerald-400'}>
                              {sign}{amountPmt.toFixed(2)} PMT
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
