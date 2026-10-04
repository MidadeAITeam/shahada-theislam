#!/bin/bash
# Fill missing pages (ru, th), rebuild those editions, retry failed lessons, then back-translation review.
cd "$(dirname "$0")/.." && set -a && . ./.env && set +a
python3 scripts/extract_book.py ru --workers 2; python3 scripts/extract_book.py th --workers 4
python3 scripts/build_chunks.py ru th && python3 scripts/build_index.py ru th
cd service
python3 - <<'PY'
import json
f='../data/build/ru/lessons.json'
# ru passages were rebuilt: drop its lessons so they are regenerated against the new ids
open(f,'w').write('{}')
PY
npx tsx tools/build_lessons.ts es ru th
npx tsx tools/backtranslate_review.ts es id pt bs vi ru th tl hi
echo done > ../data/logs/finish-langs.done
