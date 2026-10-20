"""
Indikator teknikal & histori 5 tahun dari harga harian, untuk SEMUA ticker
(dihitung dari data yang sudah diunduh saat scan, tanpa permintaan tambahan).

  Tren       : MA50, MA150, MA200, MA200 naik/turun, trend template Minervini (8 syarat)
  Momentum   : return 1/3/6/9/12 bulan, momentum 12-1, RS rating 1–99 ala IBD
  Osilator   : RSI 14 (Wilder), MACD 12/26/9
  Risiko     : volatilitas tahunan, drawdown terdalam 1 & 5 tahun
  Histori    : CAGR 3 & 5 tahun, return per tahun kalender, jumlah tahun naik
  Grafik     : harga penutupan bulanan 5 tahun (hanya disimpan untuk kandidat)

Juga berisi fundamental growth dari laporan keuangan tahunan (CAGR pendapatan
& laba, tren margin, FCF, Piotroski F-Score) untuk kandidat growth.
Semua fungsi murni: input pandas, output dict angka; dites di tests/test_fetch.py.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd


def _r(x, d=4):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else round(v, d)


def _ret(c: pd.Series, n: int):
    return _r(c.iloc[-1] / c.iloc[-n - 1] - 1) if len(c) > n and c.iloc[-n - 1] > 0 else None


def rsi(c: pd.Series, n: int = 14):
    if len(c) <= n:
        return None
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    if dn.iloc[-1] == 0:
        return 100.0
    return _r(100 - 100 / (1 + up.iloc[-1] / dn.iloc[-1]), 1)


def macd(c: pd.Series):
    if len(c) < 35:
        return None, None
    line = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    hist = line - line.ewm(span=9, adjust=False).mean()
    # dinormalisasi terhadap harga supaya bisa dibandingkan antar saham
    return _r(hist.iloc[-1] / c.iloc[-1], 5), _r(hist.iloc[-1] - hist.iloc[-2], 6)


def max_drawdown(c: pd.Series):
    if len(c) < 2:
        return None
    return _r((c / c.cummax() - 1).min())


def cagr(c: pd.Series, years: int):
    n = 252 * years
    if len(c) <= n or c.iloc[-n - 1] <= 0:
        return None
    return _r((c.iloc[-1] / c.iloc[-n - 1]) ** (1 / years) - 1)


def compute_tech(hist: pd.DataFrame) -> dict:
    """Semua indikator dari DataFrame harian (Close wajib; High/Low/Volume opsional)."""
    c = hist["Close"].dropna()
    c = c[c > 0]
    out: dict = {}
    if len(c) < 30:
        return out
    last = float(c.iloc[-1])
    for n in (50, 150, 200):
        out[f"sma{n}"] = _r(c.tail(n).mean(), 4) if len(c) >= n else None
    sma200_prev = c.iloc[:-21].tail(200).mean() if len(c) >= 221 else None
    out["sma200_up"] = None if sma200_prev is None or out["sma200"] is None else bool(out["sma200"] > sma200_prev)
    for key, n in (("ret1m", 21), ("ret3m", 63), ("ret6m", 126), ("ret9m", 189), ("ret12m", 252)):
        out[key] = _ret(c, n)
    out["mom12_1"] = _r(c.iloc[-22] / c.iloc[-253] - 1) if len(c) > 253 else None
    out["rsi14"] = rsi(c)
    out["macd_hist"], out["macd_slope"] = macd(c)
    lr = np.log(c / c.shift(1)).dropna().tail(252)
    out["vol1y"] = _r(lr.std() * math.sqrt(252)) if len(lr) > 20 else None
    out["mdd1y"] = max_drawdown(c.tail(252))
    out["mdd5y"] = max_drawdown(c.tail(1260))
    out["cagr3"] = cagr(c, 3)
    out["cagr5"] = cagr(c, 5)

    # return per tahun kalender (5 tahun penuh terakhir)
    idx = pd.to_datetime(c.index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    cy = pd.Series(c.values, index=idx)
    year_end = cy.groupby(cy.index.year).last()
    last_year = idx[-1].year
    yearly = {}
    for y in range(last_year - 5, last_year):
        if y in year_end.index and (y - 1) in year_end.index:
            yearly[str(y)] = _r(year_end[y] / year_end[y - 1] - 1)
    out["yearly"] = yearly
    out["years_up"] = sum(1 for v in yearly.values() if v is not None and v > 0) if len(yearly) >= 3 else None
    out["years_n"] = len(yearly)

    # trend template Minervini: 7 syarat dari harga, syarat ke-8 (RS ≥ 70) ditambah setelah RS dihitung
    s50, s150, s200 = out["sma50"], out["sma150"], out["sma200"]
    hi = float(hist["High"].tail(252).max()) if "High" in hist else float(c.tail(252).max())
    lo = float(hist["Low"].tail(252).min()) if "Low" in hist else float(c.tail(252).min())
    if None not in (s50, s150, s200):
        conds = [last > s150 and last > s200, s150 > s200, bool(out["sma200_up"]), s50 > s150 and s50 > s200,
                 last > s50, lo > 0 and last >= 1.3 * lo, hi > 0 and last >= 0.75 * hi]
        out["trend7"] = int(sum(conds))
    else:
        out["trend7"] = None

    # grafik: penutupan akhir bulan 5 tahun terakhir
    monthly = cy.groupby([cy.index.year, cy.index.month]).last().tail(60)
    out["spark"] = [round(float(v), 4) for v in monthly.values]
    return out


def rs_ratings(rows: list[dict]) -> None:
    """
    RS rating 1–99 ala Investor's Business Daily: bobot 40% return 3 bln + 20% masing-masing
    6, 9, 12 bln, lalu diperingkat persentil di antara semua ticker pasar yang sama.
    Menambah 'rs' dan melengkapi 'trend' (8 syarat) di setiap baris.
    """
    scored = []
    for r in rows:
        parts = [r.get("ret3m"), r.get("ret6m"), r.get("ret9m"), r.get("ret12m")]
        if None in parts:
            continue
        scored.append((0.4 * parts[0] + 0.2 * parts[1] + 0.2 * parts[2] + 0.2 * parts[3], r))
    scored.sort(key=lambda x: x[0])
    n = len(scored)
    for i, (_, r) in enumerate(scored):
        r["rs"] = max(1, min(99, int(round((i + 1) / n * 99)))) if n > 1 else 50
    for r in rows:
        if r.get("trend7") is not None:
            r["trend"] = r["trend7"] + (1 if (r.get("rs") or 0) >= 70 else 0)


def growth_prescore(r: dict) -> float | None:
    """Skor awal pemilihan kandidat growth: RS, trend template, CAGR 3 th, momentum."""
    if r.get("rs") is None or r.get("trend") is None:
        return None
    c3 = max(-0.5, min(1.0, r.get("cagr3") or 0))
    return r["rs"] + r["trend"] * 6 + c3 * 40 + (10 if (r.get("ret6m") or 0) > 0 else 0)


# ----------------------------------------------------------------------------
# Fundamental growth dari laporan keuangan tahunan (yfinance income_stmt dll.)
# ----------------------------------------------------------------------------
def _row(df: pd.DataFrame | None, names: list[str]) -> list[float | None]:
    """Ambil satu baris laporan (kolom = tahun, terbaru dulu). Nama baris Yahoo bervariasi."""
    if df is None or df.empty:
        return []
    for n in names:
        if n in df.index:
            vals = pd.to_numeric(df.loc[n], errors="coerce")
            if isinstance(vals, pd.DataFrame):
                vals = vals.iloc[0]
            cols = sorted(df.columns, reverse=True)
            return [None if pd.isna(vals.get(c)) else float(vals.get(c)) for c in cols]
    return []


def _cagr_list(v: list, years_max: int = 3):
    v = [x for x in v]
    for k in range(min(years_max, len(v) - 1), 0, -1):
        a, b = v[0], v[k]
        if a is not None and b is not None and a > 0 and b > 0:
            return _r((a / b) ** (1 / k) - 1), k
    return None, None


def piotroski(inc: pd.DataFrame | None, bal: pd.DataFrame | None, cf: pd.DataFrame | None) -> tuple[int | None, int]:
    """
    Piotroski F-Score (0–9) dari dua tahun buku terakhir. Kembalikan (skor, jumlah tes yang bisa
    dihitung). Skor None kalau kurang dari 6 tes bisa dihitung (misalnya bank, data tidak lengkap).
    """
    ni = _row(inc, ["Net Income", "Net Income Common Stockholders"])
    rev = _row(inc, ["Total Revenue", "Operating Revenue"])
    gp = _row(inc, ["Gross Profit"])
    ta = _row(bal, ["Total Assets"])
    ca = _row(bal, ["Current Assets"])
    cl = _row(bal, ["Current Liabilities"])
    ltd = _row(bal, ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"])
    sh = _row(bal, ["Ordinary Shares Number", "Share Issued"])
    cfo = _row(cf, ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"])

    def two(v):
        return (v[0], v[1]) if len(v) >= 2 and v[0] is not None and v[1] is not None else (None, None)

    tests = []
    n0, n1 = two(ni); a0, a1 = two(ta); c0 = cfo[0] if cfo else None
    if n0 is not None:
        tests.append(n0 > 0)
    if c0 is not None:
        tests.append(c0 > 0)
    if None not in (n0, n1, a0, a1) and a0 > 0 and a1 > 0:
        tests.append(n0 / a0 > n1 / a1)
    if c0 is not None and n0 is not None:
        tests.append(c0 > n0)
    d0, d1 = two(ltd)
    if None not in (d0, d1, a0, a1) and a0 > 0 and a1 > 0:
        tests.append(d0 / a0 <= d1 / a1)
    ca0, ca1 = two(ca); cl0, cl1 = two(cl)
    if None not in (ca0, ca1, cl0, cl1) and cl0 > 0 and cl1 > 0:
        tests.append(ca0 / cl0 > ca1 / cl1)
    s0, s1 = two(sh)
    if None not in (s0, s1):
        tests.append(s0 <= s1 * 1.005)
    g0, g1 = two(gp); r0, r1 = two(rev)
    if None not in (g0, g1, r0, r1) and r0 > 0 and r1 > 0:
        tests.append(g0 / r0 > g1 / r1)
    if None not in (r0, r1, a0, a1) and a0 > 0 and a1 > 0:
        tests.append(r0 / a0 > r1 / a1)
    if len(tests) < 6:
        return None, len(tests)
    return int(sum(tests)), len(tests)


def growth_fundamentals(inc: pd.DataFrame | None, bal: pd.DataFrame | None, cf: pd.DataFrame | None) -> dict:
    rev = _row(inc, ["Total Revenue", "Operating Revenue"])
    ni = _row(inc, ["Net Income", "Net Income Common Stockholders"])
    op = _row(inc, ["Operating Income", "EBIT"])
    eps = _row(inc, ["Diluted EPS", "Basic EPS"])
    fcf = _row(cf, ["Free Cash Flow"])
    out = {}
    out["rev_cagr3"], out["rev_years"] = _cagr_list(rev)
    out["ni_cagr3"], _ = _cagr_list(ni)
    out["eps_cagr3"], _ = _cagr_list(eps)
    margins = [o / r if o is not None and r else None for o, r in zip(op, rev)]
    out["op_margin"] = _r(margins[0]) if margins and margins[0] is not None else None
    old = next((m for m in reversed(margins[1:4]) if m is not None), None) if len(margins) > 1 else None
    out["op_margin_trend"] = _r(margins[0] - old) if out["op_margin"] is not None and old is not None else None
    out["fcf"] = _r(fcf[0], 0) if fcf and fcf[0] is not None else None
    out["fcf_margin"] = _r(fcf[0] / rev[0]) if fcf and rev and fcf[0] is not None and rev[0] else None
    out["fscore"], out["fscore_n"] = piotroski(inc, bal, cf)
    if out["fscore"] is None:
        out["fscore_n"] = None
    return {k: v for k, v in out.items() if v is not None}
