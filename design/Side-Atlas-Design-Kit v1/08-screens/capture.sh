#!/bin/bash
# Export prototype screens as 1440×900 PNGs with headless Chrome (v1.4.1).
#   bash capture.sh          every screen
#   bash capture.sh v13      only the v1.3, v1.3.1 and v1.4 screens (10 to 22)
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
  # v1.4.1: one menu drawn open
  shoot 01b-overview-period-menu overview-period 900
  shoot 02b-ledger-platform-menu ledger-platform 900
fi
shoot 10-mydata-empty mydata-empty 900
shoot 11-mydata mydata 900
shoot 12-settings-privacy privacy 900
shoot 13-tax-china tax-cn 900
shoot 13b-tax-china-full tax-cn "${TAX_CN_FULL_HEIGHT:-1360}"
shoot 14-overview-cny overview-cny 900
# v1.3.1
shoot 12b-delete-dialog privacy-delete 900
shoot 15-tax-both tax-both 900
shoot 16-empty-overview overview-empty 900
shoot 17-ledger-cny-ecb ledger-cny 900
shoot 17-ledger-cny-ecb-full ledger-cny "${LEDGER_ECB_FULL_HEIGHT:-2000}"
shoot 17b-ledger-cny-ratefile ledger-cny-file 900
shoot 17b-ledger-cny-ratefile-full ledger-cny-file "${LEDGER_FILE_FULL_HEIGHT:-2230}"
# v1.4
shoot 18-add-expense entry-expense 900
shoot 18b-add-income entry-income 900
shoot 19-ledger-v14 ledger-v14 900
shoot 19b-ledger-v14-full ledger-v14 "${LEDGER_V14_FULL_HEIGHT:-2460}"
shoot 20-overview-v14 overview-v14 900
shoot 20b-overview-v14-full overview-v14 "${OVERVIEW_V14_FULL_HEIGHT:-960}"
shoot 21-milestones milestones 900
shoot 22-goal-sheet goal-sheet 900
shoot 22b-goal-reached goal-reached 900
