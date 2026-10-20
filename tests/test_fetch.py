import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fetch_data import (choose_candidates, compact, pick_fundamentals, split_download,  # noqa: E402
                        summarize_bulk, summarize_dividends, summarize_prices)
from universe import clean_name, parse_nasdaqtrader, yahoo_symbol  # noqa: E402
from valuation import candidate_score, evaluate, floor_tick  # noqa: E402
from news import build_query, parse_rss  # noqa: E402
from sentiment import score_headline  # noqa: E402


def test_dividends():
    div = pd.Series(
        [50.0, 60.0, 30.0, 40.0, 80.0, 10.0],
        index=pd.to_datetime(
            ["2021-06-10", "2022-06-10", "2023-06-10", "2023-11-10", "2025-06-10", "2026-05-20"]
        ).tz_localize("Asia/Jakarta"),
    )
    s = summarize_dividends(div, pd.Timestamp("2026-10-19"))
    assert s["dps_ttm"] == 10.0
    assert s["dps_last_fy"] == 80.0
    assert s["div_years5"] == 4
    assert abs(s["dps_avg3"] - (40 + 80 + 10) / 3) < 0.01
    assert abs(s["div_cagr3"] - ((80 / 60) ** (1 / 3) - 1)) < 1e-4


def test_no_dividends():
    s = summarize_dividends(pd.Series(dtype=float), pd.Timestamp("2026-10-19"))
    assert s["dps_ttm"] == 0.0 and s["div_cagr3"] is None


def test_prices():
    h = pd.DataFrame(
        {"Close": [100, 110, None], "High": [105, 120, 1], "Low": [95, 100, 1]},
        index=pd.to_datetime(["2026-10-16", "2026-10-19", "2026-10-20"]),
    )
    p = summarize_prices(h)
    assert p["close"] == 110 and p["price_date"] == "2026-10-19" and p["liq"] is None
    assert abs(p["change_pct"] - 0.1) < 1e-9


def test_bulk_split_and_summary():
    idx = pd.to_datetime(["2025-06-10", "2026-05-20", "2026-10-16", "2026-10-19"])
    cols = pd.MultiIndex.from_product([["AAA.JK", "BBB.JK"], ["Close", "High", "Low", "Volume", "Dividends"]])
    data = [[100, 101, 99, 1000, 0, 50, 51, 49, 10, 0],
            [100, 101, 99, 1000, 8, 50, 51, 49, 10, 0],
            [100, 101, 99, 1000, 0, None, None, None, None, None],
            [110, 111, 99, 2000, 0, None, None, None, None, None]]
    df = pd.DataFrame(data, index=idx, columns=cols)
    parts = split_download(df, ["AAA.JK", "BBB.JK", "CCC.JK"])
    assert set(parts) == {"AAA.JK", "BBB.JK"}
    a = summarize_bulk(parts["AAA.JK"])
    assert a["close"] == 110 and a["dps_ttm"] == 8 and a["price_date"] == "2026-10-19"
    assert a["liq"] == round((100 * 1000 * 3 + 110 * 2000) / 4)
    b = summarize_bulk(parts["BBB.JK"])
    assert b["price_date"] == "2026-05-20" and b["dps_ttm"] == 0  # data lama → nanti dibuang sebagai tidak aktif
    single = split_download(df["AAA.JK"], ["AAA.JK"])
    assert list(single) == ["AAA.JK"]


def test_valuation_matches_js():
    # angka yang sama dengan tests/test_calc.js
    v = evaluate(700, 73, "idx")
    assert abs(v["fv"] - 835.4) < 0.5 and v["max_price"] == 665 and not v["pass1"]
    assert floor_tick(1839.99999, "idx") == 1835 and floor_tick(184 / 0.10, "idx") == 1840
    assert floor_tick(68.457, "us") == 68.45
    pb = evaluate(470, 53, "idx", {"r": .12, "g": .03, "g1": .08, "n": 5, "g2": .03, "mos": .2, "tiers": [.06, .08, .1, .12]})
    assert pb["pass1"] and pb["tier"] == 3  # yield 11,3% = Agresif (kategori ke-3)


def test_candidates():
    rows = [
        {"ticker": "CHEAP", "close": 400, "dps_ttm": 53, "liq": 5e9, "type": "stock"},
        {"ticker": "EXP", "close": 2000, "dps_ttm": 53, "liq": 5e9, "type": "stock"},
        {"ticker": "ILLIQ", "close": 400, "dps_ttm": 53, "liq": 1e6, "type": "stock"},
        {"ticker": "ODD", "close": 100, "dps_ttm": 60, "liq": 5e9, "type": "stock"},  # yield 60%
        {"ticker": "FAV", "close": 9000, "dps_ttm": 1, "liq": 1, "type": "stock"},
    ]
    assert candidate_score(rows[2], "idx") is None and candidate_score(rows[3], "idx") is None
    assert candidate_score(rows[0], "idx") > candidate_score(rows[1], "idx")
    got = choose_candidates(rows, "idx", {"FAV"}, {"stock": 1, "etf": 0})
    assert got == {"CHEAP", "FAV"}
    assert compact({"a": 1, "b": None, "c": ""}) == {"a": 1}


def test_universe_parse():
    nasdaq = ("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n"
              "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\n"
              "QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N\n"
              "ZXZZT|NASDAQ TEST STOCK|G|Y|N|100|N|N\n"
              "ABCDW|Abcd Corp - Warrant|G|N|N|100|N|N\n"
              "File Creation Time: 1020202600:00|||||||\n")
    other = ("ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\n"
             "BRK.B|Berkshire Hathaway Inc. Class B Common Stock|N|BRK.B|N|100|N|BRK.B\n"
             "ABR$D|Arbor Realty Trust 6.375% Series D Preferred Stock|N|ABRpD|N|100|N|ABR-D\n"
             "PFFD|Global X U.S. Preferred ETF|P|PFFD|Y|100|N|PFFD\n"
             "KO|Coca-Cola Company (The) Common Stock|N|KO|N|100|N|KO\n")
    rows = {r["ticker"]: r for r in parse_nasdaqtrader(nasdaq, other)}
    assert set(rows) == {"AAPL", "QQQ", "BRK-B", "PFFD", "KO"}
    assert rows["QQQ"]["type"] == "etf" and rows["PFFD"]["type"] == "etf" and rows["AAPL"]["name"] == "Apple Inc."
    assert rows["KO"]["name"] == "Coca-Cola Company (The)"
    assert yahoo_symbol("AAC.U") is None and clean_name("Foo Corp Class A Common Stock") == "Foo Corp"


def test_fundamentals_stock():
    f = pick_fundamentals({"returnOnEquity": 0.2, "debtToEquity": 45.0, "trailingPE": float("nan"),
                           "profitMargins": 0.12, "revenueGrowth": -0.03, "quoteType": "EQUITY"})
    assert f["roe"] == 0.2 and f["der"] == 0.45 and f["pe"] is None
    assert f["margin"] == 0.12 and f["rev_growth"] == -0.03 and f["type"] == "stock"
    assert "expense_ratio" not in f


def test_fundamentals_etf():
    f = pick_fundamentals({"quoteType": "ETF", "netExpenseRatio": 0.06, "totalAssets": 7e10,
                           "fiveYearAverageReturn": 0.11})
    assert f["type"] == "etf" and abs(f["expense_ratio"] - 0.0006) < 1e-9  # 0,06% ditulis sebagai persen
    assert f["aum"] == 7e10 and f["ret5"] == 0.11
    f2 = pick_fundamentals({"quoteType": "ETF", "netExpenseRatio": 0.0035})
    assert f2["expense_ratio"] == 0.0035  # sudah pecahan


def test_sentiment_id():
    assert score_headline("Laba BBRI naik 12%, dividen jumbo menanti", "id")[1] == "pos"
    assert score_headline("Saham SMSM anjlok setelah laba turun", "id")[1] == "neg"
    s, lab, _ = score_headline("Laba turun tipis", "id")
    assert s == -2 and lab == "neg"  # "laba turun" dihitung sekali, bukan + "turun"
    assert score_headline("RUPS PBID digelar pekan depan", "id")[1] == "neu"
    assert score_headline("Bara api di pabrik", "id")[1] == "neu"  # "ara" tidak cocok di dalam kata


def test_sentiment_en():
    assert score_headline("Coca-Cola beats estimates, raises dividend", "en")[1] == "pos"
    assert score_headline("Verizon shares slide after guidance cut; lawsuit filed", "en")[1] == "neg"
    assert score_headline("Johnson & Johnson to present at conference", "en")[1] == "neu"


def test_parse_rss():
    xml = """<rss><channel>
      <item><title>Laba BBRI naik 12% - Kontan</title><source>Kontan</source>
        <link>https://news.google.com/a</link><pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate></item>
      <item><title>Laba BBRI naik 12% - Bisnis</title><source>Bisnis</source>
        <link>https://news.google.com/b</link><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate></item>
      <item><title>Saham BBRI melemah - CNBC</title><source>CNBC</source>
        <link>https://news.google.com/c</link><pubDate>Tue, 20 Oct 2026 02:00:00 GMT</pubDate></item>
      <item><title>Berita lama - X</title><source>X</source>
        <link>https://news.google.com/d</link><pubDate>Mon, 01 Jun 2026 02:00:00 GMT</pubDate></item>
    </channel></rss>"""
    items = parse_rss(xml, "id", datetime(2026, 10, 20, 9, tzinfo=timezone.utc))
    assert [i["title"] for i in items] == ["Saham BBRI melemah", "Laba BBRI naik 12%"]  # duplikat & lama dibuang
    assert items[0]["label"] == "neg" and items[1]["label"] == "pos" and items[1]["source"] == "Kontan"


def test_query():
    assert build_query("BBRI", "PT Bank Rakyat Indonesia (Persero) Tbk", "idx", False).endswith("saham")
    assert build_query("SCHD", None, "us", True) == '"SCHD" ETF'
    assert build_query("KO", None, "us", False) == '"KO" stock'


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("OK", name)
