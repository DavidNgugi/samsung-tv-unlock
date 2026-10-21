import json
d = json.load(open("/tmp/tv-apps.json"))
HIDE = {"adplatform.ADPlayer","aQjWjLsPaO.MultiScreenWebLauncher","NRi6kdBYJ0.AirPlayWebApp",
"XPkceUl3N4.UsbCamApp","WykOS4t4F0.cmsWebApp","jPPp4KCHp4.emanual","Oxv5Tb6i2d.SmartTV",
"tv6pbVMQFF.PrivacyChoices","yL49PNFmjW.service","yL49PNFmjW.PromotionApp",
"J9fZJDMi1v.SecurityCenter","ZODRT12q2l.WebAccountExtension"}
KEEP = {"com.samsung.tv.gallery","org.tizen.browser","com.samsung.tv.coba.livetv",
"com.samsung.tv.coba.source","org.tizen.ambientapp"}
BRANDS = ["netflix","youtube","prime video","spotify","plex","dstv"]
TECH = ("daemon","framework","protocol","manager","support","hotel","preview","continuewatching","ep-","ewbs","p2p-","csapi","ug-","tvs-lite","agent","provider","panel","service")

def curated(a):
    i, n = a["id"], (a["name"] or "").lower()
    if i in ("tvunlock02.Launcher","tvunlock01.Peregrine"): return False
    if i.endswith("-dummy"): return False
    if i in HIDE: return False
    if i in KEEP: return True
    if any(t in n for t in ("test","suite","sample","demo")): return False
    if any(t in (i + " " + n) for t in TECH): return False
    if any(n.startswith(b) for b in BRANDS): return True
    if i.startswith("com.samsung.") or i.startswith("org.tizen."): return False
    return True

shown = [a for a in d["apps"] if a.get("show") is not False and curated(a)]
print("curated:", len(shown))
for a in sorted(shown, key=lambda x: (x["name"] or "").lower()):
    print(" ", a["name"], "|", a["id"])
