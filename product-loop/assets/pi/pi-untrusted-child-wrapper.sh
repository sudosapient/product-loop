#!/bin/sh
set -eu

: "${PI_REAL_BINARY:?Set PI_REAL_BINARY to the reviewed absolute path returned by command -v pi}"

exec "$PI_REAL_BINARY" --no-approve --no-context-files "$@"
