#!/usr/bin/env python3
"""Home-app database backup/restore for this TV.

Uses the SDB package-name workaround to run commands as SDK UID 901.
No root. Restore overwrites the live appsvc.db, so it is explicitly opt-in.

  tools/tv_home_db.py backup
  tools/tv_home_db.py restore ~/Backups/cleanmysamsungtv/<ts>/home-db --yes
"""
from __future__ import annotations
import argparse, hashlib, os, subprocess, sys, time

SDB = os.path.expanduser("~/tizen-studio/tools/sdb")
HOST = os.environ.get("TV_IP", "192.168.100.35") + ":26101"
LIVE = "/opt/dbspace/user/5001/.appsvc.db"
BASE = "/home/owner/share/tmp/sdk_tools/"


def sdb(*args, timeout=20):
    return subprocess.run([SDB, "-s", HOST, *args], capture_output=True, text=True, timeout=timeout)


def uid(command, timeout=15):
    arg = "0 appinstall tpk x.tpk`" + command + "`.tpk"
    try:
        return sdb("shell", arg, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None


def copy(src, dst):
    uid("cp${IFS}" + src + "${IFS}" + dst)


def pull(remote, local):
    try:
        sdb("pull", remote, local, timeout=25)
    except subprocess.TimeoutExpired:
        pass


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def backup(outdir):
    os.makedirs(outdir, exist_ok=True)
    for name, src in [("appsvc.db", LIVE), ("appsvc.db-journal", LIVE + "-journal")]:
        copy(src, BASE + "bk_" + name)
        pull(BASE + "bk_" + name, os.path.join(outdir, name))
    with open(os.path.join(outdir, "SHA256SUMS"), "w") as fh:
        for name in ("appsvc.db", "appsvc.db-journal"):
            p = os.path.join(outdir, name)
            if os.path.exists(p):
                fh.write(sha(p) + "  " + name + "\n")
    print("backup:", outdir)
    for name in ("appsvc.db", "appsvc.db-journal"):
        p = os.path.join(outdir, name)
        print(" ", name, os.path.getsize(p) if os.path.exists(p) else "missing")


def restore(srcdir):
    for name in ("appsvc.db", "appsvc.db-journal"):
        local = os.path.join(srcdir, name)
        if not os.path.exists(local):
            sys.exit("missing " + local)
        sdb("push", local, BASE + "rs_" + name)
    copy(BASE + "rs_appsvc.db", LIVE)
    copy(BASE + "rs_appsvc.db-journal", LIVE + "-journal")
    print("restored. Reboot the TV at the wall to reload appsvc.")
    print("If it does not boot, this path is no longer reachable.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backup"); b.add_argument("outdir", nargs="?")
    r = sub.add_parser("restore"); r.add_argument("srcdir"); r.add_argument("--yes", action="store_true")
    args = ap.parse_args()
    if args.cmd == "backup":
        out = args.outdir or os.path.expanduser(time.strftime("~/Backups/cleanmysamsungtv/%Y-%m-%d-%H%M/home-db"))
        backup(out)
    else:
        if not args.yes:
            sys.exit("refusing to overwrite the live Home DB without --yes")
        restore(args.srcdir)


if __name__ == "__main__":
    main()
