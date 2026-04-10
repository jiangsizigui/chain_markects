import React, { useMemo, useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter, ZAxis } from 'recharts';
import { BarChart3, TrendingUp, Activity, ShieldCheck, Zap, Upload, FileText, PieChart, LineChart as LucideLineChart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Market, Trade } from '../types';

type AnalysisModel =
  | 'arima'
  | 'linear_regression'
  | 'bayesian'
  | 'sentiment'
  | 'kmeans'
  | 'garch'
  | 'mispricing'
  | 'correlation'
  | null;

type UploadKind = 'series' | 'xy' | 'points';
type DatasetMeta = {
  id: string;
  name: string;
  source: 'platform' | 'upload';
  rowCount: number;
  schema: Array<{ name: string; type: string }>;
};

export const Analytics: React.FC = () => {
  const [activeModel, setActiveModel] = useState<AnalysisModel>('arima');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [uploadKind, setUploadKind] = useState<UploadKind>('series');
  const [inputData, setInputData] = useState(''); // series: 逗号分隔
  const [inputDataX, setInputDataX] = useState(''); // xy: x
  const [inputDataY, setInputDataY] = useState(''); // xy: y
  const [pointsText, setPointsText] = useState(''); // points: JSON 二维数组
  const [horizon, setHorizon] = useState('24');
  const [prior, setPrior] = useState('0.5');
  const [likelihood, setLikelihood] = useState('0.5');
  const [evidence, setEvidence] = useState('');
  const [buyVolume, setBuyVolume] = useState('100');
  const [sellVolume, setSellVolume] = useState('100');
  const [k, setK] = useState('3');
  const [modelProbability, setModelProbability] = useState('0.7');
  const [marketProbability, setMarketProbability] = useState('0.6');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [dataSource, setDataSource] = useState<'platform' | 'upload' | 'mixed' | 'ledger'>('platform');
  const [ledgerMarketId, setLedgerMarketId] = useState<number>(1);
  const [dragging, setDragging] = useState(false);
  const [lastRun, setLastRun] = useState<{ model: string; payload: any; result: any } | null>(null);
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [datasetPreview, setDatasetPreview] = useState<any>(null);
  const [jobStatus, setJobStatus] = useState('');
  const [pivotDim, setPivotDim] = useState('');
  const [pivotMeasure, setPivotMeasure] = useState('');
  const [heatmapMode, setHeatmapMode] = useState<'corr' | 'cov'>('corr');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tradeSeries, setTradeSeries] = useState<{ name: string; yesPrice: number; noPrice: number; volume: number }[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const parseUploadedFile = (file: File) => {
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (Array.isArray(json) && json.length > 0 && typeof json[0] === 'object' && !Array.isArray(json[0])) {
            fetch('/api/datasets/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: file.name, rows: json })
            }).then(async () => {
              const ds = await fetch('/api/datasets');
              if (ds.ok) setDatasets(await ds.json());
            });
          }
          // 支持：
          // 1) [0.6,0.62,...] => series
          // 2) { data:[...] } => series
          // 3) { x:[...], y:[...] } => xy
          // 4) { points:[[...],[...]] } 或 [[...],[...]] => points
          if (Array.isArray(json) && (json.length === 0 || typeof json[0] === 'number')) {
            setUploadKind('series');
            setInputData((json as any[]).join(', '));
          } else if (json?.data && Array.isArray(json.data)) {
            setUploadKind('series');
            setInputData(json.data.join(', '));
          } else if (json?.x && json?.y && Array.isArray(json.x) && Array.isArray(json.y)) {
            setUploadKind('xy');
            setInputDataX(json.x.join(', '));
            setInputDataY(json.y.join(', '));
          } else if (json?.points && Array.isArray(json.points)) {
            setUploadKind('points');
            setPointsText(JSON.stringify(json.points, null, 2));
          } else if (Array.isArray(json) && Array.isArray(json[0])) {
            setUploadKind('points');
            setPointsText(JSON.stringify(json, null, 2));
          } else {
            console.warn('Unsupported JSON schema');
          }
        } catch (err) {
          console.error("JSON parse error", err);
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          // 简单启发：2 列 => xy；>=3 列 => points；1 列 => series
          if (jsonData.length > 0) {
            const numericRows = jsonData.filter(row => row.some(cell => typeof cell === 'number'));
            
            if (numericRows.length > 0 && numericRows[0].length >= 3) {
              setUploadKind('points');
              const pts = numericRows
                .map(r => r.filter(v => typeof v === 'number') as number[])
                .filter(r => r.length >= 2);
              setPointsText(JSON.stringify(pts, null, 2));
            } else if (numericRows.length > 0 && numericRows[0].length >= 2) {
              setUploadKind('xy');
              const x = numericRows.map(row => row[0]).filter(v => typeof v === 'number');
              const y = numericRows.map(row => row[1]).filter(v => typeof v === 'number');
              setInputDataX(x.join(', '));
              setInputDataY(y.join(', '));
            } else {
              setUploadKind('series');
              const d = jsonData.flat().filter(v => typeof v === 'number');
              setInputData(d.join(', '));
            }
          }
        } catch (err) {
          console.error("Data parse error", err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseUploadedFile(file);
  };
  const [factors, setFactors] = useState({
    sentiment: 0,
    volatility: 0,
    liquidityScore: 0,
    marketEfficiency: 0
  });

  useEffect(() => {
    Promise.all([fetch('/api/trades'), fetch('/api/markets')])
      .then(async ([tRes, mRes]) => {
        const tData = tRes.ok ? ((await tRes.json()) as Trade[]) : [];
        const mData = mRes.ok ? ((await mRes.json()) as Market[]) : [];
        setTrades(Array.isArray(tData) ? tData : []);
        setMarkets(Array.isArray(mData) ? mData : []);

        if (!Array.isArray(tData) || tData.length === 0) return;
        const byTime = new Map<string, { yesPrice: number; noPrice: number; volume: number }>();
        tData.forEach(trade => {
          const t = new Date(trade.timestamp);
          const key = `${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:00`;
          const prev = byTime.get(key) || { yesPrice: 0, noPrice: 0, volume: 0 };
          const isYes = trade.outcome === 'YES';
          byTime.set(key, {
            yesPrice: isYes ? trade.price : prev.yesPrice,
            noPrice: !isYes ? trade.price : prev.noPrice,
            volume: prev.volume + trade.amount
          });
        });
        const series = Array.from(byTime.entries())
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
          .map(([name, v]) => ({ name, ...v }));
        setTradeSeries(series);
      })
      .catch(err => console.error('Failed to fetch analytics base data', err));
  }, []);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const res = await fetch('/api/datasets');
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setDatasets(list);
        if (!selectedDatasetId && list[0]?.id) setSelectedDatasetId(list[0].id);
      } catch (e) {
        console.error('Failed to fetch datasets', e);
      }
    };
    fetchDatasets();
    try {
      const raw = localStorage.getItem('analyticsWorkbenchTemplate');
      if (raw) {
        const tpl = JSON.parse(raw);
        if (tpl.activeModel) setActiveModel(tpl.activeModel);
        if (tpl.pivotDim) setPivotDim(tpl.pivotDim);
        if (tpl.pivotMeasure) setPivotMeasure(tpl.pivotMeasure);
        if (tpl.heatmapMode === 'corr' || tpl.heatmapMode === 'cov') setHeatmapMode(tpl.heatmapMode);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fetchPreview = async () => {
      if (!selectedDatasetId) return;
      try {
        const res = await fetch(`/api/datasets/${selectedDatasetId}/preview?limit=20`);
        if (!res.ok) return;
        setDatasetPreview(await res.json());
      } catch (e) {
        console.error('Failed to fetch dataset preview', e);
      }
    };
    fetchPreview();
  }, [selectedDatasetId]);

  const runAnalysis = async (model: string) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const payload: any = { model };

      const parseSeries = (s: string) =>
        s
          .split(',')
          .map(n => parseFloat(n.trim()))
          .filter(n => !isNaN(n));

      const dsRows: any[] = Array.isArray(datasetPreview?.rows) ? datasetPreview.rows : [];
      const dsNumericCols: string[] = Array.isArray(datasetPreview?.schema)
        ? datasetPreview.schema.filter((s: any) => s.type === 'number').map((s: any) => s.name)
        : [];
      const dsSeries = dsRows
        .map((r: any) => {
          const col = dsNumericCols[0];
          if (!col) return NaN;
          return Number(r?.[col]);
        })
        .filter((v: number) => Number.isFinite(v));

      const platformSeries = tradeSeries
        .map(s => (s.yesPrice > 0 ? s.yesPrice / 100 : 0))
        .filter(v => Number.isFinite(v) && v > 0);
      let ledgerSeries: number[] = [];
      if (dataSource === 'ledger' || dataSource === 'mixed') {
        try {
          const lr = await fetch(`/api/ledger/query-trades/${ledgerMarketId}`);
          if (lr.ok) {
            const ldata = await lr.json();
            ledgerSeries = (Array.isArray(ldata) ? ldata : [])
              .map((t: any) => Number(t?.price) / 100)
              .filter((v: number) => Number.isFinite(v) && v > 0);
          }
        } catch (e) {
          console.error('fetch ledger trades failed', e);
        }
      }
      const uploadSeries = parseSeries(inputData);
      const selectedSourceSeries =
        dataSource === 'platform'
          ? (dsSeries.length > 0 ? dsSeries : platformSeries)
          : dataSource === 'ledger'
          ? ledgerSeries
          : uploadSeries;
      const mergedSeries = [...platformSeries, ...ledgerSeries, ...uploadSeries, ...dsSeries];
      const pickSeries =
        dataSource === 'platform' ? selectedSourceSeries : dataSource === 'mixed' ? mergedSeries : uploadSeries;

      if (model === 'arima') {
        payload.data = pickSeries;
        payload.horizon = parseInt(horizon) || 24;
      } else if (model === 'garch') {
        payload.data = pickSeries;
      } else if (model === 'linear_regression') {
        payload.data_x = parseSeries(inputDataX);
        payload.data_y = parseSeries(inputDataY);
      } else if (model === 'correlation') {
        payload.series_a = parseSeries(inputDataX);
        payload.series_b = parseSeries(inputDataY);
      } else if (model === 'bayesian') {
        payload.prior = parseFloat(prior);
        payload.likelihood = parseFloat(likelihood);
        if (evidence.trim()) payload.evidence = parseFloat(evidence);
      } else if (model === 'sentiment') {
        payload.buy_volume = parseFloat(buyVolume);
        payload.sell_volume = parseFloat(sellVolume);
      } else if (model === 'kmeans') {
        try {
          payload.k = parseInt(k) || 3;
          payload.points = JSON.parse(pointsText || '[]');
        } catch {
          payload.points = [];
        }
      } else if (model === 'mispricing') {
        payload.model_probability = parseFloat(modelProbability);
        payload.market_probability = parseFloat(marketProbability);
      } else {
        payload.data = parseSeries(inputData);
      }

      const response = await fetch('/api/analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, payload })
      });
      const job = await response.json();
      if (!response.ok || !job?.id) throw new Error(job?.error || '任务提交失败');
      setJobStatus(`任务已提交：${job.id}`);
      let finalResult: any = null;
      for (let i = 0; i < 40; i += 1) {
        const jr = await fetch(`/api/analysis/jobs/${job.id}`);
        const jd = await jr.json();
        if (jd.status === 'done') {
          finalResult = jd.result;
          setJobStatus(`任务完成：${job.id}`);
          break;
        }
        if (jd.status === 'error') {
          throw new Error(jd.error || '任务执行失败');
        }
        setJobStatus(`任务运行中 ${jd.progress || 0}%`);
        await new Promise(r => setTimeout(r, 700));
      }
      if (!finalResult) throw new Error('任务超时，请稍后查看');
      setAnalysisResult(finalResult);
      setLastRun({ model, payload, result: finalResult });
      setAiInsight(null);
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisResult({ error: '无法连接到分析服务器' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runAiInsight = async () => {
    if (!lastRun) return;
    setIsAiAnalyzing(true);
    setAiInsight(null);
    try {
      const res = await fetch('/api/analyze/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastRun)
      });
      const data = await res.json();
      if (!res.ok) {
        setAiInsight({ error: data?.error || 'AI 分析失败' });
      } else {
        setAiInsight(data);
      }
    } catch (e) {
      setAiInsight({ error: 'AI 分析接口不可用' });
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  useEffect(() => {
    fetch('/api/analytics/factors')
      .then(res => res.json())
      .then(data => setFactors(data))
      .catch(err => console.error("Failed to fetch factors", err));
  }, []);

  const dashboard = useMemo(() => {
    const totalVolume = markets.reduce((s, m) => s + (m.volume || 0), 0) || 1;
    const topMarkets = markets
      .slice()
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 5)
      .map(m => ({
        id: m.id,
        title: m.title,
        volume: m.volume || 0,
        pct: ((m.volume || 0) / totalVolume) * 100
      }));

    const userSet = new Set<string>();
    trades.forEach(t => {
      if (t.buyerId) userSet.add(t.buyerId.toLowerCase());
      if (t.sellerId) userSet.add(t.sellerId.toLowerCase());
    });
    const activeUsers = userSet.size;
    const totalTrades = trades.length;
    const avgTradeSize = totalTrades > 0 ? trades.reduce((s, t) => s + (t.amount || 0), 0) / totalTrades : 0;
    const tradesPerUser = activeUsers > 0 ? totalTrades / activeUsers : 0;
    const yesTrades = trades.filter(t => t.outcome === 'YES').length;
    const yesRate = totalTrades > 0 ? yesTrades / totalTrades : 0;

    return {
      totalVolume,
      topMarkets,
      activeUsers,
      totalTrades,
      avgTradeSize,
      tradesPerUser,
      yesRate
    };
  }, [markets, trades]);

  const numericFields = useMemo(
    () => (datasetPreview?.schema || []).filter((s: any) => s.type === 'number').map((s: any) => s.name),
    [datasetPreview]
  );
  const categoryFields = useMemo(
    () => (datasetPreview?.schema || []).filter((s: any) => s.type === 'string' || s.type === 'date').map((s: any) => s.name),
    [datasetPreview]
  );

  const corrMatrix = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    if (!Array.isArray(rows) || numericFields.length < 2) return null;
    const cols = numericFields.slice(0, 8);
    const getCol = (name: string) => rows.map((r: any) => Number(r?.[name])).filter((v: number) => Number.isFinite(v));
    const pearson = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length);
      if (n < 3) return 0;
      const xa = a.slice(0, n);
      const xb = b.slice(0, n);
      const ma = xa.reduce((s, v) => s + v, 0) / n;
      const mb = xb.reduce((s, v) => s + v, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i += 1) {
        const va = xa[i] - ma;
        const vb = xb[i] - mb;
        num += va * vb;
        da += va * va;
        db += vb * vb;
      }
      if (!da || !db) return 0;
      return num / Math.sqrt(da * db);
    };
    const cov = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length);
      if (n < 3) return 0;
      const xa = a.slice(0, n);
      const xb = b.slice(0, n);
      const ma = xa.reduce((s, v) => s + v, 0) / n;
      const mb = xb.reduce((s, v) => s + v, 0) / n;
      let v = 0;
      for (let i = 0; i < n; i += 1) v += (xa[i] - ma) * (xb[i] - mb);
      return v / n;
    };
    const matrix = cols.map(c1 =>
      cols.map(c2 => (heatmapMode === 'corr' ? pearson(getCol(c1), getCol(c2)) : cov(getCol(c1), getCol(c2))))
    );
    return { cols, matrix };
  }, [datasetPreview, numericFields, heatmapMode]);

  const scatterData = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    if (!Array.isArray(rows) || numericFields.length < 2) return [];
    const x = numericFields[0];
    const y = numericFields[1];
    return rows
      .map((r: any) => ({ x: Number(r?.[x]), y: Number(r?.[y]), z: 1 }))
      .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, 500);
  }, [datasetPreview, numericFields]);

  const pivotStats = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    if (!pivotDim || !pivotMeasure || !Array.isArray(rows)) return [];
    const map: Record<string, { count: number; sum: number }> = {};
    rows.forEach((r: any) => {
      const key = String(r?.[pivotDim] ?? 'NULL');
      const v = Number(r?.[pivotMeasure]);
      if (!Number.isFinite(v)) return;
      if (!map[key]) map[key] = { count: 0, sum: 0 };
      map[key].count += 1;
      map[key].sum += v;
    });
    return Object.entries(map)
      .map(([key, v]) => ({ key, count: v.count, sum: v.sum, mean: v.sum / Math.max(1, v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [datasetPreview, pivotDim, pivotMeasure]);

  if (activeModel) {
    return (
      <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto animate-in slide-in-from-right duration-500">
        <div className="mb-6">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2">分析工具箱</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['arima', 'ARIMA'],
              ['linear_regression', '线性回归'],
              ['bayesian', '贝叶斯更新'],
              ['sentiment', '情绪分析'],
              ['kmeans', 'KMeans'],
              ['garch', 'GARCH'],
              ['mispricing', '定价偏差'],
              ['correlation', '相关性']
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setActiveModel(k as AnalysisModel)}
                className={`px-3 py-2 rounded-xl text-xs border ${activeModel === k ? 'bg-white text-black border-white' : 'border-white/10 text-gray-300 bg-white/5'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Input Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#141414] border border-white/5 p-8 rounded-2xl">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                {activeModel === 'arima' && <TrendingUp className="text-blue-500" />}
                {activeModel === 'linear_regression' && <LucideLineChart className="text-purple-500" />}
                {activeModel === 'bayesian' && <PieChart className="text-yellow-500" />}
                {activeModel === 'sentiment' && <Activity className="text-emerald-500" />}
                {activeModel === 'kmeans' && <BarChart3 className="text-emerald-500" />}
                {activeModel === 'garch' && <Activity className="text-blue-500" />}
                {activeModel === 'mispricing' && <TrendingUp className="text-yellow-500" />}
                {activeModel === 'correlation' && <LucideLineChart className="text-emerald-500" />}
                {activeModel === 'arima' && 'ARIMA 时间序列趋势预测'}
                {activeModel === 'linear_regression' && '线性回归分析'}
                {activeModel === 'bayesian' && '贝叶斯概率更新'}
                {activeModel === 'sentiment' && '市场情绪指标'}
                {activeModel === 'kmeans' && 'K-Means 聚类分析'}
                {activeModel === 'garch' && 'GARCH 波动率分析'}
                {activeModel === 'mispricing' && '定价偏差（Model vs Market）'}
                {activeModel === 'correlation' && '相关性分析（皮尔逊）'}
              </h2>

              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">数据来源选择（工作站）</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'platform', label: '平台数据' },
                      { key: 'ledger', label: '链上数据' },
                      { key: 'upload', label: '上传数据' },
                      { key: 'mixed', label: '混合数据' }
                    ].map(x => (
                      <button
                        key={x.key}
                        onClick={() => setDataSource(x.key as any)}
                        className={`px-3 py-2 rounded-xl text-[11px] border ${
                          dataSource === x.key ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10'
                        }`}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>
                {dataSource === 'ledger' && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">链上市场选择</div>
                    <select
                      value={ledgerMarketId}
                      onChange={(e) => setLedgerMarketId(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {markets.map(m => (
                        <option key={m.id} value={m.id}>#{m.id} {m.title}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">上传解析类型</div>
                  <div className="flex gap-2">
                    {[
                      { key: 'series', label: '单序列' },
                      { key: 'xy', label: '双序列(X/Y)' },
                      { key: 'points', label: '多维点(points)' }
                    ].map((x) => (
                      <button
                        key={x.key}
                        onClick={() => setUploadKind(x.key as UploadKind)}
                        className={`px-3 py-1 rounded-full text-[10px] border ${
                          uploadKind === (x.key as UploadKind)
                            ? 'bg-white text-black border-white'
                            : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) parseUploadedFile(file);
                  }}
                  className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center hover:border-emerald-500/50 transition-colors cursor-pointer group bg-white/5"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".json,.xlsx,.xls,.csv" 
                    className="hidden" 
                  />
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                    <Upload size={24} />
                  </div>
                  <span className="text-sm text-gray-400">
                    {uploadedFileName ? `已选择: ${uploadedFileName}` : '点击上传 XLSX, CSV 或 JSON 数据文件'}
                  </span>
                  {dragging && <span className="text-xs text-emerald-400 mt-2">释放鼠标即可上传</span>}
                  <span className="text-xs text-gray-600 mt-2">
                    JSON 支持：
                    <span className="ml-1 font-mono">
                      [0.6,0.62] / {'{'}data:[...]{'}'} / {'{'}x:[...],y:[...]{'}'} / {'{'}points:[[...],[...]]{'}'}
                    </span>
                  </span>
                </div>

                {(activeModel === 'arima' || activeModel === 'garch') && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">价格/概率序列 (逗号分隔)</label>
                      <textarea
                        value={inputData}
                        onChange={(e) => setInputData(e.target.value)}
                        className="w-full h-28 bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                        placeholder="例如：0.63, 0.64, 0.62, 0.66, 0.67"
                      />
                    </div>
                    {activeModel === 'arima' && (
                      <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">预测步数（horizon）</label>
                        <input
                          type="number"
                          value={horizon}
                          onChange={(e) => setHorizon(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                        />
                      </div>
                    )}
                  </>
                )}

                {(activeModel === 'linear_regression' || activeModel === 'correlation') && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                        {activeModel === 'linear_regression' ? '自变量 X（逗号分隔）' : '序列 A（逗号分隔）'}
                      </label>
                      <textarea
                        value={inputDataX}
                        onChange={(e) => setInputDataX(e.target.value)}
                        className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                        {activeModel === 'linear_regression' ? '因变量 Y（逗号分隔）' : '序列 B（逗号分隔）'}
                      </label>
                      <textarea
                        value={inputDataY}
                        onChange={(e) => setInputDataY(e.target.value)}
                        className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                  </>
                )}

                {activeModel === 'bayesian' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Prior</label>
                      <input
                        value={prior}
                        onChange={(e) => setPrior(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Likelihood</label>
                      <input
                        value={likelihood}
                        onChange={(e) => setLikelihood(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Evidence（可选）</label>
                      <input
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                        placeholder="留空则自动近似"
                      />
                    </div>
                  </div>
                )}

                {activeModel === 'sentiment' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Buy Volume</label>
                      <input
                        value={buyVolume}
                        onChange={(e) => setBuyVolume(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sell Volume</label>
                      <input
                        value={sellVolume}
                        onChange={(e) => setSellVolume(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                {activeModel === 'kmeans' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">K</label>
                        <input
                          value={k}
                          onChange={(e) => setK(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                        />
                      </div>
                      <div className="md:col-span-2 text-xs text-gray-500 flex items-end">
                        points 需要 JSON 二维数组，例如：[[5,100],[30,200],[6,120]]
                      </div>
                    </div>
                    <textarea
                      value={pointsText}
                      onChange={(e) => setPointsText(e.target.value)}
                      className="w-full h-40 bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                )}

                {activeModel === 'mispricing' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Model Probability（0-1）</label>
                      <input
                        value={modelProbability}
                        onChange={(e) => setModelProbability(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Market Probability（0-1）</label>
                      <input
                        value={marketProbability}
                        onChange={(e) => setMarketProbability(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => runAnalysis(activeModel)}
                  disabled={isAnalyzing}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-bold py-4 rounded-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Activity className="animate-spin" size={20} />
                      正在通过 Python 引擎计算...
                    </>
                  ) : (
                    <>
                      <Zap size={20} />
                      运行 Python 模型分析
                    </>
                  )}
                </button>
                <button
                  onClick={runAiInsight}
                  disabled={!lastRun || isAiAnalyzing}
                  className="w-full bg-white hover:bg-gray-200 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isAiAnalyzing ? 'AI 分析中...' : 'AI 辅助解读分析结果'}
                </button>
                {aiInsight && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-300 whitespace-pre-wrap break-words">
                    {aiInsight.error ? (
                      <span className="text-red-400">{aiInsight.error}</span>
                    ) : (
                      <>
                        <div className="text-[10px] text-gray-500 uppercase mb-2">AI Insight ({aiInsight.provider})</div>
                        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(aiInsight.analysis, null, 2)}</pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-2xl space-y-4">
              <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                <FileText size={16} />
                模型说明
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                运行后将展示：模型介绍、示例输入、分析建议与结构化输出（来自 Python 引擎）。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">JSON 示例</div>
                  <pre className="text-gray-300 whitespace-pre-wrap break-words">
{activeModel === 'arima' || activeModel === 'garch'
  ? `{"data":[0.63,0.64,0.62,0.66,0.67]}`
  : activeModel === 'linear_regression' || activeModel === 'correlation'
  ? `{"x":[10,20,30,40],"y":[0.55,0.60,0.66,0.71]}`
  : activeModel === 'kmeans'
  ? `{"points":[[5,100],[30,200],[6,120],[35,260]]}`
  : activeModel === 'bayesian'
  ? `{"prior":0.62,"likelihood":0.75,"evidence":0.69}`
  : activeModel === 'sentiment'
  ? `{"buy_volume":1200,"sell_volume":800}`
  : `{"model_probability":0.72,"market_probability":0.63}`}
                  </pre>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">XLSX / CSV 列示例</div>
                  <pre className="text-gray-300 whitespace-pre-wrap break-words">
{activeModel === 'arima' || activeModel === 'garch'
  ? `price\n0.63\n0.64\n0.62\n0.66\n0.67`
  : activeModel === 'linear_regression' || activeModel === 'correlation'
  ? `x,y\n10,0.55\n20,0.60\n30,0.66\n40,0.71`
  : activeModel === 'kmeans'
  ? `f1,f2,f3\n5,100,2\n30,200,7\n6,120,3`
  : activeModel === 'bayesian'
  ? `prior,likelihood,evidence\n0.62,0.75,0.69`
  : activeModel === 'sentiment'
  ? `buy_volume,sell_volume\n1200,800`
  : `model_probability,market_probability\n0.72,0.63`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Result Section */}
          <div className="space-y-6">
            <div className="bg-[#141414] border border-white/5 p-8 rounded-2xl min-h-[400px] flex flex-col">
              <h3 className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-3">分析结果输出</h3>
              <div className="text-[11px] text-gray-500 mb-4">{jobStatus || '未提交任务'}</div>
              
              {analysisResult ? (
                <div className="flex-1 space-y-4">
                  {analysisResult.error || analysisResult.ok === false ? (
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-sm font-mono">
                      {analysisResult.error || analysisResult?.result?.error || '模型运行失败'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-400 space-y-2">
                        <div className="text-white font-bold">{analysisResult.name}</div>
                        {analysisResult.intro && <div className="text-gray-400 whitespace-pre-wrap">{analysisResult.intro}</div>}
                        {analysisResult.suggestion && (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">分析建议</div>
                            <div className="text-gray-300 whitespace-pre-wrap">{analysisResult.suggestion}</div>
                          </div>
                        )}
                        {analysisResult.example_input && (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">数据示例</div>
                            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">
                              {JSON.stringify(analysisResult.example_input, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">输出结果</div>
                          <pre className="text-[11px] text-emerald-300 whitespace-pre-wrap break-words">
                            {JSON.stringify(analysisResult.result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600 space-y-4">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center animate-pulse">
                    <Activity size={32} className="opacity-20" />
                  </div>
                  <p className="text-sm italic">等待模型运行...</p>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-white/5">
                <div className="flex items-center gap-2 text-[10px] text-gray-600 font-mono">
                  <ShieldCheck size={12} />
                  ENGINE: PYTHON 3.10 / SCIPY-READY
                </div>
              </div>
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">数据集列表</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {datasets.map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => setSelectedDatasetId(ds.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs border ${
                      selectedDatasetId === ds.id
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300'
                    }`}
                  >
                    <div className="font-bold">{ds.name}</div>
                    <div className="text-[10px] text-gray-500">{ds.source} · {ds.rowCount} rows</div>
                  </button>
                ))}
                {datasets.length === 0 && <div className="text-xs text-gray-500">暂无数据集</div>}
              </div>
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">数据预览</div>
              {!datasetPreview ? (
                <div className="text-xs text-gray-500">请选择左侧数据集</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-gray-400">
                    字段：{(datasetPreview.schema || []).map((s: any) => `${s.name}(${s.type})`).slice(0, 8).join(', ')}
                  </div>
                  <div className="max-h-44 overflow-y-auto bg-white/5 border border-white/10 rounded-xl p-2">
                    <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">
                      {JSON.stringify((datasetPreview.rows || []).slice(0, 5), null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl space-y-3">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">字段筛选</div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={pivotDim}
                  onChange={(e) => setPivotDim(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-[11px] text-white"
                >
                  <option value="">选择透视维度</option>
                  {categoryFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                  value={pivotMeasure}
                  onChange={(e) => setPivotMeasure(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-[11px] text-white"
                >
                  <option value="">选择度量字段</option>
                  {numericFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setHeatmapMode('corr')}
                  className={`px-3 py-1 rounded-full text-[10px] border ${heatmapMode === 'corr' ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400'}`}
                >
                  热力图: 相关系数
                </button>
                <button
                  onClick={() => setHeatmapMode('cov')}
                  className={`px-3 py-1 rounded-full text-[10px] border ${heatmapMode === 'cov' ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400'}`}
                >
                  热力图: 协方差
                </button>
                <button
                  onClick={() => {
                    const tpl = {
                      selectedDatasetId,
                      activeModel,
                      pivotDim,
                      pivotMeasure,
                      heatmapMode,
                      savedAt: new Date().toISOString()
                    };
                    localStorage.setItem('analyticsWorkbenchTemplate', JSON.stringify(tpl));
                    alert('分析视图模板已保存');
                  }}
                  className="px-3 py-1 rounded-full text-[10px] border border-emerald-500/40 text-emerald-400"
                >
                  保存视图模板
                </button>
              </div>
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">相关性热力图</div>
              {!corrMatrix ? (
                <div className="text-xs text-gray-500">数值字段不足，无法生成热力图</div>
              ) : (
                <div className="overflow-auto">
                  <table className="text-[10px] border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-white/10 px-1 py-1" />
                        {corrMatrix.cols.map((c: string) => (
                          <th key={c} className="border border-white/10 px-2 py-1 text-gray-400">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {corrMatrix.matrix.map((row: number[], i: number) => (
                        <tr key={i}>
                          <td className="border border-white/10 px-2 py-1 text-gray-400">{corrMatrix.cols[i]}</td>
                          {row.map((v: number, j: number) => {
                            const a = Math.min(1, Math.abs(v));
                            const bg = v >= 0 ? `rgba(16,185,129,${a})` : `rgba(239,68,68,${a})`;
                            return (
                              <td key={j} className="border border-white/10 px-2 py-1 text-center text-white" style={{ backgroundColor: bg }}>
                                {v.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">散点图（字段 X/Y）</div>
              {scatterData.length === 0 ? (
                <div className="text-xs text-gray-500">数值字段不足，无法绘制散点图</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="x" stroke="#ffffff55" />
                      <YAxis dataKey="y" stroke="#ffffff55" />
                      <ZAxis dataKey="z" range={[20, 20]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter data={scatterData} fill="#10b981" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">透视统计卡片</div>
              {pivotStats.length === 0 ? (
                <div className="text-xs text-gray-500">请选择维度和度量字段</div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1">维度</th>
                        <th className="text-right py-1">Count</th>
                        <th className="text-right py-1">Sum</th>
                        <th className="text-right py-1">Mean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivotStats.map((r: any) => (
                        <tr key={r.key} className="border-t border-white/5 text-gray-300">
                          <td className="py-1">{r.key}</td>
                          <td className="py-1 text-right">{r.count}</td>
                          <td className="py-1 text-right">{r.sum.toFixed(2)}</td>
                          <td className="py-1 text-right">{r.mean.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-2">量化分析中心</h1>
        <p className="text-gray-400">8 类模型分析 + 真实交易数据看板（支持上传 CSV/XLSX/JSON）。</p>
      </div>

      {/* Model Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {[
          { id: 'arima', label: 'ARIMA 时间序列', desc: '预测概率/价格未来走势（趋势预测）', icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { id: 'linear_regression', label: '线性回归', desc: '因素影响分析（成交量/参与人数等）', icon: LucideLineChart, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { id: 'bayesian', label: '贝叶斯更新', desc: '新信息出现后更新概率（Posterior）', icon: PieChart, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { id: 'sentiment', label: '市场情绪', desc: '买卖量差 / 总量 的情绪分数', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { id: 'kmeans', label: 'K-Means 聚类', desc: '用户/市场行为分群（长期/短线/套利）', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { id: 'garch', label: 'GARCH 波动率', desc: '波动风险评估（Low/Medium/High）', icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { id: 'mispricing', label: '定价偏差', desc: 'Edge = 模型概率 - 市场概率（机会提示）', icon: TrendingUp, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { id: 'correlation', label: '相关性分析', desc: '市场 A/B 相关性（Pearson）', icon: LucideLineChart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
        ].map((model) => (
          <div 
            key={model.id} 
            onClick={() => setActiveModel(model.id as AnalysisModel)}
            className="group bg-[#141414] border border-white/5 p-8 rounded-2xl hover:border-emerald-500/50 transition-all cursor-pointer transform hover:-translate-y-1"
          >
            <div className={`w-14 h-14 ${model.bg} ${model.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
              <model.icon size={28} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{model.label}</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">{model.desc}</p>
            <div className="flex items-center text-emerald-500 text-xs font-bold gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              进入分析工作台
              <Zap size={12} />
            </div>
          </div>
        ))}
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: '市场情绪', value: `${(factors.sentiment * 100).toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: '波动率指数', value: factors.volatility.toFixed(2), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: '流动性评分', value: factors.liquidityScore, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { label: '市场效率比', value: factors.marketEfficiency.toFixed(2), icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        ].map((f, i) => (
          <div key={i} className="bg-[#141414] border border-white/5 p-6 rounded-2xl">
            <div className={`w-12 h-12 ${f.bg} ${f.color} rounded-xl flex items-center justify-center mb-4`}>
              <f.icon size={24} />
            </div>
            <div className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-1">{f.label}</div>
            <div className="text-3xl font-bold text-white">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Platform Statistics Section */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-2">
          <PieChart className="text-emerald-500" />
          平台统计数据参考
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-[#141414] border border-white/5 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">Top 市场成交占比</h3>
            <div className="space-y-4">
              {(dashboard.topMarkets.length > 0 ? dashboard.topMarkets : []).slice(0, 3).map((item: any, i: number) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span className="truncate">#{item.id} {item.title}</span>
                    <span>{item.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }} />
                  </div>
                </div>
              ))}
              {dashboard.topMarkets.length === 0 && (
                <div className="text-xs text-gray-600">暂无市场数据</div>
              )}
            </div>
          </div>

          <div className="bg-[#141414] border border-white/5 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">用户行为统计</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase mb-1">活跃交易用户</div>
                <div className="text-xl font-bold text-white">{dashboard.activeUsers}</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase mb-1">总成交笔数</div>
                <div className="text-xl font-bold text-white">{dashboard.totalTrades}</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase mb-1">人均成交笔数</div>
                <div className="text-xl font-bold text-white">{dashboard.tradesPerUser.toFixed(1)}</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase mb-1">平均每笔份额</div>
                <div className="text-xl font-bold text-white">{dashboard.avgTradeSize.toFixed(1)}</div>
              </div>
            </div>
          </div>

          <div className="bg-[#141414] border border-white/5 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">交易参与趋势</h3>
            <div className="h-[150px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tradeSeries}>
                  <Area type="monotone" dataKey={tradeSeries.length > 0 ? 'yesPrice' : 'price'} stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {tradeSeries.length === 0 && (
              <p className="text-[10px] text-gray-600 mt-4 italic text-center">暂无成交数据</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">

        {/* Price Trend Chart */}
        <div className="bg-[#141414] border border-white/5 p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white">市场价格趋势</h3>
            <div className="text-xs text-gray-500">基于成交记录聚合</div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tradeSeries}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} PMT`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Area type="monotone" dataKey={'yesPrice'} stroke="#10b981" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Volume Analysis */}
        <div className="bg-[#141414] border border-white/5 p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white">交易量分析</h3>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 text-xs text-emerald-500">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span>看好 (YES) 交易量</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span>看淡 (NO) 交易量</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tradeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '12px' }}
                />
                <Line type="monotone" dataKey={'yesPrice'} stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey={'noPrice'} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
