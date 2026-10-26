#!/usr/bin/env python3
"""Minimal static server for local / LAN preview.

Usage: python scripts/serve.py [port]
Serves the project root over HTTP so the ES modules and JSON load correctly.
Defaults to port 8321 on all interfaces (so a phone on the same Wi-Fi can open it).
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8321


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 开发期全量禁缓存: 之前改完 JS 手机上还是旧版, 就是因为 ES module 被磁盘缓存了。
        # no-store 只在这个本地调试服务器上生效, 不影响正式部署。
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


with http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'CET study tool -> http://localhost:{PORT}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        fprint = functools.partial(print)
        fprint('stopped')
