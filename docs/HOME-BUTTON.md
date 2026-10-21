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

## Known limits

- **Boot is unchanged.** `db/first_screen/type = com.samsung.tv.csfs` lives in
  vconf/buxton and is still not writable from UID 901, so power-on still opens
  Samsung Home. This captures the Home **button**, not the boot screen.
- **A firmware update can restore the stock file.** Re-apply after any update.
- It is a data-plane write, reversible, no root, no boot loader, no system app
  replacement. Clean Home remains a normal sideloaded app.

## Verification checklist

- [ ] Home from a streaming app returns to Clean Home
- [ ] Home from the TV input returns to Clean Home
- [ ] Standby/wake keeps it
- [ ] Cold boot (wall power) keeps it
- [ ] Uninstall/restore returns Samsung Home
