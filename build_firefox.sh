#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " DevTools Companion for Angular — Build Firefox XPI"
echo " ===================================================="
echo ""

if ! command -v node &>/dev/null; then
    echo " ERROR: Node.js not found. Install it from https://nodejs.org"
    exit 1
fi

cd "$(dirname "$0")"
node build.js firefox
