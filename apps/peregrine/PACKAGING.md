# Packaging Peregrine

**Status:** source is ready and validated. Nothing has been built, signed, or
installed, and the TV has not been touched.

![Peregrine preview](../../docs/peregrine-preview.png)

## Where this TV sits in Samsung's matrix

From [TV Model Groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html):

| Year | Group | Models | Tizen | Tooling |
| --- | --- | --- | --- | --- |
| 2021 | `21TV_STANDARD1` | UAU9070, UAU9000, QAQ6D, QAQ60, UAU850D, **UAU8000**, LS05AL | Tizen 6.0 | TV Extension **6.0 or higher** |
| 2021 | `21TV_BASIC1` | … UAU8000_K … | Tizen 6.0 | TV Extension 6.0 or higher |

`UA65AU8000UXKE` is the 65" UAU8000, so it is a 2021 set on Tizen 6.0. The
docs are not "too new" for it: the spec tables carry a Tizen 6.0 column all the
way down to Tizen 2.3 (2015). What matters is installing **TV Extension 6.0 or
higher**, not the oldest one.

Firmware is a separate question and does not gate app development. Developer
mode works on retail firmware. Read the version on the TV under
`Settings → Support → About This TV → Software Version`.

## Prerequisites

- Tizen Studio (IDE) for macOS. It is an Intel build; this Mac is arm64 but
  Rosetta is present and works. Expect a large download.
- Samsung TV Extension 6.0+ from Tizen Studio's Package Manager.
- A Samsung Developer account (free) for the author certificate.
- The TV's DUID: `Menu → Support → Contact Samsung → Unique Device ID`
  (Samsung's own path, from the certificate docs).
- TV developer mode on, with **Host PC IP** = `192.168.100.32`.
- If the Tizen installer complains about Java, install JDK 17
  (`brew install openjdk@17`) and point `JAVA_HOME` at it. This machine
  currently has JDK 23, which some Tizen tooling is too old to accept.

## Steps

1. **Developer mode on the TV.** `Apps → App Settings` (or focus the Apps
   panel) → `12345` → `Developer Mode: On` → `Host PC IP` = `192.168.100.32`
   → reboot. If `sdb devices` stays empty afterwards, cut the power at the wall
   and boot again — that is what fixed it for the Clean Frame author, because
   the remote's power button only reaches standby/Art Mode.

2. **Certificate profile.** Tizen Studio → `Tools → Certificate Manager` → `+`
   → `Samsung` → `TV` → name it `peregrine`.
   - Author certificate: create new, sign in with the Samsung Developer account,
     pick a backup path and keep it. Every future update must use this same
     author certificate.
   - Distributor certificate: create new, privilege `Public`, and add the TV's
     DUID (type it, or use `+` next to the connected device).

3. **Create the project.** `File → New → Tizen Project → TV → Web App`, name it
   `Peregrine`. Then replace the generated `index.html`, `style.css`,
   `main.js` and the `<tizen:application>` / `<name>` / `<content>` parts of
   `config.xml` with the files in this folder.

4. **Package it.** Right-click the project → `Build Signed Package` (or
   `Project → Build → Package`). You want `Peregrine.wgt`, signed with the
   `peregrine` profile. Do not zip it by hand — a hand-signed package is the
   exact thing that got rejected in the Clean Frame write-up.

5. **Install.**

   ```bash
   sdb connect 192.168.100.26:26101
   sdb devices
   sdb install /path/to/Peregrine.wgt
   ```

6. **Launch.** `Peregrine` appears in the TV's app row. It should show
   `1920 x 1080`, the Chromium version, and the last remote key you pressed.

## CLI alternative

Once Tizen Studio's CLI is on `PATH`:

```bash
tizen create web-project -n Peregrine -p . -t TV
# copy apps/peregrine/* over the generated sources
tizen package -t wgt -s peregrine -- Peregrine/
tizen install -n Peregrine.wgt -t <target>
```

The IDE route is better documented and matches what Samsung's packaging tools
expect.

## Why skip the emulator

- The TV emulator is x86; this Mac is arm64. It runs under Rosetta, slowly.
- Samsung's own docs warn that the emulator's web engine differs from the TV's,
  so it does not prove what you care about.
- It cannot validate the two things most likely to fail here: your certificate
  and the DUID-bound install.
- For layout, headless Chrome is already the loop we use. The TV is the only
  meaningful test for the rest.

Install Tizen Studio without the emulator images to save disk and time.

## What can still go wrong

| Symptom | Cause |
| --- | --- |
| `sdb devices` empty | dev mode off, wrong Host PC IP, TV on another subnet, or needs a wall power-cycle |
| install: signature error | unsigned/hand-zipped package, wrong profile, or DUID missing from the distributor certificate |
| app installs, opens black | wrong `content src`, or files not where `config.xml` expects them |
| keys do nothing | `hwkey-event="enable"` missing from `config.xml` |
| works, then breaks after firmware update | developer mode or the certificate is invalidated; re-enable and reinstall |

## Risks

- Changing TV settings is not risk-free, but nothing here touches the service
  menu or the boot chain.
- The Clean Frame author's Home-screen change (pointing Home at a custom app)
  is a separate, riskier step. It is not part of this build, and no launcher is
  being created.


---

## Actual setup on this machine — 21 Oct 2026

The IDE route was not needed. The CLI toolchain plus the extension packages was
enough to get `sdb` talking and a package built.

| Piece | Where / version |
| --- | --- |
| Tizen Studio CLI | `~/tizen-studio` (web-cli 6.1, 3.1 GB after extensions) |
| Bundled JDK | `~/tizen-studio/jdk` (Corretto 8); linked to `~/.package-manager/jdk` |
| TV extension | `TV-SAMSUNG-Public 10.0.0` + resources + tools |
| Certificate tooling | `Certificate-Manager 3.1.3`, `cert-add-on 2.0.75` |
| sdb | 4.2.36, TV at `192.168.100.35:26101` |
| DUID | `SHCEPZPTODCY6` |

Install order that worked:

```bash
package-manager-cli.bin install --accept-license --no-java-check \
  Certificate-Manager cert-add-on TV-SAMSUNG-Public \
  TV-SAMSUNG-Public-WebAppDevelopment TV-SAMSUNG-Extension-Tools \
  TV-SAMSUNG-Extension-Resources
```

The emulator package aborted the first run by prompting for a password to
install Intel HAXM (x86 driver, useless on Apple Silicon). Killing that prompt
let the run finish; the second pass installed the rest.

### Project and package

```bash
tizen create web-project -n Peregrine -p tv-6.0 -t WebBasicapplication -- apps/
# copy index.html / style.css / main.js over it, write config.xml
tizen security-profiles add -n peregrine -a ~/tizen-studio-data/keystore/author/author.p12 -p peregrine -A
tizen package -t wgt -s peregrine -o /tmp/peregrine.wgt -- apps/peregrine-tv
sdb install /tmp/peregrine.wgt/Peregrine.wgt
```

### Where it stops

`sdb install` pushes and exits 0, but the TV does not register the app: the
package was signed with Tizen's **default** distributor certificate
(`certificate-generator/certificates/distributor/tizen-distributor-signer.p12`),
which carries no DUID. Samsung TVs want a distributor certificate issued to the
TV's DUID.

That requires the Samsung Certificate Manager GUI (open now) and a Samsung
Developer account sign-in:

1. `+` → Samsung → TV → profile name `peregrine-samsung`.
2. Author certificate: create new, sign in, choose a backup path.
3. Distributor certificate: create new, privilege **Public**, add DUID
   `SHCEPZPTODCY6`.
4. Finish.

Then:

```bash
tizen package -t wgt -s peregrine-samsung -o /tmp/peregrine-samsung.wgt -- apps/peregrine-tv
sdb install /tmp/peregrine-samsung.wgt/Peregrine.wgt
```



---

## Result — installed and launched, 21 Oct 2026

```
app_id[tvunlock01.Peregrine] install completed
Installed the package: Id(tvunlock01.Peregrine)
... successfully launched pid = 3786
```

Two failures were worth the time they cost:

### 1. Package id must be 10 characters

`package="tvUnlock"` (8 chars) produced:

```
install failed[118, -19], reason: Parsing error
```

The stock template's generated id (`cw7fhV0AWo`) installed fine with the same
certificate, which isolated it to the manifest. Renaming to a 10-character
package fixed it:

```xml
<tizen:application id="tvunlock01.Peregrine" package="tvunlock01" required_version="3.0"/>
```

The app id is now `tvunlock01.Peregrine`. Changing it later means uninstall and
reinstall.

### 2. `sdb install` only pushes here

`sdb install` transfers the file, exits 0, and never installs. It reports
nothing. `tizen install` does the real install and surfaces platform errors:

```bash
tizen package -t wgt -s peregrine-samsung -o build -- apps/peregrine-tv
tizen install -n build/Peregrine.wgt
tizen run -p tvunlock01.Peregrine
```

No `-t` target argument is needed; it uses the connected sdb device. This is the
entire edit loop now: three commands, about ten seconds.

