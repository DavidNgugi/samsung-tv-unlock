#!/usr/bin/env python3
"""Static server for previewing the launcher in a browser.

Usage: python3 tools/preview_server.py <dir> <port>
"""
import functools
import http.server
import mimetypes
import socketserver
import sys

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")

directory = sys.argv[1] if len(sys.argv) > 1 else "."
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8090

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("127.0.0.1", port), handler) as httpd:
    print("serving %s on http://127.0.0.1:%d/" % (directory, port), flush=True)
    httpd.serve_forever()
