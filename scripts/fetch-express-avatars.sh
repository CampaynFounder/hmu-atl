#!/usr/bin/env bash
# Fetches N AI-generated portraits from thispersondoesnotexist.com, resizes
# them to 256px (max dimension) JPEGs, and saves them to
# public/express-avatars/01.jpg ... NN.jpg. Re-run this script when you
# want a fresh set of synthetic faces — the existing files are overwritten.
#
# No real people are depicted; the images are StyleGAN faces that don't
# correspond to any real human, so there's no consent or licensing concern.
#
# Requires: curl + sips (macOS). On Linux, swap sips for ImageMagick.
set -euo pipefail

COUNT="${1:-24}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/public/express-avatars"
mkdir -p "$DIR"
cd "$DIR"

for i in $(seq -w 1 "$COUNT"); do
  echo "fetching $i / $COUNT"
  curl -s -o "_raw_${i}.jpg" \
    https://thispersondoesnotexist.com/ \
    -H "Cache-Control: no-cache" \
    --max-time 30
  if [ -s "_raw_${i}.jpg" ]; then
    sips -Z 256 "_raw_${i}.jpg" --out "${i}.jpg" >/dev/null 2>&1
  else
    echo "  failed (empty response) — keeping previous ${i}.jpg if present"
  fi
  rm -f "_raw_${i}.jpg"
  sleep 1.5
done

echo "done — $(ls -1 *.jpg 2>/dev/null | wc -l) avatars in $DIR"
