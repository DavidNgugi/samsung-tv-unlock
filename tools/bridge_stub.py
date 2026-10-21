#!/usr/bin/env python3
"""A throwaway bridge the TV agent can talk to.

Serves the two endpoints the agent knows:

    GET  /agent/config   -> {"apps": [...]}
    GET  /agent/poll     -> {"apps": [...], "commands": [...]}   (drains)
    POST /cmd            -> queue one command for the TV

    curl -s -X POST localhost:8791/cmd -d '{"type":"launch","appId":"111299001912"}'

Point the agent at this with `tools/deploy.py build --bridge http://<this-ip>:8791`.
"""
from __future__ import annotations

import argparse
import json
import queue
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APPS = [
    {"id": "111299001912", "name": "YouTube", "accent": "#ff4d4d"},
    {"id": "3201907018807", "name": "Netflix", "accent": "#e50914"},
    {"id": "3201910019365", "name": "Prime Video", "accent": "#00a8e1"},
    {"id": "3201606009684", "name": "Spotify", "accent": "#1db954"},
]

COMMANDS: "queue.Queue[dict]" = queue.Queue()


def lan_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def drain() -> list[dict]:
    out = []
    while True:
        try:
            out.append(COMMANDS.get_nowait())
        except queue.Empty:
            return out


class Handler(BaseHTTPRequestHandler):
    server_version = "tvunlock-bridge/0.1"

    def _json(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _html(self, body: str) -> None:
        raw = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server naming
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/agent/config":
            return self._json({"apps": APPS})
        if path == "/agent/poll":
            return self._json({"apps": APPS, "commands": drain()})
        if path == "/":
            rows = "".join(
                "<tr><td>%s</td><td><code>%s</code></td></tr>" % (a["name"], a["id"])
                for a in APPS
            )
            return self._html(
                "<!doctype html><meta charset=utf-8>"
                "<title>tvunlock bridge</title>"
                "<style>body{font:15px/1.5 system-ui;margin:3rem;max-width:44rem}"
                "td{padding:.2rem 1rem .2rem 0}code{background:#eee;padding:.15rem .3rem}</style>"
                "<h1>Bridge stub</h1>"
                "<p>Queue a command, then watch the TV:</p>"
                "<pre>curl -s -X POST localhost:%d/cmd -d "
                "'{\"type\":\"launch\",\"appId\":\"111299001912\"}'</pre>"
                "<table>%s</table>" % (self.server.server_port, rows)
            )
        self._json({"error": "not found", "path": path}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/cmd":
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            command = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "invalid json"}, 400)
        if not isinstance(command, dict):
            return self._json({"error": "expected an object"}, 400)
        COMMANDS.put(command)
        return self._json({"queued": 1, "command": command})

    def log_message(self, fmt: str, *args) -> None:
        print("  %s" % (fmt % args))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print("bridge stub listening on http://%s:%d" % (lan_ip(), args.port))
    print("  point the agent here:  tools/deploy.py build --bridge http://%s:%d"
          % (lan_ip(), args.port))
    print("  ctrl-c to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
