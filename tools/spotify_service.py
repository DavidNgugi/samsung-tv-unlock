#!/usr/bin/env python3
"""Spotify Connect bridge for the TV launcher.

Endpoints (CORS enabled, so the TV can call them directly):

    GET  /nowplaying   -> {playing, title, artist, art, progress_ms, duration_ms}
    POST /control      -> {"action": "toggle|play|pause|next|previous|seek", "position_ms": n}
    GET  /health

Auth is Spotify PKCE, no client secret:

    SPOTIFY_CLIENT_ID=... python3 tools/spotify_service.py
    # open http://127.0.0.1:8795/login on this Mac once

Add --mock to serve sample data and test the TV widget without credentials.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AUTH = "https://accounts.spotify.com"
API = "https://api.spotify.com/v1"
SCOPES = ("streaming user-read-email user-read-private "
          "user-read-playback-state user-modify-playback-state user-read-currently-playing")
TOKEN_FILE = os.path.expanduser("~/.tv-unlock-spotify.json")
REDIRECT = "http://127.0.0.1:8795/callback"

MOCK_MODE = False
MOCK = {
    "playing": True,
    "title": "Blue Jeans Rhapsody",
    "artist": "My Favorite Artist",
    "art": "",
    "progress_ms": 83000,
    "duration_ms": 256000,
}
MOCK_STARTED = time.time()


def token_read():
    try:
        with open(TOKEN_FILE) as fh:
            return json.load(fh)
    except Exception:
        return None


def token_write(data):
    with open(TOKEN_FILE, "w") as fh:
        json.dump(data, fh)
    os.chmod(TOKEN_FILE, 0o600)


def refresh(tokens):
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
        "client_id": tokens["client_id"],
    }).encode()
    req = urllib.request.Request(AUTH + "/api/token", data=body,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as res:
        fresh = json.loads(res.read())
    fresh["client_id"] = tokens["client_id"]
    if "refresh_token" not in fresh:
        fresh["refresh_token"] = tokens["refresh_token"]
    token_write(fresh)
    return fresh


def api(path, method="GET", payload=None, query=None):
    tokens = token_read()
    if not tokens:
        raise RuntimeError("not authenticated")
    if time.time() > tokens.get("expires_at", 0):
        tokens = refresh(tokens)
    url = API + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + tokens["access_token"],
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as res:
        raw = res.read()
        return json.loads(raw) if raw else {}


def now_playing():
    if MOCK_MODE:
        elapsed = int((time.time() - MOCK_STARTED) * 1000)
        progress = (MOCK["progress_ms"] + elapsed) % MOCK["duration_ms"]
        return dict(MOCK, progress_ms=progress)
    data = api("/me/player/currently-playing")
    if not data or not data.get("item"):
        return {"playing": False}
    item = data["item"]
    images = (item.get("album") or {}).get("images") or []
    return {
        "playing": bool(data.get("is_playing")),
        "title": item.get("name", ""),
        "artist": ", ".join(a.get("name", "") for a in item.get("artists", [])),
        "art": images[0]["url"] if images else "",
        "progress_ms": data.get("progress_ms") or 0,
        "duration_ms": item.get("duration_ms") or 0,
    }


def control(action, position_ms=None):
    if MOCK_MODE:
        if action in ("toggle",):
            MOCK["playing"] = not MOCK["playing"]
        elif action == "play":
            MOCK["playing"] = True
        elif action == "pause":
            MOCK["playing"] = False
        elif action == "seek" and position_ms is not None:
            MOCK["progress_ms"] = int(position_ms)
        return {"ok": True, "mock": True}
    if action == "toggle":
        playing = now_playing().get("playing")
        action = "pause" if playing else "play"
    if action == "play":
        api("/me/player/play", method="PUT")
    elif action == "pause":
        api("/me/player/pause", method="PUT")
    elif action == "next":
        api("/me/player/next", method="POST")
    elif action == "previous":
        api("/me/player/previous", method="POST")
    elif action == "seek" and position_ms is not None:
        api("/me/player/seek", method="PUT", query={"position_ms": int(position_ms)})
    else:
        raise RuntimeError("unknown action")
    return {"ok": True}


class Handler(BaseHTTPRequestHandler):
    def _json(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/health":
            return self._json({"ok": True, "mock": MOCK_MODE, "auth": bool(token_read())})
        if path == "/nowplaying":
            try:
                return self._json(now_playing())
            except Exception as exc:
                return self._json({"playing": False, "error": str(exc)}, 200)
        if path == "/login":
            client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
            if not client_id:
                return self._json({"error": "SPOTIFY_CLIENT_ID is not set"}, 500)
            verifier = secrets.token_urlsafe(64)
            challenge = base64.urlsafe_b64encode(
                hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
            self.server.verifier = verifier
            self.server.client_id = client_id
            query = urllib.parse.urlencode({
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": REDIRECT,
                "scope": SCOPES,
                "code_challenge_method": "S256",
                "code_challenge": challenge,
            })
            self.send_response(302)
            self.send_header("Location", AUTH + "/authorize?" + query)
            self.end_headers()
            return
        if path == "/callback":
            code = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("code", [""])[0]
            body = urllib.parse.urlencode({
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT,
                "client_id": getattr(self.server, "client_id", ""),
                "code_verifier": getattr(self.server, "verifier", ""),
            }).encode()
            req = urllib.request.Request(AUTH + "/api/token", data=body,
                                         headers={"Content-Type": "application/x-www-form-urlencoded"})
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    tokens = json.loads(res.read())
            except Exception as exc:
                return self._json({"error": "token exchange failed", "detail": str(exc)}, 500)
            tokens["client_id"] = getattr(self.server, "client_id", "")
            tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600) - 30
            token_write(tokens)
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Spotify connected.</h2><p>You can close this tab.</p>")
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path.split("?")[0] != "/control":
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "invalid json"}, 400)
        try:
            return self._json(control(body.get("action", "toggle"), body.get("position_ms")))
        except Exception as exc:
            return self._json({"error": str(exc)}, 500)

    def log_message(self, fmt, *args):
        print("  " + (fmt % args), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8795)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()
    global MOCK_MODE
    MOCK_MODE = args.mock
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print("spotify bridge on http://0.0.0.0:%d  mock=%s" % (args.port, args.mock))
    print("  login: http://127.0.0.1:%d/login" % args.port)
    print("  test : curl http://127.0.0.1:%d/nowplaying" % args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
