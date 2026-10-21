import json
d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]

USER_IDS = {
 "9Ur5IzDKqV.TizenYouTube","rJeHak5zRg.Spotify","kIciSQlYEM.plex",
 "CXNLCPYe82.dstvnow","M4UT1lus28.tarmacRace",
 "tvunlock02.Launcher","tvunlock01.Peregrine"
}
USER_PKGS = {"rJeHak5zRg","kIciSQlYEM"}

def origin(a):
    if a["id"] in USER_IDS: return "user"
    pkg = a["id"].split(".")[0]
    if pkg in USER_PKGS: return "user-service"
    return "samsung"

from collections import Counter
c = Counter(origin(a) for a in apps)
print("total:", len(apps))
for k in ("samsung","user","user-service"):
    print("%-14s %d" % (k, c[k]))

print("\nuser-visible entries:")
for a in apps:
    if origin(a) != "samsung":
        print(" %-38s %-34s show=%s" % ((a["name"] or "")[:36], a["id"], a.get("show")))

vis = Counter(origin(a) for a in apps if a.get("show") is True)
print("\nvisible by origin:", dict(vis))
print("visible total:", sum(vis.values()))
