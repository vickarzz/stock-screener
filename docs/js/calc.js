/* Valuasi dividen: DDM single/double, Margin of Safety, kategori yield, harga masuk.
   Fungsi murni tanpa teks bahasa; dites oleh tests/test_calc.js. */
(function (root) {
  const TIER_KEYS = ["6", "8", "10", "12"]; // kunci kategori (nama tetap, ambang bisa diubah per pasar)

  const Calc = {
    ddmSingle(dps, r, g) { return r > g ? dps * (1 + g) / (r - g) : null; },
    ddmDouble(dps, r, g1, n, g2) {
      if (!(r > g2)) return null;
      let pv = 0, d = dps;
      for (let t = 1; t <= n; t++) { d *= (1 + g1); pv += d / Math.pow(1 + r, t); }
      return pv + (d * (1 + g2) / (r - g2)) / Math.pow(1 + r, n);
    },
    /* fraksi harga: BEI Rp1/2/5/10/25; bursa AS $0,01 */
    tick(p, market) {
      if (market === "us") return 0.01;
      return p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25;
    },
    floorTick(p, market) {
      if (p == null || !isFinite(p) || p <= 0) return null;
      const t = Calc.tick(p, market);
      return Math.round(Math.floor(p / t + 1e-9) * t * 100) / 100; // epsilon: 184/0,10 = 1839,9999…
    },
    parseTiers(str) {
      const xs = String(str || "").split(/[\/;,\s]+/).map(x => parseFloat(x.replace(",", "."))).filter(x => x > 0);
      if (xs.length !== 4 || xs.some((x, i) => i && x <= xs[i - 1])) return null;
      return xs.map((y, i) => ({ y: y / 100, key: TIER_KEYS[i] }));
    },
    pickDps(s, basis) {
      const v = { ttm: s.dps_ttm, lastfy: s.dps_last_fy, avg3: s.dps_avg3 };
      if (basis === "min") { const xs = [v.ttm, v.lastfy, v.avg3].filter(x => x != null); return xs.length ? Math.min(...xs) : 0; }
      return v[basis] ?? 0;
    },
    /* a = {r,g,g1,n,g2,mos,dpsBasis,fvMethod,tiers}; market = "idx" | "us" */
    evaluate(s, a, market) {
      const o = { s, reasons: [] };
      o.dps = Calc.pickDps(s, a.dpsBasis);
      o.yield = s.close > 0 ? o.dps / s.close : 0;
      o.fvS = o.dps > 0 ? Calc.ddmSingle(o.dps, a.r, a.g) : null;
      o.fvD = o.dps > 0 ? Calc.ddmDouble(o.dps, a.r, a.g1, a.n, a.g2) : null;
      const both = [o.fvS, o.fvD].filter(x => x != null);
      o.fv = a.fvMethod === "single" ? o.fvS : a.fvMethod === "double" ? o.fvD
        : !both.length ? null : a.fvMethod === "avg" ? both.reduce((x, y) => x + y) / both.length : Math.min(...both);
      o.maxPriceRaw = o.fv != null ? (1 - a.mos) * o.fv : null;
      o.maxPrice = Calc.floorTick(o.maxPriceRaw, market);
      o.mosActual = o.fv ? 1 - s.close / o.fv : null;
      o.pass1 = o.maxPrice != null && s.close <= o.maxPrice;
      o.tiers = a.tiers;
      o.tier = [...a.tiers].reverse().find(t => o.yield >= t.y - 1e-12) || null;
      o.ladder = a.tiers.map(t => {
        const byYield = o.dps > 0 ? o.dps / t.y : null;
        const fin = byYield == null ? null : o.maxPriceRaw == null ? byYield : Math.min(byYield, o.maxPriceRaw);
        return { ...t, byYield, final: Calc.floorTick(fin, market) };
      });
      if (o.dps <= 0) o.status = { cls: "none", code: "noDiv" };
      else if (o.fv == null) o.status = { cls: "none", code: "invalid" };
      else if (!o.pass1) o.status = { cls: "hold", code: "hold" };
      else if (!o.tier) o.status = { cls: "hold", code: "holdYield" };
      else o.status = { cls: o.tier.key, code: "t" + o.tier.key };
      o.buyable = o.dps > 0 && o.pass1 && !!o.tier;
      return o;
    },
    /* filter KPI; f.* kosong ("") = tidak dipakai. Mengisi o.reasons dengan kode. */
    applyFilters(o, f) {
      const s = o.s, R = o.reasons;
      if (f.onlyPass && !o.pass1) R.push({ code: o.dps > 0 ? "aboveMos" : "noDiv" });
      if (f.minCat > 0 && o.yield < f.minCat - 1e-9) R.push({ code: "yieldBelow", v: o.yield, lim: f.minCat });
      const chk = (val, ok, code, lim) => {
        if (val == null) { if (f.dropMissing) R.push({ code, lim, missing: true }); }
        else if (!ok(val)) R.push({ code, lim });
      };
      if (f.minRoe !== "") chk(s.roe, v => v >= f.minRoe, "roe", f.minRoe);
      if (f.maxDer !== "") chk(s.der, v => v <= f.maxDer, "der", f.maxDer);
      if (f.maxPayout !== "") chk(s.payout, v => v <= f.maxPayout, "payout", f.maxPayout);
      if (f.minYears !== "") chk(s.div_years5, v => v >= f.minYears, "years", f.minYears);
      if (f.minGrowth !== "") chk(s.div_cagr3, v => v >= f.minGrowth, "growth", f.minGrowth);
      if (f.maxPe !== "") chk(s.pe, v => v > 0 && v <= f.maxPe, "pe", f.maxPe);
      o.ok = R.length === 0;
      return o;
    }
  };

  if (typeof module !== "undefined") module.exports = Calc; else root.Calc = Calc;
})(this);
