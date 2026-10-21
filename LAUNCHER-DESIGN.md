# Launcher design

A design brief for the custom launcher, assembled from Apple TV's focus model,
CleanFrame's shipped interaction rules, CleanMyTV's host-side customiser and
tv-vibehack's visual language. Numbers are for a 1920×1080 stage.

![Shelf concept](docs/launcher-concept.png)

The concept is [design/shelf.html](design/shelf.html) — open it in a browser and
use the arrow keys once it is wired up.

---

## 1. Five principles

1. **Focus is the interface.** There is no cursor and no hover. Everything the
   viewer needs to know is carried by where the focus plate is and what the
   shelf says about it.
2. **One focus owner.** Exactly one plate is lit at a time, ever. Two competing
   highlights is the fastest way to look amateur.
3. **Focus never acts.** Moving focus changes the shelf; only OK launches.
   Apple's guidance is explicit that selection is a separate gesture.
4. **No movement without input.** No auto-return timers, no carousels that steal
   focus, no focus jumps when data loads. If focus must move because the focused
   item disappeared, move it one discrete step.
5. **The TV is not a phone.** Everything is legible from three metres, reachable
   with four arrows, and animated in under a quarter second.

## 2. Three layouts, one recommendation

**A. Shelf** — recommended default. A dock of apps, a large caption above it,
clock top-left, small utilities top-right.

~~~text
┌────────────────────────────────────────────────────┐
│ 21:04                              Inputs  Settings │
│                                                    │
│  CONTINUE                                          │
│  Netflix                                           │
│                                                    │
│                                                    │
│  ╭──────────────────────────────────────────────╮  │
│  │  ▶     [ N ]     ▷      ♫      ⌂             │  │
│  ╰──────────────────────────────────────────────╯  │
└────────────────────────────────────────────────────┘
~~~

**B. Rails** — for people with many apps. A vertical list, name-led, with a
preview pane on the right.

~~~text
┌────────────────────────────────────────────────────┐
│ 21:04                                    Settings  │
│                                                    │
│   YouTube                                 ╭─────╮  │
│   Netflix              ← focus            │     │  │
│   Prime Video                             │ pre │  │
│   Spotify                                 │ view│  │
│   All apps                                ╰─────╯  │
└────────────────────────────────────────────────────┘
~~~

**C. Grid** — for "All apps", not for Home. Five columns, focus scrolls the
grid, up from the first row goes to Home controls.

~~~text
┌────────────────────────────────────────────────────┐
│ 21:04                                 All apps     │
│   [▶]  [N]  [▷]  [♫]  [⚙]                          │
│   [ ]  [ ]  [ ]  [ ]  [ ]                          │
│   [ ]  [ ]  [ ]  [ ]  [ ]                          │
└────────────────────────────────────────────────────┘
~~~

Ship Shelf and Grid first. Rails is a theme, not a separate app.

## 3. Focus model

| Rule | Behaviour |
| --- | --- |
| Ownership | one plate; it moves, it is never duplicated |
| Movement | Left/Right within a row, Up/Down between rows; no wrap at ends |
| Selection | OK only; focus change never launches |
| Reveal | the focused item shows its name; unfocused items stay icon-only |
| Memory | last focused app persists across launches and reboots |
| Held keys | a held arrow repeats; a held OK/Back acts once until release |
| Back | closes one level, then offers "Samsung Home" rather than deciding for you |
| Missing item | move focus one step, never to a random tile |

The plate should lift ~10px at 1.05 scale and carry a soft shadow. Shadow stays
static during motion — animate transform and opacity only.

## 4. Motion tokens

~~~css
:root {
  --t: 180ms;
  --ease: cubic-bezier(.2, .7, .2, 1);
  --t-fast: 120ms;   /* opacity, small fades */
  --lift: -10px;
  --scale: 1.05;
}
~~~

- Plate move and lift: 180ms, the curve above. No spring, no bounce — a cheap
  panel makes overshoot look like judder.
- Name reveal: opacity 160ms, 4px rise.
- Scrim/background changes: 300ms crossfade, only when the theme changes.
- Nothing exceeds 250ms. If it feels slow on the TV, drop the duration rather
  than adding easing.

## 5. Type at 1080p

| Role | Size / line | Weight | Notes |
| --- | --- | --- | --- |
| Clock | 48 / 56 | 300 | tabular figures, −1.5px tracking |
| Date | 24 / 32 | 400 | 55% white |
| Shelf eyebrow | 20 / 28 | 500 | 0.26em tracking, uppercase, 42% white |
| Shelf title | 52 / 60 | 300 | −1.6px tracking; this is the hero |
| App name (focused) | 30 / 40 | 500 | −0.6px |
| Utilities | 24 / 32 | 400 | 62% white |
| Body / hints | 24 / 32 | 400 | never below 24px |

Faces: Outfit or Manrope for the UI, Newsreader if you want an editorial clock.
Ship the font files in the package; do not fetch them at runtime.

### The list is not the Smart Hub order

`getAppsInfo()` returns installed apps, not the app-bar order the viewer sees in
Smart Hub. That order cannot be read through the public API, so a launcher needs
its own editor and a sensible first-run default. Clean Home ships both: **Edit
Home** in the top-right controls, and a default of Netflix, Prime Video, YouTube,
Plex, Gallery, Spotify.

Known brands also get bundled marks, because `iconPath` is not always the icon
the TV displays for that app — the YouTube tile proved it.

## 6. Material and colour

- **Backdrop:** a photograph, a flat dark, or a light theme. Photographs get a
  bottom scrim (~520px) and a top shade (~300px) so text survives any image.
- **Plate:** a vertical white gradient at 14–34% opacity with a 1px inner
  highlight. It reads as glass without a blur pass.
- **Accent:** pull one colour from the focused app's artwork and use it as a soft
  radial glow behind the dock. Keep it under ~20% opacity; it should be felt,
  not seen.
- **Text:** #f4f4f1 on dark, #141618 on light plates.
- **Never** rely on colour alone for focus; the lift and the plate do the work.

## 6b. Tokens borrowed from cleanyourtv

[cleanyourtv](https://github.com/Gathin23/cleanyourtv) (formerly tv-vibehack)
ships a native Android TV launcher whose look is worth copying almost verbatim:

| Token | Value |
| --- | --- |
| Background | `#000000` |
| Tile fill | `#1C1C1E`, 16dp corners |
| Glass panel | `#F22A2A2E → #F5161618`, 1dp `#33FFFFFF` stroke, 20dp corners |
| Pill | 42dp high, 21dp corners; focused `#F5FFFFFF`; idle `#2EFFFFFF → #14FFFFFF` with `#38FFFFFF` stroke |
| Hero | 48sp, Outfit Light, letter-spacing −0.02 |
| Ambient | a full-screen glow in the focused app's colour |
| Themes | a JSON overlay: `background_color`, `wallpaper`, `columns`, `rows_below_dock`, `dock_title`, `dock_row`, `greeting_name`, `cinematic_home` |

Their theme folders are `default` (black, four dock apps), `aurora` (navy with a
teal/violet wallpaper) and `six-columns`. Clean Home ships the same three ideas
as Obsidian, Aurora and Six columns, with a Theme control that cycles them.

## 7. Navigation map

~~~text
Home (dock)
  ├─ Down ───────────► Quick rail (Wi-Fi · Inputs · Settings)
  │                      └─ Up ─► dock
  ├─ Up ─────────────► Utilities (Inputs, Settings)
  │                      └─ Down / Back ─► Home
  ├─ Down ───────────► All apps (grid)
  │                      └─ Up from first row ─► Apps on Home
  │                      └─ Back ─► Home
  ├─ OK ─────────────► launch app
  └─ Back ───────────► "Stay / Samsung Home" choice
~~~

Settings is a two-pane surface: groups on the left, a live preview of the
committed Home on the right. Applying a value is immediate; there is no Save
button. Back cancels a pending change and keeps completed ones.

## 8. The host-side customiser

CleanMyTV's best idea is that the TV is a bad place to arrange forty apps. Mirror
it with a small local web UI that edits a config.json and pushes it over sdb:

- drag to order, first row is the dock
- hide apps, set columns and rows
- wallpaper upload and rotation
- dim, greeting, 12/24h clock, motion on/off
- live sketch of the TV home while editing
- reads the TV's current config before writing, and can pull a screenshot

Contract:

~~~json
{
  "version": 1,
  "layout": "shelf",
  "apps": [
    { "id": "3201907018807", "name": "Netflix", "mark": "N" }
  ],
  "hidden": ["adplatform.ADPlayer"],
  "theme": { "background": "photo", "photo": "evening-01", "dim": 0.35 },
  "type": { "face": "outfit", "scale": 1 },
  "focus": { "style": "glass", "lift": 10 },
  "clock": { "format": "24h", "showDate": true },
  "greeting": "Good evening"
}
~~~

The TV app reads this file from its own package or from a fetched endpoint; the
host writes it, then restarts the app. Never let a config write half-succeed:
write a temp file, verify it parses, then replace.

## 9. Performance budget

The measured rules and the profiling method are in
[performance.md](performance.md). The numbers below are the budget; that file is
how to hit it.

| Item | Budget |
| --- | --- |
| Stage | 1920×1080, scaled with a transform |
| Wallpaper | ≤ 200 KB, pre-dimmed, pre-scrimmed |
| Plate / glow | pre-rendered or pure CSS gradients, never live blur |
| App icons | ≤ 20 KB each, lazy-loaded in All apps |
| Animated properties | transform, opacity only |
| Frame budget | 16 ms; if a section drops frames, simplify it, not the TV |
| Startup | first paint ≤ 500 ms from launch |

Do not use live backdrop blur, large animated shadows, or 4K assets. The AU8000
is a 2021 budget SoC; the difference between smooth and sluggish here is almost
entirely asset discipline.

## 10. What to take from where

| Source | Take |
| --- | --- |
| **Apple TV** | focus-first interaction, parallax lift, top shelf, dock, large type, no chrome |
| **CleanFrame** | 1920 stage, 180 ms curve, plate gradients, list/dock modes, two-pane settings, app editor, bounded API calls, held-key rules |
| **CleanMyTV** | host-side customiser, drag-to-order, wallpaper sets, live sketch, read-before-write config |
| **tv-vibehack** | pitch-black field, ambient glow, greeting + clock, clock screensaver |
| **Peregrine** | the install/verify loop that makes iteration cheap |

## 11. Anti-patterns

- Focus that wraps at the end of a row.
- Auto-return timers that yank the viewer back.
- Focus-as-launch.
- Two lit plates, or a hover state.
- Live blur, 4K wallpapers, animated shadows.
- Hard-coded app ids copied from another region.
- Filtering system apps with no escape hatch.
- Text below 24px, or grey-on-grey contrast.
- Animations over 250ms.
- A settings screen that needs a Save button.

## 12. Build order

1. **Done** — Shelf and Grid at 1920×1080, implemented in
   [apps/Launcher](apps/Launcher) and installed on the TV as Clean Home.
2. **Done** — browser preview with real key handling; focus memory is in
   `localStorage` for the dock order.
3. **Done** — on-TV app list, filter, launch, icon fallback.
4. Settings two-pane with live preview.
5. Host customiser writing config.json.
6. Motion polish and a performance pass on the actual set.
