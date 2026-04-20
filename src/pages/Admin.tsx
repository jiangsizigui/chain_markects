import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, Cpu, Loader2, X,
  TrendingUp, Clock, Users, BarChart2, ChevronRight, Sparkles,
  AlertTriangle, Globe, RefreshCw, Zap
} from 'lucide-react';
import { Market, MarketStatus, OutcomeType } from '../types';

type AIProviderId = 'openai' | 'qwen' | 'gemini';
type AIKeyConfig = { label?: string; apiKey: string };
type AIProviderConfig = {
  id: AIProviderId; enabled: boolean; model: string; baseUrl?: string; keys: AIKeyConfig[];
};
type AISettings = {
  mode?: 'manual' | 'assist' | 'auto';
  systemPrompt: string; reviewPrompt: string; settlePrompt: string;
  retrieval?: { enabled: boolean; provider: 'tavily' | 'serpapi' | 'bing'; apiKey: string; maxResults: number; };
  crossValidate: boolean; providers: AIProviderConfig[];
};
type BotConfig = {
  id: string; name: string; enabled: boolean; strategy: 'market_maker' | 'momentum' | 'noise';
  marketIds: number[]; intensity: number; maxOrderSize: number; riskPreference: number;
  horizon: 'short' | 'medium' | 'long'; createdAt: string; updatedAt: string;
};

// Avatar color from username
const avatarColor = (name: string) => {
  const colors = [
    'from-violet-500 to-purple-600', 'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500', 'from-orange-500 to-red-500',
    'from-pink-500 to-rose-600', 'from-amber-500 to-yellow-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const StatusBadge: React.FC<{ s: MarketStatus }> = ({ s }) => {
  const map: Record<MarketStatus, { label: string; cls: string }> = {
    [MarketStatus.ACTIVE]:     { label: '交易中', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    [MarketStatus.CLOSED]:     { label: '待结算', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    [MarketStatus.PENDING]:    { label: '待审核', cls: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
    [MarketStatus.RESOLVED]:   { label: '已结算', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    [MarketStatus.CANCELLED]:  { label: '已取消', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  };
  const c = map[s] || { label: s, cls: 'bg-white/10 text-gray-300' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>;
};

type Tab = 'review' | 'settle' | 'config' | 'bots';

export const Admin: React.FC<{ userId: string | null }> = ({ userId }) => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('review');
  const [settleFilter, setSettleFilter] = useState<'CLOSED' | 'RESOLVED' | 'ALL'>('CLOSED');
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [newBotName, setNewBotName] = useState('做市机器人');
  const [stats, setStats] = useState({ total: 0, pending: 0, closed: 0, resolved: 0 });
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [newMarketTitle, setNewMarketTitle] = useState('');
  const [newMarketDesc, setNewMarketDesc] = useState('');
  const [newMarketEnd, setNewMarketEnd] = useState('');
  const [creating, setCreating] = useState(false);

  const adminToken = useMemo(() => localStorage.getItem('adminToken'), []);
  const isAdminLoggedIn = useMemo(() => !!adminToken, [adminToken]);
  const authHeaders = useMemo(() => {
    if (!adminToken) return null;
    return { Authorization: `Bearer ${adminToken}` };
  }, [adminToken]);

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/markets');
      if (res.ok) {
        const data: Market[] = await res.json();
        setMarkets(data);
        setStats({
          total: data.length,
          pending: data.filter(m => m.status === MarketStatus.PENDING).length,
          closed: data.filter(m => m.status === MarketStatus.CLOSED).length,
          resolved: data.filter(m => m.status === MarketStatus.RESOLVED).length,
        });
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchMarkets(); }, []);

  useEffect(() => {
    if (!authHeaders) return;
    fetch('/api/admin/bots', { headers: authHeaders })
      .then(r => r.ok ? r.json() : []).then(setBots).catch(() => {});
    fetch('/api/admin/ai/settings', { headers: authHeaders })
      .then(r => r.ok ? r.json() : null).then(setAiSettings).catch(() => {});
  }, [authHeaders]);

  const ensureDraft = () => {
    if (aiSettings) return;
    setAiSettings({
      mode: 'assist',
      systemPrompt: '你是预测市场平台的审核与结算助手。你必须输出严格 JSON（不包裹 Markdown），不得输出多余文本。',
      reviewPrompt: '请审核预测市场问题是否清晰可判定，且不包含违法、极端、侵权、个人隐私等高风险内容。\n仅输出 JSON：{"recommend":"APPROVE"|"REJECT","reasons":"...","suggestion":"..."}',
      settlePrompt: '你将基于"预测市场题目 + 联网检索证据摘要"判断事件是否发生，并输出严格 JSON。\n仅输出 JSON：{"outcome":"YES"|"NO","reasons":"...","sources":[{"title":"...","url":"..."}]}',
      retrieval: { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 },
      crossValidate: true,
      providers: [
        { id: 'qwen', enabled: false, model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keys: [] },
        { id: 'openai', enabled: false, model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', keys: [] },
        { id: 'gemini', enabled: true, model: 'gemini-2.0-flash', keys: [] }
      ]
    });
  };

  const handleCreateMarket = async () => {
    if (!newMarketTitle.trim()) return;
    if (!authHeaders) return alert('请先登录管理员账号');
    setCreating(true);
    try {
      const endTime = newMarketEnd ? new Date(newMarketEnd).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await fetch('/api/admin/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          title: newMarketTitle, description: newMarketDesc,
          endTime, liquidity: 5000, yesPrice: 0.5, noPrice: 0.5,
          liquidityProvider: userId || 'admin',
        })
      });
      const data = await res.json();
      if (!res.ok) return alert(`创建失败：${data.error}`);
      alert('市场创建成功，请等待 AI 审核');
      setNewMarketTitle(''); setNewMarketDesc(''); setNewMarketEnd('');
      fetchMarkets();
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleReview = async (marketId: number, approve: boolean) => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/markets/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId, approve })
      });
      const data = await res.json();
      if (!res.ok) return alert(`操作失败：${data.error}`);
      alert(approve ? '✅ 市场已通过，开放交易' : '❌ 市场已拒绝');
      setAiResult(null);
      fetchMarkets();
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleAiReview = async (marketId: number) => {
    if (!authHeaders) return;
    setAiLoading(true); setAiResult(null);
    try {
      const res = await fetch('/api/admin/markets/ai-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId, extraContext: resolutionText })
      });
      const data = await res.json();
      if (!res.ok) return alert(`AI 审核失败：${data.error}`);
      setAiResult(data);
      if (aiSettings?.mode === 'auto' && data?.final?.recommend) {
        await handleReview(marketId, data.final.recommend === 'APPROVE');
      }
    } catch (e) { console.error(e); }
    finally { setAiLoading(false); }
  };

  const handleAiSettle = async () => {
    if (!selectedMarket || !authHeaders) return;
    setAiLoading(true); setAiResult(null);
    try {
      const endpoint = aiSettings?.mode === 'auto' ? '/api/admin/settle/ai' : '/api/admin/settle/ai-suggest';
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId: selectedMarket.id })
      });
      const data = await res.json();
      if (!res.ok) return alert(`AI 结算失败：${data.error}`);
      setAiResult(data);
      if (aiSettings?.mode === 'auto') {
        alert(`🎯 纯 AI 结算完成：${data.aiOutcome}`);
        setSelectedMarket(data.market);
        fetchMarkets();
      }
    } catch (e) { console.error(e); }
    finally { setAiLoading(false); }
  };

  const handleManualSettle = async (outcome: OutcomeType) => {
    if (!selectedMarket || !authHeaders) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/settle', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId: selectedMarket.id, outcome, evidence: resolutionText || undefined })
      });
      const data = await res.json();
      if (!res.ok) return alert(`结算失败：${data.error}`);
      alert('✅ 结算成功');
      setSelectedMarket(data);
      setAiResult(null);
      fetchMarkets();
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleAiSettleApply = () => {
    if (!aiResult?.final) return;
    const outcome = aiResult.final.outcome === 'NO' ? OutcomeType.NO : OutcomeType.YES;
    const evidence = JSON.stringify(aiResult.evidence || aiResult, null, 2);
    if (!selectedMarket) return;
    setResolutionText(evidence);
    setIsLoading(true);
    fetch('/api/admin/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders! },
      body: JSON.stringify({ marketId: selectedMarket.id, outcome, evidence })
    })
      .then(r => r.json())
      .then(data => {
        if (!data.error) { setSelectedMarket(data); fetchMarkets(); setAiResult(null); alert('✅ 结算已采用并执行'); }
        else alert(`失败：${data.error}`);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  const handleBootstrapSimulate = async () => {
    if (!authHeaders) return;
    const res = await fetch('/api/admin/bootstrap/simulate-trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ count: 200 })
    });
    const data = await res.json();
    if (res.ok) { alert(`已新增 ${data.appended} 笔模拟成交`); fetchMarkets(); }
    else alert(`失败：${data.error}`);
  };

  const pendingMarkets = markets.filter(m => m.status === MarketStatus.PENDING);
  const settleMarkets = markets.filter(m => settleFilter === 'ALL' ? true : m.status === settleFilter);

  const refreshBots = async () => {
    if (!authHeaders) return;
    const r = await fetch('/api/admin/bots', { headers: authHeaders });
    if (r.ok) setBots(await r.json());
  };

  const pendingCount = pendingMarkets.length;
  const closedCount = markets.filter(m => m.status === MarketStatus.CLOSED).length;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="text-emerald-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">管理员控制台</h1>
            <p className="text-gray-500 text-sm">预测市场审核 · AI 结算判定 · 系统配置</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/10 bg-white/5">
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(userId)} flex items-center justify-center text-white text-xs font-bold`}>
                {userId[0].toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-bold text-white">{userId}</div>
                <div className="text-[10px] text-emerald-400">已登录管理员</div>
              </div>
            </div>
          )}
          <button onClick={fetchMarkets} className="p-2 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20 transition-all">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: '市场总数', value: stats.total, icon: BarChart2, color: 'violet' },
          { label: '待审核', value: stats.pending, icon: Clock, color: 'amber', pulse: pendingCount > 0 },
          { label: '待结算', value: stats.closed, icon: AlertTriangle, color: 'orange' },
          { label: '已结算', value: stats.resolved, icon: CheckCircle2, color: 'emerald' },
        ].map(({ label, value, icon: Icon, color, pulse }) => (
          <div key={label} className="relative overflow-hidden bg-[#141414] border border-white/10 rounded-2xl p-4">
            {pulse && <div className="absolute inset-0 bg-amber-500/5 animate-pulse" />}
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-widest text-${color}-400`}>{label}</span>
              <Icon size={14} className={`text-${color}-500/60`} />
            </div>
            <div className="text-3xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-white/5 border border-white/10 rounded-2xl p-1 w-fit">
        {([
          { key: 'review', label: '市场审核', icon: Sparkles, dot: pendingCount > 0 },
          { key: 'settle', label: '结算管理', icon: Globe },
          { key: 'config', label: 'AI 配置', icon: Cpu },
          { key: 'bots',  label: '机器人',   icon: Zap },
        ] as const).map(({ key, label, icon: Icon, dot }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              tab === key ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ===== TAB: 市场审核 ===== */}
      {tab === 'review' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Market List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Quick Create */}
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="text-xs text-gray-400 font-bold uppercase tracking-widest">快速创建市场</div>
              <input
                value={newMarketTitle}
                onChange={e => setNewMarketTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="预测题目，例如：BTC 年底突破 10 万美元？"
              />
              <textarea
                value={newMarketDesc}
                onChange={e => setNewMarketDesc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 h-16"
                placeholder="详细描述（可选）"
              />
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newMarketEnd}
                  onChange={e => setNewMarketEnd(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                />
                <button
                  disabled={!newMarketTitle.trim() || creating}
                  onClick={handleCreateMarket}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 transition-all"
                >
                  {creating ? <Loader2 size={12} className="animate-spin" /> : '创建'}
                </button>
              </div>
            </div>

            {/* Pending Markets */}
            <div className="bg-[#141414] border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-amber-400 font-bold uppercase tracking-widest flex items-center gap-2">
                  <Clock size={12} /> 待审核 ({pendingCount})
                </span>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {pendingCount === 0 && (
                  <div className="text-xs text-gray-600 py-6 text-center">✨ 暂无待审核市场</div>
                )}
                {pendingMarkets.map(m => (
                  <div key={m.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{m.title}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{m.description?.slice(0, 60)}</div>
                      </div>
                      <StatusBadge s={m.status} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={isLoading || aiLoading}
                        onClick={() => { setSelectedMarket(m); setAiResult(null); }}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-white/10 text-[10px] text-gray-300 hover:bg-white/20 transition-all"
                      >
                        查看详情
                      </button>
                      <button
                        disabled={isLoading || aiLoading}
                        onClick={() => handleAiReview(m.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 text-[10px] hover:bg-violet-500/30 transition-all disabled:opacity-40"
                      >
                        {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Cpu size={10} />}
                        AI 审核
                      </button>
                      <button
                        disabled={isLoading}
                        onClick={() => handleReview(m.id, true)}
                        className="px-2 py-1.5 rounded-lg bg-emerald-500/80 text-black text-[10px] font-bold hover:bg-emerald-400 transition-all disabled:opacity-40"
                      >
                        ✓ 通过
                      </button>
                      <button
                        disabled={isLoading}
                        onClick={() => handleReview(m.id, false)}
                        className="px-2 py-1.5 rounded-lg bg-red-500/60 text-white text-[10px] font-bold hover:bg-red-500 transition-all disabled:opacity-40"
                      >
                        ✗ 拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo Actions */}
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
              <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-3">演示工具</div>
              <div className="flex gap-2">
                <button
                  disabled={!isAdminLoggedIn}
                  onClick={handleBootstrapSimulate}
                  className="flex-1 px-3 py-2 rounded-xl text-[10px] font-bold border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-40 transition-all"
                >
                  生成 200 笔模拟交易
                </button>
              </div>
              {!isAdminLoggedIn && (
                <div className="text-[10px] text-amber-400 mt-2">⚠️ 请先在右上角以 admin/admin123 登录以获得管理员权限</div>
              )}
            </div>
          </div>

          {/* Right: Detail + AI Panel */}
          <div className="lg:col-span-3 space-y-4">
            {selectedMarket ? (
              <>
                {/* Market Detail Card */}
                <div className="bg-[#141414] border border-white/10 rounded-2xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500 font-mono">#{selectedMarket.id}</span>
                        <StatusBadge s={selectedMarket.status} />
                      </div>
                      <h2 className="text-lg font-bold text-white">{selectedMarket.title}</h2>
                    </div>
                    <button onClick={() => setSelectedMarket(null)} className="text-gray-600 hover:text-white">
                      <X size={18} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{selectedMarket.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'YES 价格', value: `${(selectedMarket.yesPrice * 100).toFixed(1)}¢` },
                      { label: 'NO 价格', value: `${(selectedMarket.noPrice * 100).toFixed(1)}¢` },
                      { label: '截止时间', value: new Date(selectedMarket.endTime).toLocaleDateString('zh-CN') },
                      { label: '预言机来源', value: selectedMarket.resolutionSource || '待定' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</div>
                        <div className="text-sm font-bold text-white mt-0.5 truncate">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Action Panel */}
                {selectedMarket.status === MarketStatus.PENDING && (
                  <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-violet-400" />
                      <span className="text-sm font-bold text-white">AI 题目合规检测</span>
                      <span className="text-[10px] text-violet-400/60 bg-violet-500/10 px-2 py-0.5 rounded-full">内容安全 · 可判定性</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest">补充上下文（可选）</label>
                      <textarea
                        value={resolutionText}
                        onChange={e => setResolutionText(e.target.value)}
                        className="w-full bg-transparent text-xs text-gray-300 outline-none resize-none h-14"
                        placeholder="可补充外部参考资料或背景信息..."
                      />
                    </div>
                    <button
                      disabled={aiLoading}
                      onClick={() => handleAiReview(selectedMarket.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 transition-all"
                    >
                      {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />}
                      启动 AI 题目合规检测
                    </button>
                    {aiSettings?.mode === 'auto' && (
                      <div className="text-[10px] text-violet-400/60 text-center">当前为纯 AI 模式，审核后将自动执行通过/拒绝</div>
                    )}
                  </div>
                )}

                {selectedMarket.status === MarketStatus.CLOSED && (
                  <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-orange-400" />
                      <span className="text-sm font-bold text-white">AI 结果判定</span>
                      <span className="text-[10px] text-orange-400/60 bg-orange-500/10 px-2 py-0.5 rounded-full">联网检索 · 证据摘要</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        disabled={isLoading || aiLoading}
                        onClick={() => handleManualSettle(OutcomeType.YES)}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
                      >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        手动结算 YES
                      </button>
                      <button
                        disabled={isLoading || aiLoading}
                        onClick={() => handleManualSettle(OutcomeType.NO)}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-400 disabled:opacity-50 transition-all"
                      >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        手动结算 NO
                      </button>
                    </div>
                    <button
                      disabled={aiLoading}
                      onClick={handleAiSettle}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 transition-all"
                    >
                      {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {aiSettings?.mode === 'auto' ? '纯 AI 自动结算（联网）' : 'AI 联网检索并建议结果'}
                    </button>
                  </div>
                )}

                {/* AI Result Display */}
                {aiResult && (
                  <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-emerald-400" />
                        <span className="text-sm font-bold text-white">AI 分析结果</span>
                      </div>
                      {aiResult.final?.recommend && (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          aiResult.final.recommend === 'APPROVE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {aiResult.final.recommend === 'APPROVE' ? '✅ 建议通过' : '❌ 建议拒绝'}
                        </span>
                      )}
                      {aiResult.final?.outcome && (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          aiResult.final.outcome === 'YES'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          🎯 AI 判定：{aiResult.final.outcome}
                        </span>
                      )}
                    </div>

                    {aiResult.final?.reasons && (
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">分析理由</div>
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">{aiResult.final.reasons}</div>
                      </div>
                    )}

                    {aiResult.final?.suggestion && (
                      <div className="bg-violet-500/5 rounded-xl p-4 border border-violet-500/10">
                        <div className="text-[10px] text-violet-400 uppercase tracking-widest mb-2">建议</div>
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">{aiResult.final.suggestion}</div>
                      </div>
                    )}

                    {aiResult.final?.sources?.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">参考来源</div>
                        {aiResult.final.sources.slice(0, 5).map((s: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <ChevronRight size={12} className="text-gray-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs text-white truncate">{s.title}</div>
                              {s.url && <div className="text-[10px] text-gray-500 truncate">{s.url}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedMarket.status === MarketStatus.CLOSED && aiResult.final?.outcome && (
                      <button
                        disabled={isLoading}
                        onClick={handleAiSettleApply}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
                      >
                        <CheckCircle2 size={14} />
                        一键采用 AI 建议并执行结算
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-[#141414] border border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <TrendingUp size={28} className="text-gray-600" />
                </div>
                <div className="text-sm text-gray-500">从左侧选择一个市场</div>
                <div className="text-xs text-gray-600 mt-1">查看详情、发起 AI 审核或结算</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB: 结算管理 ===== */}
      {tab === 'settle' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
              <div className="flex gap-2 mb-4">
                {([['CLOSED','待结算'],['RESOLVED','已结算'],['ALL','全部']] as const).map(([k,l]) => (
                  <button
                    key={k}
                    onClick={() => setSettleFilter(k)}
                    className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                      settleFilter === k ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400 hover:border-white/30'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {settleMarkets.length === 0 && <div className="text-xs text-gray-600 py-6 text-center">无市场</div>}
                {settleMarkets.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMarket(m); setAiResult(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                      selectedMarket?.id === m.id
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-white/5 bg-white/5 hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white truncate mr-2">#{m.id} {m.title}</span>
                      <StatusBadge s={m.status} />
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 flex justify-between">
                      <span>YES {((m.yesPrice||0)*100).toFixed(0)}¢</span>
                      {m.resolvedOutcome && <span className="text-emerald-400">{m.resolvedOutcome}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selectedMarket ? (
              <>
                <div className="bg-[#141414] border border-white/10 rounded-2xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2"><span className="text-xs text-gray-500 font-mono">#{selectedMarket.id}</span><StatusBadge s={selectedMarket.status} /></div>
                      <h2 className="text-lg font-bold text-white">{selectedMarket.title}</h2>
                    </div>
                    {selectedMarket.resolvedOutcome && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                        <CheckCircle2 size={12} /> 已结算：{selectedMarket.resolvedOutcome}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{selectedMarket.description}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'YES 赔率', value: `${((selectedMarket.yesPrice||0)*100).toFixed(1)}¢` },
                      { label: 'NO 赔率', value: `${((selectedMarket.noPrice||0)*100).toFixed(1)}¢` },
                      { label: '截止时间', value: new Date(selectedMarket.endTime).toLocaleDateString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-gray-500">{label}</div>
                        <div className="text-sm font-bold text-white">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedMarket.status === MarketStatus.CLOSED && (
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      disabled={isLoading}
                      onClick={() => handleManualSettle(OutcomeType.YES)}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
                    >
                      <CheckCircle2 size={16} /> 结算 YES
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleManualSettle(OutcomeType.NO)}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-400 disabled:opacity-50 transition-all"
                    >
                      <XCircle size={16} /> 结算 NO
                    </button>
                    <button
                      disabled={aiLoading}
                      onClick={handleAiSettle}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 transition-all"
                    >
                      {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      AI 结算
                    </button>
                  </div>
                )}

                {aiResult && aiResult.final && (
                  <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">AI 结算建议</span>
                      <span className={`font-bold text-sm ${aiResult.final.outcome === 'YES' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {aiResult.final.outcome}
                      </span>
                    </div>
                    {aiResult.final.reasons && <div className="text-xs text-gray-400 whitespace-pre-wrap bg-white/5 rounded-xl p-3">{aiResult.final.reasons}</div>}
                    {aiResult.final.sources?.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase">来源</div>
                        {aiResult.final.sources.slice(0,4).map((s:any,i:number) => (
                          <div key={i} className="text-[11px] text-gray-400">• {s.title} — {s.url}</div>
                        ))}
                      </div>
                    )}
                    <button
                      disabled={isLoading}
                      onClick={handleAiSettleApply}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-50 transition-all"
                    >
                      <CheckCircle2 size={14} /> 采用 AI 建议执行结算
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-[#141414] border border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center">
                <TrendingUp size={32} className="text-gray-600 mb-3" />
                <div className="text-sm text-gray-500">选择一个市场进行结算</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB: AI 配置 ===== */}
      {tab === 'config' && (
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Provider Status Overview */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">AI 模型状态</h2>
                <p className="text-xs text-gray-500 mt-1">已配置的环境变量 Key 会自动读取并可用</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] text-gray-500 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  {aiSettings?.mode === 'manual' ? '纯人工' : aiSettings?.mode === 'auto' ? '纯 AI' : 'AI 辅助'}
                </span>
                <button
                  disabled={!isAdminLoggedIn}
                  onClick={() => { ensureDraft(); setShowAiModal(true); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-40 transition-all"
                >
                  编辑配置
                </button>
              </div>
            </div>

            {/* Provider Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {(aiSettings?.providers || []).map(p => {
                const hasKey = p.keys && p.keys.length > 0;
                const isEnv = hasKey && p.keys[0].label === 'env';
                return (
                  <div key={p.id} className={`rounded-2xl border p-4 transition-all ${
                    p.enabled && hasKey
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : hasKey
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-white/10 bg-white/5'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">{p.id.toUpperCase()}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        p.enabled && hasKey ? 'bg-emerald-500/20 text-emerald-400' :
                        hasKey ? 'bg-amber-500/20 text-amber-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {p.enabled && hasKey ? '已启用' : hasKey ? '待启用' : '无 Key'}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-3">{p.model}</div>
                    {hasKey && (
                      <div className={`text-[10px] px-2 py-1 rounded-lg inline-flex items-center gap-1 ${
                        isEnv ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {isEnv ? '🌐 .env 环境变量' : '🔑 手动配置'}
                      </div>
                    )}
                    {!p.enabled && hasKey && isAdminLoggedIn && (
                      <button
                        onClick={async () => {
                          if (!authHeaders || !aiSettings) return;
                          const next = aiSettings.providers.map((pr: any) =>
                            pr.id === p.id ? { ...pr, enabled: true } : pr
                          );
                          const res = await fetch('/api/admin/ai/settings', {
                            method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
                            body: JSON.stringify({ ...aiSettings, providers: next })
                          });
                          if (res.ok) { setAiSettings({ ...aiSettings, providers: next }); }
                        }}
                        className="mt-2 w-full text-[10px] py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-bold transition-all"
                      >
                        一键启用
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Enable Button */}
            {aiSettings?.providers?.some((p: any) => p.keys?.length > 0 && !p.enabled) && isAdminLoggedIn && (
              <button
                onClick={async () => {
                  if (!authHeaders || !aiSettings) return;
                  const next = aiSettings.providers.map((p: any) =>
                    p.keys?.length > 0 ? { ...p, enabled: true } : p
                  );
                  const res = await fetch('/api/admin/ai/settings', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify({ ...aiSettings, providers: next })
                  });
                  if (res.ok) { setAiSettings({ ...aiSettings, providers: next }); alert('所有已配置 Key 的模型已启用！'); }
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
              >
                ⚡ 一键启用所有已配置 Key 的模型
              </button>
            )}
          </div>

          {/* Mode + Status */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6">
            {/* Mode Cards */}
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">审核/结算模式</div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {([
                { key: 'manual', label: '纯人工', desc: '管理员手动审核与结算', color: 'gray' },
                { key: 'assist', label: 'AI 辅助', desc: 'AI 给出建议，管理员确认', color: 'violet' },
                { key: 'auto', label: '纯 AI', desc: 'AI 自动审核与结算', color: 'emerald' },
              ] as const).map(m => (
                <button
                  key={m.key}
                  disabled={!isAdminLoggedIn}
                  onClick={async () => {
                    if (!authHeaders || !aiSettings) return;
                    const res = await fetch('/api/admin/ai/settings', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
                      body: JSON.stringify({ ...aiSettings, mode: m.key })
                    });
                    if (res.ok) { setAiSettings({ ...aiSettings, mode: m.key }); }
                  }}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    aiSettings?.mode === m.key
                      ? `border-${m.color}-500/50 bg-${m.color}-500/10`
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  } disabled:opacity-40`}
                >
                  <div className={`text-sm font-bold text-${m.color}-400`}>{m.label}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{m.desc}</div>
                </button>
              ))}
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '联网检索', value: aiSettings?.retrieval?.enabled ? '✅ 开启' : '❌ 关闭' },
                { label: '多模型交叉验证', value: aiSettings?.crossValidate ? '✅ 开启' : '❌ 关闭' },
                { label: 'Gemini 状态', value: (() => {
                  const g = aiSettings?.providers?.find((p: any) => p.id === 'gemini');
                  if (!g) return '⚠️ 未加载';
                  if (g.enabled && g.keys?.length > 0) return '✅ 可用';
                  if (g.keys?.length > 0) return '⚠️ 有 Key 待启用';
                  return '❌ 未配置 Key';
                })() },
                { label: '联网检索 API', value: aiSettings?.retrieval?.apiKey ? '🔑 已配置' : '⚠️ 未配置' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded-xl px-4 py-3">
                  <div className="text-[10px] text-gray-500 uppercase">{label}</div>
                  <div className="text-sm font-bold text-white mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {!isAdminLoggedIn && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-400 text-center">
              ⚠️ 请先以 admin/admin123 登录以获得管理员权限，方可修改 AI 配置
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: 机器人 ===== */}
      {tab === 'bots' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6">
            <div className="text-sm font-bold text-white mb-4">新建交易机器人</div>
            <div className="space-y-3">
              <input
                value={newBotName}
                onChange={e => setNewBotName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="机器人名称"
              />
              <button
                disabled={!authHeaders}
                onClick={async () => {
                  if (!authHeaders) return;
                  const res = await fetch('/api/admin/bots', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
                    body: JSON.stringify({ name: newBotName, strategy: 'market_maker', intensity: 3, maxOrderSize: 200, riskPreference: 50, horizon: 'medium', enabled: false })
                  });
                  if (res.ok) { refreshBots(); setNewBotName('做市机器人'); }
                }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-40 transition-all"
              >
                创建机器人
              </button>
              <button
                disabled={!authHeaders}
                onClick={async () => {
                  if (!authHeaders) return;
                  await fetch('/api/admin/bots/run-once', { method: 'POST', headers: authHeaders });
                  refreshBots(); fetchMarkets();
                }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 transition-all"
              >
                运行所有机器人一次
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {bots.length === 0 && (
              <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 text-center text-xs text-gray-600">
                暂无机器人
              </div>
            )}
            {bots.map(b => (
              <div key={b.id} className="bg-[#141414] border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white">{b.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {b.enabled ? '运行中' : '已停止'}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mb-3">策略：{b.strategy} · 强度：{b.intensity}</div>
                <div className="flex gap-2">
                  <button
                    disabled={!authHeaders}
                    onClick={() => { fetch(`/api/admin/bots/${b.id}/start`, { method: 'POST', headers: authHeaders }); refreshBots(); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40"
                  >启动</button>
                  <button
                    disabled={!authHeaders}
                    onClick={() => { fetch(`/api/admin/bots/${b.id}/stop`, { method: 'POST', headers: authHeaders }); refreshBots(); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] bg-white/10 text-gray-400 hover:bg-white/20 disabled:opacity-40"
                  >停止</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Settings Modal */}
      {showAiModal && aiSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !aiLoading && setShowAiModal(false)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl p-6 sm:p-8">
            <button onClick={() => setShowAiModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
            <h2 className="text-2xl font-bold text-white mb-1">AI 配置</h2>
            <p className="text-gray-500 text-sm mb-6">选择模型提供商，配置 API Key 与提示词</p>

            <div className="space-y-6">
              {/* Mode */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">审核/结算模式</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'manual', label: '纯人工' },
                    { key: 'assist', label: 'AI 辅助人工' },
                    { key: 'auto', label: '纯 AI' },
                  ] as const).map(m => (
                    <button
                      key={m.key}
                      onClick={() => setAiSettings({ ...aiSettings, mode: m.key })}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                        aiSettings.mode === m.key ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10'
                      }`}
                    >{m.label}</button>
                  ))}
                </div>
              </div>

              {/* Providers */}
              <div className="space-y-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">模型提供商</div>
                {aiSettings.providers.map((p: any, idx: number) => {
                  const hasEnvKey = p.id === 'gemini' && !!import.meta.env.VITE_GEMINI_API_KEY;
                  const hasKey = p.keys?.length > 0;
                  return (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{p.id.toUpperCase()}</span>
                          {hasKey && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                              p.keys[0].label === 'env' ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {p.keys[0].label === 'env' ? '🌐 env' : '🔑 手动'}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const next = aiSettings.providers.slice();
                            next[idx] = { ...p, enabled: !p.enabled };
                            setAiSettings({ ...aiSettings, providers: next });
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] border font-bold ${p.enabled ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-gray-300 border-white/10'}`}
                        >{p.enabled ? '✓ 已启用' : '停用'}</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500 uppercase">模型名</label>
                          <input
                            value={p.model}
                            onChange={e => {
                              const next = aiSettings.providers.slice();
                              next[idx] = { ...p, model: e.target.value };
                              setAiSettings({ ...aiSettings, providers: next });
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500 uppercase">API Key {hasEnvKey ? '(env已填)' : ''}</label>
                          <input
                            value={hasKey && p.keys[0].label !== 'env' ? p.keys[0].apiKey : ''}
                            onChange={e => {
                              const next = aiSettings.providers.slice();
                              const newKeys = [{ label: 'manual', apiKey: e.target.value }];
                              next[idx] = { ...p, keys: newKeys };
                              setAiSettings({ ...aiSettings, providers: next });
                            }}
                            placeholder={hasEnvKey ? '(从 .env 环境变量读取)' : '粘贴 Key'}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500 placeholder:text-gray-600"
                            readOnly={hasEnvKey}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Retrieval */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-bold">联网检索（AI 结算用）</span>
                  <button
                    onClick={() => setAiSettings({
                      ...aiSettings,
                      retrieval: { ...(aiSettings.retrieval||{enabled:false,provider:'tavily',apiKey:'',maxResults:5}), enabled: !aiSettings.retrieval?.enabled }
                    })}
                    className={`px-3 py-1 rounded-full text-[10px] border ${aiSettings.retrieval?.enabled ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-gray-300 border-white/10'}`}
                  >{aiSettings.retrieval?.enabled ? '开启' : '关闭'}</button>
                </div>
                {aiSettings.retrieval?.enabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">提供商</label>
                      <select
                        value={aiSettings.retrieval.provider}
                        onChange={e => setAiSettings({ ...aiSettings, retrieval: { ...aiSettings.retrieval!, provider: e.target.value as any } })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none"
                      >
                        <option value="tavily">Tavily</option><option value="serpapi">SerpAPI</option><option value="bing">Bing</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">API Key</label>
                      <input
                        value={aiSettings.retrieval.apiKey}
                        onChange={e => setAiSettings({ ...aiSettings, retrieval: { ...aiSettings.retrieval!, apiKey: e.target.value } })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none"
                        placeholder="粘贴 API Key"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAiModal(false)} className="px-4 py-2 rounded-xl text-xs border border-white/10 text-gray-300 hover:bg-white/5">取消</button>
                <button
                  disabled={!authHeaders || aiLoading}
                  onClick={async () => {
                    if (!authHeaders) return;
                    setAiLoading(true);
                    const res = await fetch('/api/admin/ai/settings', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders },
                      body: JSON.stringify(aiSettings)
                    });
                    if (res.ok) { alert('AI 配置已保存'); setShowAiModal(false); }
                    else alert('保存失败');
                    setAiLoading(false);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
