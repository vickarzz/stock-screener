import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from technicals import (compute_tech, growth_fundamentals, growth_prescore, max_drawdown,  # noqa: E402
                        piotroski, rs_ratings, rsi)

DAYS = pd.bdate_range("2020-10-01", "2026-10-19")


def series(growth_per_year: float, noise: float = 0.0, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    daily = (1 + growth_per_year) ** (1 / 252) - 1
    r = daily + rng.normal(0, noise, len(DAYS))
    c = 100 * np.cumprod(1 + r)
    return pd.DataFrame({"Close": c, "High": c * 1.01, "Low": c * 0.99, "Volume": 1e6}, index=DAYS)


def test_uptrend():
    t = compute_tech(series(0.25))
    assert abs(t["cagr5"] - 0.25) < 0.01 and abs(t["cagr3"] - 0.25) < 0.01
    assert t["trend7"] == 6 and t["sma200_up"] is True  # +25%/th belum ≥30% di atas low 52 minggu
    assert compute_tech(series(0.40))["trend7"] == 7
    assert t["rsi14"] > 90  # naik terus tanpa koreksi
    assert t["mdd5y"] > -0.001 and t["years_up"] == 5 and len(t["spark"]) == 60
    assert t["macd_hist"] is not None


def test_downtrend():
    t = compute_tech(series(-0.3, 0.01, 2))
    assert t["trend7"] <= 2 and t["cagr5"] < 0 and t["mdd5y"] < -0.5 and t["years_up"] <= 1


def test_short_history():
    t = compute_tech(series(0.1).tail(100))
    assert t["sma200"] is None and t["cagr3"] is None and t["trend7"] is None and t["sma50"] is not None


def test_rsi_and_drawdown():
    c = pd.Series([10, 12, 9, 15, 6, 8], dtype=float)
    assert abs(max_drawdown(c) - (6 / 15 - 1)) < 1e-9
    assert rsi(pd.Series(np.linspace(1, 2, 50))) == 100.0


def test_rs_and_trend():
    rows = [{"ticker": str(i), "ret3m": i / 10, "ret6m": i / 10, "ret9m": i / 10, "ret12m": i / 10, "trend7": 7} for i in range(10)]
    rows.append({"ticker": "x", "ret3m": None, "trend7": 3})
    rs_ratings(rows)
    assert rows[0]["rs"] < rows[5]["rs"] < rows[9]["rs"] == 99
    assert rows[9]["trend"] == 8 and rows[0]["trend"] == 7 and "rs" not in rows[10] and rows[10]["trend"] == 3
    assert growth_prescore(rows[9]) > growth_prescore(rows[0]) and growth_prescore(rows[10]) is None


def _stmt(rows: dict) -> pd.DataFrame:
    cols = pd.to_datetime(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"])
    return pd.DataFrame(rows, index=cols).T


def test_growth_fundamentals_and_piotroski():
    inc = _stmt({"Total Revenue": [200, 160, 130, 100], "Net Income": [40, 30, 20, 10],
                 "Operating Income": [50, 36, 26, 18], "Gross Profit": [120, 90, 70, 50], "Diluted EPS": [4, 3, 2, 1]})
    bal = _stmt({"Total Assets": [400, 380, 350, 300], "Current Assets": [200, 170, 150, 120],
                 "Current Liabilities": [80, 80, 80, 80], "Long Term Debt": [50, 60, 70, 80],
                 "Ordinary Shares Number": [10, 10, 10, 10]})
    cf = _stmt({"Operating Cash Flow": [60, 45, 30, 20], "Free Cash Flow": [30, 20, 10, 5]})
    g = growth_fundamentals(inc, bal, cf)
    assert abs(g["rev_cagr3"] - (2 ** (1 / 3) - 1)) < 1e-4 and g["rev_years"] == 3
    assert abs(g["ni_cagr3"] - (4 ** (1 / 3) - 1)) < 1e-4
    assert abs(g["op_margin"] - 0.25) < 1e-9 and abs(g["op_margin_trend"] - (0.25 - 0.18)) < 1e-9
    assert g["fcf_margin"] == 0.15 and g["fscore"] == 9 and g["fscore_n"] == 9
    # bank: tanpa gross profit, current assets, dll → F-Score tidak dihitung
    bank_inc = _stmt({"Total Revenue": [100, 90, 80, 70], "Net Income": [20, 18, 16, 14]})
    assert piotroski(bank_inc, None, None) == (None, 1)
    assert growth_fundamentals(None, None, None) == {}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("OK", name)
