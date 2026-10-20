/* Data contoh, dipakai kalau docs/data/<pasar>.json belum ada.
   IDX: DPS dari infografis (24 Mei 2025). Selain itu (harga, KPI, berita) hanya ilustrasi.
   Berita contoh sengaja tidak berisi klaim tentang perusahaan: hanya label posisi. */
(function () {
  /* Isi indikator teknikal & growth contoh dari beberapa angka kunci, supaya konsisten satu sama lain. */
  function T(s, g) {
    const n = 60, end = s.close, start = g.cagr5 != null ? end / Math.pow(1 + g.cagr5, 5) : end * 0.9;
    const spark = [];
    for (let i = 0; i < n; i++) {
      const base = start * Math.pow(end / start, i / (n - 1));
      spark.push(+(base * (1 + 0.06 * Math.sin(i * 0.9 + s.ticker.length) * (i < n - 1 ? 1 : 0))).toFixed(2));
    }
    const avg = k => spark.slice(-k).reduce((a, b) => a + b, 0) / k;
    const last12 = spark.slice(-12);
    const yearly = {};
    for (let y = 0; y < 5; y++) { const a = spark[y * 12 - 1] ?? spark[0], b = spark[y * 12 + 11]; yearly[String(2021 + y)] = +(b / a - 1).toFixed(4); }
    Object.assign(s, {
      spark, yearly, years_n: 5, years_up: Object.values(yearly).filter(v => v > 0).length,
      sma50: +(avg(3) * (g.hot ? 0.97 : 1)).toFixed(2), sma150: +avg(7).toFixed(2), sma200: +avg(10).toFixed(2),
      high_52w: +(Math.max(...last12) * 1.03).toFixed(2), low_52w: +(Math.min(...last12) * 0.97).toFixed(2),
      cagr3: g.cagr5 != null ? g.cagr5 * 0.9 : null, ret12m: g.cagr5,
    }, g);
    delete s.hot;
    return s;
  }
  const N = (...labels) => labels.map((label, i) => ({ demo: label, label, ageDays: [1, 3, 6, 12, 20][i] }));
  const DEMO = {
    idx: { is_demo: true, market: "idx", currency: "IDR", price_date: "2025-05-23", stocks: [
      { ticker: "SMSM", name: "Selamat Sempurna Tbk", sector: "Consumer Cyclical", close: 1650, prev_close: 1640, change_pct: .0061,
        dps_ttm: 184, dps_last_fy: 184, dps_avg3: 165, div_cagr3: .09, div_years5: 5,
        roe: .27, margin: .18, rev_growth: .06, eps_growth: .08, current_ratio: 3.1, der: .25, payout: .72, pe: 9.8, pbv: 2.6, news: N("pos", "neu", "pos") },
      { ticker: "PBID", name: "Panca Budi Idaman Tbk", sector: "Consumer Cyclical", close: 470, prev_close: 474, change_pct: -.0084,
        dps_ttm: 53, dps_last_fy: 53, dps_avg3: 48, div_cagr3: .06, div_years5: 5,
        roe: .16, margin: .09, rev_growth: .03, eps_growth: .02, current_ratio: 3.5, der: .3, payout: .65, pe: 8.2, pbv: 1.3, news: N("neu", "pos") },
      { ticker: "CLPI", name: "Colorpak Indonesia Tbk", sector: "Basic Materials", close: 1100, prev_close: 1100, change_pct: 0,
        dps_ttm: 170, dps_last_fy: 170, dps_avg3: 140, div_cagr3: .12, div_years5: 5,
        roe: .18, margin: .11, rev_growth: -.02, eps_growth: .04, current_ratio: 2.4, der: .4, payout: .7, pe: 6.4, pbv: 1.1, news: N("neg", "neg", "neu") },
      { ticker: "MSTI", name: "Mastersystem Infotama Tbk", sector: "Technology", close: 1450, prev_close: 1470, change_pct: -.0136,
        dps_ttm: 122, dps_last_fy: 122, dps_avg3: 110, div_cagr3: null, div_years5: 3,
        roe: .3, margin: .08, rev_growth: .12, eps_growth: .1, current_ratio: 1.6, der: .9, payout: .6, pe: 7.9, pbv: 2.2, news: N("pos", "pos", "neu", "pos") },
      { ticker: "AUTO", name: "Astra Otoparts Tbk", sector: "Consumer Cyclical", close: 2150, prev_close: 2130, change_pct: .0094,
        dps_ttm: 229, dps_last_fy: 229, dps_avg3: 180, div_cagr3: .25, div_years5: 5,
        roe: .13, margin: .1, rev_growth: .04, eps_growth: -.03, current_ratio: 1.8, der: .35, payout: .5, pe: 5.6, pbv: .8, news: N("neu", "neg", "pos") },
      { ticker: "POWR", name: "Cikarang Listrindo Tbk", sector: "Utilities", close: 700, prev_close: 705, change_pct: -.0071,
        dps_ttm: 73, dps_last_fy: 73, dps_avg3: 68, div_cagr3: .03, div_years5: 5,
        roe: .11, margin: .2, rev_growth: -.04, eps_growth: -.08, current_ratio: 2.2, der: null, payout: .85, pe: 9.1, pbv: 1, news: [] },
      { ticker: "DCII", name: "DCI Indonesia Tbk", sector: "Technology", close: 41000, prev_close: 40500, change_pct: .0123,
        dps_ttm: 0, dps_last_fy: 0, dps_avg3: 0, div_years5: 0,
        roe: .28, margin: .45, rev_growth: .32, eps_growth: .38, current_ratio: 1.4, der: .6, payout: 0, pe: 95, pbv: 25, news: N("pos", "pos", "neu") }
    ]},
    us: { is_demo: true, market: "us", currency: "USD", price_date: "2026-10-19", stocks: [
      { ticker: "KO", name: "The Coca-Cola Company", type: "stock", sector: "Consumer Defensive", close: 70.1, prev_close: 69.8, change_pct: .0043,
        dps_ttm: 2.04, dps_last_fy: 1.94, dps_avg3: 1.92, div_cagr3: .05, div_years5: 5,
        roe: .4, margin: .23, rev_growth: .03, eps_growth: .05, current_ratio: 1.0, der: 1.6, payout: .78, pe: 26, pbv: 10, news: N("pos", "neu") },
      { ticker: "JNJ", name: "Johnson & Johnson", type: "stock", sector: "Healthcare", close: 155.2, prev_close: 156, change_pct: -.0051,
        dps_ttm: 5.0, dps_last_fy: 4.91, dps_avg3: 4.75, div_cagr3: .055, div_years5: 5,
        roe: .2, margin: .2, rev_growth: .05, eps_growth: .1, current_ratio: 1.1, der: .5, payout: .5, pe: 17, pbv: 5.4, news: N("neg", "pos", "neu") },
      { ticker: "VZ", name: "Verizon Communications Inc.", type: "stock", sector: "Communication Services", close: 42.3, prev_close: 42.1, change_pct: .0048,
        dps_ttm: 2.7, dps_last_fy: 2.67, dps_avg3: 2.62, div_cagr3: .02, div_years5: 5,
        roe: .2, margin: .12, rev_growth: .01, eps_growth: 0, current_ratio: .7, der: 1.6, payout: .58, pe: 10, pbv: 1.8, news: N("neu", "neg") },
      { ticker: "MO", name: "Altria Group, Inc.", type: "stock", sector: "Consumer Defensive", close: 55.4, prev_close: 55, change_pct: .0073,
        dps_ttm: 4.08, dps_last_fy: 3.96, dps_avg3: 3.9, div_cagr3: .04, div_years5: 5,
        roe: null, margin: .45, rev_growth: -.02, eps_growth: -.06, current_ratio: .6, der: null, payout: .6, pe: 9, pbv: null, news: N("neg", "neg", "neu") },
      { ticker: "O", name: "Realty Income Corporation", type: "stock", sector: "Real Estate", close: 56.4, prev_close: 56.9, change_pct: -.0088,
        dps_ttm: 3.17, dps_last_fy: 3.13, dps_avg3: 3.05, div_cagr3: .03, div_years5: 5,
        roe: .02, margin: .1, rev_growth: .2, eps_growth: -.1, current_ratio: 1.3, der: .7, payout: 2.9, pe: 55, pbv: 1.3, news: N("pos", "neu", "neu") },
      { ticker: "SCHD", name: "Schwab U.S. Dividend Equity ETF", type: "etf", category: "Large Value", close: 27.3, prev_close: 27.2, change_pct: .0037,
        dps_ttm: 1.0, dps_last_fy: .99, dps_avg3: .93, div_cagr3: .1, div_years5: 5, expense_ratio: .0006, aum: 7e10, ret5: .11, ret3: .06, news: N("pos", "neu") },
      { ticker: "VYM", name: "Vanguard High Dividend Yield ETF", type: "etf", category: "Large Value", close: 135.6, prev_close: 135, change_pct: .0044,
        dps_ttm: 3.5, dps_last_fy: 3.4, dps_avg3: 3.25, div_cagr3: .06, div_years5: 5, expense_ratio: .0006, aum: 6e10, ret5: .12, ret3: .09, news: N("neu") },
      { ticker: "JEPI", name: "JPMorgan Equity Premium Income ETF", type: "etf", category: "Derivative Income", close: 57.1, prev_close: 57.3, change_pct: -.0035,
        dps_ttm: 4.6, dps_last_fy: 4.5, dps_avg3: 4.8, div_cagr3: -.05, div_years5: 5, expense_ratio: .0035, aum: 4e10, ret5: null, ret3: .07, news: N("neu", "pos") },
      { ticker: "NVDA", name: "NVIDIA Corporation", type: "stock", sector: "Technology", close: 180.2, prev_close: 178.4, change_pct: .0101,
        dps_ttm: .04, dps_last_fy: .04, dps_avg3: .03, div_cagr3: 0, div_years5: 5,
        roe: 1.0, margin: .52, rev_growth: .55, eps_growth: .6, current_ratio: 4, der: .1, payout: .01, pe: 50, pbv: 40, news: N("pos", "neu", "pos", "neg") },
      { ticker: "AMZN", name: "Amazon.com, Inc.", type: "stock", sector: "Consumer Cyclical", close: 220.5, prev_close: 221.9, change_pct: -.0063,
        dps_ttm: 0, dps_last_fy: 0, dps_avg3: 0, div_years5: 0,
        roe: .22, margin: .1, rev_growth: .11, eps_growth: .3, current_ratio: 1.1, der: .5, pe: 34, pbv: 7, news: N("neu", "pos") }
    ]}
  };
  // angka growth contoh per ticker (ilustrasi)
  const G = {
    SMSM: { cagr5: .14, rs: 72, trend: 6, rsi14: 58, macd_hist: .002, rev_cagr3: .08, ni_cagr3: .1, op_margin_trend: .01, fcf_margin: .12, peg: 1.1, forward_pe: 9, ps: 1.8, fscore: 7, mdd5y: -.25, vol1y: .24 },
    PBID: { cagr5: .06, rs: 45, trend: 4, rsi14: 48, macd_hist: -.001, rev_cagr3: .03, ni_cagr3: .02, op_margin_trend: -.01, fcf_margin: .08, peg: 2.1, forward_pe: 8, ps: .9, fscore: 6, mdd5y: -.3, vol1y: .22 },
    CLPI: { cagr5: .1, rs: 61, trend: 5, rsi14: 52, macd_hist: .001, rev_cagr3: .04, ni_cagr3: .09, op_margin_trend: 0, fcf_margin: .1, peg: .9, forward_pe: 6, ps: .7, fscore: 7, mdd5y: -.35, vol1y: .3 },
    MSTI: { cagr5: .25, rs: 88, trend: 8, rsi14: 66, macd_hist: .004, rev_cagr3: .2, ni_cagr3: .22, op_margin_trend: .02, fcf_margin: .1, peg: .7, forward_pe: 7, ps: 1.2, fscore: 7, mdd5y: -.3, vol1y: .35 },
    AUTO: { cagr5: .18, rs: 70, trend: 6, rsi14: 55, macd_hist: .001, rev_cagr3: .07, ni_cagr3: .15, op_margin_trend: .01, fcf_margin: .07, peg: .8, forward_pe: 5.5, ps: .6, fscore: 6, mdd5y: -.4, vol1y: .3 },
    POWR: { cagr5: .02, rs: 30, trend: 2, rsi14: 40, macd_hist: -.002, rev_cagr3: -.02, ni_cagr3: -.05, op_margin_trend: -.02, fcf_margin: .15, peg: 3, forward_pe: 10, ps: 1.5, fscore: 5, mdd5y: -.3, vol1y: .2 },
    DCII: { cagr5: .45, rs: 93, trend: 8, rsi14: 79, hot: true, macd_hist: .006, rev_cagr3: .3, ni_cagr3: .35, op_margin_trend: .03, fcf_margin: .2, peg: 2.6, forward_pe: 70, ps: 40, fscore: 7, mdd5y: -.45, vol1y: .5 },
    KO: { cagr5: .06, rs: 55, trend: 5, rsi14: 52, macd_hist: .001, rev_cagr3: .05, ni_cagr3: .07, op_margin_trend: .01, fcf_margin: .2, peg: 3.1, forward_pe: 22, ps: 6.5, target: 76, analysts: 20, fscore: 6, mdd5y: -.2, vol1y: .16 },
    JNJ: { cagr5: .04, rs: 48, trend: 4, rsi14: 47, macd_hist: -.001, rev_cagr3: .03, ni_cagr3: .02, op_margin_trend: 0, fcf_margin: .22, peg: 2.4, forward_pe: 15, ps: 4.2, target: 170, analysts: 18, fscore: 6, mdd5y: -.25, vol1y: .17 },
    VZ: { cagr5: 0, rs: 40, trend: 3, rsi14: 45, macd_hist: -.001, rev_cagr3: .01, ni_cagr3: -.04, op_margin_trend: -.01, fcf_margin: .14, peg: 3.5, forward_pe: 9, ps: 1.3, target: 47, analysts: 22, fscore: 5, mdd5y: -.4, vol1y: .2 },
    MO: { cagr5: .08, rs: 70, trend: 6, rsi14: 60, macd_hist: .002, rev_cagr3: -.01, ni_cagr3: .05, op_margin_trend: .02, fcf_margin: .42, peg: 2.9, forward_pe: 10, ps: 4.5, target: 58, analysts: 12, fscore: 6, mdd5y: -.3, vol1y: .2 },
    O: { cagr5: -.02, rs: 35, trend: 2, rsi14: 42, macd_hist: -.002, rev_cagr3: .25, ni_cagr3: -.05, op_margin_trend: -.03, fcf_margin: .6, peg: 4, forward_pe: 40, ps: 9.5, target: 62, analysts: 15, fscore: 5, mdd5y: -.35, vol1y: .22 },
    SCHD: { cagr5: .1, rs: 58, trend: 6, rsi14: 54, macd_hist: .001, mdd5y: -.2, vol1y: .15 },
    VYM: { cagr5: .11, rs: 64, trend: 7, rsi14: 57, macd_hist: .002, mdd5y: -.22, vol1y: .15 },
    JEPI: { cagr5: .05, rs: 50, trend: 5, rsi14: 50, macd_hist: 0, mdd5y: -.15, vol1y: .11 },
    NVDA: { cagr5: .7, rs: 95, trend: 8, rsi14: 64, macd_hist: .005, rev_cagr3: .8, ni_cagr3: 1.2, op_margin_trend: .1, fcf_margin: .45, peg: 1.0, forward_pe: 30, ps: 25, target: 220, analysts: 60, fscore: 8, mdd5y: -.66, vol1y: .5 },
    AMZN: { cagr5: .12, rs: 70, trend: 7, rsi14: 55, macd_hist: .002, rev_cagr3: .11, ni_cagr3: .5, op_margin_trend: .05, fcf_margin: .05, peg: 1.6, forward_pe: 32, ps: 3.4, target: 260, analysts: 60, fscore: 7, mdd5y: -.5, vol1y: .32 },
  };
  for (const m of ["idx", "us"]) for (const s of DEMO[m].stocks) if (G[s.ticker]) T(s, { ...G[s.ticker] });
  window.DEMO = DEMO;
})();
