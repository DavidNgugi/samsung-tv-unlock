#!/usr/bin/env python3
"""Build the TV agent and install it over sdb.

    python3 tools/deploy.py build [--bridge URL]
    python3 tools/deploy.py install [--tv 192.168.1.50]
    python3 tools/deploy.py both

Tizen will not install an unsigned package, so the build here produces the .wgt
and tells you how to sign it. Signing is a one-time setup: see README.
"""
from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AGENT = os.path.join(ROOT, "agent")
BUILD = os.path.join(ROOT, "build")
WGT = os.path.join(BUILD, "agent.wgt")

SDB_CANDIDATES = [
    "sdb",
    os.path.expanduser("~/tizen-studio/tools/sdb"),
    "/opt/tizen-studio/tools/sdb",
    "/usr/local/tizen-studio/tools/sdb",
    r"C:\tizen-studio\tools\sdb.exe",
]


def lan_ip() -> str:
    """Best-effort LAN address of this machine, the one the TV can reach."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def write_bridge_js(url: str) -> None:
    path = os.path.join(AGENT, "bridge.js")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("window.TVUNLOCK_BRIDGE = %s;\n" % repr(url).replace("'", '"'))
    print("  bridge: %s" % url)


def build(url: str | None = None) -> str:
    os.makedirs(BUILD, exist_ok=True)
    write_bridge_js(url or "http://%s:8791" % lan_ip())

    if not os.path.exists(os.path.join(AGENT, "config.xml")):
        sys.exit("agent/config.xml is missing; that file identifies the app")

    with zipfile.ZipFile(WGT, "w", zipfile.ZIP_DEFLATED) as archive:
        for folder, _dirs, files in os.walk(AGENT):
            for name in sorted(files):
                full = os.path.join(folder, name)
                archive.write(full, os.path.relpath(full, AGENT))

    size = os.path.getsize(WGT)
    print("  package: %s (%.1f KB)" % (os.path.relpath(WGT, ROOT), size / 1024))
    print("  unsigned — sign it once with Tizen Studio's Certificate Manager,")
    print("  or: tizen package -t wgt -s <profile> -- agent/")
    return WGT


def find_sdb() -> str:
    for candidate in SDB_CANDIDATES:
        found = shutil.which(candidate)
        if found:
            return found
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    sys.exit(
        "sdb not found. Install Tizen Studio (it ships sdb in tools/), then\n"
        "either put it on PATH or pass --sdb /path/to/sdb."
    )


def run(cmd: list[str]) -> int:
    print("$ " + " ".join(cmd))
    return subprocess.call(cmd)


def install(tv: str, sdb: str, package: str) -> None:
    if not os.path.exists(package):
        sys.exit("no package at %s — run the build first" % package)

    run([sdb, "connect", "%s:26101" % tv])
    run([sdb, "devices"])

    code = run([sdb, "install", package])
    if code != 0:
        sys.exit(
            "\ninstall failed. Almost always one of:\n"
            "  * the package is unsigned or signed with a certificate the TV\n"
            "    does not trust — package it in Tizen Studio with your Samsung\n"
            "    author certificate\n"
            "  * developer mode is off, or Host PC IP is not this machine\n"
            "  * sdb is connected to a stale address: sdb disconnect, then retry"
        )
    print("\ninstalled. Launch 'TV Agent' from the TV's app row.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", default="build",
                        choices=["build", "install", "both"])
    parser.add_argument("--bridge", help="bridge URL the TV app should poll")
    parser.add_argument("--tv", default=os.environ.get("TV_IP"), help="TV address")
    parser.add_argument("--sdb", help="path to sdb")
    parser.add_argument("--package", default=WGT, help="path to the .wgt")
    args = parser.parse_args()

    if args.action in ("build", "both"):
        build(args.bridge)

    if args.action in ("install", "both"):
        if not args.tv:
            sys.exit("which TV? pass --tv 192.168.x.x (or set TV_IP)")
        install(args.tv, args.sdb or find_sdb(), args.package)


if __name__ == "__main__":
    main()
