import json, re

d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]

def bucket(a):
    blob = (a["id"] + " " + (a["name"] or "")).lower()
    if re.search(r"adplayer|adagent|ad-web|advert|promotion|adplatform", blob): return "Advertising"
    if re.search(r"(^|[.\-])rm-|survey|remote-management|telemetry|analytics|bnr|hitcomp", blob): return "Telemetry"
    if "hotel" in blob or blob.startswith("ep-") or "cloning" in blob: return "Hotel"
    if re.search(r"test|sample|demo|dummy|suite|cobalt-app-\d+", blob): return "Test"
    if "stadia" in blob: return "Dead"
    if re.search(r"factory|agingapp", blob): return "Factory"
    return "system"

order = ["Advertising", "Telemetry", "Hotel", "Test", "Factory", "Dead"]
for b in order:
    rows = [a for a in apps if bucket(a) == b]
    print("\n## %s (%d)" % (b, len(rows)))
    for a in sorted(rows, key=lambda x: (x["name"] or "").lower()):
        print("- %s | %s | show=%s" % ((a["name"] or "(no name)").strip(), a["id"], a.get("show")))
