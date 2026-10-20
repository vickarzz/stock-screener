// Tes analisa growth: skor kelompok, rekomendasi, rencana beli, filter, Top 10.
const assert = require("assert");
const Calc = require("../docs/js/calc.js");
const Growth = require("../docs/js/growth.js");

const NONE = { mood: "none", n: 0 }, NEG = { mood: "neg", n: 2, pos: 0, neg: 2 }, POS = { mood: "pos", n: 2, pos: 2, neg: 0 };
const great = {
  ticker: "GRW", type: "stock", detail: true, close: 100, sma50: 95, sma150: 85, sma200: 80, high_52w: 105, low_52w: 60,
  trend: 8, rs: 92, rsi14: 62, macd_hist: 0.004, cagr5: 0.28, cagr3: 0.3, years_n: 5, years_up: 5, mdd5y: -0.28, vol1y: 0.28,
  rev_growth: 0.32, eps_growth: 0.4, rev_cagr3: 0.25, ni_cagr3: 0.3, op_margin_trend: 0.04, roe: 0.25, fcf_margin: 0.18,
  peg: 0.9, forward_pe: 25, ps: 6, target: 125, analysts: 12, fscore: 8, der: 0.4, current_ratio: 2,
};

// skor & rekomendasi
const g = Growth.analyze(great, "us", NONE, Calc.floorTick);
assert.strictEqual(g.sc.grade, "strong"); assert(g.sc.total >= 85, g.sc.total);
assert.strictEqual(g.sc.groups.fund.score, 100);
assert.strictEqual(g.rec.code, "buy");
assert.strictEqual(Growth.trendState(great), "up");
assert.deepStrictEqual([g.plan.lo, g.plan.hi, g.plan.stop, g.plan.target], [95, 100, 87.4, 125]);
assert(Math.abs(g.plan.upside - 0.25) < 1e-9);
assert(g.summary.some(x => x.k === "ga_buyT") && g.summary[0].k === "gs_head");

// terlalu panas → tunggu koreksi, area beli dekat MA50
const hot = { ...great, rsi14: 82, close: 130 };
const gh = Growth.analyze(hot, "us", NONE, Calc.floorTick);
assert.deepStrictEqual(gh.rec, { code: "wait", why: "overbought" });
assert.deepStrictEqual([gh.plan.lo, gh.plan.hi], [95, 99.75]);
assert(gh.summary.some(x => x.k === "gs_hot"));

// berita negatif menahan "beli"
assert.notStrictEqual(Growth.analyze(great, "us", NEG).rec.code, "buy");

// belum dianalisa lengkap (tanpa fundamental) → tidak pernah "beli"
const techOnly = { ticker: "T", type: "stock", detail: false, close: 100, sma50: 95, sma150: 85, sma200: 80, high_52w: 105, trend: 8, rs: 95, rsi14: 60, macd_hist: 0.01, cagr5: 0.3, years_n: 5, years_up: 5, mdd5y: -0.2, vol1y: 0.25 };
const gt = Growth.analyze(techOnly, "us", NONE);
assert(gt.sc.partial && !gt.sc.enough); assert.deepStrictEqual(gt.rec, { code: "watch", why: "noDetail" });
assert.strictEqual(gt.summary[0].k, "gs_headPartial");

// lemah
const weak = { ...great, close: 50, sma50: 60, sma200: 75, trend: 1, rs: 10, macd_hist: -0.01, rsi14: 35, cagr5: -0.1, years_up: 1, mdd5y: -0.7, vol1y: 0.6,
  rev_growth: -0.1, eps_growth: -0.3, rev_cagr3: -0.05, ni_cagr3: -0.2, op_margin_trend: -0.05, roe: 0.02, fcf_margin: -0.05, peg: -1, fscore: 3, der: 3, current_ratio: 0.8, target: 45 };
const gw = Growth.analyze(weak, "us", NONE);
assert.strictEqual(gw.sc.grade, "weak"); assert.strictEqual(gw.rec.code, "avoid"); assert.strictEqual(Growth.trendState(weak), "down");

// bank: DER & current ratio tidak dinilai; ETF: tanpa kelompok fundamental & valuasi
const bank = Growth.score({ ...great, sector: "Financial Services", der: 8, current_ratio: 0.1 }, "idx");
assert(!bank.groups.health.checks.some(c => c.code === "der" || c.code === "current_ratio"));
const etf = Growth.score({ ...techOnly, type: "etf", detail: true, expense_ratio: 0.0005, aum: 5e10 }, "us");
assert(etf.etf && !etf.groups.fund && !etf.groups.val && etf.enough && etf.groups.health.score === 100);
// forward PE pakai ambang per pasar
const fpe = m => Growth.score({ ...great, forward_pe: 18 }, m).groups.val.checks.find(c => c.code === "fpe").status;
assert.strictEqual(fpe("us"), "good"); assert.strictEqual(fpe("idx"), "ok");

// filter
const F = { minScore: 70, minRev: 0.2, minEps: "", minRs: 80, maxPeg: 1.5, minF: 7, uptrend: true, hideHot: true };
const mk = (s, news = NONE) => { const o = { s, common: true }; o.g = Growth.analyze(s, "us", news); return Growth.applyFilters(o, o.g, F); };
assert(mk(great).gok);
assert(!mk(hot).gok && mk(hot).greasons.some(r => r.code === "gHot"));
assert(!mk({ ...great, peg: null }).gok && mk({ ...great, peg: null }).greasons[0].missing);

// Top 10
const rows = [mk(great, POS), mk({ ...great, ticker: "B", rs: 85 }), mk(hot), mk(weak), mk(techOnly)];
const F2 = { minScore: "", minRev: "", minEps: "", minRs: "", maxPeg: "", minF: "", uptrend: false, hideHot: false };
rows.forEach(o => Growth.applyFilters(o, o.g, F2));
assert.deepStrictEqual(Growth.topList(rows, 10).map(o => o.s.ticker), ["GRW", "B", "GRW"]); // 2 beli, lalu 1 "tunggu koreksi" (hot)
assert.strictEqual(Growth.topList(rows, 1)[0].g.rank, Growth.rankScore(rows[0].g.sc, POS));
const etfRow = mk({ ...techOnly, ticker: "ETF1", type: "etf", detail: true, expense_ratio: 0.0005, aum: 5e10 });
Growth.applyFilters(etfRow, etfRow.g, F2);
assert(!Growth.topList([etfRow], 10).length && Growth.topList([etfRow], 10, true).length === 1);
console.log("Tes growth OK. Skor contoh kuat =", g.sc.total, "| lemah =", gw.sc.total);
