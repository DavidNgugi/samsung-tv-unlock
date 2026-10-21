#!/usr/bin/env python3
"""Collector for the launcher's app-list dump."""
import argparse, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT = "/tmp/tv-apps.json"
LOG = "/tmp/dump-requests.log"

def note(line):
    with open(LOG, "a") as fh:
        fh.write(line + "\n")

class Handler(BaseHTTPRequestHandler):
    def _json(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        note("GET " + self.path)
        if self.path.split("?")[0] == "/dump" and os.path.exists(OUT):
            with open(OUT, "rb") as handle:
                body = handle.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return self._json({"ok": True})

    def do_POST(self):
        note("POST " + self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        if self.path.split("?")[0] == "/perf":
            with open("/tmp/perf.json", "wb") as handle:
                handle.write(raw)
            note("perf saved")
            return self._json({"ok": True})
        if self.path.split("?")[0] == "/caps":
            with open("/tmp/caps.json", "wb") as handle:
                handle.write(raw)
            note("caps saved")
            return self._json({"ok": True})
        if self.path.split("?")[0] != "/dump":
            return self._json({"error": "not found"}, 404)
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw.decode(errors="replace")[:2000]}
        with open(OUT, "w") as handle:
            json.dump(payload, handle, indent=1)
        note("saved %d bytes" % len(raw))
        return self._json({"ok": True, "count": len(payload.get("apps", []))})

    def log_message(self, fmt, *args):
        note("  " + (fmt % args))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8792)
    ap.add_argument("--bind", default="0.0.0.0")
    args = ap.parse_args()
    print("collector on %d" % args.port, flush=True)
    ThreadingHTTPServer((args.bind, args.port), Handler).serve_forever()

if __name__ == "__main__":
    main()
