/* Analisa fundamental, mood berita, dan rekomendasi berbasis aturan.
   Fungsi murni tanpa teks bahasa: hasilnya kode + angka, diterjemahkan di app.js.
   Dites oleh tests/test_calc.js. */
(function (root) {
  const isFinancial = s => /financial|bank|insurance|asuransi/i.test(`${s.sector || ""} ${s.industry || ""}`);

  // [kode, tipe nilai, fungsi status] — urutan = prioritas saat memilih kekuatan/kelemahan
  const band = (good, ok, higherIsBetter = true) => v =>
    higherIsBetter ? (v >= good ? "good" : v >= ok ? "ok" : "bad") : (v <= good ? "good" : v <= ok ? "ok" : "bad");

  const STOCK_CHECKS = [
    ["roe", "pct", s => s.roe, band(0.15, 0.08)],
    ["margin", "pct", s => s.margin, band(0.10, 0.03)],
    ["der", "x", s => (isFinancial(s) ? null : s.der), band(1, 2, false)],
    ["eps_growth", "pct", s => s.eps_growth, band(0.05, -0.05)],
    ["rev_growth", "pct", s => s.rev_growth, band(0.05, 0)],
    ["payout", "pct", s => (s.payout > 0 ? s.payout : null), v => (v > 1 ? "bad" : v >= 0.2 && v <= 0.8 ? "good" : "ok")],
    ["div_years5", "years", s => s.div_years5, v => (v >= 5 ? "good" : v >= 3 ? "ok" : "bad")],
    ["div_cagr3", "pct", s => s.div_cagr3, band(0.03, 0)],
    ["current_ratio", "x", s => (isFinancial(s) ? null : s.current_ratio), band(1.5, 1)],
    ["pe", "x", s => s.pe, null], // ambang per pasar, lihat bawah
  ];
  const ETF_CHECKS = [
    ["expense", "pct2", s => s.expense_ratio, band(0.002, 0.006, false)],
    ["ret5", "pct", s => s.ret5, band(0.08, 0.03)],
    ["aum", "money", s => s.aum, band(1e9, 1e8)],
    ["ret3", "pct", s => s.ret3, band(0.08, 0.03)],
    ["div_years5", "years", s => s.div_years5, v => (v >= 5 ? "good" : v >= 3 ? "ok" : "bad")],
    ["div_cagr3", "pct", s => s.div_cagr3, band(0.03, 0)],
  ];
  const MAX_SANE_YIELD = 0.25; // di atas ini biasanya dividen spesial atau data salah
  const PE_BANDS = { idx: [10, 18], us: [18, 28] };
  const POINTS = { good: 1, ok: 0.5, bad: 0 };

  const Analysis = {
    isFinancial, MAX_SANE_YIELD,

    fundamentals(s, market) {
      const etf = s.type === "etf";
      const checks = [];
      for (const [code, fmt, get, judge] of etf ? ETF_CHECKS : STOCK_CHECKS) {
        const v = get(s);
        if (v == null || !isFinite(v)) continue;
        let status;
        if (code === "pe") {
          const [g, o] = PE_BANDS[market] || PE_BANDS.idx;
          status = v <= 0 ? "bad" : v <= g ? "good" : v <= o ? "ok" : "bad";
        } else status = judge(v);
        checks.push({ code: code === "pe" && v <= 0 ? "pe_neg" : code, fmt, v, status });
      }
      const n = checks.length;
      const score = n ? Math.round(checks.reduce((a, c) => a + POINTS[c.status], 0) / n * 100) : null;
      const grade = n < 3 ? "unknown" : score >= 70 ? "strong" : score >= 45 ? "fair" : "weak";
      return {
        etf, checks, n, score, grade,
        strengths: checks.filter(c => c.status === "good").slice(0, 2),
        weaknesses: checks.filter(c => c.status === "bad").slice(0, 2),
      };
    },

    /* berita ≤7 hari bobot 1, ≤30 hari bobot 0,5 */
    newsMood(news, now = new Date()) {
      const items = (news || []).filter(x => x && (x.title || x.demo));
      let pos = 0, neg = 0, neu = 0, score = 0;
      for (const it of items) {
        const age = it.date ? (now - new Date(it.date)) / 864e5 : 0;
        const w = age <= 7 ? 1 : 0.5;
        if (it.label === "pos") { pos++; score += w; }
        else if (it.label === "neg") { neg++; score -= w; }
        else neu++;
      }
      const mood = !items.length ? "none" : score >= 0.75 ? "pos" : score <= -0.75 ? "neg" : "neu";
      return { n: items.length, pos, neg, neu, score, mood };
    },

    /* gabungan valuasi + fundamental + berita → kode rekomendasi */
    recommend(o, fund, news) {
      if (o.dps <= 0 || o.fv == null) return { code: "na", why: o.dps <= 0 ? "noDiv" : "invalid" };
      if (o.s.detail === false) return o.buyable ? { code: "careful", why: "noDetail" } : { code: "watch", why: "noDetail" };
      const weak = fund.grade === "weak", newsNeg = news.mood === "neg";
      if (o.buyable) {
        if (weak) return { code: "careful", why: "fund" };
        if (newsNeg) return { code: "careful", why: "news" };
        return { code: "buy", why: fund.grade === "unknown" ? "noFund" : "" };
      }
      if (weak) return { code: "avoid", why: "fund" };
      if (newsNeg && fund.grade !== "strong") return { code: "avoid", why: "news" };
      return { code: "watch", why: o.pass1 ? "lowYield" : "price" };
    },

    /* kalimat ringkasan sebagai daftar {k: kunci teks, p: parameter} */
    summary(o, fund, news, rec) {
      const S = [], s = o.s;
      // 1. valuasi
      if (o.dps <= 0) S.push({ k: "sv_noDiv" });
      else if (o.fv == null) S.push({ k: "sv_invalid" });
      else if (o.buyable) S.push({ k: "sv_cheap", p: { close: ["money", s.close], fv: ["money", o.fv], mos: ["pct", o.mosActual], y: ["pct", o.yield], tier: ["tier", o.tier.key] } });
      else if (o.pass1) S.push({ k: "sv_lowYield", p: { close: ["money", s.close], y: ["pct", o.yield], t1: ["pct0", o.tiers[0].y] } });
      else S.push({ k: "sv_exp", p: { close: ["money", s.close], max: ["money", o.maxPrice], d: ["pct", 1 - (o.maxPrice || 0) / s.close] } });
      // 2. fundamental
      if (s.detail === false) S.push({ k: "sf_nd" });
      else if (fund.grade === "unknown") S.push({ k: fund.etf ? "sf_unknownEtf" : "sf_unknown" });
      else {
        S.push({ k: "sf_head", p: { grade: ["grade", fund.grade], score: ["int", fund.score] } });
        if (fund.strengths.length) S.push({ k: "sf_good", p: { list: ["checks", fund.strengths] } });
        if (fund.weaknesses.length) S.push({ k: "sf_bad", p: { list: ["checks", fund.weaknesses] } });
      }
      // 3. berita
      if (s.detail === false) { /* sudah dijelaskan di sf_nd */ }
      else if (news.mood === "none") S.push({ k: "sn_none" });
      else S.push({ k: "sn", p: { n: ["int", news.n], pos: ["int", news.pos], neg: ["int", news.neg], mood: ["mood", news.mood] } });
      // 4. strategi
      const cur = o.tier ? o.ladder.find(x => x.key === o.tier.key) : null;
      const next = o.ladder.find(x => x.final != null && x.final < s.close && (!cur || x.final < cur.final));
      const first = o.ladder[0] && o.ladder[0].final;
      const P = { entry: ["money", cur && cur.final], next: ["money", next && next.final], first: ["money", first] };
      const map = {
        buy: next ? "sa_buyNext" : "sa_buy",
        careful: rec.why === "news" ? "sa_carefulNews" : rec.why === "noDetail" ? "sa_carefulNoDetail" : "sa_carefulFund",
        watch: "sa_watch",
        avoid: rec.why === "news" ? "sa_avoidNews" : "sa_avoidFund",
        na: "sa_na",
      };
      S.push({ k: map[rec.code], p: P });
      return S;
    },

    /* skor gabungan 0–100: valuasi 40, fundamental 30, yield 20, berita 10 */
    rankScore(o, a) {
      const mos = Math.max(0, Math.min(0.5, o.mosActual ?? 0)) / 0.5 * 40;
      const tierIdx = o.tier ? o.tiers.findIndex(x => x.key === o.tier.key) + 1 : 0;
      const yld = tierIdx / o.tiers.length * 20;
      const fund = (a.fund.grade === "unknown" || o.s.detail === false ? 50 : a.fund.score) / 100 * 30;
      const news = { pos: 10, neg: 0 }[a.news.mood] ?? 5;
      return Math.round(mos + yld + fund + news);
    },

    /* Top N: hanya yang lolos filter, sudah dianalisa lengkap, dan yield wajar.
       Utamakan "Layak dicicil"; kalau kurang, isi dengan "Murah, cek dulu". */
    topList(rows, n = 10) {
      const ok = rows.filter(o => o.ok && o.s.detail !== false && o.an.fund.grade !== "unknown" && o.yield <= MAX_SANE_YIELD);
      const by = code => ok.filter(o => o.an.rec.code === code).sort((x, y) => y.an.rank - x.an.rank || (y.mosActual ?? 0) - (x.mosActual ?? 0));
      const buy = by("buy");
      return buy.length >= n ? buy.slice(0, n) : buy.concat(by("careful").slice(0, n - buy.length));
    },

    analyze(o, market, now) {
      const fund = Analysis.fundamentals(o.s, market);
      const news = Analysis.newsMood(o.s.news, now);
      const rec = Analysis.recommend(o, fund, news);
      const out = { fund, news, rec, summary: Analysis.summary(o, fund, news, rec) };
      out.rank = Analysis.rankScore(o, out);
      return out;
    },

    /* filter tambahan berbasis analisa */
    applyAnalysisFilters(o, a, f) {
      if (f.kind && f.kind !== "all" && (o.s.type || "stock") !== f.kind) o.reasons.push({ code: "kind", lim: f.kind });
      if (f.minFund === "fair" && !["fair", "strong"].includes(a.fund.grade)) o.reasons.push({ code: "fundBelow", lim: "fair" });
      if (f.minFund === "strong" && a.fund.grade !== "strong") o.reasons.push({ code: "fundBelow", lim: "strong" });
      if (f.news === "notNeg" && a.news.mood === "neg") o.reasons.push({ code: "newsNeg" });
      if (f.news === "pos" && a.news.mood !== "pos") o.reasons.push({ code: "newsNotPos" });
      if (f.minLiq !== "" && f.minLiq != null && o.s.liq != null && o.s.liq < f.minLiq) o.reasons.push({ code: "liq", lim: f.minLiq });
      if (f.hideOdd && o.yield > MAX_SANE_YIELD) o.reasons.push({ code: "odd", v: o.yield });
      o.ok = o.reasons.length === 0;
      return o;
    },
  };

  if (typeof module !== "undefined") module.exports = Analysis; else root.Analysis = Analysis;
})(this);
