"""Download QuranEnc translations (ayah-level) into data/quran/translations/<lang>.json.

Usage: python scripts/fetch_quranenc.py
Terms: https://quranenc.com — translations are used unmodified with attribution.
"""
import json, pathlib, subprocess, time, concurrent.futures as cf

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data/quran/translations"
KEYS = {
    "en": "english_saheeh", "fr": "french_montada", "es": "spanish_montada_eu", "pt": "portuguese_nasr",
    "id": "indonesian_affairs", "ru": "russian_kuliev", "bs": "bosnian_rwwad", "vi": "vietnamese_rwwad",
    "th": "thai_rwwad", "zh": "chinese_makin", "tl": "tagalog_rwwad", "ml": "malayalam_kunhi",
    "si": "sinhalese_mahir", "te": "telugu_muhammad", "bn": "bengali_zakaria", "ps": "pashto_rwwad",
    "om": "oromo_rwwad",
}

def get(url):
    for i in range(6):
        r = subprocess.run(["curl", "-sS", "-m", "60", url], capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except ValueError:
                pass
        time.sleep(2 * (i + 1))
    raise RuntimeError(url)

def fetch(lang, key):
    out = OUT / f"{lang}.json"
    if out.exists():
        return lang, "skip"
    ayat = {}
    for s in range(1, 115):
        for a in get(f"https://quranenc.com/api/v1/translation/sura/{key}/{s}")["result"]:
            ayat[f"{a['sura']}:{a['aya']}"] = a["translation"]
    out.write_text(json.dumps({"key": key, "lang": lang, "source": "https://quranenc.com", "ayat": ayat},
                              ensure_ascii=False), encoding="utf-8")
    return lang, len(ayat)

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(4) as ex:
        for f in cf.as_completed([ex.submit(fetch, l, k) for l, k in KEYS.items()]):
            try:
                print(*f.result(), flush=True)
            except Exception as e:
                print("ERROR", e, flush=True)
