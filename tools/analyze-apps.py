import json, collections

d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]
print("total:", len(apps))
print("show true:", sum(1 for a in apps if a.get("show") is True))
print("show false:", sum(1 for a in apps if a.get("show") is False))
print("show other:", sum(1 for a in apps if a.get("show") not in (True, False)))

print("\n--- id prefixes ---")
pref = collections.Counter()
for a in apps:
    parts = a["id"].split(".")
    pref[".".join(parts[:2]) if len(parts) > 1 else parts[0]] += 1
for k, v in pref.most_common(12):
    print("%4d  %s" % (v, k))

print("\n--- show=true ---")
for a in sorted([x for x in apps if x.get("show") is True], key=lambda x: x["name"].lower()):
    print("%-44s %s" % (a["name"][:42], a["id"]))
