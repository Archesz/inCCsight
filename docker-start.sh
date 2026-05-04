#!/bin/bash
# docker-start.sh — Launch inCCsight via Docker Compose
# Requires Docker Desktop: https://docs.docker.com/desktop/

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
URL="http://localhost:3001"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   inCCsight — Docker                     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Check Docker ──────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo -e "${RED}ERROR: Docker not found.${NC}"
    echo "       Install Docker Desktop from:"
    echo "       https://docs.docker.com/desktop/"
    exit 1
fi

if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker daemon is not running.${NC}"
    echo "       Start Docker Desktop and try again."
    exit 1
fi

# ── GPU flag ─────────────────────────────────────────────────────────────────
COMPOSE_FILES="-f docker-compose.yml"
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    echo -e "${GREEN}  NVIDIA GPU detected — using GPU compose override.${NC}"
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.gpu.yml"
fi

# ── .env check ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}  .env created from .env.example${NC}"
    echo -e "${YELLOW}  Edit SUBJECTS_DIR in .env to point to your DTI data.${NC}"
fi

# ── Already running? ──────────────────────────────────────────────────────────
if docker compose ps 2>/dev/null | grep -q "running"; then
    echo -e "${GREEN}  inCCsight is already running.${NC}"
    echo ""
    echo "  Opening $URL ..."
    open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || true
    exit 0
fi

# ── Start ─────────────────────────────────────────────────────────────────────
echo -e "  Building and starting containers..."
echo -e "${YELLOW}  (First run may take several minutes while downloading dependencies)${NC}"
echo ""

docker compose $COMPOSE_FILES up -d --build

# Wait for healthcheck
echo "  Waiting for server..."
for i in $(seq 1 30); do
    if curl -sf "$URL/api/ping" &>/dev/null; then
        break
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}  inCCsight is running at $URL${NC}"
echo ""
echo "  To stop:  docker compose down"
echo "  Logs:     docker compose logs -f"
echo ""

open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "  Open $URL in your browser."
