/* TV Agent — Tizen web app.
 *
 * Two jobs:
 *   1. Render the app grid and launch apps by Tizen app id.
 *   2. Poll the bridge for commands while this app is in the foreground.
 *
 * Deliberately ES5-friendly: the TV browser is old Chromium and there is no
 * transpiler in the build step.
 */
(function () {
  "use strict";

  var POLL_MS = 2000;
  var POLL_TIMEOUT_MS = 1800;
  var DEFAULT_BRIDGE = "http://192.168.100.32:8791";

  var DEFAULT_APPS = [
    { id: "111299001912",  name: "YouTube",     accent: "#ff4d4d" },
    { id: "3201907018807", name: "Netflix",     accent: "#e50914" },
    { id: "3201910019365", name: "Prime Video", accent: "#00a8e1" },
    { id: "3201606009684", name: "Spotify",     accent: "#1db954" }
  ];

  var bridge = (window.TVUNLOCK_BRIDGE || DEFAULT_BRIDGE).replace(/\/+$/, "");
  var apps = DEFAULT_APPS.slice();
  var focus = 0;
  var polling = false;
  var lastStatus = "";

  var el = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    shelfLabel: document.getElementById("shelf-label"),
    time: document.getElementById("time"),
    date: document.getElementById("date"),
    status: document.getElementById("status"),
    dot: document.getElementById("dot"),
    bridgeUrl: document.getElementById("bridge-url"),
    glow: document.getElementById("glow"),
    toast: null
  };

  // ---- storage ------------------------------------------------------------
  function loadCached() {
    try {
      var raw = localStorage.getItem("tvunlock.apps");
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.length) apps = parsed;
    } catch (e) { /* a corrupt cache is not worth failing over */ }
  }

  function saveCached() {
    try { localStorage.setItem("tvunlock.apps", JSON.stringify(apps)); }
    catch (e) { /* private mode, quota, whatever */ }
  }

  // ---- tiny helpers -------------------------------------------------------
  function setStatus(text, ok) {
    if (text === lastStatus) return;
    lastStatus = text;
    el.status.textContent = text;
    el.dot.className = ok ? "dot" : "dot off";
  }

  function toast(message) {
    if (!el.toast) {
      el.toast = document.createElement("div");
      el.toast.id = "toast";
      document.body.appendChild(el.toast);
    }
    el.toast.textContent = message;
    el.toast.className = "show";
    clearTimeout(el.toast._timer);
    el.toast._timer = setTimeout(function () {
      el.toast.className = "";
    }, 2600);
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function getJSON(path, ms) {
    return withTimeout(
      fetch(bridge + path, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }),
      ms || POLL_TIMEOUT_MS
    );
  }

  // ---- rendering ----------------------------------------------------------
  function columns() {
    var w = window.innerWidth;
    if (w >= 2400) return 8;
    if (w >= 1800) return 7;
    if (w >= 1280) return 6;
    return 4;
  }

  function render() {
    el.grid.style.gridTemplateColumns = "repeat(" + columns() + ", 1fr)";
    el.grid.innerHTML = "";

    if (!apps.length) {
      el.empty.hidden = false;
      el.shelfLabel.textContent = "Apps";
      return;
    }
    el.empty.hidden = true;

    apps.forEach(function (app, index) {
      var tile = document.createElement("div");
      tile.className = "tile";
      tile.setAttribute("role", "option");
      tile.style.setProperty("--accent", app.accent || "#5a7cff");
      tile.innerHTML = '<span class="name"></span>';
      tile.querySelector(".name").textContent = app.name || app.id;
      tile.addEventListener("click", function () { focus = index; paintFocus(); launch(app); });
      el.grid.appendChild(tile);
    });

    if (focus >= apps.length) focus = apps.length - 1;
    paintFocus();
  }

  function paintFocus() {
    var tiles = el.grid.children;
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].className = "tile" + (i === focus ? " focused" : "");
    }
    var current = apps[focus];
    if (current) {
      el.shelfLabel.textContent = current.name || current.id;
      el.glow.style.background =
        "radial-gradient(ellipse at 50% 0%, " + hexToRgba(current.accent || "#5a7cff", 0.26) + ", transparent 62%)";
      if (tiles[focus] && tiles[focus].scrollIntoView) {
        try { tiles[focus].scrollIntoView({ block: "nearest" }); } catch (e) { /* old engine */ }
      }
    }
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return "rgba(90,124,255," + alpha + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function move(delta) {
    if (!apps.length) return;
    var cols = columns();
    var next = focus + delta;
    if (delta === 1 && (focus + 1) % cols === 0) return;      // stop at row end
    if (delta === -1 && focus % cols === 0) return;           // stop at row start
    if (next < 0 || next >= apps.length) return;
    focus = next;
    paintFocus();
  }

  // ---- launching ----------------------------------------------------------
  function launch(app) {
    if (window.tizen && tizen.application) {
      tizen.application.launch(
        app.id,
        function () { toast("Opening " + (app.name || app.id)); },
        function (err) { toast("Could not open " + (app.name || app.id) + ": " + (err && err.message)); }
      );
    } else {
      toast("Not on a TV — would launch " + app.id);
    }
  }

  // ---- commands -----------------------------------------------------------
  function execute(command) {
    if (!command || !command.type) return;
    switch (command.type) {
      case "launch":
        if (command.appId) launch({ id: command.appId, name: command.name });
        break;
      case "apps":
        if (command.apps && command.apps.length) {
          apps = command.apps;
          saveCached();
          render();
          toast("App list updated");
        }
        break;
      case "toast":
        toast(command.message || "");
        break;
      case "reload":
        setTimeout(function () { location.reload(); }, 250);
        break;
      default:
        break;
    }
  }

  function poll() {
    if (polling) return;
    polling = true;
    getJSON("/agent/poll?app=tvUnlock.Agent")
      .then(function (payload) {
        setStatus("bridge: connected", true);
        if (payload && payload.apps && payload.apps.length) {
          apps = payload.apps;
          saveCached();
          render();
        }
        (payload && payload.commands || []).forEach(execute);
      })
      .catch(function () {
        setStatus("bridge: offline", false);
      })
      .then(function () {
        polling = false;
        setTimeout(poll, POLL_MS);
      });
  }

  function bootstrap() {
    loadCached();
    render();
    el.bridgeUrl.textContent = bridge;

    // Pull the app list and let the bridge correct a stale cache.
    getJSON("/agent/config", 2500)
      .then(function (payload) {
        if (payload && payload.apps && payload.apps.length) {
          apps = payload.apps;
          saveCached();
          render();
        }
        setStatus("bridge: connected", true);
      })
      .catch(function () {
        setStatus("bridge: offline", false);
      });

    poll();
  }

  // ---- clock --------------------------------------------------------------
  function two(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function tickClock() {
    var now = new Date();
    el.time.textContent = two(now.getHours()) + ":" + two(now.getMinutes());
    el.date.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long"
    });
  }

  // ---- keys ---------------------------------------------------------------
  function onKey(event) {
    switch (event.keyCode) {
      case 37: move(-1); event.preventDefault(); break;
      case 39: move(1); event.preventDefault(); break;
      case 38: move(-columns()); event.preventDefault(); break;
      case 40: move(columns()); event.preventDefault(); break;
      case 13:                                              // Enter / OK
        if (apps[focus]) launch(apps[focus]);
        event.preventDefault();
        break;
      case 10009:                                           // Tizen BACK
        // Leave BACK to the platform: the TV decides how to exit a root app.
        break;
    }
  }

  document.addEventListener("keydown", function (event) {
    // Let the platform handle app exit from the launcher.
    if (event.keyCode === 10009) return;
    onKey(event);
  });

  window.addEventListener("load", function () {
    tickClock();
    setInterval(tickClock, 15000);
    bootstrap();
  });
})();
