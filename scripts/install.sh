#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)'; then
  echo "Node.js 22.19+ is required. Install it from your OS package manager or https://nodejs.org, then rerun this script." >&2
  exit 1
fi

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
npm install -g "$root"
exec product-loop setup
