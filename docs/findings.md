# Findings — 19 Oct 2026

Probed the TV at `192.168.100.26` from `192.168.100.32`. No changes were made
to the TV.

## Identity

`GET http://192.168.100.26:8001/api/v2/` (unauthenticated, 9 ms):

```json
{
  "device": {
    "modelName": "UA65AU8000UXKE",
    "model": "21_NIKEL_UHD_BASIC",
    "OS": "Tizen",
    "PowerState": "on",
    "TokenAuthSupport": "true",
    "remote_available": "true",
    "developerMode": "0",
    "firmwareVersion": "Unknown",
    "countryCode": "KE",
    "networkType": "wireless",
    "resolution": "3840x2160",
    "wifiMac": "D8:A3:5C:90:9C:44"
  }
}
```

So: 65" AU8000 Crystal UHD, 2021, Tizen 6.0, Kenya region, developer mode off.
`TokenAuthSupport: true` means the firmware *claims* to support token pairing.

## The pairing channel refuses everyone

Two independent clients, both rejected immediately:

| Client | Name | Result |
| --- | --- | --- |
| `samsung_tv_remote.py` | `DSH Probe 60217` (never used before) | `PermissionError` after **0.01 s**, `ms.channel.unauthorized` |
| `samsungtvws` 2.x | `PyProbe` | read timeout at the REST stage |

The 0.01 s is the important number. A real prompt takes a human several seconds;
an auto-denied well-known name is fast, but a *brand-new* name being refused that
fast rules out a per-name denial cache. The TV is declining the channel before
any user decision.

This is the case the bridge README describes at lines 173–218: sets that never
authorise local IP control, with Samsung's "may not be supported depending on
model or geographic area" caveat.

## REST side is partially closed too

- `GET /api/v2/` → **200**, 9 ms, full device JSON.
- `GET /api/v2/applications` → connects, then **no bytes for 6 s** (curl
  `000`, `samsungtvws` `ReadTimeout`).

So device info is world-readable, the app list is not. App launching over REST
therefore cannot be assumed until the same gate opens.

## UPnP works

Per the bridge's own status: volume, mute, transport control and Wake-on-LAN
over the renderer at 9197. That is why "I can turn it off and change volume"
works while nothing else does.

## Interpretation

| Hypothesis | Verdict |
| --- | --- |
| Cached "Denied" entry for `DSH Remote` | Ruled out — fresh name refused just as fast |
| Stale pairing token | Ruled out — probe used no token |
| Client bug in the bridge | Ruled out — `samsungtvws` behaves the same |
| TV-side gate (setting or firmware) | **Most likely** |

The remaining candidates, in order:

1. `Access Notification` off / denied devices in *Device Connection Manager* →
   TV silently refuses instead of prompting.
2. A transient block from earlier failed attempts → cleared by a power cycle.
3. Firmware/region gate on local IP control → nothing client-side fixes it.

## What this means for the build

Do not design around the 8001 channel. Design around a TV-side app that talks
outbound to the bridge. That path does not depend on the TV granting anything
except developer-mode installation, which is a one-time local operation.

## Next actions

1. Power-cycle, then check *Device Connection Manager* and `Access Notification`.
2. Retry with a fresh `--name`; watch for a prompt on screen.
3. Regardless of outcome: enable developer mode, install `agent/`, prove the
   outbound control path works.
4. Only then consider IR for blind keys, and much later, root.


---

# Update — authorized, 21 Oct 2026

**Root cause: port 8001 vs 8002, not the device list.**

The TV had moved to a new DHCP lease (`192.168.100.26` → `192.168.100.35`), and
this machine moved too (`.32` → `.24`). Once reached at the new address:

| Channel | Result |
| --- | --- |
| `ws://192.168.100.35:8001` (plain) | `ms.channel.unauthorized` in **0.01 s**, every name |
| `wss://192.168.100.35:8002` (TLS) | **connected**, `KEY_HOME` accepted |

Two independent clients behaved identically, so this is the firmware, not the
code. The 2021 AU8000 accepts only the secure channel; plain 8001 refuses
instantly even for a name that has never connected. Deleting the device list and
setting `Access Notification` was good hygiene but was never the fix.

The bridge's error text ("auto-denied this device rather than asking you") is
therefore wrong for this failure mode: it describes a per-device denial when the
real condition is a wrong port.

## What was changed

1. Paired as `DSH Remote` over `wss://192.168.100.35:8002`; the token was
   written to `~/.samsung_tv_remote/token_mac_d8a35c909c44`.
2. Registry record updated: `host` 192.168.100.35, `port` 8002,
   `secure` true. Backup at `tvs.json.bak`.
3. Service restarted. State now reports:

```json
{"connected": true, "secure": true,
 "capabilities": {"keys": true, "volume": true, "mute": true,
                  "playback": true, "power_on": true, "power_off": true,
                  "apps": true, "upnp": false}}
```

`remote key home` → `sent KEY_HOME`.

## Consequences

- The `secure` and `port` fields in `tvs.json` are load-bearing. A re-scan that
  rewrites the record must keep them, or the bridge silently falls back to the
  refusing channel.
- The IP will move again. Reserve a DHCP lease for the TV's MAC
  `D8:A3:5C:90:9C:44` at the router, or the bridge will be offline after the
  next reboot.
- Because full keys work, the TV-side agent is now an optional path for custom
  apps, not a workaround for a blocked channel.

## Suggested bridge fix

On `ms.channel.unauthorized` with no token, retry once on 8002 with TLS before
reporting a denial. That single fallback would have turned this from a
multi-day mystery into a one-line diagnosis.

