#!/bin/bash
cd "$(dirname "$0")/../service" && set -a && . ../.env && set +a
npx tsx tools/build_lessons.ts fr es
npx tsx tools/backtranslate_review.ts fr hi
echo done > ../data/logs/finish-langs2.done
