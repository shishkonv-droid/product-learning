#!/usr/bin/env bash
# Rebuild data.js from tools/src and stamp the service-worker cache version
# with a content hash, so installed apps pick up new lessons automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/build_data.py tools/src/main.xml tools/src/weeks > data.js
hash=$(cat data.js app.js style.css index.html | sha256sum | cut -c1-10)
sed -i -E "s/^const VERSION = \".*\";/const VERSION = \"$hash\";/" sw.js
echo "built: $(grep -o '"[0-9]*": {' data.js | wc -l) full lessons, sw version $hash"
