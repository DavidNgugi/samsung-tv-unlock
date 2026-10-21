import json
d=json.load(open("/tmp/tv-apps.json"))
for a in d["apps"]:
    i=a["id"].lower(); n=(a.get("name") or "").lower()
    if "bixby" in i+n or "promotion" in i+n:
        print(a["name"], "|", a["id"], "| show", a.get("show"))
