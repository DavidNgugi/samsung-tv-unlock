import json, re

d = json.load(open("/tmp/tv-apps.json"))
apps = d["apps"]

BRANDS = ["netflix","youtube","prime","disney","spotify","plex","apple","dstv","showmax",
          "britbox","hulu","max","paramount","twitch","viu","hotstar","hayu","now","sky",
          "tubi","stremio","jellyfin","kodi","vlc","browser","gallery","tv plus","art"]

def is_brand(a):
    n = a["name"].lower()
    return any(b in n for b in BRANDS)

SYSTEM = [
    "com.samsung.tv.coba.", "com.samsung.tv.cobalt-app-", "org.tizen.ep-", "ep-",
    "com.samsung.tv.coss.", "com.samsung.tv.csfw.", "capi-", "lib-", "csapi-",
    "bnr-", "ewbs", "automation", "btapp", "btaudio", "AgingApp", "factory",
    "cloning", "CSAccount", "CSBilling", "AutoDataBackup", "AdPlayer", "adagent",
    "camera-launcher", "Channel Manager", "Channel-list", "CI application",
    "ConnectionGuideApp", "ContentSharing", "RM ", "bixby", "smartthings",
    "samsung account", "notification", "privacy", "diagnos", "service",
    "survey", "reminder", "scheduler", "voice", "cnvoice", "ewbs", "usb",
    "hotel", "protocol", "event-manager", "system-manager", "boot-manager",
    "applist", "searchall", "built-in", "preview", "promotion", "multi",
    "ambient", "reminder", "network status", "telemetry", "advert", "store"
]

def is_system(a):
    blob = (a["id"] + " " + a["name"]).lower()
    return any(s.lower() in blob for s in SYSTEM)

print("=== brand matches ===")
for a in sorted([x for x in apps if is_brand(x)], key=lambda x: x["name"].lower()):
    print("%-40s %-38s show=%s" % (a["name"][:38], a["id"][:36], a.get("show")))

print("\n=== non-system candidates ===")
cands = [x for x in apps if not is_system(x)]
print("count:", len(cands))
for a in sorted(cands, key=lambda x: x["name"].lower()):
    print("%-40s %-38s show=%s" % (a["name"][:38], a["id"][:36], a.get("show")))

print("\n=== totals ===")
print("system:", sum(1 for a in apps if is_system(a)))
print("brand:", sum(1 for a in apps if is_brand(a)))
