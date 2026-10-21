# Setting this up on another TV

This is a sideloaded Tizen app plus a small local service, not a store app. Someone
else can run it, but they bring three things: their own Samsung certificate, their
own TV, and their own Spotify app registration.

## 1. What they need

- A Samsung Tizen TV (2019+, Tizen 5.5/6.0 tested on a 2021 AU8000).
- Tizen Studio CLI with the TV extension, and a Samsung certificate whose **author**
  and **distributor** are tied to their TV's DUID.
- A computer on the same LAN that can stay awake — Mac, Linux box, NAS or Pi.
- A Spotify account (Premium for playback control).

Samsung's certificate is the hard gate. It cannot be shared; each TV needs its own
DUID authorised through Samsung's certificate flow.

## 2. Build and install the launcher

The fast path does connection, config, build and install in one go:

~~~bash
git clone https://github.com/DavidNgugi/samsung-tv-unlock.git cleanmysamsungtv
cd cleanmysamsungtv
tools/setup.sh
~~~

It asks for the TV IP, lists certificate profiles, and optionally takes a bridge
URL. Non-interactive:

~~~bash
tools/setup.sh --tv 192.168.1.20 --profile my-cert --bridge http://192.168.1.50:8795
tools/setup.sh --tv 192.168.1.20 --profile my-cert --no-spotify
~~~

Manual equivalent:

~~~bash
sdb connect <TV_IP>:26101
PROFILE=<their-cert-profile> tools/deploy-launcher.sh
~~~

`PROFILE` defaults to `peregrine-samsung`; it must name their certificate profile.
The package id is `tvunlock02.Launcher`; if that collides with an installed app,
change `package` in `apps/Launcher/config.xml` and `APP_ID` in the deploy script.

## 3. Point the app at their bridge

Edit one file before packaging:

~~~js
// apps/Launcher/config.js
window.TV_CONFIG = {
  spotifyUrl: "http://192.168.1.50:8795"   // the always-on machine
};
~~~

Rebuild and reinstall. The value can also be overridden at runtime without a
rebuild, from the app's console:

~~~js
localStorage.setItem("spotifyUrl", "http://192.168.1.50:8795");
~~~

Give that machine a DHCP reservation; a changing IP breaks the card silently.

## 4. Run the Spotify bridge

Create a Spotify app at the developer dashboard, add the redirect URI
`http://127.0.0.1:8795/callback`, and copy the Client ID. No secret is used.

**macOS, as a service:**

~~~bash
SPOTIFY_CLIENT_ID=xxxx tools/install-spotify-service.sh
~~~

It installs a launchd job, starts on login, survives reboots, logs to
`~/Library/Logs/CleanMySamsungTv/spotify.log`. Complete OAuth once:

~~~bash
open http://127.0.0.1:8795/login
~~~

Remove it with `tools/install-spotify-service.sh --uninstall`.

**Linux / Raspberry Pi, systemd:**

~~~ini
# /etc/systemd/system/cleanmysamsungtv-spotify.service
[Unit]
Description=Spotify bridge for CleanMySamsungTv
After=network-online.target

[Service]
Environment=SPOTIFY_CLIENT_ID=xxxx
ExecStart=/usr/bin/python3 /home/pi/cleanmysamsungtv/tools/spotify_service.py --port 8795
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
~~~

~~~bash
sudo systemctl enable --now cleanmysamsungtv-spotify
~~~

**Manual, for a quick test:**

~~~bash
SPOTIFY_CLIENT_ID=xxxx python3 tools/spotify_service.py
~~~

## 5. Network

- The TV must reach the bridge: same LAN, no client isolation, port 8795 open on
  the host firewall.
- The service binds `0.0.0.0`; keep it on the LAN, never port-forward it.
- The TV polls every 6 seconds; if the card never appears, curl `/health` from the
  host, then from another machine.

## 6. What is per-user and what is shared

| Item | Shared in repo | Per user |
| --- | --- | --- |
| Launcher code | yes | — |
| Samsung certificate | no | their DUID |
| Spotify Client ID | no | their app registration |
| Bridge host/IP | no | their machine |
| Spotify refresh token | never committed | `~/.tv-unlock-spotify.json` (0600) |

## 7. The honest limits

- **No central server.** Each user runs their own bridge. That is the current
  distribution model; there is no hosted pairing flow.
- **Spotify only.** Tizen exposes no media session (verified on this TV), and
  YouTube/YouTube Music have no Connect API.
- **Spotify Development Mode** caps an app at 25 users. Shipping to more people
  needs a Spotify quota extension, a privacy policy, and a hosted backend.
- **Sideloading.** This is not a store app; every TV needs a certificate and a
  build. A one-click installer would require a hosted signing service, which is a
  different project.

## 8. If this ever ships properly

Replace the local bridge with a hosted backend and a pairing flow: TV shows a code,
phone opens the backend, logs into Spotify, TV gets a device token. Then the TV
never stores Spotify credentials and the repo has no machine-specific IP at all.
That is the only version that scales past "people who can run Python".
