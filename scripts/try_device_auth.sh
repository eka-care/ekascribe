#!/usr/bin/env bash
# End-to-end test of the device sign-in flow (simulates the desktop app).
#
#   ./device_login_test.sh                          # against localhost:8000
#   BASE=https://your-server ./device_login_test.sh
#   TIMEOUT_MINS=5 ./device_login_test.sh
set -euo pipefail

BASE="${BASE:-http://localhost:8000}"
TIMEOUT_MINS="${TIMEOUT_MINS:-5}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }

command -v jq >/dev/null || { err "jq is required"; exit 1; }

# --- 1. start a device sign-in (what the desktop does on "Sign in") ---------
bold ">> requesting device code from $BASE"
START=$(curl -sf -X POST "$BASE/connect-auth/v1/device/code") || {
  err "could not reach $BASE — is the api up?"; exit 1; }

CODE_ERR=$(echo "$START" | jq -r '.error.code // empty')
[ -n "$CODE_ERR" ] && { err "server said: $CODE_ERR (is AUTH_MODE=jwt?)"; exit 1; }

DEVICE_CODE=$(echo "$START" | jq -r .device_code)
USER_CODE=$(echo "$START"   | jq -r .user_code)
URL=$(echo "$START"         | jq -r .verification_uri_complete)
INTERVAL=$(echo "$START"    | jq -r .interval)

echo
bold "   Open this URL in your browser and click APPROVE:"
echo
echo "       $URL"
echo
echo "   (code: $USER_CODE — expires in $(echo "$START" | jq -r .expires_in)s)"
echo

# convenience: auto-open the browser on macOS/Linux desktop
command -v open >/dev/null && open "$URL" 2>/dev/null || true

# --- 2. poll for tokens (what the desktop does in the background) -----------
bold ">> polling every ${INTERVAL}s (timeout ${TIMEOUT_MINS}m)..."
DEADLINE=$(( $(date +%s) + TIMEOUT_MINS * 60 ))

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  RESP=$(curl -s -X POST "$BASE/connect-auth/v1/device/token" \
    -H 'Content-Type: application/json' \
    -d "{\"device_code\":\"$DEVICE_CODE\"}")

  E=$(echo "$RESP" | jq -r '.error.code // empty')
  case "$E" in
    authorization_pending) printf '.' ;;
    slow_down)             printf 's'; sleep "$INTERVAL" ;;
    expired_token)         echo; err "sign-in expired — run the script again"; exit 1 ;;
    access_denied)         echo; err "request was DENIED in the browser"; exit 1 ;;
    "" )                   break ;;   # no error field -> tokens!
    * )                    echo; err "unexpected error: $E"; echo "$RESP" | jq; exit 1 ;;
  esac
  sleep "$INTERVAL"
done

if [ -z "$(echo "$RESP" | jq -r '.access_token // empty')" ]; then
  echo; err "timed out after ${TIMEOUT_MINS}m without approval"; exit 1
fi

echo
ok ">> SUCCESS — tokens received"
echo "$RESP" | jq '{user: .user.username, expires_in, refresh_expires_in}'

# --- 3. prove the tokens work (Bearer whoami + refresh rotation) ------------
AT=$(echo "$RESP" | jq -r .access_token)
RT=$(echo "$RESP" | jq -r .refresh_token)

bold ">> verifying Bearer access token against whoami..."
WHO=$(curl -sf "$BASE/connect-auth/v1/account/whoami" -H "Authorization: Bearer $AT")
echo "$WHO" | jq
[ "$(echo "$WHO" | jq -r .username)" != "null" ] && ok "   whoami OK"

bold ">> verifying refresh token rotation..."
NEW=$(curl -sf -X POST "$BASE/connect-auth/v1/refresh" \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT\"}")
[ -n "$(echo "$NEW" | jq -r '.access_token // empty')" ] \
  && ok "   refresh OK (new access token minted)" \
  || { err "   refresh FAILED"; echo "$NEW" | jq; exit 1; }

bold ">> verifying single-use device_code..."
AGAIN=$(curl -s -X POST "$BASE/connect-auth/v1/device/token" \
  -H 'Content-Type: application/json' -d "{\"device_code\":\"$DEVICE_CODE\"}")
[ "$(echo "$AGAIN" | jq -r '.error.code')" = "expired_token" ] \
  && ok "   replay correctly rejected" \
  || err "   WARNING: second poll did not return expired_token"

echo
ok "ALL CHECKS PASSED — device flow working end to end"

