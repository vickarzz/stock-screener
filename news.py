"""
Ambil judul berita terbaru per saham dari Google News RSS (gratis, tanpa API key),
lalu beri label sentimen dengan sentiment.py.

Yang disimpan hanya judul, sumber, tanggal, dan link ke artikel aslinya.
"""

from __future__ import annotations

import email.utils
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

from sentiment import score_headline

RSS = "https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={gl}:{lang}"
UA = "Mozilla/5.0 (compatible; stock-screener/1.0)"

LOCALES = {
    "idx": {"hl": "id", "gl": "ID", "lang": "id", "sent": "id"},
    "us": {"hl": "en-US", "gl": "US", "lang": "en", "sent": "en"},
}


def build_query(ticker: str, name: str | None, market: str, is_etf: bool) -> str:
    if market == "idx":
        # "BBRI" + kata saham cukup spesifik; nama perusahaan membantu emiten kecil
        short = (name or "").replace("Tbk", "").replace("PT ", "").replace(".", "").strip()
        return f'("{ticker}" OR "{short}") saham' if short else f'"{ticker}" saham'
    return f'"{ticker}" ETF' if is_etf else f'"{ticker}" stock'


def parse_rss(xml_text: str, sent_lang: str, now: datetime, max_items: int = 6, max_age_days: int = 30) -> list[dict]:
    """Ubah XML RSS jadi daftar berita bersih (tanpa internet; mudah dites)."""
    root = ET.fromstring(xml_text)
    out, seen = [], set()
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()
        # Google News menulis "Judul - Sumber"; buang ekor sumbernya
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3].strip()
        key = title.lower()[:80]
        if not title or key in seen:
            continue
        try:
            dt = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "")
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if now - dt > timedelta(days=max_age_days):
            continue
        seen.add(key)
        score, label, hits = score_headline(title, sent_lang)
        out.append({
            "title": title,
            "source": source,
            "url": (item.findtext("link") or "").strip(),
            "date": dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "score": score,
            "label": label,
            "hits": hits,
        })
    out.sort(key=lambda n: n["date"], reverse=True)
    return out[:max_items]


def fetch_news(ticker: str, name: str | None, market: str, is_etf: bool = False, timeout: int = 15) -> list[dict]:
    loc = LOCALES[market]
    q = urllib.parse.quote(build_query(ticker, name, market, is_etf))
    url = RSS.format(q=q, hl=loc["hl"], gl=loc["gl"], lang=loc["lang"])
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        xml_text = r.read().decode("utf-8", errors="replace")
    return parse_rss(xml_text, loc["sent"], datetime.now(timezone.utc))
