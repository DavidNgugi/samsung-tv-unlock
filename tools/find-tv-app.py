import json
d=json.load(open("/tmp/tv-apps.json"))
for a in d["apps"]:
    n=(a.get("name") or "")
    i=a["id"]
    blob=(n+" "+i).lower()
    if any(k in blob for k in ("livetv","live tv","dtv","tv-app","tvapp","source","tuner","broadcast","channel")):
        print("%-24s %-46s show=%-5s icon=%s" % (n[:22], i, a.get("show"), a.get("iconPath")))
