#!/bin/bash
# Build passages, embeddings and lessons for the remaining editions (resumable).
cd "$(dirname "$0")/.." && set -a && . ./.env && set +a
for l in es id pt bs vi ru; do
  python3 scripts/build_chunks.py $l && python3 scripts/build_index.py $l
done
cd service
npx tsx tools/build_lessons.ts es id pt bs vi ru tl hi
echo done > ../data/logs/build-rest.done
