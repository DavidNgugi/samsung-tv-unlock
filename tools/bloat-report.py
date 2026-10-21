import json, re, collections

d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]

def bucket(a):
    blob = (a["id"] + " " + (a["name"] or "")).lower()
    if re.search(r"adplayer|adagent|ad-web|advert|promotion|adplatform", blob): return "advertising"
    if re.search(r"(^|[.\-])rm-|survey|remote-management|telemetry|analytics|bnr|hitcomp", blob): return "telemetry"
    if "hotel" in blob or blob.startswith("ep-") or "cloning" in blob: return "hotel/enterprise"
    if re.search(r"test|sample|demo|dummy|suite|cobalt-app-\d+", blob): return "test/sample"
    if "stadia" in blob: return "dead service"
    return "system/other"

counts = collections.Counter(bucket(a) for a in apps)
print("total:", len(apps))
for k, v in counts.most_common():
    print("%-18s %d" % (k, v))

print("\n--- advertising ---")
for a in apps:
    if bucket(a) == "advertising": print(" ", a["id"], "|", a["name"])

print("\n--- telemetry / research / remote mgmt ---")
for a in apps:
    if bucket(a) == "telemetry": print(" ", a["id"], "|", a["name"])

print("\n--- hotel / enterprise ---")
for a in apps:
    if bucket(a) == "hotel/enterprise": print(" ", a["id"], "|", a["name"])

print("\n--- test / sample / dummy ---")
for a in apps:
    if bucket(a) == "test/sample": print(" ", a["id"], "|", a["name"])

print("\n--- duplicate names (visible only) ---")
names = collections.Counter((a["name"] or "").lower() for a in apps if a.get("show"))
for n, c in names.most_common(12):
    if c > 1:
        ids = [a["id"] for a in apps if (a["name"] or "").lower() == n]
        print("%-22s x%d  %s" % (n, c, ", ".join(ids)))
