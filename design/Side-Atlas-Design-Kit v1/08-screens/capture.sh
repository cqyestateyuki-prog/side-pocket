#!/bin/bash
# Export every prototype screen as a 1440×900 PNG with headless Chrome (v1.1).
#   bash capture.sh            (run from anywhere)
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$(echo "$KIT/07-mockups/app.html" | sed 's/ /%20/g')"
shoot() { # name screen height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,"$3" \
    --virtual-time-budget=4000 --screenshot="$KIT/08-screens/desktop/$1.png" "$URL?screen=$2" >/dev/null 2>&1
  echo "$KIT/08-screens/desktop/$1.png"
}
shoot 01-overview overview 900
shoot 02-ledger ledger 900
shoot 03-tax tax 900
shoot 03b-tax-full tax "${TAX_FULL_HEIGHT:-1640}"
shoot 04-ask ask 900
shoot 05-report report 900
shoot 06-missing missing 900
shoot 07-sources sources 900
shoot 08-settings settings 900
shoot 09-ask-zh ask-zh 900
