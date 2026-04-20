import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Play, Square, Plus, Trash2, Activity, TrendingUp, BarChart3,
  Zap, RefreshCw, Settings, ChevronDown, ChevronUp, Clock, Target,
  AlertCircle, CheckCircle2, Cpu, Layers, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, AreaChart, Area, BarChart, Bar } from 'recharts';

type BotStrategy = 'market_maker' | 'momentum' | 'noise';
type BotConfig = {
  id: string;
  name: string;
  enabled: boolean;
  strategy: BotStrategy;
  marketIds: number[];
  intensity: number;
  maxOrderSize: number;
  riskPreference: number;
  horizon: 'short' | 'medium' | 'long';
  createdAt: string;
  updatedAt: string;
};

type Market = { id: number; title: string; status: string; yesPrice: number; noPrice: number; volume: number };
type Trade = { id: string; marketId: number; price: number; amount: number; timestamp: string; outcome: string };

const strategyMeta: Record<BotStrategy, { label: string; desc: string; color: string; bgColor: string }> = {
  market_maker: { label: '做市商', desc: '在买卖价差间提供流动性，赚取价差收益', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
  momentum: { label: '趋势跟随', desc: '追随价格动量，跟进上升趋势买入', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
  noise: { label: '噪声交易者', desc: '随机行为模拟真实市场噪声与流动性', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20' },
};

export const Bots: React.FC<{ adminToken: string | null }> = () => {
  // 从 localStorage 实时读取 adminToken，确保 Admin 页登录后此处立即生效
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('adminToken'));
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedBot, setExpandedBot] = useState<string | null>(null);
  const [tradesCount, setTradesCount] = useState(0);
  const [liveStats, setLiveStats] = useState({ totalBots: 0, activeBots: 0, tradesPerMin: 0, avgPrice: 0 });
  const [isRunningOnce, setIsRunningOnce] = useState(false);
  const [loginUserId, setLoginUserId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [newBot, setNewBot] = useState<Partial<BotConfig>>({
    name: '新机器人',
    enabled: false,
    strategy: 'market_maker',
    marketIds: [],
    intensity: 3,
    maxOrderSize: 200,
    riskPreference: 50,
    horizon: 'medium'
  });
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const authHeaders = adminToken ? { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } : null;

  // 监听 localStorage 中 adminToken 的变化（跨 tab 同步）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'adminToken') setAdminToken(e.newValue);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleLogin = async () => {
    if (!loginUserId || !loginPassword) { setLoginError('请填写用户 ID 和密码'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/admin/auth/fabric-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: loginUserId, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || '登录失败'); return; }
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminExpiresAt', data.expiresAt || '');
      setAdminToken(data.token);
      setLoginError('');
    } catch (e) {
      setLoginError('网络错误，请重试');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminExpiresAt');
    setAdminToken(null);
    setBots([]);
  };

  const fetchAll = async () => {
    const token = localStorage.getItem('adminToken');
    const hdrs = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
    if (!hdrs) { setLoading(false); return; }
    try {
      const [botsRes, marketsRes, tradesRes] = await Promise.all([
        fetch('/api/admin/bots', { headers: hdrs }),
        fetch('/api/markets'),
        fetch('/api/trades')
      ]);
      // 只调用一次 .json()，避免 body already used 错误
      const botsData: BotConfig[] = botsRes.ok ? await botsRes.json() : [];
      if (botsRes.ok) setBots(botsData);
      if (marketsRes.ok) setMarkets(await marketsRes.json());
      if (tradesRes.ok) {
        const t: Trade[] = await tradesRes.json();
        setRecentTrades(t.slice(-200));
        setTradesCount(t.length);
        const nowTs = Date.now();
        const lastMin = t.filter(tr => nowTs - new Date(tr.timestamp).getTime() < 60000);
        setLiveStats({
          totalBots: botsData.length,
          activeBots: botsData.filter(b => b.enabled).length,
          tradesPerMin: lastMin.length,
          avgPrice: t.length > 0 ? Math.round(t.slice(-10).reduce((s, tr) => s + tr.price, 0) / Math.min(10, t.length)) : 0
        });
      }
    } catch (e) {
      console.error('fetchAll error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [adminToken]);

  // 从 bots state 同步 liveStats 的 totalBots / activeBots
  useEffect(() => {
    setLiveStats(prev => ({
      ...prev,
      totalBots: bots.length,
      activeBots: bots.filter(b => b.enabled).length
    }));
  }, [bots]);

  const toggleBot = async (bot: BotConfig) => {
    if (!authHeaders) return;
    const endpoint = bot.enabled ? `/api/admin/bots/${bot.id}/stop` : `/api/admin/bots/${bot.id}/start`;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: authHeaders });
      if (res.ok) fetchAll();
    } catch (e) { console.error(e); }
  };

  const deleteBot = async (id: string) => {
    if (!authHeaders) return;
    if (!window.confirm('确定要删除该机器人吗？此操作不可撤销。')) return;
    try {
      const res = await fetch(`/api/admin/bots/${id}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) {
        setBots(prev => prev.filter(b => b.id !== id));
        if (expandedBot === id) setExpandedBot(null);
      }
    } catch (e) { console.error(e); }
  };

  const createBot = async () => {
    if (!authHeaders) return;
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newBot)
      });
      if (res.ok) {
        const created = await res.json();
        setBots(prev => [...prev, created]);
        setShowCreate(false);
        setNewBot({ name: '新机器人', enabled: false, strategy: 'market_maker', marketIds: [], intensity: 3, maxOrderSize: 200, riskPreference: 50, horizon: 'medium' });
      }
    } catch (e) { console.error(e); }
  };

  const updateBot = async (id: string, patch: Partial<BotConfig>) => {
    if (!authHeaders) return;
    try {
      const res = await fetch(`/api/admin/bots/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(patch)
      });
      if (res.ok) {
        const updated = await res.json();
        setBots(prev => prev.map(b => b.id === id ? updated : b));
      }
    } catch (e) { console.error(e); }
  };

  const runBotsOnce = async () => {
    if (!authHeaders) return;
    setIsRunningOnce(true);
    try {
      const res = await fetch('/api/admin/bots/run-once', { method: 'POST', headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setTradesCount(data.tradesCount);
        await fetchAll();
      }
    } catch (e) { console.error(e); }
    finally { setIsRunningOnce(false); }
  };

  // Trade volume per market chart data
  const marketVolumes = markets.map(m => ({
    name: `#${m.id}`,
    vol: recentTrades.filter(t => t.marketId === m.id).length,
    price: m.yesPrice
  })).filter(m => m.vol > 0).slice(0, 10);

  // Recent trade activity timeline
  const activityBuckets: { bucket: string; count: number }[] = [];
  const now = Date.now();
  for (let i = 11; i >= 0; i--) {
    const start = now - (i + 1) * 300000;
    const end = now - i * 300000;
    const count = recentTrades.filter(t => {
      const ts = new Date(t.timestamp).getTime();
      return ts >= start && ts < end;
    }).length;
    const label = new Date(end).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    activityBuckets.push({ bucket: label, count });
  }

  if (!authHeaders) {
    return (
      <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-10 w-full max-w-md shadow-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto">
              <Bot size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">管理员登录</h2>
            <p className="text-gray-500 text-sm">登录后可管理交易机器人，需要 Fabric 管理员账号</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">用户 ID</label>
              <input
                value={loginUserId}
                onChange={e => setLoginUserId(e.target.value)}
                placeholder="输入 Fabric 用户 ID"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">密码</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="输入密码"
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={14} />
                {loginError}
              </div>
            )}
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all active:scale-95"
            >
              {loginLoading ? '登录中...' : '登录管理员'}
            </button>
          </div>
          <p className="text-center text-xs text-gray-600">
            也可前往<button onClick={() => {}} className="text-emerald-400 hover:underline mx-1">管理员页面</button>登录后再返回此页
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Bot size={22} className="text-emerald-400" />
            </div>
            <h1 className="text-4xl font-bold text-white">交易机器人</h1>
          </div>
          <p className="text-gray-400">配置和监控自动交易机器人，为预测市场生成真实流动性与模拟交易数据。</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl hover:bg-red-500/20 transition-all text-xs font-bold"
          >
            退出管理员
          </button>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl hover:bg-white/10 transition-all active:scale-95"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={runBotsOnce}
            disabled={isRunningOnce}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition-all active:scale-95"
          >
            {isRunningOnce ? <Activity size={16} className="animate-spin" /> : <Zap size={16} />}
            立即运行一次
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold px-5 py-3 rounded-xl transition-all active:scale-95"
          >
            <Plus size={16} />
            创建机器人
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: '机器人总数', value: bots.length, icon: Layers, color: 'text-white', bg: 'bg-white/5' },
          { label: '运行中', value: bots.filter(b => b.enabled).length, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: '累计成交笔数', value: tradesCount, icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '近期成交均价', value: `${liveStats.avgPrice} PMT`, icon: TrendingUp, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} border border-white/5 rounded-2xl p-5 flex items-center gap-4`}>
            <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <s.icon size={22} className={s.color} />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Activity Timeline */}
        <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock size={14} />
            交易活动时间轴 (5分钟间隔)
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityBuckets}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="bucket" stroke="#ffffff40" fontSize={10} tickLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="count" stroke="#10b981" fill="url(#actGrad)" strokeWidth={2} name="成交笔数" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Market Volume Distribution */}
        <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 size={14} />
            各市场成交分布
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketVolumes} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="vol" fill="#10b981" radius={[4, 4, 0, 0]} name="成交笔数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bot List */}
      <div className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Cpu size={20} className="text-emerald-400" />
          机器人列表
          <span className="text-sm text-gray-500 font-normal">({bots.length} 个)</span>
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Activity size={32} className="text-emerald-500 animate-spin" />
          </div>
        ) : bots.length === 0 ? (
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-12 text-center">
            <Bot size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">暂无机器人，点击右上角"创建机器人"开始</p>
          </div>
        ) : (
          bots.map(bot => {
            const meta = strategyMeta[bot.strategy];
            const botTrades = recentTrades.filter(t => {
              // estimate: recent trades are generated by bots
              return true;
            });
            const isExpanded = expandedBot === bot.id;
            return (
              <div key={bot.id} className={`bg-[#141414] border rounded-2xl transition-all ${bot.enabled ? 'border-emerald-500/20' : 'border-white/5'}`}>
                <div className="p-5 flex items-center gap-4">
                  {/* Status indicator */}
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${bot.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`} />

                  {/* Strategy icon */}
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${meta.bgColor}`}>
                    <Bot size={18} className={meta.color} />
                  </div>

                  {/* Bot info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-white">{bot.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bgColor} ${meta.color}`}>
                        {meta.label}
                      </span>
                      {bot.enabled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          运行中
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      强度 {bot.intensity}/10 · 风险 {bot.riskPreference}% · {bot.horizon === 'short' ? '短期' : bot.horizon === 'long' ? '长期' : '中期'}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="hidden md:flex items-center gap-6 text-xs text-gray-400">
                    <div className="text-center">
                      <div className="text-gray-600 uppercase tracking-wider text-[10px]">市场数</div>
                      <div className="text-white font-bold">{bot.marketIds.length === 0 ? '全部' : bot.marketIds.length}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 uppercase tracking-wider text-[10px]">最大单量</div>
                      <div className="text-white font-bold">{bot.maxOrderSize}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleBot(bot)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        bot.enabled
                          ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {bot.enabled ? <><Square size={12} /> 停止</> : <><Play size={12} /> 启动</>}
                    </button>
                    <button
                      onClick={() => deleteBot(bot.id)}
                      className="w-9 h-9 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500/50 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/20 transition-all"
                      title="删除机器人"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandedBot(isExpanded ? null : bot.id)}
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 transition-all"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">交易强度 (1-10)</label>
                        <input
                          type="range" min={1} max={10} value={bot.intensity}
                          onChange={e => updateBot(bot.id, { intensity: Number(e.target.value) })}
                          className="w-full accent-emerald-500"
                        />
                        <div className="text-xs text-emerald-400 mt-1">{bot.intensity}</div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">风险偏好 (0-100)</label>
                        <input
                          type="range" min={0} max={100} value={bot.riskPreference}
                          onChange={e => updateBot(bot.id, { riskPreference: Number(e.target.value) })}
                          className="w-full accent-blue-500"
                        />
                        <div className="text-xs text-blue-400 mt-1">{bot.riskPreference}%</div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">最大订单量</label>
                        <input
                          type="number" min={10} max={1000} value={bot.maxOrderSize}
                          onChange={e => updateBot(bot.id, { maxOrderSize: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">投资期限</label>
                        <select
                          value={bot.horizon}
                          onChange={e => updateBot(bot.id, { horizon: e.target.value as any })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                        >
                          <option value="short">短期 (高频)</option>
                          <option value="medium">中期 (平衡)</option>
                          <option value="long">长期 (低频)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">策略描述</label>
                      <div className={`p-3 rounded-xl border text-xs ${meta.bgColor} ${meta.color}`}>
                        {meta.desc}
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-500 flex gap-4">
                      <span>创建时间: {new Date(bot.createdAt).toLocaleString('zh-CN')}</span>
                      <span>最后更新: {new Date(bot.updatedAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Recent Trades Table */}
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity size={14} />
          最近成交记录（最新50笔）
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/5">
                <th className="text-left py-2 pr-4">时间</th>
                <th className="text-left py-2 pr-4">市场</th>
                <th className="text-left py-2 pr-4">方向</th>
                <th className="text-right py-2 pr-4">价格</th>
                <th className="text-right py-2">数量</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.slice(-50).reverse().map(trade => {
                const mkt = markets.find(m => m.id === trade.marketId);
                return (
                  <tr key={trade.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-4 text-gray-500">{new Date(trade.timestamp).toLocaleTimeString('zh-CN')}</td>
                    <td className="py-2 pr-4 text-gray-300 truncate max-w-[160px]">#{trade.marketId} {mkt?.title?.slice(0, 15) || ''}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${trade.outcome === 'YES' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {trade.outcome}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right text-white font-mono">{trade.price}</td>
                    <td className="py-2 text-right text-white font-mono">{trade.amount}</td>
                  </tr>
                );
              })}
              {recentTrades.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">暂无成交记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Bot Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Plus size={20} className="text-emerald-400" />
              创建交易机器人
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">机器人名称</label>
                <input
                  value={newBot.name || ''}
                  onChange={e => setNewBot(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">交易策略</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(strategyMeta) as BotStrategy[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setNewBot(p => ({ ...p, strategy: s }))}
                      className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${newBot.strategy === s ? strategyMeta[s].bgColor + ' ' + strategyMeta[s].color : 'border-white/10 text-gray-400 bg-white/5'}`}
                    >
                      {strategyMeta[s].label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">{strategyMeta[newBot.strategy as BotStrategy]?.desc}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">交易强度 ({newBot.intensity})</label>
                  <input type="range" min={1} max={10} value={newBot.intensity}
                    onChange={e => setNewBot(p => ({ ...p, intensity: Number(e.target.value) }))}
                    className="w-full accent-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">风险偏好 ({newBot.riskPreference}%)</label>
                  <input type="range" min={0} max={100} value={newBot.riskPreference}
                    onChange={e => setNewBot(p => ({ ...p, riskPreference: Number(e.target.value) }))}
                    className="w-full accent-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-2">投资期限</label>
                <div className="flex gap-2">
                  {[['short', '短期'], ['medium', '中期'], ['long', '长期']].map(([v, l]) => (
                    <button key={v} onClick={() => setNewBot(p => ({ ...p, horizon: v as any }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${newBot.horizon === v ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="botEnabled" checked={!!newBot.enabled}
                  onChange={e => setNewBot(p => ({ ...p, enabled: e.target.checked }))}
                  className="accent-emerald-500 w-4 h-4" />
                <label htmlFor="botEnabled" className="text-sm text-gray-300">创建后立即启动</label>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/10 transition-all">
                取消
              </button>
              <button onClick={createBot}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-3 rounded-xl transition-all">
                创建机器人
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
