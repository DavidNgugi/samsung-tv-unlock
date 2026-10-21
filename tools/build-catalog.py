import json, collections

d = json.load(open("/tmp/tv-apps.json"))
apps = [a for a in d["apps"] if a.get("show") is not False]
apps.sort(key=lambda a: (a["name"] or "zzz").lower())

USER_IDS = {
 "org.tizen.netflix-app","org.tizen.primevideo","9Ur5IzDKqV.TizenYouTube",
 "com.samsung.tv.cobalt-yt","com.samsung.tv.cobalt-ytkids","com.samsung.tv.cobalt-yttv",
 "rJeHak5zRg.Spotify","kIciSQlYEM.plex","CXNLCPYe82.dstvnow",
 "org.tizen.globoplayapp","com.samsung.tv.cobalt-gpm",
 "org.tizen.browser","com.samsung.tv.gallery","org.volt.apps",
 "com.samsung.tv.coba.livetv","com.samsung.tv.coba.source","com.samsung.tv.ambientapp",
 "com.samsung.tv.music-flex","com.samsung.tv.mycontents",
 "org.tizen.ScreenMirroring-app-tv","org.tizen.remotepc"
}
BRAND_PREFIXES = ["netflix","youtube","prime video","spotify","plex","disney",
 "apple tv","dstv","globoplay","google play"]

PREFERRED = {
 "netflix":"org.tizen.netflix-app","youtube":"9Ur5IzDKqV.TizenYouTube",
 "prime video":"org.tizen.primevideo","spotify":"rJeHak5zRg.Spotify",
 "plex":"kIciSQlYEM.plex","globoplay":"org.tizen.globoplayapp"
}

def curated(a):
    if a["id"].endswith("-dummy"): return False
    n = a["name"].lower()
    if any(t in n for t in ("test","suite","sample","demo")): return False
    if a["id"] in USER_IDS: return True
    return any(n.startswith(t) for t in BRAND_PREFIXES)

def dedupe(items):
    available = {a["id"] for a in items}
    chosen = set()
    out = []
    for a in items:
        key = next((p for p in BRAND_PREFIXES if a["name"].lower().startswith(p)), None)
        if not key:
            out.append(a); continue
        pref = PREFERRED.get(key)
        if pref and pref in available:
            if a["id"] == pref: out.append(a)
            continue
        if key in chosen: continue
        chosen.add(key); out.append(a)
    return out

NOTES = {
 "org.tizen.netflix-app": "Netflix. Streaming.",
 "org.tizen.primevideo": "Prime Video. Streaming.",
 "9Ur5IzDKqV.TizenYouTube": "YouTube. Streaming.",
 "com.samsung.tv.cobalt-yt": "YouTube (Cobalt wrapper); duplicate of the Tizen YouTube app.",
 "com.samsung.tv.cobalt-ytkids": "YouTube Kids.",
 "com.samsung.tv.cobalt-yttv": "YouTube TV (region-dependent).",
 "rJeHak5zRg.Spotify": "Spotify.",
 "kIciSQlYEM.plex": "Plex. Local and streaming media.",
 "CXNLCPYe82.dstvnow": "DStv Stream (Africa).",
 "org.tizen.globoplayapp": "Globoplay (Brazil).",
 "org.tizen.globoplayaria": "Globoplay companion shell.",
 "com.samsung.tv.cobalt-gpm": "Google Play Movies and TV.",
 "org.tizen.browser": "Samsung Internet, the TV web browser.",
 "com.samsung.tv.gallery": "Gallery: photos and videos from USB or network.",
 "org.volt.apps": "The TV app store and app list shell.",
 "com.samsung.tv.store": "Samsung app store component.",
 "com.samsung.tv.coba.livetv": "Live TV (tuner).",
 "com.samsung.tv.coba.source": "Source picker: HDMI, AV, Live TV.",
 "com.samsung.tv.ambientapp": "Ambient Mode.",
 "com.samsung.tv.gamebar": "Game Bar overlay for consoles.",
 "com.samsung.tv.coba.smartthings": "SmartThings hub UI.",
 "com.samsung.tv.music-flex": "Music wall and visualiser.",
 "com.samsung.tv.mycontents": "My Contents: personal media shelf.",
 "com.samsung.tv.artpaint-tpl": "Mono Mat / art template.",
 "org.tizen.ScreenMirroring-app-tv": "Screen mirroring receiver.",
 "org.tizen.remotepc": "Remote PC: connect to a Windows PC.",
 "M4UT1lus28.tarmacRace": "Tarmac Race, a preloaded game.",
 "com.samsung.tv.cobalt-stadia": "Stadia shell; the service is discontinued."
}

def note(a):
    if a["id"] in NOTES: return NOTES[a["id"]]
    blob = (a["id"] + " " + a["name"]).lower()
    rules = [
      ("advert", "Advertising component"), ("adplayer", "Advertising player"),
      ("adagent", "Advertising agent"), ("survey", "Research / survey"),
      ("rm-", "Remote management / telemetry"), ("telemetry", "Telemetry"),
      ("hotel", "Hotel-mode component"), ("ep-", "Hotel/enterprise component"),
      ("bixby", "Bixby voice assistant"), ("voice", "Voice assistant component"),
      ("cnvoice", "Voice assistant (CN)"), ("smartthings", "SmartThings / IoT"),
      ("iot", "IoT component"), ("swu", "Software update"),
      ("update", "Update component"), ("security", "Security component"),
      ("knox", "Knox security"), ("setting", "Settings component"),
      ("cinemagraph", "Ambient art loop"), ("art", "Art / gallery component"),
      ("test", "Test build"), ("demo", "Demo component"),
      ("sample", "Sample app"), ("dummy", "Placeholder entry"),
      ("service", "Background service"), ("daemon", "Background daemon"),
      ("agent", "Background agent"), ("provider", "Content provider"),
      ("launcher", "Launcher shell"), ("component", "UI component"),
      ("widget", "Widget"), ("notification", "Notifications"),
      ("scheduler", "Scheduling service"), ("reminder", "Reminders"),
      ("cloning", "TV cloning/backup"), ("factory", "Factory tooling"),
      ("pvr", "PVR recording"), ("usb", "USB peripheral support"),
      ("camera", "Camera support"), ("network", "Network"),
      ("bt", "Bluetooth"), ("voice", "Voice"),
      ("game", "Game component"), ("screen", "Screen/mirroring")
    ]
    for key, text in rules:
      if key in blob: return text
    return "Samsung internal component"

cur = dedupe([a for a in apps if curated(a)])
cur_ids = {a["id"] for a in cur}
rest = [a for a in apps if a["id"] not in cur_ids]

def row(a, default):
    show = "yes" if default else "no"
    name = (a["name"] or "(unnamed)").replace("|", "/")
    return "| %s | %s | %s | %s |" % (name, a["id"], show, note(a))

out = []
out.append("# App catalog")
out.append("")
out.append("Generated from getAppsInfo() on **UA65AU8000UXKE** (Tizen 6.0), 21 Oct 2026.")
out.append("The TV reported **%d** entries and marks **%d** visible." % (len(d["apps"]), len(apps)))
out.append("Clean Home shows **%d** by default and hides the rest behind *Show all apps*." % len(cur))
out.append("")
out.append("Descriptions are inferred from the app id and name unless marked otherwise.")
out.append("Samsung does not publish a per-model app manifest, so treat this as a map, not gospel.")
out.append("")
out.append("## Shown by default")
out.append("")
out.append("| App | Id | Shown | What it does |")
out.append("| --- | --- | --- | --- |")
for a in cur:
    out.append(row(a, True))
out.append("")
out.append("## Hidden by default")
out.append("")
out.append("| App | Id | Shown | What it does |")
out.append("| --- | --- | --- | --- |")
for a in rest:
    out.append(row(a, False))
out.append("")
out.append("## Category counts")
out.append("")
cats = collections.Counter(note(a) for a in rest)
for k, v in cats.most_common():
    out.append("- %s: %d" % (k, v))
out.append("")
out.append("## Notes")
out.append("")
out.append("- Entries with show: false are excluded entirely; the TV hides them.")
out.append("- Several ids are duplicates of one app (two YouTube shells, two Prime entries).")
out.append("- Nothing here is uninstalled or disabled. This is presentation only.")
out.append("")

open("docs/app-catalog.md", "w").write("\n".join(out))
print("entries:", len(d["apps"]), "visible:", len(apps), "curated:", len(cur), "hidden:", len(rest))
