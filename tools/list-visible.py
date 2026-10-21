import json
d = json.load(open("/tmp/tv-apps.json"))
apps = [a for a in d["apps"] if a.get("show") is True]
apps.sort(key=lambda a: a["name"].lower())
for a in apps:
    print("%-46s %s" % (a["name"][:44], a["id"]))
