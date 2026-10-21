import json, re
d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]

def kind(a):
    i = a["id"]
    if i.startswith("tvunlock"):
        return "ours"
    if i.startswith("org.tizen."):
        return "tizen"
    if i.startswith("com.samsung"):
        return "samsung"
    if re.match(r"^[A-Za-z0-9]{10}\.", i):
        return "store"
    return "other"

from collections import Counter
c = Counter(kind(a) for a in apps)
print("total:", len(apps))
for k in ["ours","tizen","samsung","store","other"]:
    print("%-8s %d" % (k, c[k]))

print("\nother:")
for a in apps:
    if kind(a) == "other": print(" ", a["id"], "|", a["name"])

print("\nstore apps (10-char package ids):")
for a in sorted([x for x in apps if kind(x)=="store"], key=lambda x:(x["name"] or "").lower()):
    print(" %-38s %s" % ((a["name"] or "")[:36], a["id"]))
