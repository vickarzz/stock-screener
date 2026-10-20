# Stock Screener IDX & US (Dividen + Growth)

Screener saham dividen yang memindai **seluruh emiten Bursa Efek Indonesia** dan **seluruh saham
+ ETF Amerika** (NYSE, Nasdaq, NYSE American, NYSE Arca), dalam Bahasa Indonesia dan Inggris.
Ada dua mode yang bisa dipilih di header: **Dividen** dan **Growth**. Masing-masing punya
Top 10, preset, dan filter sendiri, dan setiap kartu emiten menampilkan kedua analisa.

### Mode Growth
- **Teknikal:** MA50/150/200, trend template Mark Minervini (8 syarat), RS rating 1–99 ala
  Investor's Business Daily, RSI 14, MACD 12/26/9, posisi di rentang 52 minggu.
- **Histori 5 tahun:** CAGR 3 & 5 tahun, return per tahun, jumlah tahun naik, max drawdown,
  volatilitas, grafik harga bulanan 5 tahun.
- **Fundamental pertumbuhan:** pertumbuhan pendapatan & laba (YoY dan CAGR 3 tahun dari laporan
  tahunan), tren margin usaha, ROE, Rule of 40.
- **Valuasi growth:** PEG, PER ke depan, Price/Sales, target harga rata-rata analis.
- **Kesehatan keuangan:** Piotroski F-Score, DER, arus kas bebas, current ratio.
- **Skor:** fundamental 35, teknikal 25, histori 15, valuasi 15, kesehatan 10 → rekomendasi
  Layak beli bertahap / Bagus, tunggu koreksi / Pantau / Hindari dulu, lengkap dengan area beli,
  batas rugi 8%, dan target analis.
- Preset: Seimbang, Momentum (CAN SLIM/Minervini), Growth wajar (GARP ala Peter Lynch).

### Mode Dividen
Hasilnya diurutkan menjadi **Top 10 rekomendasi** dari data closing terakhir. Setiap saham mendapat:

1. **Valuasi** Dividend Growth + Margin of Safety: DDM single & double stage → filter MoS →
   kategori yield → harga masuk final (dibulatkan ke fraksi harga bursa).
2. **Skor fundamental** 0–100 (saham: ROE, margin, utang, pertumbuhan, payout, dividen,
   likuiditas, PER; ETF: biaya tahunan, dana kelolaan, return 3/5 th, dividen).
3. **Berita terbaru** 30 hari dari Google News dengan tanda ▲ kabar baik / ▼ kabar buruk.
4. **Ringkasan & rekomendasi** dalam bahasa awam: Layak dicicil, Murah cek dulu,
   Watchlist, Hindari dulu, atau Di luar kriteria.

Ringkasan dibuat otomatis oleh aturan yang tertulis di halaman, bukan oleh analis manusia.

```
GitHub Actions (cron hari bursa)
  1. universe.py   daftar SEMUA ticker   IDX: Yahoo screener JKT / API idx.co.id
                                          US : NasdaqTrader (saham + ETF) / mirror GitHub
  2. scan semua    harga closing, likuiditas, dividen 6 th (yf.download massal)
  3. kandidat      valuation.py: lolos MoS → kategori yield → MoS terbesar (+ favorit)
  4. analisa       fundamental (Yahoo) + berita (Google News) untuk kandidat
        └─► docs/data/<pasar>.json ─► GitHub Pages: docs/index.html (Top 10, filter, kartu)
```

| Pasar | Dipindai | Disimpan | Analisa lengkap |
|---|---|---|---|
| IDX | semua emiten BEI (± 950) | yang cukup likuid (≥ Rp50 jt/hari) | 200 dividen + 200 growth + favorit |
| US | ± 11.700 saham & ETF | yang cukup likuid (≥ $100 rb/hari) | 200+100 dividen, 250+50 growth, + favorit |

Indikator teknikal & histori 5 tahun dihitung untuk SEMUA ticker yang disimpan. Laporan keuangan
tahunan (untuk CAGR, margin, Piotroski) hanya diambil untuk kandidat growth.

Top 10 hanya diambil dari yang sudah dianalisa lengkap, lolos filter aktif, dan yield-nya wajar
(≤25%). Skor gabungan: valuasi (MoS) 40, fundamental 30, kategori yield 20, berita 10.

## Pasang

1. Buat repo baru di GitHub, misalnya `vickarzz/stock-screener`, lalu push isi folder ini:
   ```bash
   cd stock-screener
   git init && git add . && git commit -m "Screener dividen IDX & US"
   git branch -M main
   git remote add origin https://github.com/vickarzz/stock-screener.git
   git push -u origin main
   ```
2. **Settings → Pages** → *Deploy from a branch* → `main`, folder `/docs` → Save.
3. **Settings → Actions → General → Workflow permissions** → *Read and write permissions*.
4. **Actions → Update data Indonesia (IDX) → Run workflow**, lalu
   **Update data Amerika (NYSE/Nasdaq) → Run workflow**.
5. Buka `https://vickarzz.github.io/stock-screener/` (tambahkan `#us` untuk langsung ke pasar AS).

Sebelum langkah 4 selesai, halaman menampilkan **data contoh** dengan banner kuning.

## Jadwal otomatis

| Pasar | Jalan | Isi | Lama run (perkiraan) |
|---|---|---|---|
| IDX | Senin–Jumat 17:17 WIB | closing BEI hari itu | 25–45 menit |
| US | Senin–Jumat 22:13 UTC (± 05:13 WIB besoknya) | closing NYSE/Nasdaq hari itu | 60–120 menit |

Repo publik mendapat menit GitHub Actions gratis tanpa batas. Untuk repo privat, run US harian
bisa menghabiskan kuota gratis 2.000 menit/bulan.

Hari libur bursa tidak menghasilkan commit. Kalau ada run gagal, GitHub mengirim email.

## Mengatur

| Mau apa | Ubah |
|---|---|
| Favorit (selalu dianalisa lengkap) | `tickers_idx.txt`, `tickers_us.txt` |
| Jumlah kandidat analisa lengkap | `MARKETS[...]["detail"]` di `fetch_data.py` |
| Batas likuiditas & yield wajar kandidat | `valuation.py` |
| Jam update | baris `cron` di `.github/workflows/update-*.yml` (UTC) |
| Preset & ambang yield | `PRESETS` di `docs/js/app.js` |
| Rumus valuasi | `docs/js/calc.js` |
| Aturan fundamental & rekomendasi dividen | `docs/js/analysis.js` |
| Aturan & bobot analisa growth | `docs/js/growth.js` |
| Indikator teknikal, Piotroski | `technicals.py` |
| Kamus kata berita | `sentiment.py` |
| Teks ID/EN | `docs/js/i18n.js` |

## Jalankan lokal

```bash
pip install -r requirements.txt
python fetch_data.py idx                 # seluruh BEI
python fetch_data.py us                  # seluruh saham & ETF AS (lama)
python fetch_data.py us --limit 300      # uji cepat 300 ticker pertama
python fetch_data.py idx --detail 50 --no-news
python -m http.server -d docs 8000   # buka http://localhost:8000
python tests/test_fetch.py && python tests/test_technicals.py
node tests/test_calc.js && node tests/test_growth.js
```

## Rumus

| Langkah | Rumus |
|---|---|
| DDM single | `DPS × (1+g) ÷ (r − g)` |
| DDM double | `Σ DPS×(1+g1)^t ÷ (1+r)^t` (t = 1..n) `+ [D_n×(1+g2) ÷ (r − g2)] ÷ (1+r)^n` |
| Nilai wajar | `MIN(single, double)` (bisa diganti) |
| Batas beli | `(1 − MoS) × nilai wajar` |
| Kategori yield | IDX 6/8/10/12%, AS 3/4/5/6% (bisa diubah) |
| Harga masuk | `MIN(DPS ÷ yield target, batas beli)`, dibulatkan ke bawah ke fraksi (BEI Rp1–25, AS $0,01) |
| Skor fundamental | rata-rata cek: bagus 1, sedang 0,5, lemah 0 → Kuat ≥70, Cukup ≥45 |
| Sentimen berita | kamus kata keuangan ID/EN pada judul; ≤7 hari bobot 1, lebih lama 0,5 |
| Rekomendasi | Layak dicicil = murah + fundamental tidak lemah + berita tidak negatif |

## Batasan

- Daftar emiten IDX diambil dari screener Yahoo atau API idx.co.id. Kalau keduanya gagal,
  dipakai `data/universe_idx.csv` dari run sukses terakhir. Run pertama butuh salah satunya berhasil.
- Saham di luar kandidat hanya punya valuasi; fundamental dan beritanya tidak diambil (label
  "belum dianalisa"). Kalau kamu mengubah preset jauh dari default, tambah jumlah kandidat.
- Yahoo bisa membatasi permintaan (rate limit) saat scan ribuan ticker; batch yang gagal dicoba
  ulang dan sisanya dilewati, jadi sesekali beberapa ticker bisa hilang dari satu run.
- Yahoo Finance tidak resmi. Harga biasanya akurat, tapi dividen bisa terlambat masuk dan
  KPI fundamental sering kosong untuk saham IDX kecil.
- Label berita dibaca dari kata-kata judul saja. Judul seperti "laba turun tapi dividen naik"
  bisa dinilai netral. Selalu baca artikelnya.
- DDM konservatif membuat banyak blue chip AS (misalnya KO, PG) terlihat mahal. Itu sifat
  metodenya, bukan error.
- Untuk REIT (misalnya O), payout di atas 100% dari laba bersih itu normal karena mereka
  membagi dari arus kas (FFO), bukan laba akuntansi.
- Bukan rekomendasi investasi.

## Notifikasi email saat gagal

Workflow mengirim email kalau ada langkah yang gagal. Isi tiga secret di
**Settings → Secrets and variables → Actions → New repository secret**:

| Nama | Isi |
|---|---|
| `MAIL_TO` | alamat penerima, misalnya a.zulfikar.r@gmail.com |
| `MAIL_USERNAME` | alamat Gmail pengirim (boleh sama dengan penerima) |
| `MAIL_PASSWORD` | App Password Gmail 16 karakter (bukan password biasa) |

App Password dibuat di myaccount.google.com/apppasswords (Verifikasi 2 Langkah harus aktif).
Alamat disimpan sebagai secret supaya tidak terlihat publik di repo.

---

© 2026 Ahmad Zulfikar Rafsanjani. Hak cipta dilindungi.
