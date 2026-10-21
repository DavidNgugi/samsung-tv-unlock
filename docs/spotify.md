# Now Playing (Spotify)

A now-playing card and control panel on the launcher, fed by Spotify Connect
rather than by Tizen. This exists because Tizen 6.0 exposes no media session to
third-party apps: `tizen.mediacontroller` is a stub on this TV.

## How it works

~~~
TV launcher  ──GET /nowplaying──▶  Mac: tools/spotify_service.py  ──▶  Spotify Web API
             ◀──JSON────────────
             ──POST /control────▶                              ──▶  Spotify Web API
~~~

The service handles OAuth (PKCE, no client secret), refreshes tokens, and exposes
two CORS-enabled endpoints. The launcher polls every 6 seconds.

## Try it without credentials

~~~bash
python3 tools/spotify_service.py --mock --port 8795
~~~

Then on the TV: **Down → Music**. The panel opens with a sample track; the compact
card sits top-right on Home. Controls call the mock and update immediately.

## Real Spotify

1. In the [Spotify developer dashboard](https://developer.spotify.com/dashboard),
   create an app. Add this exact redirect URI:

   ~~~
   http://127.0.0.1:8795/callback
   ~~~

2. Copy the **Client ID**. No client secret is needed.

3. Run the service on the Mac:

   ~~~bash
   SPOTIFY_CLIENT_ID=your_id python3 tools/spotify_service.py
   ~~~

4. Open `http://127.0.0.1:8795/login` in a browser on the Mac and approve.

5. Start playback in the TV's Spotify app (or cast to it from the phone). The
   launcher card appears within a few seconds.

The token is stored at `~/.tv-unlock-spotify.json` with mode 0600.

## Endpoints

| Endpoint | Returns / does |
| --- | --- |
| `GET /nowplaying` | `{playing,title,artist,art,progress_ms,duration_ms}` |
| `POST /control` | `{"action":"toggle"}` or `play`, `pause`, `next`, `previous`, `seek` + `position_ms` |
| `GET /health` | `{ok,mock,auth}` |
| `GET /login` | starts PKCE authorization |

## Launcher side

- Rail item **Music** opens the panel. `Left/Right` selects prev/play/next,
  `OK` acts, `Back` closes.
- The compact card is display-only; it appears when a track is loaded, including
  when paused.
- Service URL defaults to `http://192.168.100.24:8795`. To change it without
  rebuilding:

  ~~~js
  localStorage.setItem("spotifyUrl", "http://192.168.100.24:8795");
  ~~~

## Limitations

- **Spotify only.** YouTube and YouTube Music expose no Connect API and no public
  control surface; Tizen gives no media session. That is a platform limit, not a
  bug in this bridge.
- Progress is polled, so it moves in 6-second steps; position is interpolated by
  the browser only while a transition runs.
- The TV must be the active Spotify device. If playback is on the phone, transfer
  it first; the API returns 204 and the card hides.
- The service binds `0.0.0.0` so the TV can reach it. Keep it on your LAN; do not
  port-forward it.
