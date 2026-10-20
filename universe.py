"""
Daftar SELURUH ticker yang dipindai.

IDX  : semua saham di Bursa Efek Indonesia.
       1) Yahoo Finance screener (exchange JKT)  2) API daftar saham idx.co.id
       3) cadangan: data/universe_idx.csv dari run sukses terakhir
US   : semua saham + ETF di NYSE, Nasdaq, NYSE American, NYSE Arca, Cboe.
       1) NasdaqTrader Symbol Directory (resmi, ada kolom ETF)
       2) mirror GitHub datasets/nasdaq-listings & nyse-other-listings
       3) cadangan: data/universe_us.csv dari run sukses terakhir
       Warrant, right, unit, saham preferen, obligasi, dan test issue dibuang.

Setiap run sukses menyimpan daftar ke data/universe_<pasar>.csv supaya
run berikutnya tetap jalan walau sumbernya sedang down.
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / "data"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
MIRROR_NASDAQ = "https://raw.githubusercontent.com/datasets/nasdaq-listings/main/data/nasdaq-listed.csv"
MIRROR_OTHER = "https://raw.githubusercontent.com/datasets/nyse-other-listings/main/data/other-listed.csv"
IDX_API = "https://www.idx.co.id/primary/StockData/GetSecuritiesStock?start=0&length=9999&code=&sector=&board=&language=id-id"

# bukan saham biasa / ETF
_SKIP_NAME = re.compile(
    r"\b(warrants?|rights?|units?|preferred|preference|depositary shares? representing|notes? due|debentures?|"
    r"subordinated|senior notes|trust preferred|contingent value|when issued)\b|\d+(\.\d+)?%",
    re.I,
)
_ETF_NAME = re.compile(r"\b(etf|etn|exchange[- ]traded|index fund|ishares|spdr|invesco qqq|proshares|direxion)\b", re.I)


def _get(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def clean_name(name: str) -> str:
    name = (name or "").strip().strip('"')
    name = re.split(r"\s+-\s+", name)[0]  # "Apple Inc. - Common Stock"
    name = re.sub(r"\s+(Common Stock|Ordinary Shares|Class [A-Z] (Common|Ordinary).*|Common Shares.*|Shares of Beneficial Interest)$", "", name, flags=re.I)
    return name.strip()


def yahoo_symbol(sym: str) -> str | None:
    """BRK.B → BRK-B; buang simbol preferen/warrant ($, ^, =, +, .W, .U, .R)."""
    sym = sym.strip().upper()
    if not sym or any(c in sym for c in "$^=+ "):
        return None
    if re.search(r"\.(W|WS|U|R|RT)$", sym):
        return None
    return sym.replace(".", "-")


def parse_nasdaqtrader(nasdaq_txt: str, other_txt: str) -> list[dict]:
    """Gabungkan dua file pipe-delimited NasdaqTrader. Fungsi murni (mudah dites)."""
    out, seen = [], set()

    def add(sym, name, etf, test):
        y = yahoo_symbol(sym)
        if not y or test == "Y" or y in seen or (etf != "Y" and _SKIP_NAME.search(name or "")):
            return
        seen.add(y)
        out.append({"ticker": y, "name": clean_name(name), "type": "etf" if etf == "Y" else "stock"})

    for row in csv.DictReader(io.StringIO(nasdaq_txt), delimiter="|"):
        if (row.get("Symbol") or "").startswith("File Creation"):
            continue
        add(row.get("Symbol", ""), row.get("Security Name", ""), row.get("ETF", "N"), row.get("Test Issue", "N"))
    for row in csv.DictReader(io.StringIO(other_txt), delimiter="|"):
        if (row.get("ACT Symbol") or "").startswith("File Creation"):
            continue
        add(row.get("ACT Symbol", ""), row.get("Security Name", ""), row.get("ETF", "N"), row.get("Test Issue", "N"))
    return out


def parse_mirror(nasdaq_csv: str, other_csv: str) -> list[dict]:
    """Mirror GitHub: file Nasdaq tanpa kolom ETF → tebak dari nama (Yahoo memastikan nanti)."""
    out, seen = [], set()
    for row in csv.DictReader(io.StringIO(nasdaq_csv)):
        name = row.get("Security Name", "")
        y = yahoo_symbol(row.get("Symbol", ""))
        is_etf = bool(_ETF_NAME.search(name))
        if y and y not in seen and (is_etf or not _SKIP_NAME.search(name)):
            seen.add(y)
            out.append({"ticker": y, "name": clean_name(name), "type": "etf" if is_etf else "stock"})
    for row in csv.DictReader(io.StringIO(other_csv)):
        name = row.get("Security Name", "")
        y = yahoo_symbol(row.get("ACT Symbol", ""))
        is_etf = row.get("ETF") == "Y"
        if y and y not in seen and row.get("Test Issue") != "Y" and (is_etf or not _SKIP_NAME.search(name)):
            seen.add(y)
            out.append({"ticker": y, "name": clean_name(name), "type": "etf" if is_etf else "stock"})
    return out


def idx_from_yahoo() -> list[dict]:
    import yfinance as yf
    from yfinance import EquityQuery

    q = EquityQuery("eq", ["exchange", "JKT"])
    out, offset, total = [], 0, None
    while total is None or offset < total:
        res = yf.screen(q, offset=offset, size=250, sortField="ticker", sortAsc=True)
        quotes = res.get("quotes", [])
        total = res.get("total", len(quotes)) if total is None else total
        if not quotes:
            break
        for qt in quotes:
            sym = qt.get("symbol", "")
            if sym.endswith(".JK"):
                out.append({"ticker": sym[:-3], "name": qt.get("longName") or qt.get("shortName") or "", "type": "stock"})
        offset += len(quotes)
    return out


def idx_from_api() -> list[dict]:
    data = json.loads(_get(IDX_API))
    return [{"ticker": d["Code"].strip().upper(), "name": d.get("Name", "").strip(), "type": "stock"}
            for d in data.get("data", []) if d.get("Code")]


def _save(market: str, rows: list[dict]) -> None:
    CACHE.mkdir(exist_ok=True)
    with open(CACHE / f"universe_{market}.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ticker", "name", "type"])
        w.writeheader()
        w.writerows(rows)


def _load(market: str) -> list[dict]:
    p = CACHE / f"universe_{market}.csv"
    if not p.exists():
        return []
    with open(p) as f:
        return list(csv.DictReader(f))


def get_universe(market: str, min_size: int) -> tuple[list[dict], str]:
    """Kembalikan (daftar ticker, nama sumber). min_size mencegah daftar terpotong dianggap sukses."""
    if market == "idx":
        sources = [("Yahoo screener JKT", idx_from_yahoo), ("API idx.co.id", idx_from_api)]
    else:
        sources = [("NasdaqTrader", lambda: parse_nasdaqtrader(_get(NASDAQ_LISTED), _get(OTHER_LISTED))),
                   ("GitHub datasets mirror", lambda: parse_mirror(_get(MIRROR_NASDAQ), _get(MIRROR_OTHER)))]
    for label, fn in sources:
        try:
            rows = fn()
            if len(rows) >= min_size:
                _save(market, rows)
                return rows, label
            print(f"  {label}: hanya {len(rows)} ticker, coba sumber lain")
        except Exception as e:
            print(f"  {label} gagal: {e}")
    rows = _load(market)
    if rows:
        return rows, "cadangan data/universe_%s.csv" % market
    raise RuntimeError(f"Tidak ada sumber daftar ticker {market} yang berhasil")
