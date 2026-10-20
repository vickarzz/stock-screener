/* Analisa Growth: teknikal, histori 5 tahun, fundamental pertumbuhan, valuasi growth,
   kesehatan keuangan → skor 0–100, rekomendasi, rencana beli, ringkasan.
   Fungsi murni tanpa teks bahasa (kode + angka); dites oleh tests/test_growth.js. */
(function (root) {
  const isFinancial = s => /financial|bank|insurance|asuransi/i.test(`${s.sector || ""} ${s.industry || ""}`);
  const band = (good, ok, higher = true) => v =>
    higher ? (v >= good ? "good" : v >= ok ? "ok" : "bad") : (v <= good ? "good" : v <= ok ? "ok" : "bad");
  const POINTS = { good: 1, ok: 0.5, bad: 0 };
  const FPE = { idx: [12, 20], us: [20, 35] };

  // [kode, format, ambil nilai, nilai status]
  const GROUPS = {
    fund: { w: 35, checks: [
      ["rev_growth", "pct", s => s.rev_growth, band(0.20, 0.05)],
      ["eps_growth", "pct", s => s.eps_growth ?? s.eq_growth, band(0.20, 0)],
      ["rev_cagr3", "pct", s => s.rev_cagr3, band(0.15, 0.05)],
      ["ni_cagr3", "pct", s => s.ni_cagr3, band(0.15, 0)],
      ["op_margin_trend", "pp", s => s.op_margin_trend, band(0.02, -0.02)],
      ["roe", "pct", s => s.roe, band(0.15, 0.08)],
      ["rule40", "pct", s => (s.rev_growth != null && s.fcf_margin != null ? s.rev_growth + s.fcf_margin : null), band(0.40, 0.20)],
    ] },
    tech: { w: 25, checks: [
      ["above200", "pct", s => (s.sma200 ? s.close / s.sma200 - 1 : null), band(0, -0.05)],
      ["cross", "bool", s => (s.sma50 && s.sma200 ? (s.sma50 > s.sma200 ? 1 : 0) : null), v => (v ? "good" : "bad")],
      ["trend", "of8", s => s.trend, band(7, 5)],
      ["rs", "int", s => s.rs, band(80, 50)],
      ["macd", "bool", s => (s.macd_hist == null ? null : s.macd_hist > 0 ? 1 : 0), v => (v ? "good" : "bad")],
      ["rsi", "num", s => s.rsi14, v => (v >= 40 && v <= 70 ? "good" : (v >= 30 && v < 40) || (v > 70 && v <= 80) ? "ok" : "bad")],
      ["near_high", "pct", s => (s.high_52w ? s.close / s.high_52w - 1 : null), band(-0.15, -0.30)],
    ] },
    hist: { w: 15, checks: [
      ["cagr5", "pct", s => s.cagr5 ?? s.cagr3, band(0.15, 0.05)],
      ["years_up", "years", s => (s.years_n >= 3 ? s.years_up : null), v => (v >= 4 ? "good" : v >= 3 ? "ok" : "bad")],
      ["mdd5", "pct", s => s.mdd5y, band(-0.35, -0.55)],
      ["vol", "pct", s => s.vol1y, band(0.30, 0.50, false)],
    ] },
    val: { w: 15, checks: [
      ["peg", "x", s => s.peg, v => (v <= 0 ? "bad" : v <= 1 ? "good" : v <= 2 ? "ok" : "bad")],
      ["fpe", "x", (s, m) => s.forward_pe, null],
      ["ps", "x", s => s.ps, band(3, 8, false)],
      ["upside", "pct", s => (s.target && (s.analysts || 0) >= 3 ? s.target / s.close - 1 : null), band(0.15, 0)],
    ] },
    health: { w: 10, checks: [
      ["fscore", "of9", s => s.fscore, band(7, 5)],
      ["der", "x", s => (isFinancial(s) ? null : s.der), band(1, 2, false)],
      ["fcf", "bool", s => (s.fcf_margin == null ? null : s.fcf_margin > 0 ? 1 : 0), v => (v ? "good" : "bad")],
      ["current_ratio", "x", s => (isFinancial(s) ? null : s.current_ratio), band(1.5, 1)],
    ] },
  };
  // ETF: tanpa laporan keuangan; biaya & dana kelolaan masuk "kesehatan"
  const ETF_HEALTH = [
    ["expense", "pct2", s => s.expense_ratio, band(0.002, 0.006, false)],
    ["aum", "money", s => s.aum, band(1e9, 1e8)],
  ];

  const Growth = {
    /* skor per kelompok + skor gabungan (bobot dinormalisasi atas kelompok yang ada datanya) */
    score(s, market) {
      const etf = s.type === "etf", groups = {};
      for (const [g, def] of Object.entries(GROUPS)) {
        if (etf && (g === "fund" || g === "val")) continue;
        const list = etf && g === "health" ? ETF_HEALTH : def.checks;
        const checks = [];
        for (const [code, fmt, get, judge] of list) {
          const v = get(s, market);
          if (v == null || !isFinite(v)) continue;
          let status;
          if (code === "fpe") { const [a, b] = FPE[market] || FPE.idx; status = v <= 0 ? "bad" : v <= a ? "good" : v <= b ? "ok" : "bad"; }
          else status = judge(v);
          checks.push({ group: g, code, fmt, v, status });
        }
        const minN = g === "fund" ? 2 : 1;
        const sc = checks.length >= minN ? Math.round(checks.reduce((a, c) => a + POINTS[c.status], 0) / checks.length * 100) : null;
        groups[g] = { score: sc, checks, w: def.w };
      }
      const avail = Object.values(groups).filter(x => x.score != null);
      const wsum = avail.reduce((a, x) => a + x.w, 0);
      const total = wsum ? Math.round(avail.reduce((a, x) => a + x.score * x.w, 0) / wsum) : null;
      // tanpa fundamental (saham belum dianalisa lengkap) skor hanya teknikal+histori → "partial"
      const partial = !etf && (groups.fund?.score == null);
      const enough = (groups.tech?.score != null) && (etf || !partial);
      const grade = total == null ? "unknown" : total >= 70 ? "strong" : total >= 50 ? "fair" : "weak";
      return { etf, groups, total, grade, partial, enough };
    },

    trendState(s) {
      if (!s.sma50 || !s.sma200) return "unknown";
      if (s.close > s.sma200 && s.sma50 > s.sma200) return "up";
      if (s.close < s.sma200 && s.sma50 < s.sma200) return "down";
      return "side";
    },

    overbought(s) { return (s.rsi14 ?? 0) > 75 || (s.sma50 ? s.close > s.sma50 * 1.25 : false); },

    recommend(s, sc, news) {
      if (s.detail === false || !sc.enough || sc.total == null) {
        // hanya teknikal & histori: tidak pernah "beli"
        if (sc.total == null) return { code: "na", why: "noData" };
        return { code: sc.total >= 60 ? "watch" : "avoid", why: "noDetail" };
      }
      const tech = sc.groups.tech?.score ?? 0, ob = Growth.overbought(s), neg = news.mood === "neg";
      if (sc.total >= 70 && tech >= 50 && !ob && !neg) return { code: "buy", why: "" };
      if (sc.total >= 65 && (ob || tech < 50)) return { code: "wait", why: ob ? "overbought" : "techWeak" };
      if (neg && sc.total < 65) return { code: "avoid", why: "news" };
      if (sc.total >= 50) return { code: "watch", why: neg ? "news" : "score" };
      return { code: "avoid", why: "score" };
    },

    /* rencana: area beli dekat MA50 (support) atau di harga sekarang; batas rugi 8% di bawah area beli (aturan umum
       investor growth, mis. William O'Neil); target = rata-rata target harga analis kalau ada ≥3 analis */
    plan(s, rec, market, floorTick) {
      if (!s.sma50 || !s.close) return null;
      const ob = Growth.overbought(s);
      let lo, hi;
      if (ob || rec.code === "wait") { lo = s.sma50; hi = s.sma50 * 1.05; }
      else { hi = s.close; lo = Math.max(Math.min(s.sma50, s.close), s.close * 0.95); }
      if (hi < lo) [lo, hi] = [hi, lo];
      const stop = lo * 0.92;
      const target = s.target && (s.analysts || 0) >= 3 ? s.target : null;
      const f = x => (floorTick ? floorTick(x, market) : x);
      return { lo: f(lo), hi: f(hi), stop: f(stop), target, upside: target ? target / s.close - 1 : null, sma200: s.sma200 };
    },

    summary(s, sc, news, rec, plan) {
      const S = [];
      if (sc.total == null) { S.push({ k: "gs_nodata" }); return S; }
      S.push({ k: sc.partial ? "gs_headPartial" : "gs_head", p: { score: ["int", sc.total], grade: ["ggrade", sc.grade] } });
      const tr = Growth.trendState(s);
      if (tr !== "unknown") S.push({ k: "gs_trend_" + tr, p: { rs: ["int", s.rs ?? 50], sma200: ["money", s.sma200] } });
      if (s.cagr5 != null) S.push({ k: "gs_hist5", p: { cagr: ["pct", s.cagr5], mdd: ["pct0", s.mdd5y] } });
      else if (s.cagr3 != null) S.push({ k: "gs_hist3", p: { cagr: ["pct", s.cagr3], mdd: ["pct0", s.mdd5y ?? s.mdd1y] } });
      // CAGR & drawdown sudah disebut di kalimat histori, jangan diulang di daftar kekuatan/kelemahan
      const said = new Set(s.cagr5 != null || s.cagr3 != null ? ["cagr5", "mdd5"] : []);
      const all = Object.values(sc.groups).flatMap(g => g.checks).filter(c => !said.has(c.code));
      const order = ["rev_growth", "eps_growth", "rev_cagr3", "ni_cagr3", "rule40", "roe", "fscore", "op_margin_trend", "peg", "upside",
        "trend", "rs", "cagr5", "years_up", "fcf", "der", "mdd5", "near_high", "expense", "aum", "vol", "rsi", "macd", "cross", "above200", "fpe", "ps", "current_ratio"];
      const rank = c => { const i = order.indexOf(c.code); return i < 0 ? 99 : i; };
      const good = all.filter(c => c.status === "good").sort((a, b) => rank(a) - rank(b)).slice(0, 3);
      const bad = all.filter(c => c.status === "bad").sort((a, b) => rank(a) - rank(b)).slice(0, 2);
      if (good.length) S.push({ k: "gs_good", p: { list: ["gchecks", good] } });
      if (bad.length) S.push({ k: "gs_bad", p: { list: ["gchecks", bad] } });
      if ((s.rsi14 ?? 0) > 75) S.push({ k: "gs_hot", p: { rsi: ["int", Math.round(s.rsi14)] } });
      else if (s.rsi14 != null && s.rsi14 < 30) S.push({ k: "gs_cold", p: { rsi: ["int", Math.round(s.rsi14)] } });
      if (s.detail !== false && news.mood !== "none") S.push({ k: "sn", p: { n: ["int", news.n], pos: ["int", news.pos], neg: ["int", news.neg], mood: ["mood", news.mood] } });
      const P = plan ? { lo: ["money", plan.lo], hi: ["money", plan.hi], stop: ["money", plan.stop], tgt: ["money", plan.target], up: ["pct0", plan.upside], sma200: ["money", plan.sma200] } : {};
      const key = {
        buy: plan && plan.target ? "ga_buyT" : "ga_buy", wait: "ga_wait", watch: rec.why === "noDetail" ? "ga_watchNd" : "ga_watch",
        avoid: rec.why === "news" ? "ga_avoidNews" : rec.why === "noDetail" ? "ga_avoidNd" : "ga_avoid", na: "ga_na",
      }[rec.code];
      if (plan || rec.code === "avoid" || rec.code === "na") S.push({ k: key, p: P });
      return S;
    },

    /* skor peringkat Top 10 growth: skor gabungan + bonus berita */
    rankScore(sc, news) {
      if (sc.total == null) return 0;
      return Math.round(sc.total + ({ pos: 3, neg: -5 }[news.mood] || 0));
    },

    analyze(s, market, news, floorTick) {
      const sc = Growth.score(s, market);
      const rec = Growth.recommend(s, sc, news);
      const plan = Growth.plan(s, rec, market, floorTick);
      return { sc, rec, plan, rank: Growth.rankScore(sc, news), summary: Growth.summary(s, sc, news, rec, plan) };
    },

    /* filter mode growth; f.* kosong ("") = tidak dipakai */
    applyFilters(o, g, f) {
      const s = o.s, R = o.greasons = [];
      if (f.minScore !== "" && (g.sc.total == null || g.sc.total < f.minScore)) R.push({ code: "gScore", lim: f.minScore });
      if (f.minRev !== "" && !(s.rev_growth >= f.minRev)) R.push({ code: "gRev", lim: f.minRev, missing: s.rev_growth == null });
      if (f.minEps !== "" && !((s.eps_growth ?? s.eq_growth) >= f.minEps)) R.push({ code: "gEps", lim: f.minEps, missing: (s.eps_growth ?? s.eq_growth) == null });
      if (f.minRs !== "" && !(s.rs >= f.minRs)) R.push({ code: "gRs", lim: f.minRs });
      if (f.maxPeg !== "" && !(s.peg > 0 && s.peg <= f.maxPeg)) R.push({ code: "gPeg", lim: f.maxPeg, missing: s.peg == null });
      if (f.minF !== "" && !(s.fscore >= f.minF)) R.push({ code: "gF", lim: f.minF, missing: s.fscore == null });
      if (f.uptrend && Growth.trendState(s) !== "up") R.push({ code: "gTrend" });
      if (f.hideHot && Growth.overbought(s)) R.push({ code: "gHot" });
      o.gok = R.length === 0;
      return o;
    },

    /* Top N growth: lolos filter, sudah dianalisa lengkap, utamakan "beli", lalu "tunggu koreksi".
       ETF hanya ikut kalau diminta (filter jenis = ETF), karena "growth stock" pada dasarnya saham. */
    topList(rows, n = 10, includeEtf = false) {
      const ok = rows.filter(o => o.gok && o.common && o.s.detail !== false && o.g.sc.enough && (includeEtf || o.s.type !== "etf"));
      const by = code => ok.filter(o => o.g.rec.code === code).sort((x, y) => y.g.rank - x.g.rank);
      const buy = by("buy");
      return buy.length >= n ? buy.slice(0, n) : buy.concat(by("wait").slice(0, n - buy.length));
    },
  };

  if (typeof module !== "undefined") module.exports = Growth; else root.Growth = Growth;
})(this);
