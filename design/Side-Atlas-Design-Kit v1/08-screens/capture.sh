#!/bin/bash
# Export every prototype screen as a 1440×900 PNG with headless Chrome.
#   bash capture.sh            (run from anywhere)
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$(echo "$KIT/07-mockups/app.html" | sed 's/ /%20/g')"
i=1
for s in overview ledger tax ask report missing; do
  out="$KIT/08-screens/desktop/$(printf %02d $i)-$s.png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 \
    --virtual-time-budget=4000 --screenshot="$out" "$URL?screen=$s" >/dev/null 2>&1
  echo "$out"; i=$((i+1))
done
