/* Tampilan screener: pasar IDX/AS, mode Dividen/Growth, bahasa ID/EN, filter, Top 10, kartu analisa. */
(function () {
  const $ = id => document.getElementById(id);
  const I18N = window.I18N, Calc = window.Calc, Analysis = window.Analysis, Growth = window.Growth;

  /* ---------- preset dividen per pasar (minCat = indeks kategori, 0 = semua) ---------- */
  const F0 = { onlyPass: true, minCat: "1", minFund: "", hideOdd: true,
    minRoe: "", maxDer: "", maxPayout: "", minYears: "", minGrowth: "", maxPe: "", dropMissing: false };
  const PRESETS = {
    idx: {
      order: ["infografis", "ketat", "longgar"],
      infografis: { a: { r: 12, g: 3, g1: 8, n: 5, g2: 3, mos: .2, dpsBasis: "ttm", fvMethod: "min", tierStr: "6/8/10/12" }, f: { ...F0 } },
      ketat: { a: { r: 13, g: 3, g1: 6, n: 5, g2: 3, mos: .3, dpsBasis: "min", fvMethod: "min", tierStr: "6/8/10/12" },
               f: { ...F0, minCat: "2", minFund: "fair", minRoe: "0.15", maxDer: "1", maxPayout: "0.8", minYears: "5", minGrowth: "0" } },
      longgar: { a: { r: 11, g: 3, g1: 8, n: 5, g2: 3, mos: .15, dpsBasis: "ttm", fvMethod: "min", tierStr: "6/8/10/12" }, f: { ...F0, onlyPass: false, minCat: "0" } },
    },
    us: {
      order: ["us", "infografis", "ketat", "longgar"],
      us: { a: { r: 8, g: 3.5, g1: 6, n: 5, g2: 3.5, mos: .15, dpsBasis: "ttm", fvMethod: "min", tierStr: "3/4/5/6" }, f: { ...F0 } },
      infografis: { a: { r: 12, g: 3, g1: 8, n: 5, g2: 3, mos: .2, dpsBasis: "ttm", fvMethod: "min", tierStr: "6/8/10/12" }, f: { ...F0 } },
      ketat: { a: { r: 9, g: 3, g1: 5, n: 5, g2: 3, mos: .25, dpsBasis: "min", fvMethod: "min", tierStr: "3/4/5/6" },
               f: { ...F0, minCat: "2", minFund: "fair", minRoe: "0.15", maxPayout: "0.8", minYears: "5", minGrowth: "0" } },
      longgar: { a: { r: 8, g: 4, g1: 7, n: 5, g2: 4, mos: .1, dpsBasis: "ttm", fvMethod: "min", tierStr: "3/4/5/6" }, f: { ...F0, onlyPass: false, minCat: "0" } },
    },
  };
  /* ---------- preset growth (sama untuk kedua pasar) ---------- */
  const G0 = { gMinScore: "", gMinRev: "", gMinEps: "", gMinRs: "", gMaxPeg: "", gMinF: "", gUptrend: false, gHideHot: false };
  const GPRESETS = {
    order: ["seimbang", "momentum", "garp"],
    seimbang: { ...G0, gMinScore: "60", gUptrend: true },
    momentum: { ...G0, gMinRev: "0.2", gMinRs: "80", gUptrend: true },
    garp: { ...G0, gMinRev: "0.1", gMaxPeg: "1.5", gMinF: "5", gHideHot: true },
  };
  // likuiditas: default Rp1 M & $1 jt per hari; gaya longgar Rp100 jt & $100 rb
  const LIQ_OPTS = { idx: [1e8, 1e9, 1e10], us: [1e5, 1e6, 1e7] };
  const PE_OPTS = { idx: [8, 10, 15], us: [15, 20, 25] };
  const PAGE = 24;
  const SEARCH_EX = { idx: "BBRI", us: "KO" };
  const CTRL_DIV = ["r", "g", "g1", "n", "g2", "mos", "dpsBasis", "fvMethod", "tierStr", "onlyPass", "minCat", "minFund", "hideOdd",
    "minRoe", "maxDer", "maxPayout", "minYears", "minGrowth", "maxPe", "dropMissing"];
  const CTRL_GROWTH = Object.keys(G0);
  const CTRL_COMMON = ["kind", "newsF", "minLiq"];
  const COMMON_CODES = new Set(["kind", "liq", "newsNeg", "newsNotPos"]);
  const SORTS = { div: ["rec", "mos", "yield", "fund", "gap", "ticker"], growth: ["grec", "gscore", "rs", "rev", "cagr", "ticker"] };
  const SORT_LBL = { rec: "sRec", mos: "sMos", yield: "sYield", fund: "sFund", gap: "sGap", ticker: "sTicker",
    grec: "sRec", gscore: "gsScore", rs: "gsRs", rev: "gsRev", cagr: "gsCagr" };
  const REC_ORDER = { buy: 0, careful: 1, watch: 2, avoid: 3, na: 4 };
  const GREC_ORDER = { buy: 0, wait: 1, watch: 2, avoid: 3, na: 4 };

  let LANG = "id", MARKET = "idx", MODE = "div", TIERS = Calc.parseTiers("6/8/10/12");
  const PRESET = { div: "infografis", growth: "seimbang" }, SORT = { div: "rec", growth: "grec" };
  const DATA = {}, OPEN = new Set();
  let LAST = [], SHOWN = PAGE;

  /* ---------- format ---------- */
  const loc = () => (LANG === "id" ? "id-ID" : "en-US");
  const t = (k, p = {}) => String(I18N[LANG][k] ?? I18N.id[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (p[n] ?? ""));
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Intl.NumberFormat mahal dibuat; simpan per bahasa + opsi
  const NFC = new Map();
  const NF = (opts = {}) => { const k = loc() + JSON.stringify(opts); let f = NFC.get(k); if (!f) { f = new Intl.NumberFormat(loc(), opts); NFC.set(k, f); } return f; };
  const num = n => NF().format(Number(n));
  const money = (x, precise) => {
    if (x == null || !isFinite(x)) return "–";
    if (MARKET === "us") return "$" + NF({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
    return "Rp" + NF({ maximumFractionDigits: precise ? 2 : 0 }).format(x);
  };
  const compact = x => x == null ? "–" : NF({ style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(x);
  const pc = (x, d = 1) => x == null || !isFinite(x) ? "–" : NF({ minimumFractionDigits: d, maximumFractionDigits: d }).format(x * 100) + "%";
  const spc = (x, d = 1) => x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + pc(x, d);
  const xx = x => x == null || !isFinite(x) ? null : NF({ maximumFractionDigits: 2 }).format(x) + "×";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const joinList = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + t("and") + " " + xs[xs.length - 1];

  const checkVal = c => ({ pct: pc(c.v), pct2: pc(c.v, 2), x: xx(c.v), years: String(c.v), money: compact(c.v) }[c.fmt]);
  const checkText = c => t(`fc_${c.code}_${c.status}`, { v: checkVal(c) });
  const gcheckVal = c => ({
    pct: pc(c.v), pct2: pc(c.v, 2), x: xx(c.v), years: String(c.v), money: compact(c.v), int: String(Math.round(c.v)),
    num: NF({ maximumFractionDigits: 0 }).format(c.v), of8: String(c.v), of9: String(c.v), bool: "",
    pp: (c.v > 0 ? "+" : "") + NF({ maximumFractionDigits: 1 }).format(c.v * 100) + " " + t("ppUnit"),
  }[c.fmt]);
  const gcheckText = c => t(`gc_${c.code}_${c.status}`, { v: gcheckVal(c) });
  const fmtParam = ([type, v]) => ({
    money: () => money(v), pct: () => pc(v), pct0: () => pc(v, 0), int: () => String(v),
    tier: () => t("st_t" + v), grade: () => t("g_" + v).toLowerCase(), ggrade: () => t("g_" + v).toLowerCase(), mood: () => t("mood_" + v),
    checks: () => joinList(v.map(checkText)), gchecks: () => joinList(v.map(gcheckText)),
  }[type] || (() => String(v)))();
  const sentence = s => { const p = {}; for (const k in (s.p || {})) p[k] = fmtParam(s.p[k]); return t(s.k, p); };

  /* ---------- kontrol ---------- */
  const setVal = (id, v) => { const el = $(id); if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : String(v); };
  const getVal = id => { const el = $(id); return el.type === "checkbox" ? el.checked : el.value; };
  function buildOptions() {
    const cat = $("minCat"), keep = cat.value || "1";
    cat.innerHTML = `<option value="0">${t("all")}</option>` + TIERS.map((x, i) => `<option value="${i + 1}">${t("st_t" + x.key)} ≥${pc(x.y, x.y * 100 % 1 ? 1 : 0)}</option>`).join("");
    cat.value = keep;
    const pe = $("maxPe"), keepPe = pe.value;
    pe.innerHTML = `<option value="">${t("any")}</option>` + PE_OPTS[MARKET].map(v => `<option value="${v}">${v}×</option>`).join("");
    pe.value = PE_OPTS[MARKET].map(String).includes(keepPe) ? keepPe : "";
    $("kindField").hidden = MARKET !== "us";
    const liq = $("minLiq"), keepLiq = liq.value, cur = MARKET === "us" ? "USD" : "IDR";
    const fmtLiq = v => "≥ " + new Intl.NumberFormat(loc(), { style: "currency", currency: cur, notation: "compact", maximumFractionDigits: 0 }).format(v) + t("perDay");
    liq.innerHTML = `<option value="">${t("any")}</option>` + LIQ_OPTS[MARKET].map(v => `<option value="${v}">${fmtLiq(v)}</option>`).join("");
    liq.value = LIQ_OPTS[MARKET].map(String).includes(keepLiq) ? keepLiq : "";
    const order = MODE === "div" ? PRESETS[MARKET].order : GPRESETS.order;
    $("presets").innerHTML = order.concat("kustom").map(p =>
      `<button type="button" data-p="${p}" ${p === "kustom" ? "disabled" : ""} aria-pressed="${p === PRESET[MODE]}">${p === "kustom" ? t("p_kustom") : t((MODE === "div" ? "p_" : "gp_") + p)}</button>`).join("");
    const sort = $("sort");
    sort.innerHTML = SORTS[MODE].map(k => `<option value="${k}">${t(SORT_LBL[k])}</option>`).join("");
    sort.value = SORTS[MODE].includes(SORT[MODE]) ? SORT[MODE] : SORTS[MODE][0];
  }
  function setDivPreset(p) {
    const P = PRESETS[MARKET][p]; if (!P) return;
    const v = { ...P.a, ...P.f };
    for (const id of CTRL_DIV) setVal(id, v[id]);
    setVal("minLiq", LIQ_OPTS[MARKET][p === "longgar" ? 0 : 1]);
    tiersChanged();
  }
  function setGrowthPreset(p) {
    const P = GPRESETS[p]; if (!P) return;
    for (const id of CTRL_GROWTH) setVal(id, P[id]);
    setVal("minLiq", LIQ_OPTS[MARKET][1]);
  }
  function tiersChanged() {
    const parsed = Calc.parseTiers($("tierStr").value);
    $("tierStr").setAttribute("aria-invalid", String(!parsed));
    $("tiersHint").textContent = t(parsed ? "tiersHint" : "tiersBad");
    if (parsed) TIERS = parsed;
    buildOptions();
  }
  function readState() {
    const n = id => parseFloat($(id).value), opt = id => ($(id).value === "" ? "" : parseFloat($(id).value));
    const ci = parseInt($("minCat").value, 10) || 0;
    return {
      a: { r: n("r") / 100, g: n("g") / 100, g1: n("g1") / 100, n: Math.max(1, Math.round(n("n") || 1)), g2: n("g2") / 100,
           mos: n("mos"), dpsBasis: $("dpsBasis").value, fvMethod: $("fvMethod").value, tiers: TIERS },
      f: { onlyPass: $("onlyPass").checked, minCat: ci ? TIERS[ci - 1].y : 0, minRoe: opt("minRoe"), maxDer: opt("maxDer"),
           maxPayout: opt("maxPayout"), minYears: opt("minYears"), minGrowth: opt("minGrowth"), maxPe: opt("maxPe"),
           dropMissing: $("dropMissing").checked, kind: MARKET === "us" ? $("kind").value : "all",
           minFund: $("minFund").value, news: $("newsF").value, minLiq: opt("minLiq"), hideOdd: $("hideOdd").checked },
      g: { minScore: opt("gMinScore"), minRev: opt("gMinRev"), minEps: opt("gMinEps"), minRs: opt("gMinRs"), maxPeg: opt("gMaxPeg"),
           minF: opt("gMinF"), uptrend: $("gUptrend").checked, hideHot: $("gHideHot").checked },
    };
  }

  /* ---------- simpan per pasar ---------- */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tanpa storage tetap jalan */ } },
  };
  function save() {
    SORT[MODE] = $("sort").value;
    const o = { presetDiv: PRESET.div, presetGrowth: PRESET.growth, sortDiv: SORT.div, sortGrowth: SORT.growth, showAll: $("showAll").checked, v: {} };
    for (const id of CTRL_DIV.concat(CTRL_GROWTH, CTRL_COMMON)) o.v[id] = getVal(id);
    store.set("screener-v3-" + MARKET, o);
    store.set("screener-v3", { lang: LANG, market: MARKET, mode: MODE });
  }
  function restore() {
    PRESET.div = PRESETS[MARKET].order[0]; PRESET.growth = GPRESETS.order[0];
    setGrowthPreset(PRESET.growth); setDivPreset(PRESET.div);
    SORT.div = "rec"; SORT.growth = "grec";
    $("q").value = ""; $("showAll").checked = false;
    const o = store.get("screener-v3-" + MARKET);
    if (!o) { buildOptions(); return; }
    if (o.v.tierStr) { $("tierStr").value = o.v.tierStr; tiersChanged(); }
    for (const id in o.v) if ($(id)) setVal(id, o.v[id]);
    PRESET.div = o.presetDiv || "kustom"; PRESET.growth = o.presetGrowth || "kustom";
    SORT.div = o.sortDiv || "rec"; SORT.growth = o.sortGrowth || "grec";
    $("showAll").checked = !!o.showAll;
    buildOptions();
  }

  /* ---------- potongan kartu: dividen ---------- */
  function ruler(o) {
    if (o.fv == null) return "";
    const c = o.s.close, max = Math.max(o.fv, c, o.maxPrice || 0) * 1.12, pos = v => Math.min(100, v / max * 100).toFixed(1) + "%";
    return `<div class="ruler" role="img" aria-label="${esc(t("rulerAria", { c: money(c), m: money(o.maxPrice), f: money(o.fv) }))}">
      <div class="track"></div><div class="zone" style="width:${pos(o.maxPrice || 0)}"></div>
      <div class="fv" style="left:${pos(o.fv)}"></div><div class="px ${o.pass1 ? "in" : "out"}" style="left:${pos(c)}"></div></div>
      <div class="legend"><span><i style="background:var(--zone)"></i>${t("lgZone", { x: money(o.maxPrice) })}</span><span><i style="background:var(--fg);width:2px"></i>${t("lgFv", { x: money(o.fv) })}</span><span><i style="background:${o.pass1 ? "var(--accent)" : "var(--hold)"};border-radius:50%"></i>${t("lgPx", { x: money(c) })}</span></div>`;
  }
  function reasonText(r) {
    const lim = r.code === "der" || r.code === "pe" || r.code === "gPeg" ? xx(r.lim)
      : r.code === "years" || r.code === "gScore" || r.code === "gRs" || r.code === "gF" ? String(r.lim)
      : r.code === "kind" ? t(r.lim === "etf" ? "kEtf" : "kStock")
      : r.code === "fundBelow" ? t("g_" + r.lim)
      : r.code === "liq" ? new Intl.NumberFormat(loc(), { style: "currency", currency: MARKET === "us" ? "USD" : "IDR", notation: "compact", maximumFractionDigits: 0 }).format(r.lim) + t("perDay")
      : typeof r.lim === "number" ? pc(r.lim, 0) : "";
    const base = t("r_" + r.code, { v: pc(r.v), lim });
    return r.missing ? t("r_missing", { r: base }) : base;
  }
  const arrow = l => l === "pos" ? `<span class="arr up" aria-label="${t("news_up")}">▲</span>`
    : l === "neg" ? `<span class="arr down" aria-label="${t("news_down")}">▼</span>`
    : `<span class="arr flat" aria-label="${t("news_flat")}">●</span>`;
  function ago(d) {
    const days = Math.floor((Date.now() - new Date(d)) / 864e5);
    return days <= 0 ? t("today") : t("daysAgo", { n: days });
  }
  function newsList(s) {
    if (s.detail === false) return `<p class="muted">${t("newsNd")}</p>`;
    const items = s.news || [];
    if (!items.length) return `<p class="muted">${t("newsNone")}</p>`;
    return `<ul class="news">${items.map(n => {
      const title = n.demo ? t("demo_" + n.demo) : n.title;
      const head = n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : `<span>${esc(title)}</span>`;
      return `<li>${arrow(n.label)}<div>${head}<div class="meta">${esc(n.demo ? t("demoSrc") : n.source || "")} · ${ago(n.date)}</div></div></li>`;
    }).join("")}</ul><p class="note">${t("newsNote")}</p>`;
  }
  function fundList(o, a) {
    const f = a.fund;
    if (o.s.detail === false) return `<p class="muted">${t("sf_nd")}</p>`;
    if (!f.n) return `<p class="muted">${t("fundEmpty")}</p>`;
    const icon = { good: "✓", ok: "•", bad: "✗" };
    return `<ul class="checks">${f.checks.map(c => `<li class="ck-${c.status}"><span aria-hidden="true">${icon[c.status]}</span>${esc(cap(checkText(c)))}</li>`).join("")}</ul>` +
      (!f.etf && Analysis.isFinancial(o.s) ? `<p class="note">${t("fundBank")}</p>` : "");
  }
  function kpi(label, v) { return `<div class="stat"><div class="k">${label}</div><div class="v">${v ?? `<span class="miss">${t("miss")}</span>`}</div></div>`; }
  const det = (o, sec, summary, body) => {
    const key = o.s.ticker + ":" + sec;
    return `<details class="more" data-k="${esc(key)}" ${OPEN.has(key) ? "open" : ""}><summary>${summary}</summary><div class="more-body">${body}</div></details>`;
  };
  const newsBadge = nm => nm.n ? `<span class="nb"><span class="up">▲${nm.pos}</span> <span class="down">▼${nm.neg}</span></span>` : "";
  const closeStat = s => `<div class="stat"><div class="k">${t("kClose")}</div><div class="v">${money(s.close)} <span class="${s.change_pct > 0 ? "pos" : s.change_pct < 0 ? "neg" : ""}" style="font-size:12px">${s.change_pct == null ? "" : spc(s.change_pct)}</span></div></div>`;

  function divBlock(o) {
    const a = o.an, nm = a.news;
    const fundLabel = a.fund.grade === "unknown" ? t("g_unknown") : `${t("g_" + a.fund.grade)} ${a.fund.score}`;
    return `<div class="summary"><div class="lbl">${t("recHead")}</div><p>${a.summary.map(sentence).map(esc).join(" ")}</p>
        <div class="chips"><span class="pill c-${o.status.cls}">${t("valChip", { x: t("st_" + o.status.code) })}</span>
        <span class="pill g-${a.fund.grade}">${t("fundChip", { x: fundLabel })}</span>
        <span class="pill c-none">${t("newsChip")} ${nm.n ? newsBadge(nm) : "–"}</span></div></div>
      <div class="stats">${closeStat(o.s)}
        <div class="stat"><div class="k">${t("kYield")}</div><div class="v">${pc(o.yield)}</div></div>
        <div class="stat"><div class="k">${t("kDps")}</div><div class="v">${money(o.dps, true)}</div></div>
        <div class="stat"><div class="k">${t("kFv")}</div><div class="v">${money(o.fv)}</div></div>
        <div class="stat"><div class="k">${t("kMax")}</div><div class="v">${money(o.maxPrice)}</div></div>
        <div class="stat"><div class="k">${t("kMos")}</div><div class="v ${o.mosActual > 0 ? "pos" : "neg"}">${pc(o.mosActual)}</div></div>
      </div>${ruler(o)}`;
  }
  function divCalc(o) {
    const s = o.s;
    const ladder = o.ladder.map(x => `<tr class="${o.buyable && x.key === o.tier.key ? "hit" : ""}"><td>${t("st_t" + x.key)} ≥${pc(x.y, x.y * 100 % 1 ? 1 : 0)}</td><td class="num">${money(x.byYield)}</td><td class="num">${money(x.final)}</td></tr>`).join("");
    return `<div class="tbl-wrap"><table><thead><tr><th>${t("thCat")}</th><th>${t("thBy")}</th><th>${t("thEntry")}</th></tr></thead><tbody>${ladder}</tbody></table></div>
      <div class="kpis">${kpi("DDM single", money(o.fvS))}${kpi("DDM double", money(o.fvD))}${kpi(t("kDiv5"), s.div_years5 == null ? null : s.div_years5 + " / 5")}
      ${kpi(t("kGrowth"), s.div_cagr3 == null ? null : pc(s.div_cagr3))}${kpi(t("kPe"), xx(s.pe))}${kpi(t("kPbv"), xx(s.pbv))}</div>`;
  }

  /* ---------- potongan kartu: growth ---------- */
  function spark(s) {
    const v = s.spark;
    if (!v || v.length < 6) return "";
    const W = 300, H = 64, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const pts = v.map((y, i) => [i / (v.length - 1) * W, H - 4 - (y - lo) / span * (H - 8)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const up = v[v.length - 1] >= v[0], last = pts[pts.length - 1];
    const yr = s.price_date ? Number(s.price_date.slice(0, 4)) : null;
    const years = yr ? `<span>${yr - Math.round(v.length / 12)}</span><span>${yr}</span>` : "";
    return `<figure class="spark ${up ? "up" : "down"}"><figcaption>${t("sparkLbl")}</figcaption>
      <div class="spark-box" role="img" aria-label="${esc(t("sparkAria", { n: v.length, a: money(v[0]), b: money(v[v.length - 1]) }))}">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <path class="area" d="${d} L${W} ${H} L0 ${H} Z"></path><path class="line" d="${d}" vector-effect="non-scaling-stroke"></path></svg>
        <i class="dot" style="left:${(last[0] / W * 100).toFixed(1)}%;top:${(last[1] / H * 100).toFixed(1)}%"></i></div>
      <div class="spark-x">${years}</div></figure>`;
  }
  function range52(s) {
    const lo = s.low_52w, hi = s.high_52w;
    if (!lo || !hi || hi <= lo) return "";
    const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(1) + "%";
    const tick = (v, cls) => v && v >= lo && v <= hi ? `<i class="${cls}" style="left:${pos(v)}"></i>` : "";
    return `<div class="range" role="img" aria-label="${esc(t("rgAria", { lo: money(lo), hi: money(hi), c: money(s.close) }))}">
        <div class="track"></div>${tick(s.sma200, "ma200")}${tick(s.sma50, "ma50")}<div class="px ${Growth.trendState(s) === "down" ? "out" : "in"}" style="left:${pos(s.close)}"></div></div>
      <div class="legend"><span>${t("rgLo", { x: money(lo) })}</span><span><i class="lg-ma50"></i>${t("rgMa50", { x: money(s.sma50) })}</span>
        <span><i class="lg-ma200"></i>${t("rgMa200", { x: money(s.sma200) })}</span><span>${t("rgHi", { x: money(hi) })}</span></div>`;
  }
  function planBox(g) {
    const p = g.plan;
    if (!p || !["buy", "wait"].includes(g.rec.code)) return "";
    return `<div class="plan"><div class="lbl">${t("planH")}</div><div class="plan-grid">
      <div><small>${t("planZone")}</small><b>${money(p.lo)} – ${money(p.hi)}</b></div>
      <div><small>${t("planStop")}</small><b class="neg">${money(p.stop)}</b></div>
      ${p.target ? `<div><small>${t("planTgt")}</small><b>${money(p.target)} <span class="${p.upside >= 0 ? "pos" : "neg"}">${spc(p.upside, 0)}</span></b></div>` : ""}
      </div><p class="note">${t("planNote")}</p></div>`;
  }
  function growthBlock(o) {
    const s = o.s, g = o.g, nm = o.an.news, sc = g.sc, tr = Growth.trendState(s);
    const gl = sc.total == null ? t("g_unknown") : `${t("g_" + sc.grade)} ${sc.total}${sc.partial ? "*" : ""}`;
    return `<div class="summary"><div class="lbl">${t("recHead")}</div><p>${g.summary.map(sentence).map(esc).join(" ")}</p>
        <div class="chips"><span class="pill g-${sc.grade}">${t("gScoreChip", { x: gl })}</span>
        <span class="pill tr-${tr}">${t("trendChip", { x: t("tr_" + tr) })}</span>
        <span class="pill c-none">${t("newsChip")} ${nm.n && s.detail !== false ? newsBadge(nm) : "–"}</span></div></div>
      <div class="stats">${closeStat(s)}
        <div class="stat"><div class="k">${t("kGScore")}</div><div class="v">${sc.total ?? "–"}</div></div>
        <div class="stat"><div class="k">${t("kRs")}</div><div class="v">${s.rs ?? "–"}</div></div>
        <div class="stat"><div class="k">${t("kRevG")}</div><div class="v ${s.rev_growth > 0 ? "pos" : s.rev_growth < 0 ? "neg" : ""}">${spc(s.rev_growth)}</div></div>
        <div class="stat"><div class="k">${t("kCagr5")}</div><div class="v ${(s.cagr5 ?? s.cagr3) > 0 ? "pos" : "neg"}">${spc(s.cagr5 ?? s.cagr3)}</div></div>
        <div class="stat"><div class="k">${t("kRsi")}</div><div class="v">${s.rsi14 == null ? "–" : Math.round(s.rsi14)}</div></div>
      </div>${spark(s)}${range52(s)}${planBox(g)}`;
  }
  function growthDetails(o) {
    const s = o.s, sc = o.g.sc, icon = { good: "✓", ok: "•", bad: "✗" };
    const parts = ["fund", "tech", "hist", "val", "health"].filter(k => sc.groups[k]).map(k => {
      const G = sc.groups[k];
      const head = G.score == null ? t("gd_" + k) : t("gdScore", { g: t("gd_" + k), s: G.score });
      const list = G.checks.length ? `<ul class="checks">${G.checks.map(c => `<li class="ck-${c.status}"><span aria-hidden="true">${icon[c.status]}</span>${esc(cap(gcheckText(c)))}</li>`).join("")}</ul>`
        : `<p class="muted">${t(s.detail === false ? "gdNd" : "fundEmpty")}</p>`;
      const years = k === "hist" && s.yearly && Object.keys(s.yearly).length
        ? `<div class="years"><small>${t("yrLbl")}</small>${Object.entries(s.yearly).map(([y, v]) => `<span class="${v >= 0 ? "pos" : "neg"}">${y} ${spc(v, 0)}</span>`).join("")}</div>` : "";
      return `<div class="gsec"><h4>${head}</h4>${list}${years}</div>`;
    }).join("");
    return parts + (s.detail === false ? `<p class="note">${t("gdNd")}</p>` : "");
  }

  function card(o) {
    const s = o.s, a = o.an, g = o.g;
    const divPill = `<span class="rec rec-${a.rec.code}">${t("rec_" + a.rec.code)}</span>`;
    const gPill = `<span class="rec grec-${g.rec.code}">${t("grec_" + g.rec.code)}</span>`;
    const second = MODE === "div"
      ? `<span class="rec2">${t("md_growth")}: ${t("grec_" + g.rec.code)}</span>`
      : `<span class="rec2">${t("md_div")}: ${o.dps > 0 ? t("rec_" + a.rec.code) : t("st_noDiv")}</span>`;
    const reasons = MODE === "div" ? o.reasons : o.greasons.concat(o.reasons.filter(r => COMMON_CODES.has(r.code)));
    const pass = MODE === "div" ? o.ok : o.gok && o.common;
    const gHead = g.sc.total == null ? t("growthHead") : `${t("growthHead")} · ${g.sc.total}/100`;
    const body = MODE === "div"
      ? `${divBlock(o)}
        ${reasons.length ? `<ul class="reasons">${reasons.map(r => `<li>${esc(reasonText(r))}</li>`).join("")}</ul>` : ""}
        ${det(o, "fund", s.detail === false ? t("fundSecNd") : a.fund.grade === "unknown" ? t("fundSecNone") : t("fundSec", { s: `${a.fund.score}/100 · ${t("g_" + a.fund.grade)}` }), fundList(o, a))}
        ${det(o, "news", `${t("newsSec")} ${newsBadge(a.news)}`, newsList(s))}
        ${det(o, "calc", t("details"), divCalc(o))}
        ${det(o, "growth", `${gHead} <span class="rec2 inline">${t("grec_" + g.rec.code)}</span>`, growthBlock(o) + growthDetails(o))}`
      : `${growthBlock(o)}
        ${reasons.length ? `<ul class="reasons">${reasons.map(r => `<li>${esc(reasonText(r))}</li>`).join("")}</ul>` : ""}
        ${det(o, "gdet", t("details"), growthDetails(o))}
        ${det(o, "news", `${t("newsSec")} ${newsBadge(a.news)}`, newsList(s))}
        ${det(o, "div", `${t("divHead")} <span class="rec2 inline">${o.dps > 0 ? t("rec_" + a.rec.code) : t("st_noDiv")}</span>`,
          o.dps > 0 ? divBlock(o) + det(o, "calc", t("details"), divCalc(o)) : `<p class="muted">${t("gdNoDiv")}</p>`)}`;
    return `<article class="card ${pass ? "" : "dim"}">
      <div class="chead"><div><div class="tick">${esc(s.ticker)}${s.type === "etf" ? ' <span class="badge">ETF</span>' : ""}</div><div class="name">${esc(s.name || "")}</div></div>
        <div class="pills">${MODE === "div" ? divPill : gPill}${second}</div></div>
      ${body}
    </article>`;
  }

  /* ---------- render ---------- */
  /* Valuasi & analisa hanya dihitung ulang kalau data atau asumsi valuasi berubah;
     analisa growth tidak bergantung pada asumsi, jadi disimpan per saham. Filter selalu diterapkan ulang (murah). */
  const CACHE = { key: null, rows: [] };
  function compute() {
    const D = DATA[MARKET]; if (!D) return [];
    const st = readState(), now = new Date();
    const key = MARKET + "|" + D.ver + "|" + JSON.stringify(st.a);
    if (CACHE.key !== key) {
      CACHE.key = key;
      CACHE.rows = (D.stocks || []).filter(s => !s.error && s.close > 0).map(s => {
        const o = Calc.evaluate(s, st.a, MARKET);
        o.an = Analysis.analyze(o, MARKET, now);
        if (!s._g) s._g = Growth.analyze(s, MARKET, o.an.news, Calc.floorTick);
        o.g = s._g;
        return o;
      });
    }
    for (const o of CACHE.rows) {
      o.reasons = [];
      Calc.applyFilters(o, st.f);
      Analysis.applyAnalysisFilters(o, o.an, st.f);
      o.common = !o.reasons.some(r => COMMON_CODES.has(r.code));
      Growth.applyFilters(o, o.g, st.g);
    }
    return CACHE.rows;
  }
  function render() {
    const D = DATA[MARKET]; if (!D) return;
    const q = $("q").value.trim().toUpperCase();
    const all = compute();
    const rows = all.filter(o => !q || o.s.ticker.includes(q) || (o.s.name || "").toUpperCase().includes(q));
    const passOf = o => (MODE === "div" ? o.ok : o.gok && o.common);
    const keyFns = {
      rec: o => REC_ORDER[o.an.rec.code] * 1000 - o.an.rank, mos: o => -(o.mosActual ?? -9), yield: o => -o.yield,
      fund: o => -(o.an.fund.score ?? -1), gap: o => (o.ladder[0].final ? o.s.close / o.ladder[0].final : 99), ticker: o => o.s.ticker,
      grec: o => GREC_ORDER[o.g.rec.code] * 1000 - o.g.rank, gscore: o => -(o.g.sc.total ?? -1), rs: o => -(o.s.rs ?? -1),
      rev: o => -(o.s.rev_growth ?? -9), cagr: o => -((o.s.cagr5 ?? o.s.cagr3) ?? -9),
    };
    const key = keyFns[$("sort").value] || keyFns.ticker;
    rows.sort((x, y) => { const px = passOf(x), py = passOf(y); if (px !== py) return px ? -1 : 1; const a = key(x), b = key(y); return a < b ? -1 : a > b ? 1 : 0; });
    LAST = rows;
    const C = D.counts || {};
    const ok = rows.filter(passOf).length;
    if (MODE === "div") {
      const buy = rows.filter(o => o.ok && o.an.rec.code === "buy").length, exp = rows.filter(o => o.dps > 0 && !o.pass1).length;
      const payers = C.dividend ?? all.filter(o => o.dps > 0).length;
      $("counts").innerHTML = (C.universe ? `<span class="chip">${t("cScanned", { n: num(C.universe) })}</span>` : "") +
        `<span class="chip">${t("cDiv", { n: num(payers) })}</span><span class="chip ok">${t("cPass", { n: num(ok) })}</span>` +
        `<span class="chip ok">${t("cBuy", { n: num(buy) })}</span><span class="chip bad">${t("cExp", { n: num(exp) })}</span>`;
      renderTop(Analysis.topList(all, 10), payers, D.price_date);
    } else {
      const buy = rows.filter(o => o.gok && o.common && o.g.rec.code === "buy").length, up = rows.filter(o => Growth.trendState(o.s) === "up").length;
      $("counts").innerHTML = (C.universe ? `<span class="chip">${t("cScanned", { n: num(C.universe) })}</span>` : "") +
        `<span class="chip">${t("cStored", { n: num(C.stored ?? all.length) })}</span><span class="chip ok">${t("cPass", { n: num(ok) })}</span>` +
        `<span class="chip ok">${t("cGBuy", { n: num(buy) })}</span><span class="chip">${t("cUp", { n: num(up) })}</span>`;
      renderTop(Growth.topList(all, 10, MARKET === "us" && $("kind").value === "etf"), C.stored ?? all.length, D.price_date);
    }
    const shown = $("showAll").checked || q ? rows : rows.filter(passOf);
    const page = shown.slice(0, SHOWN);
    const emptyMsg = q ? t(D.is_demo ? "noMatchDemo" : "noMatch", { q: esc(q), n: num((D.stocks || []).length) }) : t("empty");
    $("list").innerHTML = page.length ? page.map(card).join("") : `<div class="empty">${emptyMsg}</div>`;
    const left = shown.length - page.length;
    $("moreBox").hidden = left <= 0;
    $("moreBtn").textContent = t("more", { n: Math.min(PAGE, left) });
    $("moreLeft").textContent = t("moreLeft", { n: num(left) });
    save();
  }

  function renderTop(top, total, date) {
    const d = date ? new Date(date + "T00:00:00").toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric" }) : "–";
    const G = MODE === "growth";
    $("top10H").textContent = t(G ? "gtop10H" : "top10H");
    $("top10Sub").textContent = t(G ? "gtop10Sub" : "top10Sub", { n: num(total), d });
    const nBuy = top.filter(o => (G ? o.g.rec.code : o.an.rec.code) === "buy").length;
    $("top10Note").hidden = !(top.length && nBuy < top.length);
    $("top10Note").textContent = t(G ? "gtop10Fill" : "top10Fill", { n: nBuy });
    $("top10List").innerHTML = top.length ? top.map((o, i) => {
      const key = o.s.ticker + ":top";
      let pill, metrics;
      if (G) {
        const p = o.g.plan;
        pill = `<span class="rec grec-${o.g.rec.code}">${t("grec_" + o.g.rec.code)}</span>`;
        metrics = `<span><small>${t("scoreLbl")}</small><b>${o.g.rank}</b></span><span><small>RS</small><b>${o.s.rs ?? "–"}</b></span>
          <span><small>${t("kRevG")}</small><b>${spc(o.s.rev_growth, 0)}</b></span><span><small>${t("kCagr5")}</small><b>${spc(o.s.cagr5 ?? o.s.cagr3, 0)}</b></span>
          <span><small>${t("kZone")}</small><b>${p ? money(p.lo) + "–" + money(p.hi) : "–"}</b></span>`;
      } else {
        const cur = o.tier ? o.ladder.find(x => x.key === o.tier.key) : null;
        pill = `<span class="rec rec-${o.an.rec.code}">${t("rec_" + o.an.rec.code)}</span>`;
        metrics = `<span><small>${t("scoreLbl")}</small><b>${o.an.rank}</b></span><span><small>${t("kYield")}</small><b>${pc(o.yield)}</b></span>
          <span><small>MoS</small><b>${pc(o.mosActual, 0)}</b></span><span><small>${t("entryLbl")}</small><b>${money(cur && cur.final)}</b></span>`;
      }
      return `<li><details data-k="${esc(key)}" ${OPEN.has(key) ? "open" : ""}><summary>
        <span class="rk">${i + 1}</span>
        <span class="tn"><b>${esc(o.s.ticker)}</b>${o.s.type === "etf" ? ' <span class="badge">ETF</span>' : ""}<small>${esc(o.s.name || "")}</small></span>
        ${pill}<span class="tm">${metrics}</span>
      </summary><div class="top-card">${card(o)}</div></details></li>`;
    }).join("") : `<li class="empty">${t(G ? "gtop10Empty" : "top10Empty")}</li>`;
  }

  /* ---------- teks statis & meta ---------- */
  function applyLang() {
    document.documentElement.lang = LANG;
    const G = MODE === "growth";
    document.title = t((G ? "gtitle_" : "title_") + MARKET);
    $("h1").textContent = t((G ? "gtitle_" : "title_") + MARKET);
    $("sub").textContent = t((G ? "gsub_" : "sub_") + MARKET);
    document.querySelectorAll("[data-i18n]").forEach(el => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $("q").placeholder = t("searchPh", { ex: SEARCH_EX[MARKET] });
    document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
    document.querySelectorAll(".market button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === MARKET)));
    document.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === MODE)));
    for (const el of document.querySelectorAll("[data-only]")) el.hidden = el.dataset.only !== MODE;
    tiersChanged(); paintPresets(); showMeta(); render();
  }
  function paintPresets() {
    const p = PRESET[MODE];
    document.querySelectorAll("#presets button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
    $("presetNote").textContent = p === "kustom" ? t("n_kustom") : MODE === "div" ? t(`n_${MARKET}_${p}`) : t("gn_" + p);
  }
  function showMeta() {
    const D = DATA[MARKET] || {};
    const d = D.price_date ? new Date(D.price_date + "T00:00:00") : null;
    $("asofDate").textContent = d ? d.toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "–";
    $("asofMeta").textContent = D.is_demo ? t("asofDemo") : t("asofUpd", { x: D.generated_at || "" });
    $("demoBanner").hidden = !D.is_demo;
    $("demoBanner").innerHTML = t("banner", { dpsNote: MARKET === "idx" ? t("bannerDpsIdx") : "", file: `data/${MARKET}.json` });
  }
  function setHash() {
    const h = MARKET + (MODE === "growth" ? "-growth" : "");
    try { if (location.hash !== "#" + h) history.replaceState(null, "", "#" + h); } catch (e) { /* abaikan */ }
  }

  /* ---------- data ---------- */
  let VER = 0;
  function prepare(D) {
    const now = Date.now();
    D.ver = ++VER;
    for (const s of D.stocks || []) for (const n of s.news || []) if (n.ageDays != null && !n.date) n.date = new Date(now - n.ageDays * 864e5).toISOString();
    return D;
  }
  async function loadMarket(m) {
    if (!DATA[m]) DATA[m] = prepare(JSON.parse(JSON.stringify(window.DEMO[m])));
    if (!DATA[m].tried) {
      DATA[m].tried = true;
      try {
        const res = await fetch(`data/${m}.json`, { cache: "no-store" });
        if (res.ok) { const j = await res.json(); if (j && Array.isArray(j.stocks) && j.stocks.length) { DATA[m] = prepare(j); DATA[m].tried = true; } }
      } catch (e) { /* tetap pakai data contoh */ }
    }
  }
  async function switchMarket(m) {
    if (MARKET !== m && DATA[MARKET]) save();
    MARKET = m; SHOWN = PAGE;
    setHash();
    restore();
    applyLang();
    await loadMarket(m);
    if (MARKET === m) { showMeta(); render(); }
  }
  function switchMode(md) {
    if (MODE === md) return;
    SORT[MODE] = $("sort").value;
    MODE = md; SHOWN = PAGE;
    setHash();
    applyLang();
  }

  /* ---------- event ---------- */
  function toast(msg) { const el = $("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (el.hidden = true), 2400); }
  $("copyCsv").addEventListener("click", () => {
    const q = v => `"${String(v ?? "").replace(/"/g, "'")}"`;
    let head, lines;
    if (MODE === "div") {
      head = ["ticker", "name", "type", "close", "dps", "yield_pct", "fair_value", "max_buy_price", "mos_pct", "valuation", "recommendation",
        "fund_score", "fund_grade", "news_mood", "growth_score", "growth_rec", "entry_1", "entry_2", "entry_3", "entry_4", "passes_filters", "reasons"];
      lines = LAST.map(o => [o.s.ticker, q(o.s.name), o.s.type || "stock", o.s.close, o.dps, (o.yield * 100).toFixed(2),
        o.fv ? o.fv.toFixed(2) : "", o.maxPrice ?? "", o.mosActual != null ? (o.mosActual * 100).toFixed(1) : "", q(t("st_" + o.status.code)),
        q(t("rec_" + o.an.rec.code)), o.an.fund.score ?? "", q(t("g_" + o.an.fund.grade)), q(t("mood_" + o.an.news.mood)),
        o.g.sc.total ?? "", q(t("grec_" + o.g.rec.code)), ...o.ladder.map(x => x.final ?? ""), o.ok ? t("csvYes") : t("csvNo"), q(o.reasons.map(reasonText).join("; "))]);
    } else {
      head = ["ticker", "name", "type", "close", "growth_score", "grade", "recommendation", "trend", "rs", "rsi14", "cagr5_pct", "rev_growth_pct",
        "eps_growth_pct", "peg", "fscore", "buy_low", "buy_high", "stop_loss", "analyst_target", "news_mood", "dividend_rec", "passes_filters", "reasons"];
      lines = LAST.map(o => { const s = o.s, p = o.g.plan || {}, f = x => (x == null ? "" : (x * 100).toFixed(1));
        return [s.ticker, q(s.name), s.type || "stock", s.close, o.g.sc.total ?? "", q(t("g_" + o.g.sc.grade)), q(t("grec_" + o.g.rec.code)),
          q(t("tr_" + Growth.trendState(s))), s.rs ?? "", s.rsi14 ?? "", f(s.cagr5 ?? s.cagr3), f(s.rev_growth), f(s.eps_growth ?? s.eq_growth),
          s.peg ?? "", s.fscore ?? "", p.lo ?? "", p.hi ?? "", p.stop ?? "", p.target ?? "", q(t("mood_" + o.an.news.mood)),
          q(o.dps > 0 ? t("rec_" + o.an.rec.code) : t("st_noDiv")), o.gok && o.common ? t("csvYes") : t("csvNo"),
          q(o.greasons.concat(o.reasons.filter(r => COMMON_CODES.has(r.code))).map(reasonText).join("; "))]; });
    }
    const text = [head.join(",")].concat(lines.map(l => l.join(","))).join("\n");
    navigator.clipboard.writeText(text).then(() => toast(t("tCopied", { n: LAST.length }))).catch(() => toast(t("tCopyFail")));
  });
  document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => { LANG = b.dataset.lang; applyLang(); }));
  document.querySelectorAll(".market button").forEach(b => b.addEventListener("click", () => switchMarket(b.dataset.m)));
  document.querySelectorAll(".mode button").forEach(b => b.addEventListener("click", () => switchMode(b.dataset.mode)));
  $("presets").addEventListener("click", e => {
    const b = e.target.closest("button[data-p]"); if (!b || b.dataset.p === "kustom") return;
    PRESET[MODE] = b.dataset.p;
    if (MODE === "div") setDivPreset(b.dataset.p); else setGrowthPreset(b.dataset.p);
    SHOWN = PAGE; paintPresets(); render();
  });
  for (const id of CTRL_DIV.concat(CTRL_GROWTH, CTRL_COMMON)) $(id).addEventListener("input", () => {
    if (id === "tierStr") tiersChanged();
    PRESET[MODE] = "kustom"; SHOWN = PAGE; paintPresets(); render();
  });
  let qTimer;
  for (const id of ["showAll", "sort", "q"]) $(id).addEventListener("input", () => { SHOWN = PAGE; clearTimeout(qTimer); qTimer = setTimeout(render, id === "q" ? 180 : 0); });
  $("moreBtn").addEventListener("click", () => { SHOWN += PAGE; render(); });
  for (const id of ["top10List", "list"]) $(id).addEventListener("toggle", e => {
    const d = e.target; if (!d.dataset || !d.dataset.k) return;
    if (d.open) OPEN.add(d.dataset.k); else OPEN.delete(d.dataset.k);
  }, true);

  window.addEventListener("hashchange", () => {
    const [m, md] = location.hash.replace("#", "").split("-");
    if (!PRESETS[m]) return;
    const mode = md === "growth" ? "growth" : "div";
    if (m !== MARKET) { MODE = mode; switchMarket(m); } else switchMode(mode);
  });

  /* ---------- mulai ---------- */
  $("copyYear").textContent = new Date().getFullYear();
  const saved = store.get("screener-v3") || {};
  if (saved.lang && I18N[saved.lang]) LANG = saved.lang;
  const [hm, hmode] = location.hash.replace("#", "").split("-");
  MODE = hmode === "growth" ? "growth" : hm && PRESETS[hm] ? "div" : saved.mode === "growth" ? "growth" : "div";
  if (window.matchMedia("(max-width: 899px)").matches) $("filterBox").open = false;
  switchMarket(PRESETS[hm] ? hm : PRESETS[saved.market] ? saved.market : "idx");
})();
