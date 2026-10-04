"""Aggregated post-shahada follow-up statistics from the theislam.chat export.
Counts only — no text, IPs or identities are output (challenge T&C §9).
Definition: a 'shahada conversation' = the assistant congratulated the user on entering Islam (regex, mostly English → strict lower bound)."""
import gzip, json, re, statistics, sys
PATH = sys.argv[1] if len(sys.argv) > 1 else '/Users/muhammad/midade/projects/theislam-chat/db/chats-2026-09-08.ndjson.gz'
CONGR = re.compile(r"(congratulations on (embracing|accepting|entering) islam|you are now (a )?muslim|welcome to islam|welcome to the (fold|family) of islam|ikaw ay (ganap nang )?muslim|umekuwa muislamu|مبارك (لك )?(دخولك|إسلامك)|أصبحت مسلما|أصبحتَ مسلمًا|أصبحت مسلمًا|أصبحتِ مسلمة|bienvenue dans l'islam|ahora eres musulm|you have (now )?entered islam)", re.I)
EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')
PHONE = re.compile(r'\+?\d[\d\s-]{8,}\d')
ASK_CONTACT = re.compile(r'(phone|email|whatsapp|e-mail|رقم|واتس|بريد)', re.I)
LEARN = re.compile(r"(how (do|to|can) (i )?(pray|perform (the )?(prayer|salah|wudu)|make wudu|fast)|wudu|ablution|salah|namaz|what (should|do) i do (now|next)|next step|learn (more|quran|arabic|to pray)|كيف (أ|ا)صلي|الوضوء|ماذا (أ|ا)فعل الآن)", re.I)
n = asked = shared = learn = short = back = 0; after_counts = []
with gzip.open(PATH, 'rt') as f:
    for line in f:
        d = json.loads(line); ms = sorted(d['messages'], key=lambda m: m['id'])
        i = next((k for k, m in enumerate(ms) if m['role'] == 'assistant' and CONGR.search(m.get('text') or '')), None)
        if i is None: continue
        n += 1; after = ms[i + 1:]; ua = [m for m in after if m['role'] == 'user']
        after_counts.append(len(ua))
        asked += any(ASK_CONTACT.search(m.get('text') or '') for m in after if m['role'] == 'assistant')
        shared += any(EMAIL.search(m.get('text') or '') or PHONE.search(m.get('text') or '') for m in ua)
        learn += any(LEARN.search(m.get('text') or '') for m in ua)
        short += len(ua) <= 2
        ts = [m['at'][:10] for m in after if m.get('at')]
        back += bool(ts and ms[i].get('at') and max(ts) != ms[i]['at'][:10])
out = dict(shahada_conversations=n, bot_asked_for_contact=asked, user_shared_contact=shared,
           user_shared_contact_pct=round(100 * shared / n, 1), ended_within_2_user_msgs=short,
           ended_within_2_pct=round(100 * short / n, 1), median_user_msgs_after=statistics.median(after_counts),
           came_back_another_day=back, asked_how_to_pray_or_what_next=learn)
print(json.dumps(out, ensure_ascii=False, indent=1))
