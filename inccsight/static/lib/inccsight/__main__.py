"""
Entry point for:
  python -m inccsight        (from repo or any directory)
  inccsight                  (after pip install)

The server always looks for analysis data in the current working directory
(or $INCCSIGHT_PROJECT if set).  Navigate to your project folder first:

    cd /path/to/my/inccsight-project
    inccsight
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
import webbrowser


def main() -> None:
    parser = argparse.ArgumentParser(
        prog='inccsight',
        description='inCCsight — DTI Corpus Callosum analysis dashboard',
    )
    parser.add_argument(
        '--port', type=int, default=3001,
        help='Port to listen on (default: 3001)',
    )
    parser.add_argument(
        '--no-browser', action='store_true',
        help='Do not open the browser automatically',
    )
    parser.add_argument(
        '--project', metavar='DIR',
        help='Path to the inCCsight project directory (overrides $INCCSIGHT_PROJECT and CWD)',
    )
    args = parser.parse_args()

    # Allow --project to override before the server module resolves paths
    if args.project:
        import os
        os.environ['INCCSIGHT_PROJECT'] = args.project

    # Import here so path resolution above takes effect first
    try:
        import uvicorn
        from inccsight.server import app, mount_static
    except ImportError as exc:
        print(f'\n[ERROR] Missing dependency: {exc}')
        print('        pip install -r requirements-server.txt\n')
        sys.exit(1)

    mount_static()

    url = f'http://localhost:{args.port}'

    if not args.no_browser:
        def _open_browser():
            time.sleep(1.5)
            webbrowser.open(url)
        threading.Thread(target=_open_browser, daemon=True).start()

    print(f'[OK] inCCsight running at {url}')
    print(f'     Press Ctrl+C to stop.\n')
    uvicorn.run(app, host='localhost', port=args.port, log_level='warning')


if __name__ == '__main__':
    main()
