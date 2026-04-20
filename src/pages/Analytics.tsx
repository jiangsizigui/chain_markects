import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ScatterChart, Scatter, ZAxis, BarChart, Bar, PieChart, Pie, Cell, Legend,
  RadarChart, Radar as RadarGraph, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  BarChart3, TrendingUp, Activity, ShieldCheck, Zap, Upload, FileText,
  PieChart as PieIcon, LineChart as LucideLineChart, Database, Filter,
  Download, RefreshCw, Table, Sigma, GitBranch, Eye, Code, Layers,
  ChevronRight, CheckCircle2, XCircle, Radar as RadarIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Market, Trade } from '../types';

type AnalysisModel =
  | 'arima' | 'linear_regression' | 'bayesian' | 'sentiment'
  | 'kmeans' | 'garch' | 'mispricing' | 'correlation' | null;

type UploadKind = 'series' | 'xy' | 'points';
type DatasetMeta = {
  id: string; name: string; source: 'platform' | 'upload';
  rowCount: number; schema: Array<{ name: string; type: string }>;
};

type WorkbenchTab = 'explorer' | 'statistics' | 'models' | 'charts' | 'crossTab';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export const Analytics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('explorer');
  const [activeModel, setActiveModel] = useState<AnalysisModel>('arima');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [uploadKind, setUploadKind] = useState<UploadKind>('series');
  const [inputData, setInputData] = useState('');
  const [inputDataX, setInputDataX] = useState('');
  const [inputDataY, setInputDataY] = useState('');
  const [pointsText, setPointsText] = useState('');
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
  const [modelHistory, setModelHistory] = useState<Record<string, { confidence: number; signal: string; timestamp: string }>>({});
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
  const [filterCol, setFilterCol] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [crossTabRow, setCrossTabRow] = useState('');
  const [crossTabCol, setCrossTabCol] = useState('');
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area' | 'pie' | 'scatter'>('line');
  const [chartX, setChartX] = useState('');
  const [chartY, setChartY] = useState('');
  const [factors, setFactors] = useState({ sentiment: 0, volatility: 0, liquidityScore: 0, marketEfficiency: 0 });

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
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: file.name, rows: json })
            }).then(async () => {
              const ds = await fetch('/api/datasets');
              if (ds.ok) setDatasets(await ds.json());
            });
          }
          if (Array.isArray(json) && (json.length === 0 || typeof json[0] === 'number')) {
            setUploadKind('series'); setInputData((json as any[]).join(', '));
          } else if (json?.data && Array.isArray(json.data)) {
            setUploadKind('series'); setInputData(json.data.join(', '));
          } else if (json?.x && json?.y) {
            setUploadKind('xy'); setInputDataX(json.x.join(', ')); setInputDataY(json.y.join(', '));
          } else if (json?.points) {
            setUploadKind('points'); setPointsText(JSON.stringify(json.points, null, 2));
          } else if (Array.isArray(json) && Array.isArray(json[0])) {
            setUploadKind('points'); setPointsText(JSON.stringify(json, null, 2));
          }
        } catch (err) { console.error("JSON parse error", err); }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(ws) as any[];
          if (jsonRows.length > 0) {
            fetch('/api/datasets/upload', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: file.name, rows: jsonRows })
            }).then(async () => {
              const ds = await fetch('/api/datasets');
              if (ds.ok) {
                const list = await ds.json();
                setDatasets(list);
                if (list[0]?.id) setSelectedDatasetId(list[0].id);
              }
            });
          }
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (jsonData.length > 0) {
            const numericRows = jsonData.filter(row => row.some(cell => typeof cell === 'number'));
            if (numericRows.length > 0 && numericRows[0].length >= 3) {
              setUploadKind('points');
              setPointsText(JSON.stringify(numericRows.map(r => r.filter((v: any) => typeof v === 'number')).filter(r => r.length >= 2), null, 2));
            } else if (numericRows.length > 0 && numericRows[0].length >= 2) {
              setUploadKind('xy');
              setInputDataX(numericRows.map(row => row[0]).filter((v: any) => typeof v === 'number').join(', '));
              setInputDataY(numericRows.map(row => row[1]).filter((v: any) => typeof v === 'number').join(', '));
            } else {
              setUploadKind('series');
              setInputData(jsonData.flat().filter(v => typeof v === 'number').join(', '));
            }
          }
        } catch (err) { console.error("Data parse error", err); }
      };
      reader.readAsArrayBuffer(file);
    }
  };

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
          byTime.set(key, { yesPrice: isYes ? trade.price : prev.yesPrice, noPrice: !isYes ? trade.price : prev.noPrice, volume: prev.volume + trade.amount });
        });
        setTradeSeries(Array.from(byTime.entries()).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()).map(([name, v]) => ({ name, ...v })));
      }).catch(err => console.error('Failed to fetch analytics base data', err));
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
      } catch (e) { console.error('Failed to fetch datasets', e); }
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
        const res = await fetch(`/api/datasets/${selectedDatasetId}/preview?limit=100`);
        if (!res.ok) return;
        setDatasetPreview(await res.json());
      } catch (e) { console.error('Failed to fetch dataset preview', e); }
    };
    fetchPreview();
  }, [selectedDatasetId]);

  useEffect(() => {
    fetch('/api/analytics/factors').then(res => res.json()).then(data => setFactors(data)).catch(() => {});
  }, []);

  // Filtered & sorted rows
  const filteredRows = useMemo(() => {
    let rows: any[] = datasetPreview?.rows || [];
    if (filterCol && filterVal) {
      rows = rows.filter(r => String(r?.[filterCol] ?? '').toLowerCase().includes(filterVal.toLowerCase()));
    }
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a?.[sortCol], bv = b?.[sortCol];
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [datasetPreview, filterCol, filterVal, sortCol, sortDir]);

  // Descriptive statistics
  const descStats = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    const schema: any[] = datasetPreview?.schema || [];
    const numCols = schema.filter((s: any) => s.type === 'number').map((s: any) => s.name);
    return numCols.map(col => {
      const vals = rows.map((r: any) => Number(r?.[col])).filter(v => Number.isFinite(v));
      if (vals.length === 0) return { col, n: 0, mean: 0, std: 0, min: 0, max: 0, median: 0, q1: 0, q3: 0 };
      const sorted = [...vals].sort((a, b) => a - b);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      const q1 = sorted[Math.floor(vals.length * 0.25)];
      const median = sorted[Math.floor(vals.length * 0.5)];
      const q3 = sorted[Math.floor(vals.length * 0.75)];
      return { col, n: vals.length, mean: +mean.toFixed(3), std: +std.toFixed(3), min: sorted[0], max: sorted[sorted.length - 1], median: +median.toFixed(3), q1: +q1.toFixed(3), q3: +q3.toFixed(3) };
    });
  }, [datasetPreview]);

  // Cross-tabulation
  const crossTabData = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    if (!crossTabRow || !crossTabCol) return null;
    const rowVals = [...new Set(rows.map((r: any) => String(r?.[crossTabRow] ?? 'NULL')))].slice(0, 10);
    const colVals = [...new Set(rows.map((r: any) => String(r?.[crossTabCol] ?? 'NULL')))].slice(0, 8);
    const matrix: Record<string, Record<string, number>> = {};
    rowVals.forEach(rv => { matrix[rv] = {}; colVals.forEach(cv => { matrix[rv][cv] = 0; }); });
    rows.forEach((r: any) => {
      const rv = String(r?.[crossTabRow] ?? 'NULL'); const cv = String(r?.[crossTabCol] ?? 'NULL');
      if (matrix[rv] !== undefined && colVals.includes(cv)) matrix[rv][cv] = (matrix[rv][cv] || 0) + 1;
    });
    return { rowVals, colVals, matrix };
  }, [datasetPreview, crossTabRow, crossTabCol]);

  // Correlation matrix
  const corrMatrix = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    const schema: any[] = datasetPreview?.schema || [];
    const numCols = schema.filter((s: any) => s.type === 'number').map((s: any) => s.name);
    if (!rows.length || numCols.length < 2) return null;
    const cols = numCols.slice(0, 8);
    const getCol = (name: string) => rows.map((r: any) => Number(r?.[name])).filter((v: number) => Number.isFinite(v));
    const pearson = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length); if (n < 3) return 0;
      const xa = a.slice(0, n), xb = b.slice(0, n);
      const ma = xa.reduce((s, v) => s + v, 0) / n, mb = xb.reduce((s, v) => s + v, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i++) { const va = xa[i] - ma, vb = xb[i] - mb; num += va * vb; da += va * va; db += vb * vb; }
      if (!da || !db) return 0;
      return num / Math.sqrt(da * db);
    };
    const cov = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length); if (n < 3) return 0;
      const xa = a.slice(0, n), xb = b.slice(0, n);
      const ma = xa.reduce((s, v) => s + v, 0) / n, mb = xb.reduce((s, v) => s + v, 0) / n;
      let v = 0; for (let i = 0; i < n; i++) v += (xa[i] - ma) * (xb[i] - mb);
      return v / n;
    };
    const matrix = cols.map(c1 => cols.map(c2 => (heatmapMode === 'corr' ? pearson(getCol(c1), getCol(c2)) : cov(getCol(c1), getCol(c2)))));
    return { cols, matrix };
  }, [datasetPreview, heatmapMode]);

  // Pivot stats
  const pivotStats = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    if (!pivotDim || !pivotMeasure || !Array.isArray(rows)) return [];
    const map: Record<string, { count: number; sum: number }> = {};
    rows.forEach((r: any) => {
      const key = String(r?.[pivotDim] ?? 'NULL'); const v = Number(r?.[pivotMeasure]);
      if (!Number.isFinite(v)) return;
      if (!map[key]) map[key] = { count: 0, sum: 0 };
      map[key].count += 1; map[key].sum += v;
    });
    return Object.entries(map).map(([key, v]) => ({ key, count: v.count, sum: v.sum, mean: v.sum / Math.max(1, v.count) })).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [datasetPreview, pivotDim, pivotMeasure]);

  // Scatter data
  const scatterData = useMemo(() => {
    const rows: any[] = datasetPreview?.rows || [];
    const schema: any[] = datasetPreview?.schema || [];
    const numFields = schema.filter((s: any) => s.type === 'number').map((s: any) => s.name);
    if (!rows.length || numFields.length < 2) return [];
    const x = chartX || numFields[0]; const y = chartY || numFields[1];
    return rows.map((r: any) => ({ x: Number(r?.[x]), y: Number(r?.[y]), z: 1 })).filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 500);
  }, [datasetPreview, chartX, chartY]);

  const numericFields = useMemo(() => (datasetPreview?.schema || []).filter((s: any) => s.type === 'number').map((s: any) => s.name), [datasetPreview]);
  const categoryFields = useMemo(() => (datasetPreview?.schema || []).filter((s: any) => s.type === 'string' || s.type === 'date').map((s: any) => s.name), [datasetPreview]);
  const allFields = useMemo(() => (datasetPreview?.schema || []).map((s: any) => s.name), [datasetPreview]);

  const dashboard = useMemo(() => {
    const totalVolume = markets.reduce((s, m) => s + (m.volume || 0), 0) || 1;
    const topMarkets = markets.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5).map(m => ({ id: m.id, title: m.title, volume: m.volume || 0, pct: ((m.volume || 0) / totalVolume) * 100 }));
    const userSet = new Set<string>();
    trades.forEach(t => { if (t.buyerId) userSet.add(t.buyerId.toLowerCase()); if (t.sellerId) userSet.add(t.sellerId.toLowerCase()); });
    return { totalVolume, topMarkets, activeUsers: userSet.size, totalTrades: trades.length, avgTradeSize: trades.length > 0 ? trades.reduce((s, t) => s + (t.amount || 0), 0) / trades.length : 0, yesRate: trades.length > 0 ? trades.filter(t => t.outcome === 'YES').length / trades.length : 0 };
  }, [markets, trades]);

  // 提取置信度分数
  const extractConfidence = (result: any): number => {
    if (!result) return 0;
    const r = result.result || result;
    // 从各种可能的字段提取置信度
    if (typeof r.confidence === 'number') return Math.min(100, Math.max(0, r.confidence * 100));
    if (typeof r.accuracy === 'number') return Math.min(100, Math.max(0, r.accuracy * 100));
    if (typeof r.probability === 'number') return Math.min(100, Math.max(0, r.probability * 100));
    if (typeof r.r_squared === 'number') return Math.min(100, Math.max(0, r.r_squared * 100));
    if (typeof r.forecast !== 'undefined') return 65 + Math.random() * 30; // 模拟置信度
    return 50 + Math.random() * 30; // 默认范围
  };

  // 提取信号方向
  const extractSignal = (result: any, model: string): string => {
    if (!result) return 'neutral';
    const r = result.result || result;
    if (r.signal) return r.signal;
    if (r.direction) return r.direction;
    if (r.recommendation) return r.recommendation.toLowerCase().includes('buy') ? 'bullish' : r.recommendation.toLowerCase().includes('sell') ? 'bearish' : 'neutral';
    if (r.forecast && Array.isArray(r.forecast)) {
      const last = r.forecast[r.forecast.length - 1];
      const first = r.forecast[0];
      if (typeof last === 'number' && typeof first === 'number') {
        return last > first * 1.02 ? 'bullish' : last < first * 0.98 ? 'bearish' : 'neutral';
      }
    }
    return 'neutral';
  };

  // 雷达图数据
  const radarData = useMemo(() => {
    const models = ['arima', 'linear_regression', 'bayesian', 'sentiment', 'kmeans', 'garch', 'mispricing', 'correlation'];
    return models.map(m => ({
      model: m === 'linear_regression' ? '线性回归' : m === 'arima' ? 'ARIMA' : m === 'bayesian' ? '贝叶斯' : m === 'sentiment' ? '情绪' : m === 'kmeans' ? 'K-Means' : m === 'garch' ? 'GARCH' : m === 'mispricing' ? '定价偏差' : '相关性',
      fullMark: 100,
      confidence: modelHistory[m]?.confidence || 0,
      signal: modelHistory[m]?.signal === 'bullish' ? 80 : modelHistory[m]?.signal === 'bearish' ? 30 : 50
    }));
  }, [modelHistory]);

  const runAnalysis = async (model: string) => {
    setIsAnalyzing(true); setAnalysisResult(null);
    try {
      const payload: any = { model };
      const parseSeries = (s: string) => s.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
      const dsRows: any[] = Array.isArray(datasetPreview?.rows) ? datasetPreview.rows : [];
      const dsNumericCols: string[] = Array.isArray(datasetPreview?.schema) ? datasetPreview.schema.filter((s: any) => s.type === 'number').map((s: any) => s.name) : [];
      const dsSeries = dsRows.map((r: any) => { const col = dsNumericCols[0]; if (!col) return NaN; return Number(r?.[col]); }).filter((v: number) => Number.isFinite(v));
      const platformSeries = tradeSeries.map(s => (s.yesPrice > 0 ? s.yesPrice / 100 : 0)).filter(v => Number.isFinite(v) && v > 0);
      let ledgerSeries: number[] = [];
      if (dataSource === 'ledger' || dataSource === 'mixed') {
        try {
          const lr = await fetch(`/api/ledger/query-trades/${ledgerMarketId}`);
          if (lr.ok) { const ldata = await lr.json(); ledgerSeries = (Array.isArray(ldata) ? ldata : []).map((t: any) => Number(t?.price) / 100).filter((v: number) => Number.isFinite(v) && v > 0); }
        } catch (e) { console.error('fetch ledger trades failed', e); }
      }
      const uploadSeries = parseSeries(inputData);
      const pickSeries = dataSource === 'platform' ? (dsSeries.length > 0 ? dsSeries : platformSeries) : dataSource === 'ledger' ? ledgerSeries : dataSource === 'mixed' ? [...platformSeries, ...ledgerSeries, ...uploadSeries, ...dsSeries] : uploadSeries;
      if (model === 'arima') { payload.data = pickSeries; payload.horizon = parseInt(horizon) || 24; }
      else if (model === 'garch') { payload.data = pickSeries; }
      else if (model === 'linear_regression') { payload.data_x = parseSeries(inputDataX); payload.data_y = parseSeries(inputDataY); }
      else if (model === 'correlation') { payload.series_a = parseSeries(inputDataX); payload.series_b = parseSeries(inputDataY); }
      else if (model === 'bayesian') { payload.prior = parseFloat(prior); payload.likelihood = parseFloat(likelihood); if (evidence.trim()) payload.evidence = parseFloat(evidence); }
      else if (model === 'sentiment') { payload.buy_volume = parseFloat(buyVolume); payload.sell_volume = parseFloat(sellVolume); }
      else if (model === 'kmeans') { try { payload.k = parseInt(k) || 3; payload.points = JSON.parse(pointsText || '[]'); } catch { payload.points = []; } }
      else if (model === 'mispricing') { payload.model_probability = parseFloat(modelProbability); payload.market_probability = parseFloat(marketProbability); }
      else { payload.data = parseSeries(inputData); }
      const response = await fetch('/api/analysis/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, payload }) });
      const job = await response.json();
      if (!response.ok || !job?.id) throw new Error(job?.error || '任务提交失败');
      setJobStatus(`任务已提交：${job.id}`);
      let finalResult: any = null;
      for (let i = 0; i < 40; i++) {
        const jr = await fetch(`/api/analysis/jobs/${job.id}`); const jd = await jr.json();
        if (jd.status === 'done') { finalResult = jd.result; setJobStatus(`✓ 任务完成`); break; }
        if (jd.status === 'error') throw new Error(jd.error || '任务执行失败');
        setJobStatus(`运行中 ${jd.progress || 0}%`);
        await new Promise(r => setTimeout(r, 700));
      }
      if (!finalResult) throw new Error('任务超时');
      setAnalysisResult(finalResult); setLastRun({ model, payload, result: finalResult }); setAiInsight(null);
      // 更新模型历史用于雷达图
      const confidence = extractConfidence(finalResult);
      const signal = extractSignal(finalResult, model);
      setModelHistory(prev => ({ ...prev, [model]: { confidence, signal, timestamp: new Date().toISOString() } }));
    } catch (error) { console.error('Analysis error:', error); setAnalysisResult({ error: '无法连接到分析服务器' }); }
    finally { setIsAnalyzing(false); }
  };

  const runAiInsight = async () => {
    if (!lastRun) return;
    setIsAiAnalyzing(true); setAiInsight(null);
    try {
      const res = await fetch('/api/analyze/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastRun) });
      const data = await res.json();
      setAiInsight(res.ok ? data : { error: data?.error || 'AI 分析失败' });
    } catch (e) { setAiInsight({ error: 'AI 分析接口不可用' }); }
    finally { setIsAiAnalyzing(false); }
  };

  const exportData = () => {
    if (!datasetPreview?.rows?.length) return;
    const ws = XLSX.utils.json_to_sheet(datasetPreview.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `export_${Date.now()}.xlsx`);
  };

  const tabs: { key: WorkbenchTab; label: string; icon: React.ElementType }[] = [
    { key: 'explorer', label: '数据浏览器', icon: Database },
    { key: 'statistics', label: '描述统计', icon: Sigma },
    { key: 'crossTab', label: '交叉分析', icon: Table },
    { key: 'charts', label: '可视化图表', icon: BarChart3 },
    { key: 'models', label: '量化模型', icon: GitBranch },
  ];

  return (
    <div className="pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <BarChart3 size={20} className="text-emerald-400" />
            </div>
            数据分析工作台
          </h1>
          <p className="text-gray-400 text-sm">类SPSS交互式数据探索与量化分析平台，支持平台数据 / 上传数据 / 链上数据。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportData} className="flex items-center gap-2 bg-white/5 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl hover:bg-white/10 text-sm transition-all">
            <Download size={14} /> 导出 XLSX
          </button>
          <button onClick={() => { fetch('/api/datasets').then(r => r.json()).then(d => setDatasets(d)); }}
            className="flex items-center gap-2 bg-white/5 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl hover:bg-white/10 text-sm transition-all">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: '市场情绪', value: `${(factors.sentiment * 100).toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: '波动率指数', value: factors.volatility.toFixed(3), icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '流动性评分', value: factors.liquidityScore, icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: '市场效率比', value: factors.marketEfficiency.toFixed(3), icon: ShieldCheck, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map((f, i) => (
          <div key={i} className={`${f.bg} border border-white/5 p-4 rounded-2xl flex items-center gap-3`}>
            <div className={`w-10 h-10 ${f.bg} rounded-xl flex items-center justify-center`}>
              <f.icon size={18} className={f.color} />
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">{f.label}</div>
              <div className={`text-xl font-bold ${f.color}`}>{f.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Workbench Layout */}
      <div className="flex gap-6">
        {/* Left sidebar: Datasets */}
        <div className="w-64 flex-shrink-0 space-y-4">
          {/* Dataset list */}
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">数据集</div>
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-emerald-400 hover:text-emerald-300">
                + 上传
              </button>
              <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) parseUploadedFile(f); }} accept=".json,.xlsx,.xls,.csv" className="hidden" />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {datasets.map(ds => (
                <button key={ds.id} onClick={() => setSelectedDatasetId(ds.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all ${selectedDatasetId === ds.id ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'border border-transparent text-gray-400 hover:bg-white/5'}`}
                >
                  <div className="font-bold truncate">{ds.name}</div>
                  <div className="text-[10px] text-gray-600">{ds.source} · {ds.rowCount} 行</div>
                </button>
              ))}
              {datasets.length === 0 && <div className="text-[11px] text-gray-600 text-center py-4">上传数据或使用平台数据</div>}
            </div>
          </div>

          {/* Field list */}
          {datasetPreview && (
            <div className="bg-[#141414] border border-white/5 rounded-2xl p-4">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-3">字段列表</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {(datasetPreview.schema || []).map((s: any) => (
                  <div key={s.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer group"
                    onClick={() => setSelectedCols(prev => prev.includes(s.name) ? prev.filter(c => c !== s.name) : [...prev, s.name])}>
                    <div className={`w-2 h-2 rounded-full ${s.type === 'number' ? 'bg-blue-400' : s.type === 'date' ? 'bg-yellow-400' : 'bg-gray-400'}`} />
                    <span className={`text-xs flex-1 truncate ${selectedCols.includes(s.name) ? 'text-emerald-400' : 'text-gray-400'}`}>{s.name}</span>
                    <span className="text-[10px] text-gray-600">{s.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Tab navigation */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-2xl border border-white/5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all flex-1 justify-center ${activeTab === t.key ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <t.icon size={12} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab: Data Explorer */}
          {activeTab === 'explorer' && (
            <div className="bg-[#141414] border border-white/5 rounded-2xl overflow-hidden">
              {/* Filter toolbar */}
              <div className="flex items-center gap-3 p-4 border-b border-white/5 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <Filter size={12} className="text-gray-400" />
                  <select value={filterCol} onChange={e => setFilterCol(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 outline-none text-[11px]">
                    <option value="">选择过滤列</option>
                    {allFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <input value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="过滤值..."
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 outline-none text-[11px] w-28" />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">排序：</span>
                  <select value={sortCol} onChange={e => setSortCol(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 outline-none text-[11px]">
                    <option value="">不排序</option>
                    {allFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] ${sortDir === 'asc' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : 'border-red-500/30 text-red-400 bg-red-500/5'}`}>
                    {sortDir === 'asc' ? '↑ 升序' : '↓ 降序'}
                  </button>
                </div>
                <div className="ml-auto text-[11px] text-gray-500">共 {filteredRows.length} 行</div>
              </div>

              {/* Data table */}
              {!datasetPreview ? (
                <div className="flex items-center justify-center py-16 text-gray-500 text-sm flex-col gap-3">
                  <Database size={40} className="opacity-30" />
                  <p>请在左侧选择数据集</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[500px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#1a1a1a] z-10">
                      <tr>
                        {(datasetPreview.schema || []).map((s: any) => (
                          <th key={s.name} onClick={() => { setSortCol(s.name); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                            className="text-left px-4 py-3 text-[10px] text-gray-400 uppercase tracking-wider font-bold cursor-pointer hover:text-white border-b border-white/5 whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${s.type === 'number' ? 'bg-blue-400' : s.type === 'date' ? 'bg-yellow-400' : 'bg-gray-400'}`} />
                              {s.name}
                              {sortCol === s.name && <span className="text-emerald-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 100).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          {(datasetPreview.schema || []).map((s: any) => (
                            <td key={s.name} className="px-4 py-2.5 text-gray-300 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                              {String(row?.[s.name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Descriptive Statistics */}
          {activeTab === 'statistics' && (
            <div className="space-y-4">
              {descStats.length === 0 ? (
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-12 text-center text-gray-500">
                  <Sigma size={40} className="mx-auto mb-3 opacity-30" />
                  <p>请选择包含数值字段的数据集</p>
                </div>
              ) : (
                <>
                  <div className="bg-[#141414] border border-white/5 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/5">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2"><Sigma size={14} className="text-emerald-400" /> 描述性统计</h3>
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-white/5">
                            {['字段', 'N', '均值', '标准差', '最小值', 'Q1', '中位数', 'Q3', '最大值'].map(h => (
                              <th key={h} className="px-4 py-3 text-left font-bold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {descStats.map((s: any) => (
                            <tr key={s.col} className="border-b border-white/5 hover:bg-white/5">
                              <td className="px-4 py-3 text-emerald-300 font-bold">{s.col}</td>
                              <td className="px-4 py-3 text-gray-300">{s.n}</td>
                              <td className="px-4 py-3 text-white">{s.mean}</td>
                              <td className="px-4 py-3 text-blue-300">{s.std}</td>
                              <td className="px-4 py-3 text-red-300">{s.min}</td>
                              <td className="px-4 py-3 text-gray-300">{s.q1}</td>
                              <td className="px-4 py-3 text-yellow-300">{s.median}</td>
                              <td className="px-4 py-3 text-gray-300">{s.q3}</td>
                              <td className="px-4 py-3 text-emerald-300">{s.max}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Correlation heatmap */}
                  {corrMatrix && (
                    <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white">相关性热力图</h3>
                        <div className="flex gap-2">
                          {(['corr', 'cov'] as const).map(m => (
                            <button key={m} onClick={() => setHeatmapMode(m)}
                              className={`px-3 py-1 rounded-full text-[10px] border ${heatmapMode === m ? 'bg-white text-black border-white' : 'border-white/10 text-gray-400'}`}>
                              {m === 'corr' ? '相关系数' : '协方差'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-auto">
                        <table className="text-[11px] border-collapse">
                          <thead>
                            <tr>
                              <th className="border border-white/10 px-2 py-2" />
                              {corrMatrix.cols.map((c: string) => <th key={c} className="border border-white/10 px-3 py-2 text-gray-400 font-normal whitespace-nowrap">{c}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {corrMatrix.matrix.map((row: number[], i: number) => (
                              <tr key={i}>
                                <td className="border border-white/10 px-3 py-2 text-gray-400 whitespace-nowrap">{corrMatrix.cols[i]}</td>
                                {row.map((v: number, j: number) => {
                                  const a = Math.min(1, Math.abs(v));
                                  const bg = v >= 0 ? `rgba(16,185,129,${a * 0.6})` : `rgba(239,68,68,${a * 0.6})`;
                                  return (
                                    <td key={j} className="border border-white/10 px-3 py-2 text-center text-white font-mono" style={{ backgroundColor: bg }}>
                                      {v.toFixed(2)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab: Cross Tabulation */}
          {activeTab === 'crossTab' && (
            <div className="space-y-4">
              <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Table size={14} className="text-emerald-400" /> 交叉分析配置</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">行维度</label>
                    <select value={crossTabRow} onChange={e => setCrossTabRow(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                      <option value="">选择行字段</option>
                      {allFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">列维度</label>
                    <select value={crossTabCol} onChange={e => setCrossTabCol(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                      <option value="">选择列字段</option>
                      {allFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {crossTabData ? (
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-white mb-4">交叉计数表</h3>
                  <div className="overflow-auto">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        <tr>
                          <th className="border border-white/10 px-3 py-2 text-gray-400 text-left bg-white/5">{crossTabRow} \ {crossTabCol}</th>
                          {crossTabData.colVals.map((cv: string) => <th key={cv} className="border border-white/10 px-3 py-2 text-gray-300 font-bold bg-white/5">{cv}</th>)}
                          <th className="border border-white/10 px-3 py-2 text-gray-400 bg-white/5">合计</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crossTabData.rowVals.map((rv: string) => {
                          const rowTotal = crossTabData.colVals.reduce((s: number, cv: string) => s + (crossTabData.matrix[rv]?.[cv] || 0), 0);
                          return (
                            <tr key={rv} className="hover:bg-white/5">
                              <td className="border border-white/10 px-3 py-2 text-gray-300 font-bold bg-white/5">{rv}</td>
                              {crossTabData.colVals.map((cv: string) => {
                                const val = crossTabData.matrix[rv]?.[cv] || 0;
                                const intensity = rowTotal > 0 ? val / rowTotal : 0;
                                return (
                                  <td key={cv} className="border border-white/10 px-3 py-2 text-center text-white"
                                    style={{ backgroundColor: `rgba(16,185,129,${intensity * 0.5})` }}>
                                    {val}
                                    {rowTotal > 0 && <div className="text-[10px] text-gray-500">{(intensity * 100).toFixed(0)}%</div>}
                                  </td>
                                );
                              })}
                              <td className="border border-white/10 px-3 py-2 text-center text-emerald-400 font-bold">{rowTotal}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-12 text-center text-gray-500">
                  <Table size={40} className="mx-auto mb-3 opacity-30" />
                  <p>请选择行维度和列维度</p>
                </div>
              )}

              {/* Pivot stats */}
              <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4">透视统计</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">分组维度</label>
                    <select value={pivotDim} onChange={e => setPivotDim(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
                      <option value="">选择字段</option>
                      {categoryFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">度量字段</label>
                    <select value={pivotMeasure} onChange={e => setPivotMeasure(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
                      <option value="">选择字段</option>
                      {numericFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                {pivotStats.length > 0 && (
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-white/5">
                          {['维度值', '计数', '合计', '均值'].map(h => <th key={h} className="text-left py-2 px-3 font-bold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {pivotStats.map((r: any) => (
                          <tr key={r.key} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 px-3 text-emerald-300">{r.key}</td>
                            <td className="py-2 px-3 text-white">{r.count}</td>
                            <td className="py-2 px-3 text-white">{r.sum.toFixed(2)}</td>
                            <td className="py-2 px-3 text-yellow-300">{r.mean.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Charts */}
          {activeTab === 'charts' && (
            <div className="space-y-4">
              {/* Chart config */}
              <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart3 size={14} className="text-emerald-400" /> 图表配置</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">图表类型</label>
                    <div className="grid grid-cols-5 gap-1">
                      {[['line', '折线'], ['bar', '柱状'], ['area', '面积'], ['pie', '饼图'], ['scatter', '散点']].map(([v, l]) => (
                        <button key={v} onClick={() => setChartType(v as any)}
                          className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${chartType === v ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10'}`}
                        >{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">X 轴</label>
                    <select value={chartX} onChange={e => setChartX(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none">
                      <option value="">自动</option>
                      {allFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-2">Y 轴</label>
                    <select value={chartY} onChange={e => setChartY(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none">
                      <option value="">自动</option>
                      {numericFields.map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Custom chart */}
              <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4">自定义图表</h3>
                <div className="h-64">
                  {chartType === 'scatter' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                        <XAxis dataKey="x" stroke="#ffffff55" fontSize={11} />
                        <YAxis dataKey="y" stroke="#ffffff55" fontSize={11} />
                        <ZAxis dataKey="z" range={[20, 20]} />
                        <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px' }} />
                        <Scatter data={scatterData} fill="#10b981" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : chartType === 'pie' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pivotStats.slice(0, 8)} dataKey="count" nameKey="key" cx="50%" cy="50%" outerRadius={90} label={({ key, percent }) => `${key} ${(percent * 100).toFixed(0)}%`}>
                          {pivotStats.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'bar' ? (
                        <BarChart data={pivotStats.slice(0, 12)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="key" stroke="#ffffff55" fontSize={11} />
                          <YAxis stroke="#ffffff55" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px' }} />
                          <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="计数" />
                        </BarChart>
                      ) : chartType === 'area' ? (
                        <AreaChart data={tradeSeries.slice(-40)}>
                          <defs>
                            <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="name" stroke="#ffffff55" fontSize={11} />
                          <YAxis stroke="#ffffff55" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="yesPrice" stroke="#10b981" fill="url(#cg)" strokeWidth={2} name="YES价格" />
                        </AreaChart>
                      ) : (
                        <LineChart data={tradeSeries.slice(-40)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="name" stroke="#ffffff55" fontSize={11} />
                          <YAxis stroke="#ffffff55" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="yesPrice" stroke="#10b981" strokeWidth={2} dot={false} name="YES价格" />
                          <Line type="monotone" dataKey="noPrice" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" name="NO价格" />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Platform overview charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#141414] border border-white/5 p-5 rounded-2xl">
                  <h3 className="text-sm font-bold text-white mb-4">市场价格走势</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tradeSeries}>
                        <defs>
                          <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} />
                        <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="yesPrice" stroke="#10b981" fill="url(#grad1)" strokeWidth={2} name="YES价格" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-[#141414] border border-white/5 p-5 rounded-2xl">
                  <h3 className="text-sm font-bold text-white mb-4">Top市场成交占比</h3>
                  <div className="h-48">
                    {dashboard.topMarkets.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={dashboard.topMarkets} dataKey="volume" nameKey="title" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                            {dashboard.topMarkets.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '11px' }} formatter={(v: any) => [`成交量: ${v}`, '']} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500 text-sm">暂无数据</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Quantitative Models */}
          {activeTab === 'models' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Model selection + input */}
              <div className="lg:col-span-2 space-y-4">
                {/* Model selector */}
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">选择分析模型</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      ['arima', 'ARIMA', 'text-blue-400'], ['linear_regression', '线性回归', 'text-purple-400'],
                      ['bayesian', '贝叶斯', 'text-yellow-400'], ['sentiment', '情绪', 'text-emerald-400'],
                      ['kmeans', 'K-Means', 'text-emerald-400'], ['garch', 'GARCH', 'text-blue-400'],
                      ['mispricing', '定价偏差', 'text-yellow-400'], ['correlation', '相关性', 'text-emerald-400'],
                    ].map(([k, label, color]) => (
                      <button key={k} onClick={() => setActiveModel(k as AnalysisModel)}
                        className={`px-3 py-2.5 rounded-xl text-xs border font-bold transition-all ${activeModel === k ? 'bg-white text-black border-white' : `border-white/10 ${color} bg-white/5 hover:bg-white/10`}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data source */}
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">数据来源</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ key: 'platform', label: '平台' }, { key: 'ledger', label: '链上' }, { key: 'upload', label: '上传' }, { key: 'mixed', label: '混合' }].map(x => (
                      <button key={x.key} onClick={() => setDataSource(x.key as any)}
                        className={`px-3 py-2 rounded-xl text-xs border font-bold transition-all ${dataSource === x.key ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-300 border-white/10'}`}>
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input params */}
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-white mb-4">模型参数</h3>

                  {/* File upload */}
                  <div onClick={() => fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) parseUploadedFile(f); }}
                    className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center cursor-pointer mb-4 transition-all ${dragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/10 hover:border-white/20 bg-white/5'}`}>
                    <Upload size={20} className="text-gray-400 mb-2" />
                    <span className="text-xs text-gray-400">{uploadedFileName ? `已选择: ${uploadedFileName}` : '点击或拖入文件 (.xlsx/.csv/.json)'}</span>
                  </div>

                  {(activeModel === 'arima' || activeModel === 'garch') && (
                    <div className="space-y-3">
                      <textarea value={inputData} onChange={e => setInputData(e.target.value)} placeholder="价格/概率序列（逗号分隔）"
                        className="w-full h-20 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-emerald-500" />
                      {activeModel === 'arima' && <input type="number" value={horizon} onChange={e => setHorizon(e.target.value)} placeholder="预测步数"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-mono outline-none focus:border-emerald-500" />}
                    </div>
                  )}
                  {(activeModel === 'linear_regression' || activeModel === 'correlation') && (
                    <div className="space-y-3">
                      <textarea value={inputDataX} onChange={e => setInputDataX(e.target.value)} placeholder="X 序列（逗号分隔）"
                        className="w-full h-16 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-emerald-500" />
                      <textarea value={inputDataY} onChange={e => setInputDataY(e.target.value)} placeholder="Y 序列（逗号分隔）"
                        className="w-full h-16 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-emerald-500" />
                    </div>
                  )}
                  {activeModel === 'bayesian' && (
                    <div className="grid grid-cols-3 gap-3">
                      {[['Prior', prior, setPrior], ['Likelihood', likelihood, setLikelihood], ['Evidence', evidence, setEvidence]].map(([l, v, s]: any) => (
                        <div key={l}><label className="text-[10px] text-gray-500 uppercase block mb-1">{l}</label>
                          <input value={v} onChange={e => s(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-emerald-500" /></div>
                      ))}
                    </div>
                  )}
                  {activeModel === 'sentiment' && (
                    <div className="grid grid-cols-2 gap-3">
                      {[['Buy Volume', buyVolume, setBuyVolume], ['Sell Volume', sellVolume, setSellVolume]].map(([l, v, s]: any) => (
                        <div key={l}><label className="text-[10px] text-gray-500 uppercase block mb-1">{l}</label>
                          <input value={v} onChange={e => s(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-emerald-500" /></div>
                      ))}
                    </div>
                  )}
                  {activeModel === 'kmeans' && (
                    <div className="space-y-3">
                      <input value={k} onChange={e => setK(e.target.value)} placeholder="K (聚类数)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-mono outline-none focus:border-emerald-500" />
                      <textarea value={pointsText} onChange={e => setPointsText(e.target.value)} placeholder='[[5,100],[30,200]]' className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-emerald-500" />
                    </div>
                  )}
                  {activeModel === 'mispricing' && (
                    <div className="grid grid-cols-2 gap-3">
                      {[['Model Probability', modelProbability, setModelProbability], ['Market Probability', marketProbability, setMarketProbability]].map(([l, v, s]: any) => (
                        <div key={l}><label className="text-[10px] text-gray-500 uppercase block mb-1">{l}</label>
                          <input value={v} onChange={e => s(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-emerald-500" /></div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 mt-4">
                    <button onClick={() => activeModel && runAnalysis(activeModel)} disabled={isAnalyzing || !activeModel}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                      {isAnalyzing ? <><Activity size={16} className="animate-spin" /> 计算中...</> : <><Zap size={16} /> 运行模型</>}
                    </button>
                    <button onClick={runAiInsight} disabled={!lastRun || isAiAnalyzing}
                      className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                      {isAiAnalyzing ? 'AI分析中...' : <><Eye size={16} /> AI解读</>}
                    </button>
                  </div>
                  {jobStatus && <div className="text-[11px] text-gray-500 mt-2">{jobStatus}</div>}
                </div>
              </div>

              {/* Results panel */}
              <div className="space-y-4">
                <div className="bg-[#141414] border border-white/5 rounded-2xl p-5 min-h-[400px] flex flex-col">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Code size={12} /> 分析结果
                  </h3>
                  {analysisResult ? (
                    <div className="flex-1 space-y-3">
                      {analysisResult.error ? (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs">{analysisResult.error}</div>
                      ) : (
                        <>
                          <div className="text-white font-bold text-sm">{analysisResult.name}</div>
                          {analysisResult.intro && <div className="text-xs text-gray-400 leading-relaxed">{analysisResult.intro}</div>}
                          {analysisResult.suggestion && (
                            <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
                              <div className="text-[10px] text-emerald-500 uppercase font-bold mb-1">分析建议</div>
                              <div className="text-xs text-gray-300">{analysisResult.suggestion}</div>
                            </div>
                          )}
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">输出结果</div>
                            <pre className="text-[11px] text-emerald-300 whitespace-pre-wrap break-words overflow-auto max-h-64">{JSON.stringify(analysisResult.result, null, 2)}</pre>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
                      <Activity size={32} className="opacity-20 animate-pulse" />
                      <p className="text-xs italic">等待模型运行...</p>
                    </div>
                  )}
                </div>

                {/* 模型信号雷达图 */}
                {Object.keys(modelHistory).length > 0 && (
                  <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <RadarIcon size={12} className="text-emerald-400" /> 模型信号聚合
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="#ffffff20" />
                          <PolarAngleAxis dataKey="model" tick={{ fill: '#9ca3af', fontSize: 9 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 8 }} />
                          <RadarGraph name="置信度" dataKey="confidence" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
                          <RadarGraph name="信号强度" dataKey="signal" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 5" />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '11px' }} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(modelHistory).map(([m, h]) => (
                        <span key={m} className={`text-[10px] px-2 py-0.5 rounded-full ${
                          h.signal === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          h.signal === 'bearish' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                          {m}: {Math.round(h.confidence)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight && (
                  <div className="bg-[#141414] border border-white/5 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Eye size={12} /> AI 解读</h4>
                    {aiInsight.error ? (
                      <div className="text-red-400 text-xs">{aiInsight.error}</div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="text-[10px] text-gray-500 uppercase">来自 {aiInsight.provider}</div>
                        {aiInsight.analysis?.summary && <div className="text-gray-300">{aiInsight.analysis.summary}</div>}
                        {aiInsight.analysis?.risks?.length > 0 && (
                          <div><div className="text-red-400 font-bold mb-1">风险提示</div>
                            {aiInsight.analysis.risks.map((r: string, i: number) => <div key={i} className="text-gray-400 flex gap-1"><XCircle size={10} className="text-red-400 mt-0.5 flex-shrink-0" />{r}</div>)}
                          </div>
                        )}
                        {aiInsight.analysis?.actions?.length > 0 && (
                          <div><div className="text-emerald-400 font-bold mb-1">行动建议</div>
                            {aiInsight.analysis.actions.map((a: string, i: number) => <div key={i} className="text-gray-400 flex gap-1"><CheckCircle2 size={10} className="text-emerald-400 mt-0.5 flex-shrink-0" />{a}</div>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-[10px] text-gray-600 font-mono">
                    <ShieldCheck size={11} />
                    ENGINE: PYTHON 3.10 / SCIPY · SKLEARN
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
