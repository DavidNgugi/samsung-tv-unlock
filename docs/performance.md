# Tizen performance guide

How to keep a Tizen TV web app at 60 fps on hardware this weak, written from
measurements on a 2021 Samsung AU8000. Everything here was measured on the TV;
none of it is a browser guess.

Test box: 4 cores, `navigator.deviceMemory = 1` (1 GB class), Tizen 6.0,
Chromium 76, 1.38 GB storage free.

## The mental model

A native TV app composites a few GPU layers. A web app pays for layout, paint,
raster and composite. On this set a single full-stage paint costs roughly
**80–200 ms**, so one accidental paint per keypress turns 60 fps into 5 fps.

The rule that follows: **focus and animation may change only `transform` and
`opacity`.** Everything else is a potential repaint.

## Ten rules

### 1. Animate transform and opacity only

~~~css
/* slow: layout + paint */
.tile:focus { width: 220px; height: 220px; top: -8px; }

/* fast: compositor */
.tile { transform: translateZ(0); will-change: transform; }
.tile:focus { transform: translateZ(0) translateY(-8px) scale(1.04); }
~~~

Never animate `width`, `height`, `top`, `left`, `margin`, `padding`, `border`,
`background`, `box-shadow` or `filter`.

### 2. Promote the layers you animate

~~~css
.tile { transform: translateZ(0); will-change: transform; backface-visibility: hidden; }
.plate { will-change: transform, opacity; }
.label { will-change: opacity; }
~~~

Without promotion, a transform can still re-rasterise. With it, the compositor
moves an existing texture.

### 3. Use one floating highlight, not per-tile focus backgrounds

A class that adds a background, border or shadow to a tile repaints the whole dock
layer. Keep a single promoted plate and move it:

~~~js
plate.style.transform = "translate(" + tile.offsetLeft + "px," + tile.offsetTop + "px)";
plate.style.opacity = "1";
~~~

### 4. Pre-render text that changes on focus

`textContent` on a visible node can cost a layout pass and a repaint. If the text
changes as focus moves, build the strings once, stack them, and toggle opacity:

~~~html
<div class="title-stack">
  <div class="title-item">Netflix</div>
  <div class="title-item">YouTube</div>
</div>
~~~

~~~js
items[previous].style.opacity = "0";
items[index].style.opacity = "1";
~~~

If you must write text, guard it: `if (node.textContent !== value)`.

### 5. Never rebuild a container that holds a persistent layer

`container.innerHTML = ""` deletes the floating plate along with the tiles. Either
append the plate after re-rendering, or query `.tile` elements instead of indexing
`children` (which would count the plate as tile 0).

### 6. Audit broad selectors

A rule like `.util span { position: relative }` silently overrode
`.chip { position: absolute }`, collapsing the highlight to **0.8 × 0.8 px**. It
looked like "the menu never highlights". Scope selectors or raise specificity.

### 7. Keep glows and shadows static

Changing a large gradient per focus is a large paint. A 900×340 radial glow update
cost about half the frame rate. Paint it once; let the plate carry focus.

### 8. Guard repeated writes

Only change the property that changed:

~~~js
if (plate._tile === tile) return;
plate._tile = tile;
~~~

Track previous indices for chips, titles and captions. Writing the same value
still invalidates style.

### 9. Cache expensive platform APIs

`tizen.application.getAppsInfo()` walks every installed package. On this TV:
**4,011–4,220 ms, blocking the main thread**. `requestAnimationFrame` does not fire
during it, so the app freezes.

~~~js
var cache = readCache();
if (cache) adopt(cache);            // render immediately
if (!cache || stale(cache)) fetchApps(); // refresh behind the UI
~~~

A cold start still pays the cost; show a message rather than a blank screen.

### 10. Keep the layer count sane

Each `will-change` element is a texture. Twenty-five promoted tiles plus plates is
fine at 190×140; promoting a 1920×1080 layer per item is not. On a 1 GB device,
layer churn shows up as 200–900 ms stalls.

## Measured anti-patterns

| Change on each keypress | Result |
| --- | --- |
| Full-width glow gradient | 4.9–11.7 fps |
| Per-tile focus class (background/border/shadow) | ~5 fps |
| Subtitle `textContent` write | 3.9 fps |
| Chip plate `width` write | 5.9 fps |
| Broad selector collapsing the chip | highlight invisible |
| Nothing (control) | 60.2 fps |
| Plate transform only | 60.1 fps |
| Title text only | 61.1 fps |
| `clearFocus()` alone | 59.9 fps |
| Per-item opacity chips | 54.4 fps |

The controls matter: they prove which operation is the cost before you refactor.

## The working focus recipe

~~~html
<div id="dock">
  <div class="tile">…</div>
  …
  <div id="plate" class="plate"></div>
</div>
~~~

~~~css
.tile { transform: translateZ(0); will-change: transform; backface-visibility: hidden;
        transition: transform 180ms cubic-bezier(.2,.7,.2,1); }
.tile.focus { transform: translateZ(0) translateY(-8px) scale(1.04); }
.plate { position: absolute; left: 0; top: 0; width: 190px; height: 140px;
         opacity: 0; will-change: transform, opacity;
         transition: transform 180ms cubic-bezier(.2,.7,.2,1), opacity 120ms linear; }
~~~

~~~js
function focusTile(node) {
  if (last) last.className = last.className.replace(/\s*focus/g, "");
  if (node) node.className += " focus";
  last = node;
  plate.style.transform = "translate(" + node.offsetLeft + "px," + node.offsetTop + "px)";
  plate.style.opacity = "1";
}
~~~

Measured: **61.9 fps, 16 moves, 19 ms worst frame.**

## Profile it, don't guess

The launcher ships a probe behind `DIAGNOSTICS = true`:

~~~bash
python3 tools/dump-server.py --port 8792
tools/deploy-launcher.sh
sleep 15
cat /tmp/perf.json
~~~

It reports `firstPaint`, `appsMs`, frame stats and a scripted 16-move focus
benchmark. Benchmark modes let you bisect:

| Mode | What it does |
| --- | --- |
| `nopaint` | moves focus, repaints nothing — the ceiling |
| `plate` | moves only the plate |
| `text` | writes only the title |
| `chips` | toggles only chip opacity |
| `clear` | clears focus classes only |
| `paint` | the real focus path |

If `frame` is `null`, the main thread never yielded — a blocking platform call,
not a rendering problem.

## Checklist before shipping

- [ ] Focus/animation touches only `transform` and `opacity`
- [ ] Animated elements are promoted (`translateZ`, `will-change`, `backface-visibility`)
- [ ] No animated `box-shadow`, `filter`, gradient or layout property
- [ ] One floating highlight plate, not per-tile focus backgrounds
- [ ] Text that changes with focus is pre-rendered or guarded
- [ ] Containers with persistent layers survive re-render
- [ ] Broad selectors audited against absolute-positioned children
- [ ] Expensive platform APIs cached; cold start has feedback
- [ ] Layer count and layer size are deliberate
- [ ] 16-move focus benchmark ≥ 55 fps on the real TV
- [ ] Cold start measured separately from steady state

## What you cannot fix from the app

This TV reports 393 installed entries, 382 of them Samsung's, 205 marked visible.
Smart Hub renders those plus recommendations and ads. The package scan is the
platform walking all of them on a 4-core, 1 GB box. There is no `pm disable-user`
on Tizen, so the levers are: cache, avoid Smart Hub, block ad/telemetry domains at
DNS, turn off ACR and TV Plus autostart, and keep storage free.

## This TV's final numbers

| Metric | Before | After |
| --- | --- | --- |
| Dock focus | 4.9–11.7 fps | **61.9 fps** |
| Menus / rail | ~5 fps | **~54 fps** |
| `getAppsInfo` | 4.0–4.2 s every launch | skipped on cached launches |
| First paint | 0.9–1.6 s | unchanged |
| JS heap | 10 MB | 10 MB |
