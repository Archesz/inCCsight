#!/bin/bash
# start.sh — Launch inCCsight (local clone version)
# Run setup.sh first if you haven't already.

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
URL="http://localhost:3000"

echo ""
echo -e "${BOLD}Starting inCCsight...${NC}"

# ── Validate setup ────────────────────────────────────────────────────────────
if [ ! -d "methods/venv" ]; then
    echo -e "${RED}ERROR: Python venv not found.${NC}"
    echo "       Run './setup.sh' first."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${RED}ERROR: Node modules not found.${NC}"
    echo "       Run './setup.sh' first."
    exit 1
fi

# ── Check port availability ───────────────────────────────────────────────────
for PORT in 3000 3001; do
    if lsof -i :$PORT &>/dev/null 2>&1; then
        echo -e "${YELLOW}WARNING: Port $PORT is already in use.${NC}"
        echo "         Stop the conflicting process or restart this script."
    fi
done

# ── Activate venv (so the Express process can find python) ───────────────────
export PATH="$(pwd)/methods/venv/bin:$PATH"
export VIRTUAL_ENV="$(pwd)/methods/venv"

# ── Start the app ─────────────────────────────────────────────────────────────
echo -e "${GREEN}  API server:  http://localhost:3001${NC}"
echo -e "${GREEN}  App:         $URL${NC}"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# Open browser after a short delay (background)
(
    sleep 3
    if command -v xdg-open &>/dev/null; then
        xdg-open "$URL"
    elif command -v open &>/dev/null; then
        open "$URL"
    fi
) &

# Start both CRA dev server and Express backend
npm run dev
