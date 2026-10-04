#!/bin/bash
# Convert every downloaded Al-Wajeez PDF to Markdown (resumable).
cd "$(dirname "$0")/.." && set -a && . ./.env && set +a
for l in ar en fr es id pt ru bs vi th; do
  python3 scripts/extract_book.py "$l" --workers 8 >> "data/logs/extract-$l.log" 2>&1
done
echo done > data/logs/extract-all.done
