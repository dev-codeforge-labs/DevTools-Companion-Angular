#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " DevTools Companion for Angular — Build XPI"
echo " ============================================"
echo ""

# Check Node.js is available
if ! command -v node &>/dev/null; then
    echo " ERROR: Node.js not found. Install it from https://nodejs.org"
    exit 1
fi

# Move to the directory where this script lives
cd "$(dirname "$0")"

# Run the build
node build.js
