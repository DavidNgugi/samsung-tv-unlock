# Home button → Clean Home (no root)

Status: **working** on UA65AU8000UXKE (Tizen 6.0, `T-NKLAUABC-2310.0`).

The physical Home key is not a vconf value on this firmware. It is a row in the
key-routing database:

- File: `/opt/dbspace/.app-context.db`
- Table: `key_filter`
- Row: `key = 'XF86Home'`

Stock value routes it to Samsung Home:

```sql
appid='com.samsung.tv.csfs'  key='XF86Home'  request='launch'
  target_selector='package:com.samsung.tv.csfs'  args='entry_point:smarthub_key'
```

## What we changed

```sql
INSERT OR IGNORE INTO managed_app(appid, ui_type, source)
  VALUES('tvunlock02.Launcher', NULL, NULL);

UPDATE key_filter
  SET target_selector='package:tvunlock02.Launcher', args=NULL
  WHERE key='XF86Home' AND appid='com.samsung.tv.csfs';
```

Two things mattered:

1. `package:` holds the **application id**, not the package name. The first
   attempt used `package:tvunlock02` (the package) and the Home key stopped
   working entirely — proof the router reads this file at boot.
2. The launcher had to be registered in `managed_app` with `ui_type = NULL`
   (the same value `org.tizen.tv-viewer` and other full-screen apps use).

## How the write was made

`/opt/dbspace` is group-writable by `system_share`, and the UID 901 (sdk)
foothold is in that group. The procedure:

1. Pull the stock `.app-context.db`, edit it with `sqlite3`, keep a copy.
2. Push the edited DB to the SDK staging dir.
3. `rm` the live `.app-context.db` and its journal (directory write).
4. `cp` the edited DB into place.
5. Power-cycle at the wall (the router reads the file at boot).

The replacement file gets the directory's SMACK label (`User::Home`) rather than
the stock `_` — accepted by the router on this firmware.

## Restore (revert to Samsung Home)

Push the stock DB back the same way, then power-cycle. The stock file is
`app-context-STOCK.db` in this repo's backup folder, SHA `86205ef1…`.

## Boot and wake (the first screen)

The first screen is not `first_screen/type` alone. On this firmware the
boot/wake app lives in keys that already exist, so `vconftool` can overwrite
them:

- `db/appfw/home_appid` — stock `org.tizen.tv-viewer`
- `db/appfw/booting_appid_backup` — stock `org.tizen.tv-viewer`
- `db/first_screen/type` — stock `com.samsung.tv.csfs`

Set all three to `tvunlock02.Launcher`, then power-cycle:

~~~bash
vconftool set -f -t string db/appfw/home_appid tvunlock02.Launcher
vconftool set -f -t string db/appfw/booting_appid_backup tvunlock02.Launcher
vconftool set -f -t string db/first_screen/type tvunlock02.Launcher
~~~

Restore the stock first screen:

~~~bash
vconftool set -f -t string db/appfw/home_appid org.tizen.tv-viewer
vconftool set -f -t string db/appfw/booting_appid_backup org.tizen.tv-viewer
vconftool set -f -t string db/first_screen/type com.samsung.tv.csfs
~~~

The rule that mattered: **existing** system keys can be overwritten by `sdk`;
*missing* keys cannot be created. `db/appfw/startup_appid` does not exist, so
writing it returns "Operation not permitted" — which is what led us to wrongly
believe all of vconf was locked.

## Known limits

- **Warm wake (remote standby) resumes Clean Home. Cold boot still opens the TV
  viewer.** The cold-boot key `db/appfw/startup_appid` does not exist on this
  firmware, and `sdk` cannot create a system key, so boot falls back to the
  hardcoded `org.tizen.tv-viewer`. `app_onboot` is native-only and never set
  on a `webapp`. A webapp launcher can own warm wake and the Home key, but not
  the cold-boot first screen.
- **A firmware update can restore these keys and the stock DB.** Re-apply after
  any update.
- It is a data-plane write, reversible, no root, no boot loader, no system app
  replacement. Clean Home remains a normal sideloaded app.

## Verification checklist

- [ ] Home from a streaming app returns to Clean Home
- [ ] Home from the TV input returns to Clean Home
- [ ] Standby/wake keeps it
- [ ] Cold boot (wall power) keeps it
- [ ] Uninstall/restore returns Samsung Home
