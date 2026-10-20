"""
Scan SELURUH pasar lalu simpan ke docs/data/<pasar>.json untuk halaman screener.

Tahap 1 — scan semua ticker (universe.py): harga harian 6 tahun + dividen lewat
          yf.download massal (100 ticker per batch). Dari sini dihitung valuasi
          dividen dan indikator teknikal + histori 5 tahun (technicals.py), lalu
          RS rating 1–99 antar seluruh ticker.
Tahap 2 — pilih kandidat:
          dividen (valuation.py): lolos MoS → kategori yield → MoS terbesar
          growth  (technicals.py): RS rating, trend template, CAGR 3 th, momentum
          ditambah favorit (tickers_<pasar>.txt).
Tahap 3 — analisa lengkap kandidat: KPI fundamental (Yahoo) + berita (Google News);
          kandidat growth juga laporan keuangan tahunan (CAGR, margin, Piotroski).

Yang disimpan: semua ticker yang cukup likuid (supaya mode Growth juga mencakup
saham tanpa dividen). Ticker sangat tidak likuid hanya dihitung jumlahnya.

Pakai:
  python fetch_data.py idx
  python fetch_data.py us
  python fetch_data.py us --limit 300           # uji cepat: 300 ticker pertama
  python fetch_data.py idx --detail 100         # jumlah kandidat per jenis
  python fetch_data.py us --no-news
"""

from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from technicals import compute_tech, growth_fundamentals, growth_prescore, rs_ratings
from valuation import MIN_LIQUIDITY, candidate_score

ROOT = Path(__file__).parent
MARKETS = {
    "idx": {"suffix": ".JK", "watch": ROOT / "tickers_idx.txt", "tz": timezone(timedelta(hours=7)), "tzname": "WIB",
            "currency": "IDR", "min_universe": 500, "store_liq": 5e7,
            "detail": {"stock": 200, "etf": 0}, "growth": {"stock": 200, "etf": 0}},
    "us": {"suffix": "", "watch": ROOT / "tickers_us.txt", "tz": timezone(timedelta(hours=-4)), "tzname": "ET",
           "currency": "USD", "min_universe": 5000, "store_liq": 1e5,
           "detail": {"stock": 200, "etf": 100}, "growth": {"stock": 250, "etf": 50}},
}
BATCH = 100
STALE_DAYS = 7


# ----------------------------------------------------------------------------
# Fungsi murni (tanpa internet) — gampang dites
# ----------------------------------------------------------------------------
def _num(x, digits: int = 4):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, digits)


def summarize_dividends(div: pd.Series, asof: pd.Timestamp) -> dict:
    """
      dps_ttm      total dividen 12 bulan terakhir
      dps_last_fy  total dividen tahun kalender terakhir yang sudah lewat
      dps_avg3     rata-rata dividen per tahun selama 36 bulan terakhir
      div_cagr3    pertumbuhan dividen tahunan 3 tahun (tahun lalu vs 3 th sebelumnya)
      div_years5   berapa dari 5 tahun kalender terakhir yang ada pembagian dividen
    """
    out = {"dps_ttm": 0.0, "dps_last_fy": 0.0, "dps_avg3": 0.0, "div_cagr3": None, "div_years5": 0}
    if div is None or len(div) == 0:
        return out
    div = div.copy()
    idx = pd.to_datetime(div.index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    div.index = idx
    asof = pd.Timestamp(asof)
    if asof.tzinfo is not None:
        asof = asof.tz_localize(None)
    div = div[(div.index <= asof) & (div > 0)]
    if div.empty:
        return out
    out["dps_ttm"] = _num(div[div.index > asof - pd.Timedelta(days=365)].sum(), 4)
    out["dps_avg3"] = _num(div[div.index > asof - pd.Timedelta(days=3 * 365)].sum() / 3, 4)
    last_fy = asof.year - 1
    by_year = div.groupby(div.index.year).sum()
    out["dps_last_fy"] = _num(by_year.get(last_fy, 0.0), 4)
    out["div_years5"] = int(sum(1 for y in range(last_fy - 4, last_fy + 1) if by_year.get(y, 0) > 0))
    start, end = by_year.get(last_fy - 3, 0.0), by_year.get(last_fy, 0.0)
    if start > 0 and end > 0:
        out["div_cagr3"] = _num((end / start) ** (1 / 3) - 1)
    return out


def summarize_prices(hist: pd.DataFrame) -> dict:
    """Close terakhir, perubahan %, tanggal, 52-week high/low, likuiditas 20 hari."""
    hist = hist.dropna(subset=["Close"])
    if hist.empty:
        raise ValueError("tidak ada data harga")
    close = float(hist["Close"].iloc[-1])
    prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else close
    year = hist.tail(252)
    out = {
        "close": _num(close, 4),
        "change_pct": _num(close / prev - 1) if prev else None,
        "price_date": pd.Timestamp(hist.index[-1]).strftime("%Y-%m-%d"),
        "high_52w": _num(year["High"].max(), 4) if "High" in year else None,
        "low_52w": _num(year["Low"].min(), 4) if "Low" in year else None,
        "liq": None,
    }
    if "Volume" in hist:
        out["liq"] = _num((hist["Close"] * hist["Volume"]).tail(20).mean(), 0)
    return out


def summarize_bulk(sub: pd.DataFrame) -> dict | None:
    """Satu ticker dari hasil yf.download(actions=True) → baris data. None kalau kosong."""
    if sub is None or "Close" not in sub:
        return None
    sub = sub.dropna(subset=["Close"])
    if sub.empty:
        return None
    row = summarize_prices(sub)
    div = sub["Dividends"] if "Dividends" in sub else pd.Series(dtype=float)
    row.update(summarize_dividends(div, pd.Timestamp(row["price_date"])))
    row.update(compute_tech(sub))
    return row


def split_download(df: pd.DataFrame, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Pecah hasil yf.download(group_by='ticker') per simbol (aman untuk 1 atau banyak simbol)."""
    if df is None or df.empty:
        return {}
    if isinstance(df.columns, pd.MultiIndex):
        lvl0 = set(df.columns.get_level_values(0))
        return {s: df[s] for s in symbols if s in lvl0}
    return {symbols[0]: df} if len(symbols) == 1 else {}


def _expense_ratio(info: dict):
    """Yahoo kadang memberi 0,0945 (persen) dan kadang 0,000945 (pecahan)."""
    v = _num(info.get("netExpenseRatio"), 6) or _num(info.get("annualReportExpenseRatio"), 6)
    if v is None:
        return None
    return _num(v / 100, 6) if v > 0.05 else v


def pick_fundamentals(info: dict) -> dict:
    der = _num(info.get("debtToEquity"))
    qt = (info.get("quoteType") or "").upper()
    out = {
        "name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": _num(info.get("marketCap"), 0),
        "roe": _num(info.get("returnOnEquity")),
        "margin": _num(info.get("profitMargins")),
        "rev_growth": _num(info.get("revenueGrowth")),
        "eps_growth": _num(info.get("earningsGrowth")),
        "current_ratio": _num(info.get("currentRatio")),
        "payout": _num(info.get("payoutRatio")),
        "der": _num(der / 100) if der is not None else None,
        "pe": _num(info.get("trailingPE"), 2),
        "pbv": _num(info.get("priceToBook"), 2),
        # untuk analisa growth
        "forward_pe": _num(info.get("forwardPE"), 2),
        "peg": _num(info.get("trailingPegRatio") or info.get("pegRatio"), 2),
        "ps": _num(info.get("priceToSalesTrailing12Months"), 2),
        "ev_ebitda": _num(info.get("enterpriseToEbitda"), 2),
        "gross_margin": _num(info.get("grossMargins")),
        "roa": _num(info.get("returnOnAssets")),
        "eq_growth": _num(info.get("earningsQuarterlyGrowth")),
        "target": _num(info.get("targetMeanPrice"), 4),
        "rec_mean": _num(info.get("recommendationMean"), 2),
        "analysts": info.get("numberOfAnalystOpinions"),
        "beta": _num(info.get("beta"), 2),
    }
    if qt:
        out["type"] = "etf" if qt == "ETF" else "stock"
    if qt == "ETF":
        out.update({
            "category": info.get("category"),
            "expense_ratio": _expense_ratio(info),
            "aum": _num(info.get("totalAssets"), 0),
            "ret3": _num(info.get("threeYearAverageReturn")),
            "ret5": _num(info.get("fiveYearAverageReturn")),
        })
    return out


def choose_candidates(rows: list[dict], market: str, watch: set[str], caps: dict) -> set[str]:
    """Favorit + kandidat teratas per jenis (saham/ETF) menurut candidate_score."""
    chosen = {r["ticker"] for r in rows if r["ticker"] in watch}
    for kind, cap in caps.items():
        scored = [(candidate_score(r, market), r["ticker"]) for r in rows if r.get("type", "stock") == kind]
        scored = sorted([x for x in scored if x[0] is not None], key=lambda x: (-x[0], x[1]))
        chosen.update(t for _, t in scored[:cap])
    return chosen


def choose_growth(rows: list[dict], caps: dict) -> set[str]:
    """Kandidat growth teratas per jenis menurut growth_prescore (likuid saja)."""
    chosen = set()
    for kind, cap in caps.items():
        scored = [(growth_prescore(r), r["ticker"]) for r in rows if r.get("type", "stock") == kind and r.get("liq_ok")]
        scored = sorted([x for x in scored if x[0] is not None], key=lambda x: (-x[0], x[1]))
        chosen.update(t for _, t in scored[:cap])
    return chosen


def compact(row: dict) -> dict:
    """Buang nilai kosong supaya file JSON kecil."""
    # kolom yang hanya dipakai saat scan (RS rating, trend template), tidak dibutuhkan halaman
    drop = {"warning", "liq_ok", "trend7", "sma150", "sma200_up", "mom12_1", "ret1m", "ret3m", "ret6m", "ret9m", "ret12m", "macd_slope"}

    def slim(v):
        if isinstance(v, float) and v != 0 and math.isfinite(v):
            return float(f"{v:.6g}")  # 6 angka penting cukup untuk harga & rasio
        return v
    return {k: slim(v) for k, v in row.items() if v is not None and v != "" and v != {} and k not in drop}


# ----------------------------------------------------------------------------
# Bagian yang butuh internet
# ----------------------------------------------------------------------------
def scan_prices(tickers: list[str], suffix: str) -> dict[str, dict]:
    import yfinance as yf

    out = {}
    for i in range(0, len(tickers), BATCH):
        chunk = tickers[i:i + BATCH]
        symbols = [t + suffix for t in chunk]
        for attempt in range(3):
            try:
                df = yf.download(symbols, period="6y", interval="1d", actions=True, auto_adjust=False,
                                 group_by="ticker", threads=True, progress=False)
                break
            except Exception as e:
                print(f"  batch {i // BATCH + 1} gagal ({e}), coba lagi", flush=True)
                time.sleep(10 * (attempt + 1))
        else:
            continue
        parts = split_download(df, symbols)
        for t, s in zip(chunk, symbols):
            try:
                row = summarize_bulk(parts.get(s))
                if row:
                    out[t] = row
            except Exception:
                pass
        print(f"  harga: {min(i + BATCH, len(tickers))}/{len(tickers)} ticker, {len(out)} ada data", flush=True)
        time.sleep(1.5)
    return out


def fetch_detail(code: str, suffix: str, market: str, kind: str, with_news: bool, statements: bool = False) -> dict:
    import yfinance as yf
    from news import fetch_news

    d = {"detail": True}
    tk = yf.Ticker(code + suffix)
    for attempt in range(3):
        try:
            d.update(pick_fundamentals(tk.info or {}))
            break
        except Exception as e:
            d["warning"] = str(e)
            time.sleep(3 * (attempt + 1))
    if statements and d.get("type", kind) != "etf":
        try:
            d.update(growth_fundamentals(tk.income_stmt, tk.balance_sheet, tk.cashflow))
        except Exception as e:
            d["warning"] = f"laporan keuangan: {e}"
    if with_news:
        try:
            d["news"] = fetch_news(code, d.get("name"), market, d.get("type", kind) == "etf")
        except Exception:
            d["news"] = []
    return d


def read_tickers(path: Path) -> list[str]:
    if not path.exists():
        return []
    codes = []
    for line in path.read_text().splitlines():
        line = line.split("#")[0].strip().upper()
        if line and line not in codes:
            codes.append(line)
    return codes


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in MARKETS:
        print(__doc__)
        return 2
    from universe import get_universe

    market, rest = argv[0], argv[1:]
    cfg = MARKETS[market]
    with_news = "--no-news" not in rest
    limit = int(rest[rest.index("--limit") + 1]) if "--limit" in rest else None
    caps, gcaps = dict(cfg["detail"]), dict(cfg["growth"])
    if "--detail" in rest:
        n = int(rest[rest.index("--detail") + 1])
        caps = {k: (n if v else 0) for k, v in caps.items()}
        gcaps = {k: (n if v else 0) for k, v in gcaps.items()}

    t0 = time.time()
    universe, src = get_universe(market, cfg["min_universe"])
    meta = {r["ticker"]: r for r in universe}
    watch = read_tickers(cfg["watch"])
    for w in watch:  # favorit selalu ikut walau tidak ada di daftar
        meta.setdefault(w, {"ticker": w, "name": "", "type": "stock"})
    tickers = list(meta)[:limit] if limit else list(meta)
    print(f"[1/3] Daftar ticker: {len(tickers)} dari {src}", flush=True)

    prices = scan_prices(tickers, cfg["suffix"])
    if not prices:
        print("Tidak ada harga yang berhasil diambil — file data tidak diubah.")
        return 1
    latest = max(r["price_date"] for r in prices.values())
    cutoff = (pd.Timestamp(latest) - pd.Timedelta(days=STALE_DAYS)).strftime("%Y-%m-%d")
    active, stale = [], 0
    for t, r in prices.items():
        if r["price_date"] < cutoff:  # suspensi / delisting / tidak aktif
            stale += 1
            continue
        active.append({"ticker": t, "name": meta[t].get("name"), "type": meta[t].get("type") or "stock", **r, "detail": False})
    rs_ratings(active)  # RS dibandingkan dengan seluruh ticker aktif di pasar ini
    wset = set(watch)
    for r in active:
        r["liq_ok"] = (r.get("liq") or 0) >= MIN_LIQUIDITY[market]
    rows = [r for r in active if (r.get("liq") or 0) >= cfg["store_liq"] or r["ticker"] in wset]
    payers = [r for r in rows if (r.get("dps_ttm") or 0) > 0 or (r.get("dps_avg3") or 0) > 0]
    print(f"[2/3] {len(prices)} ada harga, {stale} tidak aktif, {len(active) - len(rows)} sangat tidak likuid, "
          f"{len(rows)} disimpan, {len(payers)} membagikan dividen", flush=True)

    div_set = choose_candidates(payers, market, wset, caps)
    growth_set = choose_growth(rows, gcaps) | wset
    chosen = div_set | growth_set
    print(f"[3/3] Analisa lengkap {len(chosen)} kandidat ({len(div_set)} dividen, {len(growth_set)} growth)", flush=True)
    for i, r in enumerate([r for r in rows if r["ticker"] in chosen], 1):
        d = fetch_detail(r["ticker"], cfg["suffix"], market, r["type"], with_news, statements=r["ticker"] in growth_set)
        r.update({k: v for k, v in d.items() if v is not None and not (k == "name" and not v)})
        if i % 25 == 0:
            print(f"  detail {i}/{len(chosen)}", flush=True)
        time.sleep(0.5)

    payload = {
        "market": market,
        "currency": cfg["currency"],
        "generated_at": datetime.now(cfg["tz"]).strftime(f"%Y-%m-%d %H:%M {cfg['tzname']}"),
        "price_date": latest,
        "source": "Yahoo Finance (yfinance) · Google News",
        "universe_source": src,
        "counts": {"universe": len(tickers), "priced": len(prices), "stale": stale, "illiquid": len(active) - len(rows),
                   "stored": len(rows), "dividend": len(payers), "detail": len(chosen)},
        "is_demo": False,
        "stocks": [compact(r if r["detail"] else {k: v for k, v in r.items() if k not in ("spark", "yearly")})
                   for r in sorted(rows, key=lambda r: r["ticker"])],
    }
    out = ROOT / "docs" / "data" / f"{market}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"Tersimpan {out} ({out.stat().st_size / 1e6:.1f} MB, closing {latest}, {time.time() - t0:.0f} detik)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
