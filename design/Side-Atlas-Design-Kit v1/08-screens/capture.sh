#!/bin/bash
# Export prototype screens as 1440×900 PNGs with headless Chrome (v1.3).
#   bash capture.sh          every screen
#   bash capture.sh v13      only the v1.3 screens (10–14)
# 01–08 were last exported in v1.1; the shell (logo, four-item nav, data switch) changed in v1.2/v1.3,
# so re-running the full set re-draws them with the new sidebar.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$(echo "$KIT/07-mockups/app.html" | sed 's/ /%20/g')"
shoot() { # name screen height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,"$3" \
    --virtual-time-budget=4000 --screenshot="$KIT/08-screens/desktop/$1.png" "$URL?screen=$2" >/dev/null 2>&1
  echo "$KIT/08-screens/desktop/$1.png"
}
if [ "${1:-}" != "v13" ]; then
  shoot 01-overview overview 900
  shoot 02-ledger ledger 900
  shoot 03-tax tax 900
  shoot 03b-tax-full tax "${TAX_FULL_HEIGHT:-1640}"
  shoot 04-ask ask 900
  shoot 05-report report 900
  shoot 06-missing missing 900
  shoot 07-sources sources 900
  shoot 08-settings settings 900
fi
shoot 10-mydata-empty mydata-empty 900
shoot 11-mydata mydata 900
shoot 12-settings-privacy privacy 900
shoot 13-tax-china tax-cn 900
shoot 13b-tax-china-full tax-cn "${TAX_CN_FULL_HEIGHT:-1360}"
shoot 14-overview-cny overview-cny 900
