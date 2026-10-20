// Tes logika valuasi & analisa: cocokkan dengan angka infografis dan aturan rekomendasi.
const assert = require("assert");
const Calc = require("../docs/js/calc.js");
const Analysis = require("../docs/js/analysis.js");
const near = (a, b, tol) => assert(Math.abs(a - b) <= tol, `${a} vs ${b}`);

const TIERS_IDX = Calc.parseTiers("6/8/10/12");
const A = { r: .12, g: .03, g1: .08, n: 5, g2: .03, mos: .2, dpsBasis: "ttm", fvMethod: "min", tiers: TIERS_IDX };

// --- valuasi (infografis) ---
near(Calc.ddmSingle(73, .12, .03), 835.4, 0.5);
const d = Calc.ddmDouble(73, .12, .08, 5, .03); assert(d > 1000 && d < 1050, d);
const p = Calc.evaluate({ ticker: "POWR", close: 700, dps_ttm: 73 }, A, "idx");
near(p.maxPriceRaw, 668.4, 0.5); assert.strictEqual(p.maxPrice, 665); // fraksi Rp5
assert(!p.pass1);
const pb = Calc.evaluate({ ticker: "PBID", close: 470, dps_ttm: 53 }, { ...A, fvMethod: "single" }, "idx");
assert.strictEqual(pb.status.code, "t10"); // yield 11,3% = Agresif
const sm = Calc.evaluate({ ticker: "SMSM", close: 1650, dps_ttm: 184 }, A, "idx");
near(sm.ladder[0].byYield, 3066.7, 0.5); near(sm.fv, 2105.8, 0.5);
assert.strictEqual(sm.maxPrice, 1680);
assert(sm.ladder[2].final === 1680 && sm.ladder[3].final === 1530);

// fraksi & parse ambang
assert.deepStrictEqual([199.9, 499, 1533.3, 2163, 5012].map(x => Calc.floorTick(x, "idx")), [199, 498, 1530, 2160, 5000]);
assert.strictEqual(Calc.floorTick(68.457, "us"), 68.45);
assert.strictEqual(Calc.floorTick(30, "us"), 30);
assert.strictEqual(Calc.parseTiers("3/4/5/6")[0].y, 0.03);
assert.strictEqual(Calc.parseTiers("6/5/7/8"), null); // harus naik
assert.strictEqual(Calc.evaluate({ close: 100, dps_ttm: 5 }, { ...A, r: .03 }, "idx").status.code, "invalid");
assert.strictEqual(Calc.evaluate({ close: 100, dps_ttm: 0 }, A, "idx").status.code, "noDiv");

// filter KPI
const F = { onlyPass: false, minCat: 0, minRoe: .15, maxDer: "", maxPayout: "", minYears: "", minGrowth: "", maxPe: "", dropMissing: false };
assert(Calc.applyFilters(Calc.evaluate({ close: 470, dps_ttm: 53, roe: null }, A, "idx"), F).ok);
assert(!Calc.applyFilters(Calc.evaluate({ close: 470, dps_ttm: 53, roe: null }, A, "idx"), { ...F, dropMissing: true }).ok);

// --- US: ambang yield 3/4/5/6, sen ---
const AUS = { ...A, r: .09, g: .03, g1: .06, tiers: Calc.parseTiers("3/4/5/6") };
const ko = Calc.evaluate({ ticker: "KO", close: 70, dps_ttm: 2.04 }, AUS, "us");
near(ko.fvS, 35.02, 0.01); assert.strictEqual(ko.status.code, "hold"); // DDM konservatif: KO $70 tergolong mahal
assert.strictEqual(ko.maxPrice, 28.01); // 0,8 × 35,02 dibulatkan ke sen
const koCheap = Calc.evaluate({ ticker: "KO", close: 25, dps_ttm: 2.04 }, AUS, "us");
assert.strictEqual(koCheap.status.code, "t12"); // yield 8,2% ≥ 6% = kategori tertinggi di AS

// --- fundamental ---
const strong = Analysis.fundamentals({ roe: .25, margin: .15, der: .3, eps_growth: .1, rev_growth: .08, payout: .6, div_years5: 5, div_cagr3: .07, current_ratio: 2, pe: 9 }, "idx");
assert.strictEqual(strong.grade, "strong"); assert.strictEqual(strong.score, 100);
assert.deepStrictEqual(strong.strengths.map(c => c.code), ["roe", "margin"]);
const weak = Analysis.fundamentals({ roe: .03, margin: -.02, der: 3, eps_growth: -.3, payout: 1.4, div_years5: 2 }, "idx");
assert.strictEqual(weak.grade, "weak");
const bank = Analysis.fundamentals({ sector: "Financial Services", roe: .2, der: 6, current_ratio: .2, pe: 9 }, "idx");
assert(!bank.checks.some(c => c.code === "der" || c.code === "current_ratio")); // DER bank diabaikan
assert.strictEqual(Analysis.fundamentals({ roe: .2 }, "idx").grade, "unknown"); // <3 data
const etf = Analysis.fundamentals({ type: "etf", expense_ratio: .0006, aum: 7e10, ret5: .11, ret3: .09, div_years5: 5, div_cagr3: .1 }, "us");
assert.strictEqual(etf.grade, "strong"); assert(etf.etf);
assert.strictEqual(Analysis.fundamentals({ pe: -4, roe: .1, margin: .05 }, "us").checks.find(c => c.code === "pe_neg").status, "bad");
assert.strictEqual(Analysis.fundamentals({ pe: 22, roe: .1, margin: .05 }, "us").checks.find(c => c.code === "pe").status, "ok");

// --- berita ---
const now = new Date("2026-10-20T09:00Z");
const nm = Analysis.newsMood([
  { title: "a", label: "pos", date: "2026-10-19T00:00Z" },
  { title: "b", label: "pos", date: "2026-10-18T00:00Z" },
  { title: "c", label: "neg", date: "2026-09-25T00:00Z" }], now); // lama: bobot 0,5
assert.strictEqual(nm.mood, "pos"); assert.strictEqual(nm.score, 1.5);
assert.strictEqual(Analysis.newsMood([{ title: "x", label: "neg", date: "2026-10-19T00:00Z" }], now).mood, "neg");
assert.strictEqual(Analysis.newsMood([], now).mood, "none");

// --- rekomendasi ---
const NEG = { mood: "neg" }, POS = { mood: "pos" }, NONE = { mood: "none" };
const cheap = Calc.evaluate({ close: 400, dps_ttm: 53 }, A, "idx"); assert(cheap.buyable);
assert.strictEqual(Analysis.recommend(cheap, strong, POS).code, "buy");
assert.deepStrictEqual(Analysis.recommend(cheap, weak, POS), { code: "careful", why: "fund" });
assert.deepStrictEqual(Analysis.recommend(cheap, strong, NEG), { code: "careful", why: "news" });
assert.strictEqual(Analysis.recommend(p, strong, NONE).code, "watch");
assert.deepStrictEqual(Analysis.recommend(p, weak, NONE), { code: "avoid", why: "fund" });
assert.strictEqual(Analysis.recommend(p, strong, NEG).code, "watch"); // fundamental kuat → tetap watchlist
assert.strictEqual(Analysis.recommend(Calc.evaluate({ close: 100, dps_ttm: 0 }, A, "idx"), strong, POS).code, "na");

// --- ringkasan berisi 4 bagian dan kunci yang dikenal ---
const full = Analysis.analyze({ ...cheap, s: { ...cheap.s, roe: .25, margin: .15, der: .3, news: [] } }, "idx", now);
const keys = full.summary.map(x => x.k);
assert(keys[0] === "sv_cheap" && keys.includes("sn_none") && keys[keys.length - 1].startsWith("sa_"));

console.log("Semua tes kalkulasi & analisa OK. POWR double =", d.toFixed(1), "| SMSM batas beli =", sm.maxPrice);

// --- skor peringkat & Top 10 ---
const mk = (t, close, dps, fundIn, news, detail) => {
  const o = Calc.applyFilters(Calc.evaluate({ ticker: t, close, dps_ttm: dps, detail, news, ...fundIn }, A, "idx"),
    { onlyPass: false, minCat: 0, minRoe: "", maxDer: "", maxPayout: "", minYears: "", minGrowth: "", maxPe: "", dropMissing: false });
  o.an = Analysis.analyze(o, "idx", now);
  return Analysis.applyAnalysisFilters(o, o.an, { kind: "all", minFund: "", news: "all", minLiq: "", hideOdd: true });
};
const FS = { roe: .25, margin: .15, der: .3, eps_growth: .1, rev_growth: .08, payout: .6, div_years5: 5 };
const FW = { roe: .03, margin: -.02, der: 3, eps_growth: -.3, payout: 1.4, div_years5: 2 };
const posNews = [{ title: "x", label: "pos", date: "2026-10-19T00:00Z" }];
const rows = [
  mk("A", 300, 53, FS, posNews),            // sangat murah, kuat → buy
  mk("B", 420, 53, FS, []),                 // murah, kuat → buy (skor lebih rendah)
  mk("C", 300, 53, FW, posNews),            // murah tapi lemah → careful
  mk("D", 300, 53, FS, posNews, false),     // belum dianalisa → bukan Top 10
  mk("E", 100, 53, FS, posNews),            // yield 53% → tidak wajar
  mk("F", 2000, 53, FS, posNews),           // mahal → watch
];
assert.strictEqual(rows[3].an.rec.why, "noDetail");
assert(!rows[4].ok && rows[4].reasons.some(r => r.code === "odd"));
assert(rows[0].an.rank > rows[1].an.rank);
assert.deepStrictEqual(Analysis.topList(rows, 10).map(o => o.s.ticker), ["A", "B", "C"]);
assert.deepStrictEqual(Analysis.topList(rows, 1).map(o => o.s.ticker), ["A"]);
console.log("Tes Top 10 OK.");
