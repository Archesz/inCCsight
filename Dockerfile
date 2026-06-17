# ─────────────────────────────────────────────────────────────────────────────
# inCCsight — Dockerfile
#
# Builds a single production image containing:
#   • Python 3.10 + all neuroimaging / ML dependencies
#   • Node.js 18 + built React frontend
#   • Express backend (server.js)
#
# Build arguments:
#   TORCH_INDEX   PyTorch wheel index URL (default: CPU-only)
#                 CPU:       https://download.pytorch.org/whl/cpu
#                 CUDA 11.8: https://download.pytorch.org/whl/cu118
#                 CUDA 12.1: https://download.pytorch.org/whl/cu121
#
# Usage:
#   docker build -t inccsight .                           # CPU
#   docker build --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu121 \
#                -t inccsight:gpu .                        # CUDA 12.1
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.10-slim AS base

ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 18 ────────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies (cached layer) ───────────────────────────────────────
# Install PyTorch first (index varies by CUDA version)
RUN pip install --no-cache-dir "torch>=2.0.0" --index-url "${TORCH_INDEX}"

COPY methods/requirements.txt methods/requirements.txt
RUN pip install --no-cache-dir -r methods/requirements.txt

# ── Node dependencies (cached layer) ─────────────────────────────────────────
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ── ViT Quality-Control model (baked into the image) ──────────────────────────
# The .pth is gitignored (too large for git); place it in methods/models/ in the
# build context before building so it is included here. The folder always exists
# (methods/models/.gitkeep), so this COPY succeeds even when the model is absent —
# in that case the entrypoint can fetch it at runtime via INCCSIGHT_QC_MODEL_URL.
COPY methods/models/ methods/models/

# ── Copy source and build React (includes the guided tutorial) ────────────────
COPY . .
RUN npm run build

# ── Runtime configuration ─────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONIOENCODING=utf-8

EXPOSE 3001

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
