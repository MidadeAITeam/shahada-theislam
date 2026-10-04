"""Aggregate, anonymised statistics from the theislam.chat archive export.
Outputs counts only — no conversation text, IPs or identities (per challenge T&C §9)."""
import gzip, json, re, collections, statistics, sys
from langdetect import detect, DetectorFactory
DetectorFactory.seed = 0
PATH = sys.argv[1] if len(sys.argv) > 1 else '/Users/muhammad/midade/projects/theislam-chat/db/chats-2026-09-08.ndjson.gz'
CONGR = re.compile(r"(congratulations on (embracing|accepting|entering) islam|you are now (a )?muslim|welcome to islam|welcome to the (fold|family) of islam|ikaw ay (ganap nang )?muslim|umekuwa muislamu|مبارك (لك )?(دخولك|إسلامك)|أصبحت مسلما|أصبحتَ مسلمًا|أصبحت مسلمًا|أصبحتِ مسلمة|bienvenue dans l'islam|ahora eres musulm|you have (now )?entered islam)", re.I)
REL = {'christian': r'\b(christian|catholic|protestant|orthodox|kristiyano|chrétien|cristian[oa]|mkristo)\b', 'hindu': r'\bhindu',
       'atheist/agnostic': r'\b(atheist|ateo|ateísta|athée|agnostic|no religion)\b', 'buddhist': r'\b(buddhist|budista|bouddhiste|buddhism)\b',
       'jewish': r'\b(jew|jewish)\b'}
QURAN = re.compile(r'(qur.?an\s*\(?\d{1,3}\s*[:：]\s*\d{1,3}|surah|sūrah|\(\d{1,3}:\d{1,3}\)|سورة|\[\s*\d{1,3}\s*:\s*\d{1,3}\s*\])', re.I)
S = collections.Counter(); countries = set(); langs = collections.Counter(); rel = collections.Counter(); per_chat = []
conv_c = collections.Counter(); conv_rel = collections.Counter(); conv_lang = collections.Counter(); prefixes = collections.Counter()
first = last = None
with gzip.open(PATH, 'rt') as f:
    for line in f:
        d = json.loads(line); S['chats'] += 1
        ms = sorted(d['messages'], key=lambda m: m['id']); per_chat.append(len(ms))
        if d.get('country'): countries.add(d['country'])
        tid = str(d.get('thread_id') or ''); prefixes[tid.split('_')[0] if '_' in tid else 'none'] += 1
        c = d.get('created_at') or ''
        if c: first = min(first or c, c); last = max(last or c, c)
        us = [m.get('text') or '' for m in ms if m['role'] == 'user']
        S['user_msgs'] += len(us); S['assistant_msgs'] += sum(1 for m in ms if m['role'] == 'assistant')
        for m in ms:
            if m['role'] == 'assistant' and len(m.get('text') or '') >= 200:
                S['long_answers'] += 1; S['long_answers_with_quran_ref'] += bool(QURAN.search(m['text']))
        joined = ' '.join(us)
        try: lg = detect(joined[:600]) if joined.strip() else None
        except Exception: lg = None
        if lg: langs[lg] += 1
        rs = [k for k, p in REL.items() if re.search(p, joined.lower())]
        rel.update(rs)
        if any(m['role'] == 'assistant' and CONGR.search(m.get('text') or '') for m in ms):
            S['shahada_chats'] += 1; conv_c[d.get('country')] += 1; conv_rel.update(rs); conv_lang[lg] += 1
excl = {'Saudi Arabia', 'Egypt', None}
out = dict(S)
out.update(first=first, last=last, countries=len(countries), languages_detected=len(langs),
           languages_20plus=sum(1 for v in langs.values() if v >= 20), top_languages=langs.most_common(15),
           median_msgs=statistics.median(per_chat), chats_10plus=sum(1 for p in per_chat if p >= 10),
           religion_mentions=dict(rel), channel_prefixes=dict(prefixes),
           shahada_excl_SA_EG_unknown=sum(v for k, v in conv_c.items() if k not in excl),
           shahada_countries_excl=len([k for k in conv_c if k not in excl]),
           shahada_by_country=conv_c.most_common(12), shahada_by_religion=dict(conv_rel), shahada_langs=conv_lang.most_common(10))
print(json.dumps(out, ensure_ascii=False, indent=1))
