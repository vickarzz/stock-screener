"""
Versi Python dari docs/js/calc.js, dipakai saat scan untuk memilih kandidat
yang perlu dianalisa lengkap (fundamental + berita). Angkanya harus sama
dengan versi JS; tests/test_fetch.py mengeceknya.
"""

from __future__ import annotations

import math

DEFAULTS = {
    # preset default tiap pasar (sama dengan PRESETS di docs/js/app.js)
    "idx": {"r": 0.12, "g": 0.03, "g1": 0.08, "n": 5, "g2": 0.03, "mos": 0.20, "tiers": [0.06, 0.08, 0.10, 0.12]},
    "us": {"r": 0.08, "g": 0.035, "g1": 0.06, "n": 5, "g2": 0.035, "mos": 0.15, "tiers": [0.03, 0.04, 0.05, 0.06]},
}
MIN_LIQUIDITY = {"idx": 1e9, "us": 1e6}  # rata-rata nilai transaksi harian: Rp1 miliar / $1 juta
MAX_SANE_YIELD = 0.25                     # di atas ini biasanya dividen spesial atau data salah


def ddm_single(dps, r, g):
    return dps * (1 + g) / (r - g) if r > g else None


def ddm_double(dps, r, g1, n, g2):
    if not r > g2:
        return None
    pv, d = 0.0, dps
    for t in range(1, n + 1):
        d *= 1 + g1
        pv += d / (1 + r) ** t
    return pv + (d * (1 + g2) / (r - g2)) / (1 + r) ** n


def tick(p, market):
    if market == "us":
        return 0.01
    return 1 if p < 200 else 2 if p < 500 else 5 if p < 2000 else 10 if p < 5000 else 25


def floor_tick(p, market):
    if p is None or not math.isfinite(p) or p <= 0:
        return None
    t = tick(p, market)
    return round(math.floor(p / t + 1e-9) * t, 2)


def evaluate(close: float, dps: float, market: str, a: dict | None = None) -> dict:
    a = a or DEFAULTS[market]
    out = {"dps": dps, "yield": dps / close if close else 0.0, "fv": None, "max_price": None, "mos": None, "pass1": False, "tier": 0}
    if dps <= 0 or not close:
        return out
    fvs = [x for x in (ddm_single(dps, a["r"], a["g"]), ddm_double(dps, a["r"], a["g1"], a["n"], a["g2"])) if x is not None]
    if not fvs:
        return out
    fv = min(fvs)
    out["fv"] = fv
    out["max_price"] = floor_tick((1 - a["mos"]) * fv, market)
    out["mos"] = 1 - close / fv
    out["pass1"] = out["max_price"] is not None and close <= out["max_price"]
    out["tier"] = sum(1 for y in a["tiers"] if out["yield"] >= y - 1e-12)  # 0 = di bawah kategori pertama
    return out


def candidate_score(row: dict, market: str) -> float | None:
    """
    Skor awal untuk memilih kandidat analisa lengkap. None = tidak layak kandidat
    (tanpa dividen, tidak likuid, yield tidak wajar).
    Lolos MoS dulu, lalu kategori yield, lalu MoS terbesar.
    """
    dps = row.get("dps_ttm") or 0
    close = row.get("close") or 0
    if dps <= 0 or close <= 0:
        return None
    if (row.get("liq") or 0) < MIN_LIQUIDITY[market]:
        return None
    v = evaluate(close, dps, market)
    if v["yield"] > MAX_SANE_YIELD or v["fv"] is None:
        return None
    return (100 if v["pass1"] else 0) + v["tier"] * 10 + max(-1.0, min(1.0, v["mos"] or 0)) * 5
