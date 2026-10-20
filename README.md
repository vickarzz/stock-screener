# Stock Screener IDX & US (Dividend + Growth)

A daily-updated stock screener that scans **every stock on the Indonesia Stock Exchange (IDX)** and
**every US stock and ETF** (NYSE, Nasdaq, NYSE American, NYSE Arca), with an interface in English
and Indonesian.

**Live site:** https://vickarzz.github.io/stock-screener/

| View | Link |
|---|---|
| Indonesia · Dividend | [/#idx](https://vickarzz.github.io/stock-screener/#idx) |
| Indonesia · Growth | [/#idx-growth](https://vickarzz.github.io/stock-screener/#idx-growth) |
| United States · Dividend | [/#us](https://vickarzz.github.io/stock-screener/#us) |
| United States · Growth | [/#us-growth](https://vickarzz.github.io/stock-screener/#us-growth) |

The header has two modes, **Dividend** and **Growth**. Each mode has its own Top 10, presets and
filters, and every stock card shows both analyses.

### Growth mode
- **Technicals:** 50/150/200-day moving averages, Mark Minervini's trend template (8 conditions),
  an Investor's Business Daily-style RS rating (1–99), RSI 14, MACD 12/26/9, position within the
  52-week range.
- **5-year history:** 3- and 5-year CAGR, return by calendar year, number of up years, max
  drawdown, volatility, and a 5-year monthly price chart.
- **Growth fundamentals:** revenue and earnings growth (year over year and 3-year CAGR from annual
  reports), operating margin trend, ROE, Rule of 40.
- **Growth valuation:** PEG, forward P/E, price/sales, average analyst price target.
- **Financial health:** Piotroski F-Score, debt-to-equity, free cash flow, current ratio.
- **Score:** fundamentals 35, technicals 25, history 15, valuation 15, health 10 → a recommendation
  (Buy gradually / Strong, wait for a dip / Watch / Avoid for now) with a buy zone, an 8% stop loss
  and the analyst target.
- **Presets:** Balanced, Momentum (CAN SLIM / Minervini), Growth at a reasonable price (Peter Lynch).

### Dividend mode
Results are ranked into a **Top 10** from the latest close. Every stock gets:

1. **Valuation** with a Dividend Growth + Margin of Safety framework: single- and two-stage DDM →
   margin-of-safety filter → yield category → final entry price (rounded down to the exchange tick).
2. **Fundamental score** 0–100 (stocks: ROE, margin, debt, growth, payout, dividend record,
   liquidity, P/E; ETFs: expense ratio, assets under management, 3/5-year return, dividends).
3. **Latest news** from the past 30 days via Google News, marked ▲ good news / ▼ bad news.
4. **Plain-language summary and recommendation:** Accumulate, Cheap but check first, Watchlist,
   Avoid for now, or Outside criteria.

Summaries are generated automatically by the rules documented on the site, not by a human analyst.

## How it works

```
GitHub Actions (cron on trading days)
  1. universe.py   list EVERY ticker      IDX: Yahoo screener (JKT) / idx.co.id API
                                          US : NasdaqTrader (stocks + ETFs) / GitHub mirror
  2. scan all      6 years of daily prices + dividends (bulk yf.download) →
                   dividend valuation, technicals, 5-year history, RS rating
  3. candidates    dividend: passes MoS → yield category → largest MoS
                   growth:   RS rating, trend template, 3-year CAGR, momentum   (+ favourites)
  4. deep dive     fundamentals (Yahoo) + news (Google News) for candidates;
                   annual reports (CAGR, margins, Piotroski) for growth candidates
        └─► docs/data/<market>.json ─► GitHub Pages: docs/index.html (Top 10, filters, cards)
```

| Market | Scanned | Stored | Full analysis |
|---|---|---|---|
| IDX | every listed stock (~950) | liquid enough (≥ IDR 50M/day) | 200 dividend + 200 growth + favourites |
| US | ~11,700 stocks & ETFs | liquid enough (≥ $100K/day) | 200+100 dividend, 250+50 growth, + favourites |

Technicals and 5-year history are computed for every stored ticker. Annual financial statements
(for CAGR, margins and Piotroski) are fetched only for growth candidates.

The Top 10 only includes fully analysed names that pass the active filters and have a plausible
yield (≤25%). Dividend score: valuation (MoS) 40, fundamentals 30, yield category 20, news 10.
Growth ETFs only enter the growth Top 10 when the type filter is set to ETF.

## Setup

1. Create a public repository on GitHub, e.g. `vickarzz/stock-screener`, then push this folder:
   ```bash
   cd ~/Documents/stock-screener && pwd   # make sure this is the project folder
   git init && git add . && git commit -m "Stock Screener IDX & US"
   git branch -M main
   git remote add origin https://github.com/vickarzz/stock-screener.git
   git push -u origin main
   ```
2. **Settings → Actions → General → Workflow permissions** → *Read and write permissions* → Save.
3. **Settings → Pages** → *Deploy from a branch* → `main`, folder `/docs` → Save.
4. **Actions → Update data Indonesia (IDX) → Run workflow**, then
   **Update data Amerika (NYSE/Nasdaq) → Run workflow**.
5. Open `https://vickarzz.github.io/stock-screener/`.

Until step 4 finishes, the site shows **sample data** with a yellow banner.

## Daily schedule

| Market | Runs | Contents | Typical duration |
|---|---|---|---|
| IDX | Mon–Fri 17:17 WIB (10:17 UTC) | that day's IDX close | 25–45 min |
| US | Mon–Fri 22:13 UTC | that day's NYSE/Nasdaq close | 60–120 min |

Public repositories get unlimited free GitHub Actions minutes. For a private repository, the daily
US run can use up the free 2,000 minutes per month.

Market holidays produce no commit. Failed runs trigger an email (see below).

## Customising

| To change | Edit |
|---|---|
| Favourites (always fully analysed) | `tickers_idx.txt`, `tickers_us.txt` |
| Number of fully analysed candidates | `MARKETS[...]["detail"]` and `["growth"]` in `fetch_data.py` |
| Candidate liquidity & plausible-yield limits | `valuation.py` |
| Update time | the `cron` line in `.github/workflows/update-*.yml` (UTC) |
| Presets & yield thresholds | `PRESETS` / `GPRESETS` in `docs/js/app.js` |
| Valuation formulas | `docs/js/calc.js` |
| Dividend fundamentals & recommendation rules | `docs/js/analysis.js` |
| Growth rules & weights | `docs/js/growth.js` |
| Technical indicators, Piotroski | `technicals.py` |
| News word list | `sentiment.py` |
| Interface text (EN/ID) | `docs/js/i18n.js` |

## Run locally

```bash
pip install -r requirements.txt
python fetch_data.py idx                 # whole IDX
python fetch_data.py us                  # all US stocks & ETFs (slow)
python fetch_data.py us --limit 300      # quick test on the first 300 tickers
python fetch_data.py idx --detail 50 --no-news
python -m http.server -d docs 8000       # open http://localhost:8000
python tests/test_fetch.py && python tests/test_technicals.py
node tests/test_calc.js && node tests/test_growth.js
```

## Formulas

| Step | Formula |
|---|---|
| Single-stage DDM | `DPS × (1+g) ÷ (r − g)` |
| Two-stage DDM | `Σ DPS×(1+g1)^t ÷ (1+r)^t` (t = 1..n) `+ [D_n×(1+g2) ÷ (r − g2)] ÷ (1+r)^n` |
| Fair value | `MIN(single, two-stage)` (configurable) |
| Max buy price | `(1 − MoS) × fair value` |
| Yield categories | IDX 6/8/10/12%, US 3/4/5/6% (configurable) |
| Entry price | `MIN(DPS ÷ target yield, max buy price)`, rounded down to the tick (IDX Rp1–25, US $0.01) |
| Fundamental score | average of checks: good 1, fair 0.5, weak 0 → Strong ≥70, Fair ≥45 |
| RS rating | 40% 3-month + 20% each 6/9/12-month return, percentile-ranked 1–99 within the market |
| CAGR | `(end price ÷ start price)^(1/n) − 1` |
| PEG | `P/E ÷ earnings growth` |
| Rule of 40 | `revenue growth + free-cash-flow margin ≥ 40%` |
| News sentiment | finance word list (EN/ID) on headlines; ≤7 days weight 1, older 0.5 |

## Limitations

- The IDX ticker list comes from Yahoo's screener or the idx.co.id API. If both fail, the run falls
  back to `data/universe_idx.csv` from the last successful run, so the first run needs one of them.
- Names outside the candidate lists only get valuation and technicals; their fundamentals and news
  aren't fetched (shown as "not analysed"). If you move presets far from the defaults, raise the
  candidate counts.
- Yahoo may rate-limit a scan of thousands of tickers; failed batches are retried and then skipped,
  so a few tickers can occasionally be missing from a run.
- Yahoo Finance is unofficial. Prices are usually accurate, but dividends can arrive late and
  fundamental KPIs are often missing for small IDX stocks. Piotroski is often blank for banks.
- News labels are read from headline words only. A headline like "profit falls but dividend rises"
  may score as neutral. Always read the article.
- A conservative DDM makes many US blue chips (e.g. KO, PG) look expensive. That is how the method
  behaves, not a bug.
- For REITs (e.g. O), a payout above 100% of net income is normal because they pay from cash flow
  (FFO), not accounting profit.
- Not investment advice.

## Email alerts on failure

Workflows send an email when a step fails. Add three secrets under
**Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `MAIL_TO` | recipient address |
| `MAIL_USERNAME` | sending Gmail address (can be the same as the recipient) |
| `MAIL_PASSWORD` | 16-character Gmail App Password (not your normal password) |

Create the App Password at myaccount.google.com/apppasswords (2-Step Verification must be on).
Addresses are stored as secrets so they stay out of the public repository.

---

© 2026 Ahmad Zulfikar Rafsanjani. All rights reserved.
