#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  Starting Writing Studio..."
echo ""
if ! command -v node &> /dev/null; then
  echo "  Node.js is not installed."
  echo "  Download it from https://nodejs.org and try again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d "node_modules" ]; then
  echo "  First-time setup: installing dependencies..."
  npm install
fi
npm run studio
