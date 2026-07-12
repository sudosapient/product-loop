#!/bin/sh

set -eu

: "${PRODUCT_LOOP_REPO:?set PRODUCT_LOOP_REPO to the persistent absolute repository path}"
: "${PRODUCT_LOOP_SKILL:?set PRODUCT_LOOP_SKILL to the absolute product-loop skill path}"
: "${PRODUCT_LOOP_PI_TRUST:?set PRODUCT_LOOP_PI_TRUST=reviewed only after reviewing the target project resources}"

if [ "$PRODUCT_LOOP_PI_TRUST" != "reviewed" ]; then
  printf '%s\n' 'observation-resume.sh supports reviewed/trusted targets only; contain untrusted targets and use the secure user-scope route' >&2
  exit 2
fi

case "$PRODUCT_LOOP_REPO:$PRODUCT_LOOP_SKILL" in
  /*:/*) ;;
  *) printf '%s\n' 'PRODUCT_LOOP_REPO and PRODUCT_LOOP_SKILL must be absolute paths' >&2; exit 2 ;;
esac

repo=$PRODUCT_LOOP_REPO
skill=$PRODUCT_LOOP_SKILL
pi_bin=${PRODUCT_LOOP_PI_BIN:-pi}
model=${PRODUCT_LOOP_PI_MODEL:-llm-proxy/gpt-5.6-sol}
env_file=${PRODUCT_LOOP_ENV_FILE:-"$HOME/.config/product-loop/env"}
stale_seconds=${PRODUCT_LOOP_LOCK_STALE_SECONDS:-7200}
state="$repo/.loop/run-state.json"
contract="$repo/product/observation/monitor-contract.md"
prompt="$skill/assets/observation/observation-resume-prompt.md"
validator="$skill/scripts/validate-run-state.mjs"
lock_root="$repo/.loop/locks"
lock_dir="$lock_root/observation-resume.lock"
session_dir="$repo/.loop/pi-sessions"
log_dir="$repo/.loop/logs"

for path in "$repo" "$skill" "$state" "$contract" "$prompt" "$validator"; do
  [ -e "$path" ] || { printf 'required path is missing: %s\n' "$path" >&2; exit 2; }
done
command -v "$pi_bin" >/dev/null 2>&1 || { printf 'Pi binary is unavailable: %s\n' "$pi_bin" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { printf '%s\n' 'node is required' >&2; exit 2; }
[ -r "$env_file" ] && . "$env_file"
case "$stale_seconds" in ''|*[!0-9]*) printf '%s\n' 'PRODUCT_LOOP_LOCK_STALE_SECONDS must be a positive integer' >&2; exit 2 ;; esac
[ "$stale_seconds" -gt 0 ] || { printf '%s\n' 'PRODUCT_LOOP_LOCK_STALE_SECONDS must be positive' >&2; exit 2; }

mkdir -p "$lock_root" "$session_dir" "$log_dir"
if ! mkdir "$lock_dir" 2>/dev/null; then
  now=$(date -u '+%s')
  created=$(cat "$lock_dir/created_epoch" 2>/dev/null || printf '0')
  case "$created" in ''|*[!0-9]*) created=0 ;; esac
  age=$((now - created))
  if [ "$created" -eq 0 ] || [ "$age" -le "$stale_seconds" ]; then
    printf '%s\n' 'observation continuation is already locked; exiting without mutation'
    exit 0
  fi
  stale_dir="$lock_root/observation-resume.stale.$now.$$"
  if ! mv "$lock_dir" "$stale_dir" 2>/dev/null || ! mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' 'another invocation owns or recovered the observation lock; exiting without mutation'
    exit 0
  fi
  rm -f "$stale_dir/created_epoch" "$stale_dir/pid" "$stale_dir/host"
  rmdir "$stale_dir" 2>/dev/null || true
fi
date -u '+%s' > "$lock_dir/created_epoch"
printf '%s\n' "$$" > "$lock_dir/pid"
uname -n > "$lock_dir/host"
cleanup_lock() {
  rm -f "$lock_dir/created_epoch" "$lock_dir/pid" "$lock_dir/host"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup_lock EXIT
trap 'cleanup_lock; exit 1' HUP INT TERM

node "$validator" "$state" --snapshot-only --repo "$repo" >/dev/null

set +e
node - "$state" <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (state.lifecycle !== 'OBSERVING') process.exit(10);
const due = Date.parse(state.observation?.next_check_at ?? '');
if (!Number.isFinite(due)) process.exit(11);
if (due > Date.now()) process.exit(12);
NODE
due_status=$?
set -e

case "$due_status" in
  0) ;;
  10) printf '%s\n' 'run is not OBSERVING; exiting without mutation'; exit 0 ;;
  12) printf '%s\n' 'next observation check is not due; exiting without mutation'; exit 0 ;;
  *) printf '%s\n' 'observation.next_check_at is missing or invalid' >&2; exit 1 ;;
esac

stamp=$(date -u '+%Y%m%dT%H%M%SZ')
stdout_log="$log_dir/observation-$stamp.jsonl"
stderr_log="$log_dir/observation-$stamp.stderr.log"
before_state=$(cksum "$state")

(
  cd "$repo"
  "$pi_bin" \
    --mode json \
    --model "$model" \
    --thinking high \
    --session-dir "$session_dir" \
    --name product-loop-observation \
    --skill "$skill" \
    --approve \
    @"$state" \
    @"$contract" \
    @"$prompt"
) >"$stdout_log" 2>"$stderr_log"

node "$validator" "$state" --snapshot-only --repo "$repo" >/dev/null
[ "$(cksum "$state")" != "$before_state" ] || {
  printf '%s\n' 'scheduled observation completed without advancing durable run state' >&2
  exit 1
}
