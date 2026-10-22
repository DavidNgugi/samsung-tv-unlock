#!/usr/bin/env python3
"""One-step reversal: put the TV back to stock.

  tools/revert.py <TV-IP:PORT>
  tools/revert.py --help

It:
  1. sets db/appfw/home_appid, db/appfw/booting_appid_backup and
     db/first_screen/type back to their stock values (TV viewer / Smart Hub)
  2. restores the stock /opt/dbspace/.app-context.db (Home key -> Samsung Home)
  3. uninstalls Clean Home
Then power-cycle the TV.
"""
import argparse
import glob
import os
import subprocess
import sys
import time

SDB = os.path.expanduser("~/tizen-studio/tools/sdb")
if not os.path.exists(SDB):
    SDB = "sdb"
TIZEN = os.path.expanduser("~/tizen-studio/tools/ide/bin/tizen")
if not os.path.exists(TIZEN):
    TIZEN = "tizen"
STAGE = "/home/owner/share/tmp/sdk_tools/"


def sdb(host, *args, timeout=25):
    return subprocess.run([SDB, "-s", host, *args], capture_output=True, text=True, timeout=timeout)


def uid(host, cmd):
    arg = "0 appinstall tpk x.tpk`" + cmd + "`.tpk"
    try:
        sdb(host, "shell", arg)
    except Exception:
        pass
    time.sleep(0.45)


def setkey(host, key, value):
    uid(host, "vconftool${IFS}set${IFS}-f${IFS}-t${IFS}string${IFS}" + key + "${IFS}" + value)
    print("   vconf " + key + " = " + value)


def find_stock_db():
    pats = glob.glob(os.path.expanduser(
        "~/Backups/cleanmysamsungtv/*/tv/home-db/app-context/app-context-STOCK.db"))
    return sorted(pats)[-1] if pats else ""


def main():
    ap = argparse.ArgumentParser(description="Revert Clean Home to stock and uninstall it.")
    ap.add_argument("host", nargs="?", default="192.168.100.35:26101",
                    help="sdb target (default 192.168.100.35:26101)")
    ap.add_argument("--app-id", default="tvunlock02.Launcher")
    ap.add_argument("--package", default="tvunlock02")
    ap.add_argument("--stock-db", default="", help="stock app-context.db (default: newest backup)")
    ap.add_argument("--skip-uninstall", action="store_true")
    ap.add_argument("--skip-home-db", action="store_true")
    args = ap.parse_args()

    print("Reverting Clean Home on " + args.host)
    subprocess.run([SDB, "connect", args.host], capture_output=True, text=True)

    print("1/3 boot + wake keys -> stock")
    setkey(args.host, "db/appfw/home_appid", "org.tizen.tv-viewer")
    setkey(args.host, "db/appfw/booting_appid_backup", "org.tizen.tv-viewer")
    setkey(args.host, "db/first_screen/type", "com.samsung.tv.csfs")

    print("2/3 Home key database -> stock")
    if args.skip_home_db:
        print("   skipped (--skip-home-db)")
    else:
        stock = args.stock_db or find_stock_db()
        if stock and os.path.exists(stock):
            sdb(args.host, "push", stock, STAGE + "ac_revert.db")
            uid(args.host, "rm${IFS}-f${IFS}/opt/dbspace/.app-context.db${IFS}/opt/dbspace/.app-context.db-journal")
            uid(args.host, "cp${IFS}" + STAGE + "ac_revert.db${IFS}/opt/dbspace/.app-context.db")
            print("   restored " + stock)
        else:
            print("   ! stock app-context.db not found. Pass --stock-db PATH.")
            print("     Backup it with tools/backup-tv.sh before changing anything next time.")

    if not args.skip_uninstall:
        print("3/3 uninstalling " + args.package)
        try:
            subprocess.run([TIZEN, "uninstall", "-p", args.package], timeout=90)
        except Exception as e:
            print("   uninstall failed: " + str(e))
    else:
        print("3/3 uninstall skipped (--skip-uninstall)")

    print("")
    print("Done. Power-cycle the TV (unplug 10 s) for the stock Home screen.")


if __name__ == "__main__":
    main()
