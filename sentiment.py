"""
Penilai sentimen judul berita saham (Indonesia & Inggris), berbasis kamus kata.

Sengaja sederhana dan transparan: setiap frasa punya bobot +/-; skor judul =
jumlah bobot. Skor > 0 → "pos" (▲), < 0 → "neg" (▼), 0 → "neu" (●).
Frasa yang lebih panjang dicocokkan lebih dulu supaya "laba turun" tidak
terhitung dua kali sebagai "laba" dan "turun".

Ini bukan model AI; hasilnya indikasi cepat, bukan pengganti membaca berita.
"""

from __future__ import annotations

import re

# bobot: 2 = sinyal kuat, 1 = sinyal ringan
LEXICON: dict[str, dict[str, int]] = {
    "id": {
        # positif kuat
        "laba naik": 2, "laba bersih naik": 2, "laba melonjak": 2, "laba tumbuh": 2, "laba meningkat": 2,
        "rekor laba": 2, "cetak rekor": 2, "dividen jumbo": 2, "dividen naik": 2, "kenaikan dividen": 2,
        "buyback": 2, "pembelian kembali saham": 2, "kontrak baru": 2, "target harga naik": 2,
        "rekomendasi beli": 2, "auto reject atas": 2, "ara": 2, "berbalik untung": 2, "upgrade": 2,
        # positif ringan
        "naik": 1, "menguat": 1, "melonjak": 1, "melesat": 1, "meroket": 1, "terbang": 1, "rebound": 1,
        "tumbuh": 1, "meningkat": 1, "untung": 1, "surplus": 1, "ekspansi": 1, "bagi dividen": 1,
        "tebar dividen": 1, "positif": 1, "optimistis": 1, "net buy": 1, "borong": 1, "akuisisi": 1,
        "rekor": 1, "prospek cerah": 2, "kinerja solid": 2,
        # negatif kuat
        "laba turun": -2, "laba anjlok": -2, "laba merosot": -2, "rugi bersih": -2, "merugi": -2,
        "gagal bayar": -2, "pailit": -2, "pkpu": -2, "suspensi": -2, "disuspensi": -2, "auto reject bawah": -2,
        "arb": -2, "korupsi": -2, "fraud": -2, "gugatan": -2, "digugat": -2, "phk": -2, "downgrade": -2,
        "dividen turun": -2, "tidak bagi dividen": -2, "batal bagi dividen": -2, "rekomendasi jual": -2,
        "target harga turun": -2, "delisting": -2, "denda": -2,
        # negatif ringan
        "turun": -1, "anjlok": -1, "melemah": -1, "merosot": -1, "ambruk": -1, "terkoreksi": -1, "koreksi": -1,
        "tertekan": -1, "rugi": -1, "negatif": -1, "net sell": -1, "dilepas asing": -1, "lesu": -1,
        "diperiksa": -1, "tersangka": -2, "beban naik": -1, "utang naik": -1,
    },
    "en": {
        "beats estimates": 2, "beat estimates": 2, "tops estimates": 2, "record profit": 2, "record revenue": 2,
        "raises dividend": 2, "dividend hike": 2, "hikes dividend": 2, "increases dividend": 2, "raises guidance": 2,
        "raises outlook": 2, "buyback": 2, "share repurchase": 2, "upgrade": 2, "upgraded": 2, "outperform": 2,
        "price target raised": 2, "wins contract": 2, "fda approval": 2, "strong buy": 2,
        "beats": 1, "beat": 1, "tops": 1, "surges": 1, "surge": 1, "soars": 1, "jumps": 1, "rallies": 1, "rally": 1,
        "gains": 1, "rises": 1, "climbs": 1, "record": 1, "growth": 1, "strong": 1, "bullish": 1, "approval": 1,
        "expands": 1, "profit rises": 2, "rebound": 1, "upbeat": 1,
        "misses estimates": -2, "missed estimates": -2, "cuts dividend": -2, "dividend cut": -2, "slashes dividend": -2,
        "suspends dividend": -2, "lowers guidance": -2, "cuts guidance": -2, "cuts outlook": -2, "downgrade": -2,
        "downgraded": -2, "underperform": -2, "price target cut": -2, "lawsuit": -2, "sued": -2, "investigation": -2,
        "probe": -2, "fraud": -2, "bankruptcy": -2, "default": -2, "recall": -2, "layoffs": -2, "plunges": -2,
        "net loss": -2, "sell rating": -2,
        "misses": -1, "miss": -1, "falls": -1, "fall": -1, "drops": -1, "drop": -1, "slides": -1, "slumps": -1,
        "tumbles": -1, "sinks": -1, "declines": -1, "decline": -1, "weak": -1, "bearish": -1,
        "loss": -1, "warning": -1, "warns": -1, "fined": -1, "cuts": -1, "concerns": -1, "risk": -1,
    },
}

_COMPILED: dict[str, list[tuple[re.Pattern, int]]] = {}


def _patterns(lang: str) -> list[tuple[re.Pattern, int]]:
    if lang not in _COMPILED:
        items = sorted(LEXICON[lang].items(), key=lambda kv: -len(kv[0]))
        _COMPILED[lang] = [(re.compile(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])"), w) for k, w in items]
    return _COMPILED[lang]


def score_headline(title: str, lang: str = "id") -> tuple[int, str, list[str]]:
    """Kembalikan (skor, label 'pos'/'neg'/'neu', frasa yang cocok)."""
    text = " " + (title or "").lower() + " "
    total, hits = 0, []
    for pat, w in _patterns(lang):
        if pat.search(text):
            total += w
            hits.append(pat.pattern)
            text = pat.sub(" ", text)  # cegah frasa pendek ikut terhitung
    label = "pos" if total > 0 else "neg" if total < 0 else "neu"
    clean = [re.sub(r"\(\?<!\[\\w-\]\)|\(\?!\[\\w-\]\)|\\", "", h) for h in hits]
    return total, label, clean
