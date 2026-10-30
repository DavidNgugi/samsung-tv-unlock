#!/usr/bin/env python3
"""Clean Home installer: a local setup wizard that installs the launcher on a Samsung TV.

    python3 install.py

It binds to 127.0.0.1 only, every API call carries a per-run token, and it stops
with Ctrl+C. The wizard writes its own settings to ~/.cleanhome and calls the
repo's existing scripts (tools/deploy-launcher.sh, tools/backup-tv.sh) for the
actual work.
"""
from __future__ import annotations

import base64
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.realpath(__file__))
LAUNCHER = os.path.join(ROOT, "apps", "Launcher")
INSTALLER = os.path.join(ROOT, "installer")
SECRETS = os.path.expanduser("~/.cleanhome")
SETTINGS = os.path.join(SECRETS, "installer.json")
TOKEN = secrets.token_urlsafe(18)
PORT = int(os.environ.get("PORT", "8765"))
APP_ID = "tvunlock02.Launcher"
TIZEN = os.path.expanduser("~/tizen-studio/tools/ide/bin/tizen")
SDB = os.path.expanduser("~/tizen-studio/tools/sdb")

_walls = os.path.join(LAUNCHER, "wallpapers")
BG = os.path.join(_walls, "crimson-bonsai-minimalist.jpg")
if not os.path.exists(BG):
    jpgs = sorted(f for f in os.listdir(_walls) if f.endswith(".jpg")) if os.path.isdir(_walls) else []
    BG = os.path.join(_walls, jpgs[0]) if jpgs else ""


# ---------------------------------------------------------------- settings
def read_settings() -> dict:
    try:
        with open(SETTINGS) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_settings(data: dict) -> None:
    os.makedirs(SECRETS, mode=0o700, exist_ok=True)
    with open(SETTINGS, "w") as f:
        json.dump(data, f, indent=2)


def set_app_name(name: str) -> None:
    path = os.path.join(LAUNCHER, "config.xml")
    with open(path) as f:
        xml = f.read()
    backup = os.path.join(SECRETS, "config.xml.bak")
    if not os.path.exists(backup):
        shutil.copy(path, backup)
    safe = name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    xml = re.sub(r"<name>.*?</name>", "<name>%s</name>" % safe, xml, count=1)
    with open(path, "w") as f:
        f.write(xml)


def set_app_icon(data_url: str) -> None:
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    path = os.path.join(LAUNCHER, "icon.png")
    backup = os.path.join(SECRETS, "icon.png.bak")
    if not os.path.exists(backup):
        shutil.copy(path, backup)
    with open(path, "wb") as f:
        f.write(raw)


# ---------------------------------------------------------------- helpers
def computer_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return ""


def probe_tv(ip: str):
    try:
        with urllib.request.urlopen("http://%s:8001/api/v2/" % ip, timeout=0.8) as r:
            device = json.loads(r.read(65536)).get("device", {})
        return {
            "ip": ip,
            "name": device.get("name") or "Samsung TV",
            "model": device.get("modelName", ""),
            "developerMode": device.get("developerMode", ""),
            "developerIP": device.get("developerIP", ""),
        }
    except Exception:
        return None


def find_tvs():
    ip = computer_ip()
    if not ip:
        return []
    prefix = ip.rsplit(".", 1)[0]
    with ThreadPoolExecutor(64) as pool:
        found = pool.map(probe_tv, ["%s.%d" % (prefix, n) for n in range(1, 255)])
    return [t for t in found if t]


def certificates():
    path = os.path.expanduser("~/tizen-studio-data/profile/profiles.xml")
    try:
        with open(path) as f:
            return re.findall(r'name="([^"]+)"', f.read())
    except OSError:
        return []


def checks() -> dict:
    return {
        "python": sys.version.split()[0],
        "tizen": os.path.exists(TIZEN),
        "sdb": os.path.exists(SDB),
        "computerIp": computer_ip(),
        "profiles": certificates(),
        "settings": read_settings(),
        "appName": "Clean Home",
    }


# ---------------------------------------------------------------- jobs
JOBS = {}
JOBS_LOCK = threading.Lock()


def run_job(args, env=None, label="") -> str:
    job_id = secrets.token_hex(6)
    job = {"done": False, "ok": False, "log": [], "label": label}
    with JOBS_LOCK:
        JOBS[job_id] = job

    def work():
        try:
            proc = subprocess.Popen(
                args,
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env={**os.environ, **(env or {})},
            )
            for line in proc.stdout:
                job["log"].append(line.rstrip())
            job["ok"] = proc.wait() == 0
        except Exception as exc:  # noqa: BLE001 - surface it in the log
            job["log"].append("Error: %s" % exc)
        finally:
            job["done"] = True

    threading.Thread(target=work, daemon=True).start()
    return job_id


# ---------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj), "application/json")

    def _authorized(self) -> bool:
        query = parse_qs(urlparse(self.path).query)
        token = self.headers.get("X-Token") or query.get("t", [""])[0]
        return token == TOKEN

    def _file(self, path, ctype):
        if os.path.exists(path):
            with open(path, "rb") as f:
                self._send(200, f.read(), ctype)
            return True
        return False

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            return self._file(os.path.join(INSTALLER, "index.html"), "text/html; charset=utf-8")
        if path == "/bg":
            return self._file(BG, "image/jpeg")
        if path == "/appicon":
            return self._file(os.path.join(LAUNCHER, "icon.png"), "image/png")
        if path.startswith("/installer/"):
            name = os.path.basename(path)
            ctype = "text/css" if name.endswith(".css") else "application/javascript"
            return self._file(os.path.join(INSTALLER, name), ctype)
        if not self._authorized():
            return self._json({"error": "token"}, 403)
        if path == "/api/state":
            return self._json(checks())
        if path == "/api/scan":
            return self._json({"tvs": find_tvs(), "computerIp": computer_ip()})
        if path == "/api/job":
            query = parse_qs(urlparse(self.path).query)
            job = JOBS.get(query.get("id", [""])[0])
            return self._json(job or {"error": "not found"}, 200 if job else 404)
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            body = {}
        if not self._authorized():
            return self._json({"error": "token"}, 403)

        if path == "/api/settings":
            data = read_settings()
            data.update({k: body[k] for k in ("name", "tvIp", "profile", "home", "familyDir") if k in body})
            write_settings(data)
            if body.get("name"):
                set_app_name(str(body["name"])[:60])
            return self._json({"ok": True, "settings": data})

        if path == "/api/icon":
            if not body.get("data"):
                return self._json({"error": "no data"}, 400)
            set_app_icon(body["data"])
            return self._json({"ok": True})

        if path == "/api/connect":
            ip = body.get("ip") or ""
            if not ip:
                return self._json({"error": "no ip"}, 400)
            out = subprocess.run(
                [SDB, "connect", "%s:26101" % ip], capture_output=True, text=True, timeout=30
            )
            devices = subprocess.run([SDB, "devices"], capture_output=True, text=True, timeout=20)
            return self._json({"ok": "connected" in out.stdout, "log": out.stdout + devices.stdout})

        if path == "/api/install":
            ip = body.get("ip") or ""
            profile = body.get("profile") or "peregrine-samsung"
            family_dir = body.get("familyDir") or os.path.expanduser("~/Pictures/Clean Home/Family")
            if not ip:
                return self._json({"error": "no ip"}, 400)
            script = (
                'set -e; export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"; '
                'sdb connect %s:26101 >/dev/null 2>&1 || true; PROFILE=%s tools/deploy-launcher.sh'
                % (ip, profile)
            )
            return self._json({"job": run_job(["bash", "-lc", script], env={"CLEANHOME_FAMILY_DIR": family_dir}, label="install")})

        if path == "/api/backup":
            return self._json({"job": run_job(["bash", "tools/backup-tv.sh"], label="backup")})

        if path == "/api/open":
            proc = subprocess.run(
                [TIZEN, "run", "-p", APP_ID], capture_output=True, text=True, timeout=30,
                env={**os.environ, "PATH": os.path.expanduser("~/tizen-studio/tools") + ":" + os.path.expanduser("~/tizen-studio/tools/ide/bin") + ":" + os.environ.get("PATH", "")},
            )
            return self._json({"ok": proc.returncode == 0, "log": proc.stdout + proc.stderr})

        return self._json({"error": "not found"}, 404)


def main():
    url = "http://127.0.0.1:%d/?t=%s" % (PORT, TOKEN)
    print("Clean Home installer: %s" % url, flush=True)
    print("Local only. Ctrl+C stops it.", flush=True)
    try:
        import webbrowser

        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    with ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
