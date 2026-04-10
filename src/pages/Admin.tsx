import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Cpu, Loader2, X } from 'lucide-react';
import { Market, MarketStatus, OutcomeType } from '../types';

type AIProviderId = 'openai' | 'qwen' | 'gemini';
type AIKeyConfig = { label?: string; apiKey: string };
type AIProviderConfig = {
  id: AIProviderId;
  enabled: boolean;
  model: string;
  baseUrl?: string;
  keys: AIKeyConfig[];
};
type AISettings = {
  mode?: 'manual' | 'assist' | 'auto';
  systemPrompt: string;
  reviewPrompt: string;
  settlePrompt: string;
  retrieval?: {
    enabled: boolean;
    provider: 'tavily' | 'serpapi' | 'bing';
    apiKey: string;
    maxResults: number;
  };
  crossValidate: boolean;
  providers: AIProviderConfig[];
};
type BotConfig = {
  id: string;
  name: string;
  enabled: boolean;
  strategy: 'market_maker' | 'momentum' | 'noise';
  marketIds: number[];
  intensity: number;
  maxOrderSize: number;
  riskPreference: number;
  horizon: 'short' | 'medium' | 'long';
  createdAt: string;
  updatedAt: string;
};

export const Admin: React.FC<{ account: string | null }> = ({ account }) => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [pendingMarkets, setPendingMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [adminSecret, setAdminSecret] = useState(''); // 仅用于 bootstrap 添加管理员
  const [resolutionText, setResolutionText] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  const [aiLog, setAiLog] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<{ recommend: 'APPROVE' | 'REJECT'; reasons: string; suggestion?: string } | null>(null);
  const [aiReviewDetail, setAiReviewDetail] = useState<any>(null);
  const [aiSettleSuggest, setAiSettleSuggest] = useState<any>(null);
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('adminToken'));
  const [adminExpiresAt, setAdminExpiresAt] = useState<string | null>(() => localStorage.getItem('adminExpiresAt'));
  const [settleFilter, setSettleFilter] = useState<'ALL' | 'CLOSED' | 'RESOLVED'>('CLOSED');
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [newBotName, setNewBotName] = useState('做市机器人');

  const ensureAiSettingsDraft = () => {
    if (aiSettings) return;
    setAiSettings({
      mode: 'assist',
      systemPrompt: '你是预测市场平台的审核与结算助手。你必须输出严格 JSON（不包裹 Markdown），不得输出多余文本。',
      reviewPrompt:
        '请审核预测市场问题是否清晰可判定，且不包含违法、极端、侵权、个人隐私等高风险内容。\\n仅输出 JSON：{\"recommend\":\"APPROVE\"|\"REJECT\",\"reasons\":\"...\",\"suggestion\":\"...\"}',
      settlePrompt:
        '你将基于“预测市场题目 + 联网检索证据摘要”判断事件是否发生，并输出严格 JSON。\\n仅输出 JSON：{\"outcome\":\"YES\"|\"NO\",\"reasons\":\"...\",\"sources\":[{\"title\":\"...\",\"url\":\"...\"}]}',
      retrieval: { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 },
      crossValidate: true,
      providers: [
        { id: 'qwen', enabled: false, model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keys: [] },
        { id: 'openai', enabled: false, model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', keys: [] },
        { id: 'gemini', enabled: true, model: 'gemini-2.0-flash', keys: [] }
      ]
    });
  };

  const authHeaders = useMemo(() => {
    if (!adminToken) return null;
    return { Authorization: `Bearer ${adminToken}` };
  }, [adminToken]);

  const fetchMarkets = async () => {
    try {
      const allRes = await fetch('/api/markets');
      if (allRes.ok) setMarkets(await allRes.json());

      if (authHeaders) {
        const pendingRes = await fetch('/api/admin/markets?status=PENDING', { headers: authHeaders });
        if (pendingRes.ok) setPendingMarkets(await pendingRes.json());
      } else {
        setPendingMarkets([]);
      }
    } catch (error) {
      console.error('Failed to fetch markets for admin:', error);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, [adminToken]);

  useEffect(() => {
    const fetchBots = async () => {
      if (!authHeaders) return setBots([]);
      try {
        const res = await fetch('/api/admin/bots', { headers: authHeaders });
        if (res.ok) setBots(await res.json());
      } catch (e) {
        console.error('Fetch bots error:', e);
      }
    };
    fetchBots();
  }, [adminToken]);

  const refreshBots = async () => {
    if (!authHeaders) return;
    const res = await fetch('/api/admin/bots', { headers: authHeaders });
    if (res.ok) setBots(await res.json());
  };

  useEffect(() => {
    const fetchAISettings = async () => {
      if (!authHeaders) {
        setAiSettings(null);
        return;
      }
      setAiSettingsLoading(true);
      try {
        const res = await fetch('/api/admin/ai/settings', { headers: authHeaders });
        if (res.ok) setAiSettings(await res.json());
      } catch (e) {
        console.error('Fetch AI settings error:', e);
      } finally {
        setAiSettingsLoading(false);
      }
    };
    fetchAISettings();
  }, [adminToken]);

  const handleAdminLogin = async () => {
    if (!account) {
      alert('请先使用 Fabric 身份登录');
      return;
    }
    try {
      const password = window.prompt('请输入管理员 Fabric 密码');
      if (!password) return;
      const res = await fetch('/api/admin/auth/fabric-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account, password })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`管理员登录失败：${data.error || '未知错误'}`);
        return;
      }
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminExpiresAt', data.expiresAt);
      setAdminToken(data.token);
      setAdminExpiresAt(data.expiresAt);
      alert('管理员登录成功');
    } catch (e) {
      console.error('Admin login error:', e);
      alert('管理员登录失败，请查看控制台');
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminExpiresAt');
    setAdminToken(null);
    setAdminExpiresAt(null);
    setPendingMarkets([]);
  };

  const handleManualSettle = async (outcome: OutcomeType, evidence?: string) => {
    if (!selectedMarket) return;
    if (!authHeaders) {
      alert('请先完成管理员钱包签名登录');
      return;
    }
    setIsSettling(true);
    try {
      const res = await fetch('/api/admin/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          marketId: selectedMarket.id,
          outcome,
          evidence
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`结算失败：${data.error || '未知错误'}`);
      } else {
        alert('结算成功');
        setSelectedMarket(data);
        fetchMarkets();
      }
    } catch (error) {
      console.error('Manual settle error:', error);
      alert('结算失败，请检查控制台日志');
    } finally {
      setIsSettling(false);
    }
  };

  const handleReview = async (marketId: number, approve: boolean) => {
    if (!authHeaders) {
      alert('请先完成管理员钱包签名登录');
      return;
    }
    setIsSettling(true);
    try {
      const res = await fetch('/api/admin/markets/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId, approve })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`审核失败：${data.error || '未知错误'}`);
      } else {
        alert(approve ? '市场已通过审核并开放交易' : '市场已被拒绝/关闭');
        fetchMarkets();
      }
    } catch (error) {
      console.error('Market review error:', error);
      alert('审核失败，请检查控制台日志');
    } finally {
      setIsSettling(false);
    }
  };

  const handleAiReview = async (marketId: number) => {
    if (!authHeaders) {
      alert('请先完成管理员钱包签名登录');
      return;
    }
    setIsSettling(true);
    setAiLog(null);
    setAiReview(null);
    setAiReviewDetail(null);
    try {
      const res = await fetch('/api/admin/markets/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId, extraContext: resolutionText })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`AI 审核失败：${data.error || '未知错误'}`);
      } else {
        setAiReviewDetail(data);
        if (data?.final?.recommend) {
          setAiReview({
            recommend: data.final.recommend,
            reasons: data.final.reasons || '',
            suggestion: data.final.suggestion || ''
          });

          // 纯 AI 模式：自动执行通过/拒绝
          if (aiSettings?.mode === 'auto') {
            const approve = data.final.recommend === 'APPROVE';
            await handleReview(marketId, approve);
          }
        } else {
          setAiLog(JSON.stringify(data, null, 2));
        }
      }
    } catch (error) {
      console.error('AI market review error:', error);
      alert('AI 审核失败，请检查控制台日志');
    } finally {
      setIsSettling(false);
    }
  };

  const handleAiSettle = async () => {
    if (!selectedMarket) return;
    if (!authHeaders) {
      alert('请先完成管理员钱包签名登录');
      return;
    }
    setIsSettling(true);
    setAiLog(null);
    try {
      setAiSettleSuggest(null);
      const isAuto = aiSettings?.mode === 'auto';
      const endpoint = isAuto ? '/api/admin/settle/ai' : '/api/admin/settle/ai-suggest';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ marketId: selectedMarket.id })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`AI 结算失败：${data.error || '未知错误'}`);
      } else {
        if (isAuto) {
          setSelectedMarket(data.market);
          setAiLog(`AI 判定结果：${data.aiOutcome}\n\n理由：\n${data?.final?.reasons || ''}`);
          alert('纯 AI 结算已完成（已写入公示依据）');
          fetchMarkets();
        } else {
          setAiSettleSuggest(data);
          setAiLog(`AI 建议结果：${data?.final?.outcome}\n\n理由：\n${data?.final?.reasons || ''}`);
        }
      }
    } catch (error) {
      console.error('AI settle error:', error);
      alert('AI 结算失败，请检查控制台日志');
    } finally {
      setIsSettling(false);
    }
  };

  const handleBootstrapAddAdmin = async () => {
    if (!account) {
      alert('请先连接钱包，并确保当前地址是你要添加的管理员地址');
      return;
    }
    if (!adminSecret) {
      alert('请输入 ADMIN_SECRET（仅用于初始化添加管理员）');
      return;
    }
    setIsSettling(true);
    try {
      const res = await fetch('/api/admin/bootstrap/add-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: account, adminSecret })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`添加管理员失败：${data.error || '未知错误'}`);
      } else {
        alert('管理员地址已写入后端白名单，请进行钱包签名登录');
      }
    } catch (e) {
      console.error('Bootstrap add admin error:', e);
      alert('添加管理员失败，请查看控制台');
    } finally {
      setIsSettling(false);
    }
  };

  const handleBootstrapResetAll = async () => {
    if (!adminSecret) {
      alert('请输入 ADMIN_SECRET（用于重置题库与交易数据）');
      return;
    }
    setIsSettling(true);
    try {
      const res = await fetch('/api/admin/bootstrap/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret })
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) {
        const msg = typeof data === 'string' ? data : (data?.error || '未知错误');
        alert(`重置失败：${msg}`);
      } else {
        const count = typeof data === 'string' ? '' : data.marketsCount;
        alert(`已重置：题库 ${count ?? ''} 条，交易数据已清空。请回到市场大厅刷新。`);
        fetchMarkets();
      }
    } catch (e) {
      console.error('Bootstrap reset error:', e);
      alert('重置失败，请查看控制台');
    } finally {
      setIsSettling(false);
    }
  };

  const handleCreateBot = async () => {
    if (!authHeaders) return;
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: newBotName,
          strategy: 'market_maker',
          intensity: 3,
          maxOrderSize: 200,
          riskPreference: 50,
          horizon: 'medium',
          enabled: false
        })
      });
      const data = await res.json();
      if (!res.ok) return alert(`创建机器人失败：${data.error || '未知错误'}`);
      await refreshBots();
      setNewBotName('做市机器人');
    } catch (e) {
      console.error('Create bot error:', e);
    }
  };

  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">管理员结算面板</h1>
            <p className="text-gray-500 text-sm">
              对已结束的预测事件设置最终结果，可选择手动指定或通过 AI 辅助判定。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {adminToken ? (
            <>
              <div className="text-[10px] text-gray-500 border border-white/10 bg-white/5 rounded-xl px-3 py-2">
                已登录
                {adminExpiresAt ? ` · 到期 ${new Date(adminExpiresAt).toLocaleString()}` : ''}
              </div>
              <button
                onClick={handleAdminLogout}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200"
              >
                退出管理员
              </button>
            </>
          ) : (
            <button
              onClick={handleAdminLogin}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400"
            >
              钱包签名登录管理员
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 左侧：待审核市场 + 结算市场列表 */}
        <div className="lg:col-span-1 space-y-4">
          {/* 初始化添加管理员地址 */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
            <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">管理员初始化</div>
            <div className="text-xs text-gray-400 mb-3">
              仅首次使用：通过后端 `ADMIN_SECRET` 将当前钱包地址加入管理员白名单，之后使用“钱包签名登录”获取令牌。
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                placeholder="输入 ADMIN_SECRET"
              />
              <button
                disabled={isSettling}
                onClick={handleBootstrapAddAdmin}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50"
              >
                将当前地址加入管理员白名单
              </button>
              <button
                disabled={isSettling}
                onClick={handleBootstrapResetAll}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50"
              >
                重置题库与交易数据（演示用）
              </button>
              <button
                disabled={isSettling}
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/bootstrap/simulate-trades', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ adminSecret, count: 500 })
                    });
                    const data = await res.json();
                    if (!res.ok) return alert(`模拟交易失败：${data.error || '未知错误'}`);
                    alert(`已新增 ${data.appended} 笔模拟成交`);
                    fetchMarkets();
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/80 text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                生成 500 笔模拟交易
              </button>
            </div>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
            <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">交易机器人管理</div>
            <div className="flex gap-2 mb-3">
              <input
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                placeholder="机器人名称"
              />
              <button
                disabled={!authHeaders}
                onClick={handleCreateBot}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50"
              >
                新建
              </button>
              <button
                disabled={!authHeaders}
                onClick={async () => {
                  if (!authHeaders) return;
                  await fetch('/api/admin/bots/run-once', { method: 'POST', headers: authHeaders });
                  refreshBots();
                  fetchMarkets();
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                运行一次
              </button>
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {bots.length === 0 && <div className="text-xs text-gray-500">暂无机器人</div>}
              {bots.map((b) => (
                <div key={b.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-200 font-bold">{b.name}</span>
                    <span className={b.enabled ? 'text-emerald-400' : 'text-gray-500'}>{b.enabled ? '运行中' : '已停止'}</span>
                  </div>
                  <div className="text-gray-500 mt-1">策略: {b.strategy} · 强度: {b.intensity}</div>
                  <div className="text-gray-500 mt-1">风险偏好: {b.riskPreference}% · 周期: {b.horizon === 'short' ? '短期' : b.horizon === 'long' ? '长期' : '中期'}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-gray-500">风险偏好</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={b.riskPreference ?? 50}
                      onChange={async (e) => {
                        if (!authHeaders) return;
                        await fetch(`/api/admin/bots/${b.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({ riskPreference: Number(e.target.value) })
                        });
                        refreshBots();
                      }}
                    />
                    <label className="text-[10px] text-gray-500">收益时间区间</label>
                    <select
                      value={b.horizon || 'medium'}
                      onChange={async (e) => {
                        if (!authHeaders) return;
                        await fetch(`/api/admin/bots/${b.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({ horizon: e.target.value })
                        });
                        refreshBots();
                      }}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white"
                    >
                      <option value="short">短期</option>
                      <option value="medium">中期</option>
                      <option value="long">长期</option>
                    </select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      disabled={!authHeaders}
                      onClick={async () => {
                        if (!authHeaders) return;
                        await fetch(`/api/admin/bots/${b.id}/start`, { method: 'POST', headers: authHeaders });
                        refreshBots();
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] bg-emerald-500/80 text-black"
                    >
                      启动
                    </button>
                    <button
                      disabled={!authHeaders}
                      onClick={async () => {
                        if (!authHeaders) return;
                        await fetch(`/api/admin/bots/${b.id}/stop`, { method: 'POST', headers: authHeaders });
                        refreshBots();
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] bg-white/10 text-gray-300"
                    >
                      停止
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI 设置 */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {aiSettings?.mode === 'manual' ? '模式：纯人工' : aiSettings?.mode === 'auto' ? '模式：纯 AI' : '模式：AI 辅助人工'}
              </div>
              <button
                disabled={!authHeaders}
                onClick={() => {
                  ensureAiSettingsDraft();
                  setShowAiSettingsModal(true);
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50"
              >
                打开配置
              </button>
            </div>
          </div>

          {/* 待审核市场 */}
          <div className="bg-[#141414] border border-emerald-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">待审核市场</span>
              <button
                onClick={fetchMarkets}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                刷新
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {pendingMarkets.length === 0 && (
                <div className="text-xs text-gray-500 py-4 text-center">暂无待审核市场</div>
              )}
              {pendingMarkets.map((m) => (
                <div
                  key={m.id}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs border border-emerald-500/30 bg-emerald-500/5 text-gray-200 space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold">#{m.id} {m.title}</span>
                    <span className="text-[10px] text-yellow-400">PENDING</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      disabled={isSettling || (aiSettings?.mode === 'manual')}
                      onClick={() => handleAiReview(m.id)}
                      className="px-2 py-1 rounded-lg bg-white/5 text-[10px] flex items-center gap-1 hover:bg-white/10 disabled:opacity-50"
                      title={aiSettings?.mode === 'manual' ? '当前为纯人工模式，已禁用 AI 审核' : undefined}
                    >
                      <Cpu size={10} />
                      AI 审核
                    </button>
                    <button
                      disabled={isSettling}
                      onClick={() => handleReview(m.id, true)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/80 text-black text-[10px] hover:bg-emerald-400 disabled:opacity-50"
                    >
                      通过
                    </button>
                    <button
                      disabled={isSettling}
                      onClick={() => handleReview(m.id, false)}
                      className="px-2 py-1 rounded-lg bg-red-500/70 text-white text-[10px] hover:bg-red-500 disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 待结算市场 */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">待结算市场</span>
              <button
                onClick={fetchMarkets}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                刷新
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              {[
                { key: 'CLOSED', label: '待结算' },
                { key: 'RESOLVED', label: '已结算' },
                { key: 'ALL', label: '全部' }
              ].map((f: any) => (
                <button
                  key={f.key}
                  onClick={() => setSettleFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
                    settleFilter === f.key ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400 hover:border-white/30'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {markets.length === 0 && (
                <div className="text-xs text-gray-500 py-4 text-center">暂无市场</div>
              )}
              {markets
                .filter(m => (settleFilter === 'ALL' ? true : m.status === settleFilter))
                .map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMarket(m)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition-colors ${
                    selectedMarket?.id === m.id
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                      : 'border-white/5 bg-white/5 text-gray-300 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">#{m.id} {m.title}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>状态：{m.status}</span>
                    {m.resolvedOutcome && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={10} />
                        已结算：{m.resolvedOutcome}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-xs text-gray-400 space-y-2">
            <p className="font-bold text-emerald-400 flex items-center gap-2">
              <Cpu size={14} />
              AI 结算说明
            </p>
            <p>
              系统会用“题目”自动联网检索证据摘要，再由已配置的模型输出 YES/NO + 理由 + 来源链接。
            </p>
            <p>
              “AI 辅助人工”模式下会先给出建议，管理员复核后再结算；“纯 AI”模式下会直接结算并写入公示依据。
            </p>
          </div>
        </div>

        {/* 右侧：详情与结算操作 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 min-h-[220px]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">市场详情</span>
              {selectedMarket?.resolvedOutcome && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 size={14} />
                  已结算为 {selectedMarket.resolvedOutcome}
                </span>
              )}
            </div>
            {selectedMarket ? (
              <div className="space-y-3 text-sm">
                <div className="text-lg font-bold text-white">
                  #{selectedMarket.id} {selectedMarket.title}
                </div>
                <div className="text-gray-400">
                  {selectedMarket.description}
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-2">
                  <span>截止时间：{new Date(selectedMarket.endTime).toLocaleString()}</span>
                  <span>来源：{selectedMarket.resolutionSource}</span>
                  <span>当前 YES 价格：{selectedMarket.yesPrice}</span>
                  <span>当前 NO 价格：{selectedMarket.noPrice}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">
                请在左侧选择一个市场进行结算。
              </div>
            )}
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-3">
                <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                  备注/补充信息（可选，仅用于人工记录或手动结算公示）
                </label>
                <textarea
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 h-16"
                  placeholder="可留空。若你手动结算，建议在此填写依据摘要，便于社区复核。"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={!selectedMarket || isSettling}
                onClick={() => handleManualSettle(OutcomeType.YES, resolutionText.trim() ? resolutionText.trim() : undefined)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSettling ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                手动结算为 YES
              </button>
              <button
                disabled={!selectedMarket || isSettling}
                onClick={() => handleManualSettle(OutcomeType.NO, resolutionText.trim() ? resolutionText.trim() : undefined)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/90 text-white text-xs font-bold hover:bg-red-400 disabled:opacity-50"
              >
                {isSettling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                手动结算为 NO
              </button>
              <button
                disabled={!selectedMarket || isSettling}
                onClick={handleAiSettle}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-gray-200 disabled:opacity-50"
              >
                {isSettling ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                {aiSettings?.mode === 'auto' ? '纯 AI 自动结算（联网检索）' : 'AI 获取并建议结果（联网检索）'}
              </button>
            </div>

            {aiSettleSuggest?.final && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">AI 结算建议</span>
                    <span className={`font-bold ${aiSettleSuggest.final.outcome === 'YES' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {aiSettleSuggest.final.outcome}
                    </span>
                  </div>
                  <div className="mt-2 text-gray-300 whitespace-pre-wrap">{aiSettleSuggest.final.reasons}</div>
                  {Array.isArray(aiSettleSuggest.final.sources) && aiSettleSuggest.final.sources.length > 0 && (
                    <div className="mt-2 space-y-1 text-[11px] text-gray-400">
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">来源</div>
                      {aiSettleSuggest.final.sources.slice(0, 6).map((s: any, i: number) => (
                        <div key={i} className="break-all">
                          - {s?.title ? `${s.title} ` : ''}{s?.url || ''}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={isSettling || !selectedMarket}
                      onClick={() => {
                        const outcome = aiSettleSuggest.final.outcome === 'NO' ? OutcomeType.NO : OutcomeType.YES;
                        const evidence = JSON.stringify(aiSettleSuggest.evidence || aiSettleSuggest, null, 2);
                        handleManualSettle(outcome, evidence);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      一键采用建议并执行结算
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(aiReview || aiLog || aiReviewDetail) && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                {aiReview ? (
                  <div className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">AI 审核结论</span>
                      <span className={`font-bold ${aiReview.recommend === 'APPROVE' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {aiReview.recommend}
                      </span>
                    </div>
                    <div className="mt-2 text-gray-300 whitespace-pre-wrap">{aiReview.reasons}</div>
                    {aiReview.suggestion && (
                      <div className="mt-2 text-gray-400 whitespace-pre-wrap">
                        建议：{aiReview.suggestion}
                      </div>
                    )}
                    {selectedMarket?.status === MarketStatus.PENDING && (
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={isSettling}
                          onClick={() => handleReview(selectedMarket.id, aiReview.recommend === 'APPROVE')}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50"
                        >
                          一键采用建议并执行审核
                        </button>
                      </div>
                    )}
                    {aiReviewDetail?.results && (
                      <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                          多模型明细（raw）
                        </div>
                        <div className="space-y-2">
                          {aiReviewDetail.results.map((r: any, i: number) => (
                            <div key={i} className="text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-500">[{r.provider}]</span>
                                <span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>
                                  {r.ok ? 'OK' : 'ERR'}
                                </span>
                              </div>
                              <div className="text-gray-400 whitespace-pre-wrap break-words">{r.raw}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">
                    {aiLog}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI 设置弹窗 */}
      {showAiSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !isSettling && setShowAiSettingsModal(false)}
          />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl p-6 sm:p-8">
            <button
              onClick={() => !isSettling && setShowAiSettingsModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">AI 配置</h2>
              <p className="text-gray-500 text-sm mt-1">
                选择模型提供商，配置 API Key 与提示词，并可启用多 AI 交叉验证。
              </p>
              {!authHeaders && (
                <div className="mt-3 text-xs text-red-400">
                  请先“钱包签名登录管理员”，否则无法保存/使用 AI。
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* 模式 */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">审核模式</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'manual', label: '纯人工' },
                    { key: 'assist', label: 'AI 辅助人工' },
                    { key: 'auto', label: '纯 AI' }
                  ].map((m: any) => (
                    <button
                      key={m.key}
                      onClick={() => aiSettings && setAiSettings({ ...aiSettings, mode: m.key })}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                        (aiSettings?.mode || 'assist') === m.key
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-gray-600">
                  - 纯人工：不使用 AI 审核<br />
                  - AI 辅助人工：AI 给出建议，管理员确认通过/拒绝<br />
                  - 纯 AI：AI 出结论后自动执行通过/拒绝（建议开启交叉验证）
                </div>
              </div>

              {/* 交叉验证 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">多 AI 交叉验证（投票）</span>
                <button
                  onClick={() => aiSettings && setAiSettings({ ...aiSettings, crossValidate: !aiSettings.crossValidate })}
                  className={`px-3 py-1 rounded-full text-[10px] border ${
                    aiSettings?.crossValidate ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-gray-300 border-white/10'
                  }`}
                >
                  {aiSettings?.crossValidate ? '开启' : '关闭'}
                </button>
              </div>

              {/* 联网检索 */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-bold">联网检索（用于 AI 结算证据）</span>
                  <button
                    onClick={() => {
                      if (!aiSettings) return;
                      const next = aiSettings.retrieval || { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 };
                      setAiSettings({ ...aiSettings, retrieval: { ...next, enabled: !next.enabled } });
                    }}
                    className={`px-3 py-1 rounded-full text-[10px] border ${
                      aiSettings?.retrieval?.enabled ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-gray-300 border-white/10'
                    }`}
                  >
                    {aiSettings?.retrieval?.enabled ? '开启' : '关闭'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">提供商</label>
                    <select
                      value={aiSettings?.retrieval?.provider || 'tavily'}
                      onChange={(e) => {
                        if (!aiSettings) return;
                        const next = aiSettings.retrieval || { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 };
                        setAiSettings({ ...aiSettings, retrieval: { ...next, provider: e.target.value as any } });
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                    >
                      <option value="tavily">Tavily</option>
                      <option value="serpapi">SerpAPI（Google）</option>
                      <option value="bing">Bing Web Search</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">API Key</label>
                    <input
                      value={aiSettings?.retrieval?.apiKey || ''}
                      onChange={(e) => {
                        if (!aiSettings) return;
                        const next = aiSettings.retrieval || { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 };
                        setAiSettings({ ...aiSettings, retrieval: { ...next, apiKey: e.target.value } });
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                      placeholder="用于联网检索的 Key（后台会脱敏显示）"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">结果数</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={aiSettings?.retrieval?.maxResults ?? 5}
                      onChange={(e) => {
                        if (!aiSettings) return;
                        const next = aiSettings.retrieval || { enabled: false, provider: 'tavily', apiKey: '', maxResults: 5 };
                        setAiSettings({ ...aiSettings, retrieval: { ...next, maxResults: Number(e.target.value) || 5 } });
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-gray-600">
                  未开启或未配置 key 时，AI 仍会运行，但“证据摘要”为空，可靠性会下降。
                </div>
              </div>

              {/* 提示词 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">系统提示词（通用）</label>
                  <textarea
                    value={aiSettings?.systemPrompt || ''}
                    onChange={(e) => aiSettings && setAiSettings({ ...aiSettings, systemPrompt: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500 h-36"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">审核提示词（输出 JSON）</label>
                  <textarea
                    value={aiSettings?.reviewPrompt || ''}
                    onChange={(e) => aiSettings && setAiSettings({ ...aiSettings, reviewPrompt: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500 h-36"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">结算提示词（输出 JSON：outcome/reasons/sources）</label>
                <textarea
                  value={aiSettings?.settlePrompt || ''}
                  onChange={(e) => aiSettings && setAiSettings({ ...aiSettings, settlePrompt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500 h-20"
                />
              </div>

              {/* 提供商 */}
              <div className="space-y-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">模型提供商与密钥</div>
                {(aiSettings?.providers || []).map((p, idx) => (
                  <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white font-bold">{p.id.toUpperCase()}</span>
                      <button
                        onClick={() => {
                          if (!aiSettings) return;
                          const next = aiSettings.providers.slice();
                          next[idx] = { ...p, enabled: !p.enabled };
                          setAiSettings({ ...aiSettings, providers: next });
                        }}
                        className={`px-3 py-1 rounded-full text-[10px] border ${
                          p.enabled ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-gray-300 border-white/10'
                        }`}
                      >
                        {p.enabled ? '启用' : '停用'}
                      </button>
                    </div>

                    {p.id !== 'gemini' && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-500 uppercase">Base URL（OpenAI 兼容）</label>
                        <input
                          value={p.baseUrl || ''}
                          onChange={(e) => {
                            if (!aiSettings) return;
                            const next = aiSettings.providers.slice();
                            next[idx] = { ...p, baseUrl: e.target.value };
                            setAiSettings({ ...aiSettings, providers: next });
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">模型名</label>
                      <input
                        value={p.model}
                        onChange={(e) => {
                          if (!aiSettings) return;
                          const next = aiSettings.providers.slice();
                          next[idx] = { ...p, model: e.target.value };
                          setAiSettings({ ...aiSettings, providers: next });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-gray-500 uppercase">API Keys（可添加多个）</label>
                        <button
                          onClick={() => {
                            if (!aiSettings) return;
                            const next = aiSettings.providers.slice();
                            const keys = (p.keys || []).slice();
                            keys.push({ label: `key${keys.length + 1}`, apiKey: '' });
                            next[idx] = { ...p, keys };
                            setAiSettings({ ...aiSettings, providers: next });
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200"
                        >
                          添加
                        </button>
                      </div>
                      {(p.keys || []).map((k, kidx) => (
                        <div key={kidx} className="grid grid-cols-5 gap-2">
                          <input
                            value={k.label || ''}
                            onChange={(e) => {
                              if (!aiSettings) return;
                              const next = aiSettings.providers.slice();
                              const keys = (p.keys || []).slice();
                              keys[kidx] = { ...keys[kidx], label: e.target.value };
                              next[idx] = { ...p, keys };
                              setAiSettings({ ...aiSettings, providers: next });
                            }}
                            className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                            placeholder="标签"
                          />
                          <input
                            value={k.apiKey || ''}
                            onChange={(e) => {
                              if (!aiSettings) return;
                              const next = aiSettings.providers.slice();
                              const keys = (p.keys || []).slice();
                              keys[kidx] = { ...keys[kidx], apiKey: e.target.value };
                              next[idx] = { ...p, keys };
                              setAiSettings({ ...aiSettings, providers: next });
                            }}
                            className="col-span-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-500"
                            placeholder="粘贴 API Key（明文，仅本地存储）"
                          />
                        </div>
                      ))}
                      <div className="text-[10px] text-gray-600">
                        保存后后端会持久化 key；再次读取只会显示脱敏值，建议你在本地另行备份。
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  disabled={isSettling}
                  onClick={() => setShowAiSettingsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  disabled={isSettling || !authHeaders || !aiSettings}
                  onClick={async () => {
                    if (!authHeaders || !aiSettings) return;
                    setIsSettling(true);
                    try {
                      const res = await fetch('/api/admin/ai/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify(aiSettings)
                      });
                      const data = await res.json();
                      if (!res.ok) alert(`保存失败：${data.error || '未知错误'}`);
                      else {
                        alert('AI 设置已保存');
                        setShowAiSettingsModal(false);
                      }
                    } catch (e) {
                      console.error('Save AI settings error:', e);
                      alert('保存失败，请查看控制台');
                    } finally {
                      setIsSettling(false);
                    }
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

