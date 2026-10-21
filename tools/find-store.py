import json
d=json.load(open("/tmp/tv-apps.json"))
for a in d["apps"]:
    n=(a.get("name") or ""); i=a["id"]
    if any(k in (n+" "+i).lower() for k in ("store","shop","market","apps","hub","galaxy","play")):
        print("%-28s %-44s show=%s" % (n[:26], i, a.get("show")))
