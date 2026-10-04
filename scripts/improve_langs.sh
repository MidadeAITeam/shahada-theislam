#!/bin/bash
# Regenerate lessons that failed the back-translation check, review again, then build exercises.
cd "$(dirname "$0")/.." && set -a && . ./.env && set +a
LANGS="fr es id pt bs vi ru th tl hi"
python3 - <<'PY'
import json, os
rev = json.load(open('content/review.json'))['approved']
for lang in "fr es id pt bs vi ru th tl hi".split():
    f = f'data/build/{lang}/lessons.json'
    if not os.path.exists(f): continue
    d = json.load(open(f))
    keep = {k: v for k, v in d.items() if f'{lang}:{k}' in rev}
    json.dump(keep, open(f, 'w'), ensure_ascii=False)
    print(lang, 'kept', len(keep), 'regenerating', len(d) - len(keep) + (19 - len(d)))
PY
cd service
npx tsx tools/build_lessons.ts $LANGS
npx tsx tools/backtranslate_review.ts $LANGS
npx tsx tools/build_exercises.ts $LANGS
echo done > ../data/logs/improve-langs.done
