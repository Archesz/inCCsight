#!/usr/bin/env python3
"""
server.py — thin shim for running the inCCsight server from the repo root.

The actual server logic lives in inccsight/server.py (the pip-installable package).
This file exists for developer convenience:

    python server.py            # dev mode  (React on :3000 via CRA proxy)
    python server.py --prod     # prod mode (also serves the React build)
    python server.py --port XXXX

Equivalent to:  python -m inccsight [--no-browser] [--port XXXX]
"""

import sys

_MISSING = []
try:
    import uvicorn          # noqa: F401
except ImportError:
    _MISSING.append('uvicorn[standard]')
try:
    import fastapi          # noqa: F401
except ImportError:
    _MISSING.append('fastapi')
try:
    import sse_starlette    # noqa: F401
except ImportError:
    _MISSING.append('sse-starlette')

if _MISSING:
    print('\n[ERROR] Missing Python dependencies for the inCCsight server:\n')
    print(f"   pip install {' '.join(_MISSING)}\n")
    sys.exit(1)

import argparse
from inccsight.server import app, mount_static   # noqa: E402

if __name__ == '__main__':
    import uvicorn  # noqa: E402

    parser = argparse.ArgumentParser(description='inCCsight local server')
    parser.add_argument('--prod',   action='store_true', help='Serve React build (prod mode)')
    parser.add_argument('--port',   type=int, default=3001, help='Port (default: 3001)')
    args = parser.parse_args()

    if args.prod:
        mount_static()

    print(f'[OK] inCCsight server running at http://localhost:{args.port}')
    uvicorn.run(app, host='localhost', port=args.port, log_level='warning')
