import sys
import json
import math
from typing import Any, Dict, List, Optional, Tuple


def _safe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except Exception:
        return None


def _series_from_payload(payload: Dict[str, Any]) -> List[float]:
    data = payload.get("data", [])
    out: List[float] = []
    if isinstance(data, list):
        for x in data:
            v = _safe_float(x)
            if v is not None:
                out.append(v)
    return out


def _xy_from_payload(payload: Dict[str, Any]) -> Tuple[List[float], List[float]]:
    dx = payload.get("data_x", [])
    dy = payload.get("data_y", [])
    x: List[float] = []
    y: List[float] = []
    if isinstance(dx, list) and isinstance(dy, list):
        n = min(len(dx), len(dy))
        for i in range(n):
            xi = _safe_float(dx[i])
            yi = _safe_float(dy[i])
            if xi is None or yi is None:
                continue
            x.append(xi)
            y.append(yi)
    return x, y


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: List[float]) -> float:
    if len(xs) <= 1:
        return 0.0
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / len(xs)
    return math.sqrt(max(var, 0.0))


def _median(xs: List[float]) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    n = len(s)
    mid = n // 2
    return (s[mid - 1] + s[mid]) / 2.0 if n % 2 == 0 else s[mid]


def model_arima(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    ARIMA(1,1,0) 轻量实现（不依赖外部库）：
    - 对序列做一次差分
    - 用 AR(1) 最小二乘估计 phi
    - 预测未来 horizon 步（默认 24）
    备注：若环境装了 statsmodels，可后续扩展为真 ARIMA。
    """
    series = _series_from_payload(payload)
    horizon = int(payload.get("horizon", 24) or 24)
    if len(series) < 5:
        return {"error": "数据不足（至少需要 5 个点）"}

    diffs = [series[i] - series[i - 1] for i in range(1, len(series))]
    if len(diffs) < 4:
        return {"error": "差分后数据不足"}

    x = diffs[:-1]
    y = diffs[1:]
    denom = sum(v * v for v in x)
    phi = (sum(xi * yi for xi, yi in zip(x, y)) / denom) if denom != 0 else 0.0
    phi = max(-0.999, min(0.999, phi))

    last = series[-1]
    last_diff = diffs[-1]
    preds: List[float] = []
    for _ in range(max(1, horizon)):
        next_diff = phi * last_diff
        next_val = last + next_diff
        preds.append(next_val)
        last = next_val
        last_diff = next_diff

    current = series[-1]
    future = preds[-1]
    trend = "上升" if future > current else "下降" if future < current else "持平"
    return {
        "current": round(current, 6),
        "forecast_horizon": horizon,
        "forecast_last": round(future, 6),
        "trend": trend,
        "phi": round(phi, 6),
        "forecast_series": [round(p, 6) for p in preds],
    }


def model_linear_regression(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _xy_from_payload(payload)
    if len(x) < 3:
        return {"error": "回归数据不足（至少 3 对 x/y）"}

    n = len(x)
    sx = sum(x)
    sy = sum(y)
    sxx = sum(v * v for v in x)
    sxy = sum(xi * yi for xi, yi in zip(x, y))

    denom = n * sxx - sx * sx
    if denom == 0:
        return {"error": "X 方差为 0，无法回归"}
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n

    y_mean = sy / n
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    ss_res = sum((yi - (slope * xi + intercept)) ** 2 for xi, yi in zip(x, y))
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot != 0 else 1.0
    pred_x = _safe_float(payload.get("predict_x"))
    pred_y = (slope * pred_x + intercept) if pred_x is not None else None

    return {
        "slope": round(slope, 6),
        "intercept": round(intercept, 6),
        "r_squared": round(r2, 6),
        "equation": f"y = {round(slope, 6)}x + {round(intercept, 6)}",
        "predict_x": pred_x,
        "predicted_y": round(pred_y, 6) if pred_y is not None else None,
    }


def model_bayesian_update(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Posterior = (Prior * Likelihood) / Evidence
    prior = _safe_float(payload.get("prior"))
    likelihood = _safe_float(payload.get("likelihood"))
    evidence = _safe_float(payload.get("evidence"))
    if prior is None:
        prior = 0.5
    if likelihood is None:
        likelihood = 0.5
    if evidence is None:
        # 简化：Evidence 用全概率近似 prior*likelihood + (1-prior)*(1-likelihood)
        evidence = prior * likelihood + (1 - prior) * (1 - likelihood)
    if evidence == 0:
        return {"error": "Evidence 为 0，无法更新"}
    posterior = (prior * likelihood) / evidence
    posterior = max(0.0, min(1.0, posterior))
    return {
        "prior": round(prior, 6),
        "likelihood": round(likelihood, 6),
        "evidence": round(evidence, 6),
        "posterior": round(posterior, 6),
        "delta": round(posterior - prior, 6),
    }


def model_sentiment(payload: Dict[str, Any]) -> Dict[str, Any]:
    buy = _safe_float(payload.get("buy_volume"))
    sell = _safe_float(payload.get("sell_volume"))
    if buy is None or sell is None:
        # 兼容传入 data=[buy,sell]
        xs = _series_from_payload(payload)
        if len(xs) >= 2:
            buy, sell = xs[0], xs[1]
    if buy is None or sell is None:
        return {"error": "需要 buy_volume/sell_volume（或 data=[buy,sell]）"}
    total = buy + sell
    score = (buy - sell) / total if total != 0 else 0.0
    label = "偏多" if score > 0.1 else "偏空" if score < -0.1 else "中性"
    return {
        "buy_volume": round(buy, 6),
        "sell_volume": round(sell, 6),
        "sentiment_score": round(score, 6),
        "label": label,
    }


def model_kmeans(payload: Dict[str, Any]) -> Dict[str, Any]:
    # 轻量 KMeans（欧氏距离，固定迭代次数）
    points = payload.get("points")
    k = int(payload.get("k", 3) or 3)
    if not isinstance(points, list) or len(points) < k:
        return {"error": "需要 points=[[...],[...]] 且数量 >= k"}
    pts: List[List[float]] = []
    for p in points:
        if not isinstance(p, list) or len(p) == 0:
            continue
        row = []
        ok = True
        for v in p:
            fv = _safe_float(v)
            if fv is None:
                ok = False
                break
            row.append(fv)
        if ok:
            pts.append(row)
    if len(pts) < k:
        return {"error": "points 中可用数值行不足"}

    dim = len(pts[0])
    for r in pts:
        if len(r) != dim:
            return {"error": "points 维度不一致"}

    # 初始化：取前 k 个点作为中心
    centers = [pts[i][:] for i in range(k)]
    iters = int(payload.get("max_iter", 15) or 15)

    def dist2(a: List[float], b: List[float]) -> float:
        return sum((ai - bi) ** 2 for ai, bi in zip(a, b))

    labels = [0 for _ in pts]
    for _ in range(max(1, iters)):
        # assign
        changed = False
        for i, p in enumerate(pts):
            best = 0
            best_d = dist2(p, centers[0])
            for ci in range(1, k):
                d = dist2(p, centers[ci])
                if d < best_d:
                    best_d = d
                    best = ci
            if labels[i] != best:
                labels[i] = best
                changed = True
        # update
        sums = [[0.0] * dim for _ in range(k)]
        cnts = [0] * k
        for p, lab in zip(pts, labels):
            cnts[lab] += 1
            for j in range(dim):
                sums[lab][j] += p[j]
        for ci in range(k):
            if cnts[ci] > 0:
                centers[ci] = [s / cnts[ci] for s in sums[ci]]
        if not changed:
            break

    cluster_sizes = [0] * k
    for lab in labels:
        cluster_sizes[lab] += 1
    return {
        "k": k,
        "centers": [[round(v, 6) for v in c] for c in centers],
        "labels": labels,
        "cluster_sizes": cluster_sizes,
    }


def model_garch(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    GARCH(1,1) 简化版（EWMA 波动率替代，保证无依赖可运行）：
    - 对 returns 计算指数加权方差作为“条件波动率”
    输出 volatility_score + 风险分层。
    """
    series = _series_from_payload(payload)
    if len(series) < 6:
        return {"error": "需要至少 6 个价格点用于波动率"}
    # returns
    rets = []
    for i in range(1, len(series)):
        prev = series[i - 1]
        cur = series[i]
        if prev == 0:
            continue
        rets.append((cur - prev) / prev)
    if len(rets) < 5:
        return {"error": "收益率点不足"}

    lam = _safe_float(payload.get("lambda"))
    if lam is None:
        lam = 0.94
    lam = max(0.5, min(0.99, lam))
    var = rets[0] * rets[0]
    cond_vol = []
    for r in rets[1:]:
        var = lam * var + (1 - lam) * (r * r)
        cond_vol.append(math.sqrt(max(var, 0.0)))
    v = cond_vol[-1] if cond_vol else 0.0
    # 简单打分
    score = min(100.0, max(0.0, v * 1000.0))
    level = "Low Risk" if score < 20 else "Medium Risk" if score < 50 else "High Risk"
    return {
        "volatility": round(v, 8),
        "volatility_score": round(score, 2),
        "risk_level": level,
        "lambda": round(lam, 4),
    }


def model_mispricing(payload: Dict[str, Any]) -> Dict[str, Any]:
    model_p = _safe_float(payload.get("model_probability"))
    market_p = _safe_float(payload.get("market_probability"))
    if model_p is None or market_p is None:
        return {"error": "需要 model_probability 与 market_probability（0-1）"}
    model_p = max(0.0, min(1.0, model_p))
    market_p = max(0.0, min(1.0, market_p))
    edge = model_p - market_p
    label = "YES 被低估（做多机会）" if edge > 0.03 else "NO 被低估（做空机会）" if edge < -0.03 else "接近公平定价"
    return {
        "model_probability": round(model_p, 6),
        "market_probability": round(market_p, 6),
        "edge": round(edge, 6),
        "label": label,
    }


def model_correlation(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = payload.get("series_a")
    b = payload.get("series_b")
    if not isinstance(a, list) or not isinstance(b, list):
        # 兼容 data_x/data_y
        x, y = _xy_from_payload(payload)
        a, b = x, y
    aa: List[float] = []
    bb: List[float] = []
    n = min(len(a), len(b))
    for i in range(n):
        va = _safe_float(a[i])
        vb = _safe_float(b[i])
        if va is None or vb is None:
            continue
        aa.append(va)
        bb.append(vb)
    if len(aa) < 5:
        return {"error": "相关性数据不足（至少 5 对点）"}
    ma = _mean(aa)
    mb = _mean(bb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(aa, bb)) / len(aa)
    sa = _std(aa)
    sb = _std(bb)
    corr = cov / (sa * sb) if sa != 0 and sb != 0 else 0.0
    corr = max(-1.0, min(1.0, corr))
    label = "高度相关" if abs(corr) >= 0.8 else "中度相关" if abs(corr) >= 0.4 else "弱相关"
    return {"correlation": round(corr, 6), "label": label}


MODEL_META = {
    "arima": {
        "name": "ARIMA 时间序列趋势预测",
        "intro": "用于预测市场价格/概率的未来走势（默认 24 步）。",
        "example_input": {"model": "arima", "data": [0.63, 0.64, 0.62, 0.66, 0.67], "horizon": 24},
        "suggestion": "适合用于短期趋势/拐点预警；预测结果应与成交量与事件信息结合解读。",
    },
    "linear_regression": {
        "name": "线性回归（因素影响）",
        "intro": "分析成交量/参与人数等因素对概率变化的影响，输出回归方程与 R²。",
        "example_input": {"model": "linear_regression", "data_x": [10, 20, 30], "data_y": [0.55, 0.60, 0.66]},
        "suggestion": "若 R² 很低，说明线性关系弱；可增加特征或改用非线性模型。",
    },
    "bayesian": {
        "name": "贝叶斯更新（概率更新）",
        "intro": "根据新信息对先验概率进行更新，输出 posterior 与变化量。",
        "example_input": {"model": "bayesian", "prior": 0.62, "likelihood": 0.75},
        "suggestion": "适合解释“新证据出现后概率为何上调/下调”。",
    },
    "sentiment": {
        "name": "市场情绪指标",
        "intro": "根据买卖量差计算情绪分数，输出偏多/偏空/中性。",
        "example_input": {"model": "sentiment", "buy_volume": 1200, "sell_volume": 800},
        "suggestion": "情绪指标适合做看板；可叠加价格动量过滤虚假情绪。",
    },
    "kmeans": {
        "name": "K-Means 聚类（市场/用户行为）",
        "intro": "对行为特征进行无监督聚类，输出簇中心与分配标签。",
        "example_input": {"model": "kmeans", "k": 3, "points": [[5, 100], [30, 200], [6, 120]]},
        "suggestion": "用于识别长期/短线/套利等群体；特征选择决定聚类质量。",
    },
    "garch": {
        "name": "GARCH 波动率（简化）",
        "intro": "用指数加权条件波动率近似 GARCH(1,1) 风险，输出风险等级。",
        "example_input": {"model": "garch", "data": [0.5, 0.52, 0.48, 0.55, 0.60, 0.58]},
        "suggestion": "适合风控与提示“高波动市场”；可用于调整保证金/限价策略。",
    },
    "mispricing": {
        "name": "定价偏差（Model vs Market）",
        "intro": "计算 Edge = ModelProbability - MarketProbability，提示潜在机会。",
        "example_input": {"model": "mispricing", "model_probability": 0.72, "market_probability": 0.63},
        "suggestion": "Edge 只是差值；还需考虑流动性、滑点与事件不确定性。",
    },
    "correlation": {
        "name": "皮尔逊相关性（市场关联）",
        "intro": "分析两个市场/序列的相关性，输出相关系数与相关强度。",
        "example_input": {"model": "correlation", "series_a": [0.5, 0.6, 0.55], "series_b": [0.2, 0.3, 0.28]},
        "suggestion": "相关性可用于发现相关市场与对冲组合；注意样本量与时序对齐。",
    },
}


def wrap(model: str, ok: bool, result: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = MODEL_META.get(model, {})
    return {
        "ok": ok,
        "model": model,
        "name": meta.get("name", model),
        "intro": meta.get("intro", ""),
        "suggestion": meta.get("suggestion", ""),
        "example_input": meta.get("example_input", {}),
        "result": result,
        "received": {"keys": sorted(list(payload.keys()))},
    }


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        model = str(payload.get("model") or "").strip()
        if not model:
            print(json.dumps({"ok": False, "error": "缺少 model"}))
            return

        if model == "arima":
            r = model_arima(payload)
        elif model == "linear_regression":
            r = model_linear_regression(payload)
        elif model == "bayesian":
            r = model_bayesian_update(payload)
        elif model == "sentiment":
            r = model_sentiment(payload)
        elif model == "kmeans":
            r = model_kmeans(payload)
        elif model == "garch":
            r = model_garch(payload)
        elif model == "mispricing":
            r = model_mispricing(payload)
        elif model == "correlation":
            r = model_correlation(payload)
        else:
            print(json.dumps({"ok": False, "error": "Unknown model type"}))
            return

        if isinstance(r, dict) and r.get("error"):
            print(json.dumps(wrap(model, False, r, payload)))
        else:
            print(json.dumps(wrap(model, True, r, payload)))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()
