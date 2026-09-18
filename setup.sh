#!/bin/bash
# setup.sh — inCCsight local setup (Linux / macOS)
# Run once after cloning the repository.
set -e

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   inCCsight — Local Setup                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
echo -e "${BOLD}[1/5] Checking Python...${NC}"
PYTHON=$(command -v python3 || command -v python || true)
if [ -z "$PYTHON" ]; then
    echo -e "${RED}ERROR: Python 3.9+ not found.${NC}"
    echo "       Install from https://www.python.org/downloads/"
    exit 1
fi

PY_VER=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
PY_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 9 ]; }; then
    echo -e "${RED}ERROR: Python 3.9+ required (found $PY_VER).${NC}"
    exit 1
fi
echo -e "${GREEN}  Python $PY_VER${NC}"

# ── Create Python venv ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/5] Creating Python virtual environment...${NC}"
$PYTHON -m venv methods/venv
source methods/venv/bin/activate
pip install --upgrade pip --quiet
echo -e "${GREEN}  Virtual environment: methods/venv${NC}"

# ── Install PyTorch ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/5] Installing PyTorch...${NC}"
echo -e "${YELLOW}  Detecting CUDA availability...${NC}"

TORCH_URL="https://download.pytorch.org/whl/cpu"
if command -v nvidia-smi &>/dev/null; then
    CUDA_VER=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}' | cut -d. -f1,2 | tr -d '.')
    if [ -n "$CUDA_VER" ]; then
        echo -e "${GREEN}  NVIDIA GPU detected (CUDA $CUDA_VER)${NC}"
        if [ "$CUDA_VER" -ge 121 ] 2>/dev/null; then
            TORCH_URL="https://download.pytorch.org/whl/cu121"
            echo "  Using CUDA 12.1 wheels"
        elif [ "$CUDA_VER" -ge 118 ] 2>/dev/null; then
            TORCH_URL="https://download.pytorch.org/whl/cu118"
            echo "  Using CUDA 11.8 wheels"
        fi
    fi
else
    echo -e "${YELLOW}  No NVIDIA GPU detected — installing CPU-only PyTorch.${NC}"
fi

pip install "torch>=2.0.0" --index-url "$TORCH_URL" --quiet
echo -e "${GREEN}  PyTorch installed ($TORCH_URL)${NC}"

# ── Install Python requirements ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/5] Installing Python packages...${NC}"
pip install -r methods/requirements.txt --quiet
deactivate
echo -e "${GREEN}  Python packages installed.${NC}"

# ── Install Node.js dependencies ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}[5/5] Installing Node.js packages...${NC}"
if ! command -v node &>/dev/null; then
    echo -e "${RED}ERROR: Node.js not found.${NC}"
    echo "       Install from https://nodejs.org/en/download/"
    exit 1
fi
NODE_VER=$(node -v)
echo "  Node.js $NODE_VER"
npm install --legacy-peer-deps --silent
echo -e "${GREEN}  Node packages installed.${NC}"

# ── Copy .env ─────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo -e "${YELLOW}  .env created from .env.example — edit SUBJECTS_DIR if needed.${NC}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo "  To start inCCsight:  ./start.sh"
echo ""
echo -e "${YELLOW}  ── Model files ship with the repository ─────────────────────────${NC}"
echo -e "${YELLOW}  [CNN model]  .ckpt files are in methods/CNNBased/peso/ (regular git).${NC}"
echo -e "${YELLOW}  [QC model]   .pth is stored via Git LFS. If methods/models/*.pth is${NC}"
echo -e "${YELLOW}               only a few KB (an LFS pointer), run:  git lfs pull${NC}"
echo -e "${YELLOW}  ──────────────────────────────────────────────────────────────────${NC}"
echo ""
