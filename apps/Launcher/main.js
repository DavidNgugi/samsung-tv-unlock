/* Clean Home - a Tizen TV launcher.
 *
 * Public APIs only: getAppsInfo to list, tizen.application.launch to open, and
 * the native Settings / Samsung Home apps for hand-off. No vconf, no Home
 * reassignment, no root.
 *
 * The dock is chosen by the viewer (Edit Home in the top-right controls), not
 * guessed from a hard-coded list. Known brands use bundled marks because the
 * iconPath from the TV is not always the icon the TV itself shows.
 */
(function () {
  "use strict";

  var DIAGNOSTICS = false; // in-app perf/dump beacons; off in normal builds
  var SELF = "tvunlock02.Launcher";
  var SETTINGS_APP = "com.samsung.tv.coba.setting";
  var SAMSUNG_HOME = "com.samsung.tv.csfs";
  var NETWORK_SETTINGS = "com.samsung.tv.coba.setting.networksettings";
  var SOURCE_APP = "com.samsung.tv.coba.source";
  var LIVETV_APP = "com.samsung.tv.coba.livetv";
  var STORE_KEY = "cleanhome.v2";
  var MAX_DOCK = 9;
  var GRID_COLS = 5;
  var ROW_H = 158;

  var INTERNAL_IDS = [
    "adplatform.ADPlayer", "WykOS4t4F0.cmsWebApp", "25emanual3.emanual",
    "ZODRT12q2l.WebAccountExtension", "ByJlgt0XeD.CastSettingsApp",
    "tv6pbVMQFF.PrivacyChoices", "com.samsung.tv.cobalt-yt"
  ];

  var DEMO_APPS = [
    { id: "3201907018807", name: "Netflix" },
    { id: "3201910019365", name: "Prime Video" },
    { id: "111299001912", name: "YouTube" },
    { id: "3201512006785", name: "Plex" },
    { id: "3201710017644", name: "Gallery" },
    { id: "3201606009684", name: "Spotify" },
    { id: "3201807016597", name: "Disney+" },
    { id: "3201703007751", name: "Apple TV" },
    { id: "3201907018808", name: "Hulu" },
    { id: "3201812017479", name: "Max" }
  ];

  /* The dock the viewer asked for. Ids first, names as a fallback. */
  var DEFAULT_IDS = [
    "9Ur5IzDKqV.TizenYouTube", "org.tizen.netflix-app", "org.tizen.primevideo",
    "CXNLCPYe82.dstvnow", "rJeHak5zRg.Spotify", "kIciSQlYEM.plex", "org.tizen.browser",
    "com.samsung.tv.coba.livetv"
  ];
  var DEFAULT_NAMES = [
    "YouTube", "Netflix", "Prime Video", "DStv Stream", "Spotify", "Plex", "Internet",
    "LiveTV"
  ];

  var BRANDS = [
    { match: "netflix", icon: "icons/netflix.svg", color: "#E50914" },
    { match: "youtube", icon: "icons/youtube.svg", color: "#FF0000" },
    { match: "spotify", icon: "icons/spotify.svg", color: "#1DB954" },
    { match: "plex", icon: "icons/plex.svg", color: "#E5A00D" },
    { match: "apple tv", icon: "icons/appletv.svg", color: "#FFFFFF" },
    { match: "prime video", icon: "icons/primevideo.svg", color: "#00A8E1" },
    { match: "dstv", icon: "icons/dstv.png", color: "#00A8E1" },
    { match: "disney", letter: "D+", color: "#6C8CFF" }
  ];

  /* Theme presets, after cleanyourtv's theme folders. */
  var THEMES = [
    { id: "obsidian", name: "Obsidian", aurora: false, columns: 5 },
    { id: "aurora", name: "Aurora", aurora: true, columns: 5 },
    { id: "six", name: "Six columns", aurora: false, columns: 6 }
  ];

  var state = {
    view: "home",
    editing: false,
    titleKey: "",
    titleIndex: -1,
    focusedTile: null,
    musicOpen: false,
    musicIndex: 1,
    reordering: false,
    reorderOriginal: null,
    holdTimer: null,
    holdFired: false,
    suppressActivate: false,
    columns: 5,
    zone: "dock",
    dockIndex: 0,
    utilIndex: 0,
    railIndex: 0,
    network: "",
    gridIndex: 0,
    apps: [],
    dock: [],
    grid: []
  };

  var el = {
    stage: document.getElementById("stage"),
    time: document.getElementById("time"),
    date: document.getElementById("date"),
    utils: document.getElementById("utils"),
    utilPlate: document.getElementById("util-plate"),
    railPlate: document.getElementById("rail-plate"),
    eyebrowStack: document.getElementById("eyebrow-stack"),
    titleStack: document.getElementById("title-stack"),
    subStack: document.getElementById("sub-stack"),
    dock: document.getElementById("dock"),
    dockPlate: document.getElementById("dock-plate"),
    gridPlate: document.getElementById("grid-plate"),
    rail: document.getElementById("rail"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    emptyText: document.getElementById("empty-text"),
    toast: document.getElementById("toast"),
    glow: document.getElementById("glow"),
    greeting: document.getElementById("greeting"),
    npCard: document.getElementById("np-card"),
    npArt: document.getElementById("np-art"),
    npNote: document.getElementById("np-note"),
    npTitle: document.getElementById("np-title"),
    npArtist: document.getElementById("np-artist"),
    npFill: document.getElementById("np-fill"),
    npState: document.getElementById("np-state"),
    music: document.getElementById("music"),
    muArt: document.getElementById("mu-art"),
    muNote: document.getElementById("mu-note"),
    muTitle: document.getElementById("mu-title"),
    muArtist: document.getElementById("mu-artist"),
    muFill: document.getElementById("mu-fill"),
    muPos: document.getElementById("mu-pos"),
    muDur: document.getElementById("mu-dur"),
    muBtns: document.querySelectorAll(".mu-btn")
  };

  var SPOTIFY_URL = "http://192.168.100.24:8795";
  var PLAY_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#f3f5f8"><path d="M8 5l11 7-11 7z"/></svg>';
  var PAUSE_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#f3f5f8"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  var np = null;
  var npTimer = null;

  var utils = [
    { key: "all", label: "All apps" },
    { key: "edit", label: "Edit Home" },
    { key: "manage", label: "Manage" },
    { key: "music", label: "Music" },
    { key: "theme", label: "Theme" },
    { key: "home", label: "Samsung Home" }
  ];

  var store = loadStore();

  // ---------------------------------------------------------------- storage
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        return { dock: [], seeded: false, theme: "obsidian", showAll: false,
                 dockOrder: false, allReset: false, liveTvInDock: false };
      }
      var parsed = JSON.parse(raw);
      return {
        dock: Array.isArray(parsed.dock) ? parsed.dock : [],
        seeded: !!parsed.seeded || (Array.isArray(parsed.dock) && parsed.dock.length > 0),
        theme: typeof parsed.theme === "string" ? parsed.theme : "obsidian",
        showAll: !!parsed.showAll,
        dockOrder: !!parsed.dockOrder,
        allReset: !!parsed.allReset,
        liveTvInDock: !!parsed.liveTvInDock
      };
    } catch (e) {
      return { dock: [], seeded: false, theme: "obsidian", showAll: false,
               dockOrder: false, allReset: false, liveTvInDock: false };
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* storage may be unavailable; the launcher still works */ }
  }

  // ---------------------------------------------------------------- helpers
  function hasTizen() {
    return !!(window.tizen && window.tizen.application);
  }

  function two(n) { return n < 10 ? "0" + n : String(n); }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.className = "toast show";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.toast.className = "toast"; }, 2200);
  }

  function labelFor(app) {
    if (app && app.id === LIVETV_APP) return "TV";
    return (app && app.name) || "";
  }

  function initial(name) {
    var cleaned = String(name || "?").replace(/^samsung\s+/i, "").trim();
    return cleaned.charAt(0).toUpperCase() || "?";
  }

  function brandFor(name) {
    var value = String(name || "").toLowerCase();
    for (var i = 0; i < BRANDS.length; i++) {
      if (value.indexOf(BRANDS[i].match) >= 0) return BRANDS[i];
    }
    return null;
  }

  function themeFor(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return THEMES[0];
  }

  function hexToRgba(hex, alpha) {
    var value = String(hex || "#5A7CFF").replace("#", "");
    if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    var n = parseInt(value, 16);
    if (isNaN(n)) return "rgba(90,124,255," + alpha + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function brandColor(name) {
    var brand = brandFor(name);
    if (brand && brand.color) return brand.color;
    return "#5A7CFF";
  }

  function setGlow(app) {
    // Static glow only: tinting it per app repaints a 900x340 layer on every
    // keypress, which cost ~15 fps on this set.
    if (true) return;
    if (!el.glow) return;
    var color = app ? brandColor(app.name) : "#5A7CFF";
    el.glow.style.background = "radial-gradient(ellipse at 50% 100%, " +
      hexToRgba(color, app ? 0.20 : 0.10) + ", transparent 66%)";
  }

  function applyTheme() {
    var theme = themeFor(store.theme);
    state.columns = theme.columns;
    el.stage.className = "stage" + (theme.aurora ? " aurora" : "");
    el.grid.style.gridTemplateColumns = "repeat(" + theme.columns + ", 190px)";
    saveStore();
  }

  function cycleTheme() {
    var index = 0;
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === store.theme) index = i;
    }
    store.theme = THEMES[(index + 1) % THEMES.length].id;
    applyTheme();
    paintFocus();
    toast("Theme: " + themeFor(store.theme).name);
  }

  function greetingFor(hour) {
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  // ---------------------------------------------------------------- data
  /* Names that must survive whatever their package id looks like. Samsung mixes
   * 10-character ids (9Ur5IzDKqV.TizenYouTube) with dotted ones
   * (org.tizen.netflix-app), so an id-shape rule alone silently drops Netflix. */
  var KNOWN_NAMES = [
    "netflix", "youtube", "prime video", "spotify", "disney", "apple tv",
    "plex", "hulu", "max", "twitch", "paramount", "britbox", "hayu",
    "showmax", "viu", "hotstar", "now", "sky"
  ];

  function isKnownBrand(name) {
    var value = String(name || "").toLowerCase();
    for (var i = 0; i < KNOWN_NAMES.length; i++) {
      if (value.indexOf(KNOWN_NAMES[i]) >= 0) return true;
    }
    return false;
  }

  function isConsumer(app) {
    if (!app || !app.id || !app.name) return false;
    if (app.id === SELF) return false;
    if (INTERNAL_IDS.indexOf(app.id) >= 0) return false;
    if (/-dummy$/.test(app.id)) return false;

    // The TV's own "show in the app list" flag is the best first filter.
    if (app.show === false || app.show === "false") return false;

    // Known brands always pass, whatever shape their id has.
    if (isKnownBrand(app.name)) return true;

    // Everything else needs a dotted id. Any segment length: org.tizen.foo and
    // com.samsung.tv.foo are real consumer apps too.
    if (!/^[A-Za-z0-9_]+(\.[A-Za-z0-9_-]+)+$/.test(app.id)) return false;
    if (/(?:service|worker|plugin|preview|promotion|launcher|test|sdk|daemon|factory|sample)/i
        .test(app.name)) return false;
    return true;
  }

  function findByExactName(apps, name) {
    var wanted = name.toLowerCase();
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].name.toLowerCase() === wanted) return apps[i];
    }
    for (var j = 0; j < apps.length; j++) {
      if (apps[j].name.toLowerCase().indexOf(wanted) === 0) return apps[j];
    }
    return null;
  }

  /* Never on the dock, whatever the saved config says. e-Manual is the one that
   * keeps surfacing on this TV; add to this list rather than editing the dock. */
  var HOME_BLOCKLIST = ["emanual", "e-manual", "e manual"];

  function blockedOnHome(app) {
    var value = (String(app.name || "") + " " + String(app.id || "")).toLowerCase();
    for (var i = 0; i < HOME_BLOCKLIST.length; i++) {
      if (value.indexOf(HOME_BLOCKLIST[i]) >= 0) return true;
    }
    return false;
  }

  function resolveDock(apps, ids) {
    var byId = {};
    apps.forEach(function (a) { byId[a.id] = a; });
    var picked = [];
    (ids || []).forEach(function (id) {
      if (byId[id] && picked.indexOf(byId[id]) < 0 && !blockedOnHome(byId[id])) picked.push(byId[id]);
    });
    return picked.slice(0, MAX_DOCK);
  }

  function findById(apps, id) {
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].id === id) return apps[i];
    }
    return null;
  }

  function defaultDock(apps) {
    var chosen = [];
    DEFAULT_IDS.forEach(function (id, index) {
      var hit = findById(apps, id) || findByExactName(apps, DEFAULT_NAMES[index]);
      if (hit && chosen.indexOf(hit) < 0) chosen.push(hit);
    });

    // Fill any gap, then pin Settings as the last tile (the gear).
    apps.forEach(function (app) {
      if (chosen.length < MAX_DOCK - 1 && chosen.indexOf(app) < 0 &&
          !blockedOnHome(app) && isCurated(app)) chosen.push(app);
    });
    var settings = findById(apps, SETTINGS_APP);
    if (settings) chosen.push(settings);

    return chosen.slice(0, MAX_DOCK);
  }

  // ---------------------------------------------------------------- render
  function tile(app, index) {
    var node = document.createElement("div");
    node.className = "tile";
    node.setAttribute("data-index", index);

    var brand = brandFor(app.name);

    if (app.id === LIVETV_APP) {
      var tv = document.createElement("img");
      tv.className = "brand";
      tv.alt = "";
      tv.src = "icons/tv.svg";
      node.appendChild(tv);
    } else if (app.id === SETTINGS_APP) {
      var gear = document.createElement("img");
      gear.className = "brand";
      gear.alt = "";
      gear.src = "icons/gear.svg";
      node.appendChild(gear);
    } else if (app.id === "__toggle") {
      var more = document.createElement("div");
      more.className = "mark";
      more.textContent = "⋯";
      node.appendChild(more);
    } else if (brand && brand.icon) {
      var logo = document.createElement("img");
      logo.className = "brand";
      logo.alt = "";
      logo.src = brand.icon;
      node.appendChild(logo);
    } else if (brand && brand.letter) {
      var colored = document.createElement("div");
      colored.className = "mark";
      colored.style.color = brand.color;
      colored.textContent = brand.letter;
      node.appendChild(colored);
    } else if (app.iconPath) {
      var img = document.createElement("img");
      img.alt = "";
      img.onerror = function () {
        if (img.parentNode === node) node.removeChild(img);
        var mark = document.createElement("div");
        mark.className = "mark";
        mark.textContent = initial(app.name);
        node.appendChild(mark);
      };
      img.src = app.iconPath;
      node.appendChild(img);
    } else {
      var mark = document.createElement("div");
      mark.className = "mark";
      mark.textContent = initial(app.name);
      node.appendChild(mark);
    }

    var label = document.createElement("div");
    label.className = "name";
    label.textContent = app.id === "__toggle" && app.count
      ? app.name + " (" + app.count + ")"
      : labelFor(app);
    node.appendChild(label);

    if (store.dock.indexOf(app.id) >= 0) node.className += " on-home";
    return node;
  }

  function renderUtils() {
    el.utils.innerHTML = "";
    utils.forEach(function (util, index) {
      var node = document.createElement("div");
      node.className = "util";
      node.setAttribute("data-index", index);
      var chip = document.createElement("span");
      chip.className = "chip";
      node.appendChild(chip);
      var label = document.createElement("span");
      label.textContent = util.label;
      node.appendChild(label);
      el.utils.appendChild(node);
    });
  }

  function railItems() {
    return [
      { key: "music", label: "Music", sub: "Spotify" },
      { key: "wifi", label: "Wi-Fi", sub: state.network === "WIFI" ? "connected" : "not connected", up: state.network === "WIFI" },
      { key: "hdmi1", label: "HDMI 1", sub: "" },
      { key: "hdmi2", label: "HDMI 2", sub: "" },
      { key: "hdmi3", label: "HDMI 3", sub: "" },
      { key: "hdmi4", label: "HDMI 4", sub: "" },
      { key: "livetv", label: "TV", sub: "Tuner" },
      { key: "ambient", label: "Ambient", sub: "Art" }
    ];
  }

  function renderRail() {
    el.rail.innerHTML = "";
    railItems().forEach(function (item, index) {
      var node = document.createElement("div");
      node.className = "pill";
      node.setAttribute("data-index", index);

      var chip = document.createElement("span");
      chip.className = "chip";
      node.appendChild(chip);

      var dot = document.createElement("span");
      dot.className = "dot" + (item.up ? "" : " off");
      node.appendChild(dot);

      var text = document.createElement("span");
      text.textContent = item.sub ? item.label + " · " + item.sub : item.label;
      node.appendChild(text);

      el.rail.appendChild(node);
    });
  }

  function readNetwork() {
    if (!(window.tizen && window.tizen.systeminfo)) return;
    try {
      window.tizen.systeminfo.getPropertyValue("NETWORK", function (net) {
        state.network = (net && net.networkType) || "";
        renderRail();
        if (state.zone === "rail") paintFocus();
      }, function () { /* read-only probe; ignore */ });
    } catch (e) { /* older firmware */ }
  }

  function renderDock() {
    el.dock.innerHTML = "";
    el.dock.hidden = !state.dock.length;
    state.dock.forEach(function (app, index) {
      el.dock.appendChild(tile(app, index));
    });
    el.dockPlate = document.createElement("div");
    el.dockPlate.className = "plate";
    el.dock.appendChild(el.dockPlate);
  }

  function renderGrid() {
    el.grid.innerHTML = "";
    state.grid.forEach(function (app, index) {
      el.grid.appendChild(tile(app, index));
    });
    el.gridPlate = document.createElement("div");
    el.gridPlate.className = "plate";
    el.grid.appendChild(el.gridPlate);
  }

  function clearFocus() {
    var nodes = document.querySelectorAll(".tile.focus, .util.focus");
    for (var i = 0; i < nodes.length; i++) nodes[i].className = nodes[i].className.replace(/\s*focus/g, "");
  }

  function movePlate(plate, tile) {
    if (!plate || plate._tile === tile) return;
    plate._tile = tile;
    if (!tile) { plate.style.opacity = "0"; return; }
    plate.style.transform = "translate(" + tile.offsetLeft + "px," + tile.offsetTop + "px)";
    plate.style.opacity = "1";
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function showTitle(key, labels, index) {
    if (!el.titleStack) return;
    if (state.titleKey !== key) {
      state.titleKey = key;
      state.titleIndex = -1;
      el.titleStack.innerHTML = "";
      labels.forEach(function (label) {
        var node = document.createElement("div");
        node.className = "title-item";
        node.textContent = label;
        el.titleStack.appendChild(node);
      });
    }
    if (state.titleIndex === index) return;
    var items = el.titleStack.children;
    if (items[state.titleIndex]) items[state.titleIndex].style.opacity = "0";
    if (items[index]) items[index].style.opacity = "1";
    state.titleIndex = index;
  }

  function setStack(stack, key) {
    if (!stack || stack._key === key) return;
    stack._key = key;
    var items = stack.children;
    for (var i = 0; i < items.length; i++) {
      items[i].style.opacity = items[i].getAttribute("data-k") === key ? "1" : "0";
    }
  }

  function setFocusedTile(node) {
    if (state.focusedTile === node) return;
    if (state.focusedTile) {
      state.focusedTile.className = state.focusedTile.className.replace(/\s*focus/g, "");
    }
    if (node) node.className += " focus";
    state.focusedTile = node;
  }

  function setChips(container, index) {
    if (!container || container._chipIndex === index) return;
    var previous = container._chipIndex;
    container._chipIndex = index;
    var nodes = container.children;
    if (nodes[previous]) {
      var old = nodes[previous].querySelector(".chip");
      if (old) old.style.opacity = "0";
    }
    if (nodes[index]) {
      var next = nodes[index].querySelector(".chip");
      if (next) next.style.opacity = "1";
    }
  }

  function paintFocus() {
    setGlow(null);
    if (el.npCard) el.npCard.classList.remove("focus");

    if (state.view === "grid") {
      var gridNodes = el.grid.querySelectorAll(".tile");
      setFocusedTile(gridNodes[state.gridIndex]);
      movePlate(el.gridPlate, gridNodes[state.gridIndex]);
      movePlate(el.dockPlate, null);
      var app = state.grid[state.gridIndex];
      setStack(el.eyebrowStack, state.editing ? "edit" : "apps");
      showTitle("grid", state.grid.map(function (a) { return labelFor(a); }),
        state.gridIndex);
      setStack(el.subStack, state.editing ? "edit" : "apps");
      scrollGrid();
      return;
    }

    if (state.zone === "rail") {
      setFocusedTile(null);
      movePlate(el.dockPlate, null);
      movePlate(el.gridPlate, null);
      setChips(el.utils, -1);
      setChips(el.rail, -1);
      setChips(el.rail, state.railIndex);
      var item = railItems()[state.railIndex];
      setStack(el.eyebrowStack, "quick");
      showTitle("rail", railItems().map(function (r) { return r.label; }), state.railIndex);
      setStack(el.subStack, "quick");
      return;
    }

    if (state.zone === "card") {
      setFocusedTile(null);
      movePlate(el.dockPlate, null);
      movePlate(el.gridPlate, null);
      el.npCard.classList.add("focus");
      setStack(el.eyebrowStack, "music");
      showTitle("music", [np ? np.title : "Now playing"], 0);
      setStack(el.subStack, "music");
      return;
    }

    if (state.zone === "utils") {
      setFocusedTile(null);
      movePlate(el.dockPlate, null);
      movePlate(el.gridPlate, null);
      setChips(el.rail, -1);
      setChips(el.utils, state.utilIndex);
      var util = utils[state.utilIndex];
      setStack(el.eyebrowStack, "controls");
      showTitle("utils", utils.map(function (u) { return u.label; }), state.utilIndex);
      setStack(el.subStack, "control");
      return;
    }

    var dockNodes = el.dock.querySelectorAll(".tile");
    setFocusedTile(dockNodes[state.dockIndex]);
    movePlate(el.dockPlate, dockNodes[state.dockIndex]);
    movePlate(el.gridPlate, null);
    var current = state.dock[state.dockIndex];
    setGlow(current);
    setStack(el.eyebrowStack, state.reordering ? "reorder" : "apps");
    showTitle("dock", state.dock.length
      ? state.dock.map(function (a) { return labelFor(a); })
      : ["No apps on Home"], state.dock.length ? state.dockIndex : 0);
    setStack(el.subStack, state.reordering ? "reorder" : "apps");
  }

  function scrollGrid() {
    var row = Math.floor(state.gridIndex / state.columns);
    var offset = Math.max(0, (row - 2) * ROW_H);
    el.grid.style.transform = offset ? "translateY(-" + offset + "px)" : "";
  }

  // ---------------------------------------------------------------- actions
  function launch(app) {
    if (!app) return;
    if (!hasTizen()) {
      toast("Preview: would open " + app.name);
      return;
    }
    try {
      window.tizen.application.launch(app.id, function () { /* opened */ },
        function (err) {
          toast("Could not open " + app.name + ": " + (err && err.message ? err.message : "refused"));
        });
    } catch (e) {
      toast("Could not open " + app.name);
    }
  }

  function toggleHome(app) {
    if (!app) return;
    if (blockedOnHome(app)) { toast("Not available for Home"); return; }
    var ids = store.dock.slice();
    var at = ids.indexOf(app.id);
    if (at >= 0) {
      ids.splice(at, 1);
      toast("Removed from Home");
    } else {
      if (ids.length >= MAX_DOCK) {
        toast("Home holds " + MAX_DOCK + " apps");
        return;
      }
      ids.push(app.id);
      toast("Added to Home");
    }
    store.dock = ids;
    store.seeded = true;
    saveStore();
    state.dock = resolveDock(state.apps, ids);
    renderDock();
    renderGrid();
    paintFocus();
  }

  function fmtTime(ms) {
    var total = Math.round((ms || 0) / 1000);
    return Math.floor(total / 60) + ":" + ("0" + (total % 60)).slice(-2);
  }

  function renderMusicPanel() {
    if (!np) return;
    setText(el.muTitle, np.title || "");
    setText(el.muArtist, np.artist || "");
    var pct = np.duration_ms ? Math.max(0, Math.min(100, np.progress_ms / np.duration_ms * 100)) : 0;
    el.muFill.style.width = pct + "%";
    setText(el.muPos, fmtTime(np.progress_ms));
    setText(el.muDur, fmtTime(np.duration_ms));
    if (np.art) {
      if (el.muArt.getAttribute("src") !== np.art) el.muArt.src = np.art;
      el.muArt.classList.add("on");
      el.muNote.style.display = "none";
    } else {
      el.muArt.classList.remove("on");
      el.muNote.style.display = "flex";
    }
    if (state.lastPlaying !== np.playing) {
      state.lastPlaying = np.playing;
      if (el.muBtns[1]) el.muBtns[1].innerHTML = np.playing ? PAUSE_ICON : PLAY_ICON;
    }
  }

  function renderNowPlaying() {
    if (!np || !np.title) {
      if (el.npCard) el.npCard.hidden = true;
      return;
    }
    el.npCard.hidden = false;
    setText(el.npTitle, np.title);
    setText(el.npArtist, np.artist || "");
    var pct = np.duration_ms ? Math.max(0, Math.min(100, np.progress_ms / np.duration_ms * 100)) : 0;
    el.npFill.style.width = pct + "%";
    if (np.art) {
      if (el.npArt.getAttribute("src") !== np.art) el.npArt.src = np.art;
      el.npArt.classList.add("on");
      el.npNote.style.display = "none";
    } else {
      el.npArt.classList.remove("on");
      el.npNote.style.display = "flex";
    }
    el.npState.innerHTML = np.playing ? PAUSE_ICON : PLAY_ICON;
    if (state.musicOpen) renderMusicPanel();
  }

  function pollSpotify() {
    clearTimeout(npTimer);
    fetch(SPOTIFY_URL + "/nowplaying", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        np = data;
        renderNowPlaying();
        npTimer = setTimeout(pollSpotify, 6000);
      })
      .catch(function () {
        if (el.npCard) el.npCard.hidden = true;
        npTimer = setTimeout(pollSpotify, 15000);
      });
  }

  function spotifyControl(action) {
    fetch(SPOTIFY_URL + "/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action })
    }).then(function () {
      setTimeout(pollSpotify, 350);
    }).catch(function () {
      toast("Spotify is not reachable");
    });
  }

  function updateMusicFocus() {
    for (var i = 0; i < el.muBtns.length; i++) {
      el.muBtns[i].className = i === state.musicIndex ? "mu-btn focus" : "mu-btn";
    }
  }

  function openMusic() {
    state.musicOpen = true;
    state.musicIndex = 1;
    if (el.music) el.music.hidden = false;
    renderNowPlaying();
    renderMusicPanel();
    updateMusicFocus();
  }

  function closeMusic() {
    state.musicOpen = false;
    if (el.music) el.music.hidden = true;
    paintFocus();
  }

  function musicActivate() {
    if (state.musicIndex === 0) spotifyControl("previous");
    else if (state.musicIndex === 2) spotifyControl("next");
    else spotifyControl("toggle");
  }

  function switchSource(name) {
    if (!hasTizen()) { toast("Preview: switch to " + name); return; }
    try {
      var data = [
        new window.tizen.ApplicationControlData("source", [name]),
        new window.tizen.ApplicationControlData("input", [name])
      ];
      var control = new window.tizen.ApplicationControl(
        "http://tizen.org/appcontrol/operation/default", null, null, null, data);
      window.tizen.application.launchAppControl(control, SOURCE_APP,
        function () { toast("Switching to " + name); },
        function () { launch({ id: SOURCE_APP, name: "Sources" }); });
    } catch (e) {
      launch({ id: SOURCE_APP, name: "Sources" });
    }
  }

  function activate() {
    if (state.zone === "card") { openMusic(); return; }
    if (state.view === "grid") {
      var app = state.grid[state.gridIndex];
      if (app && app.id === "__toggle") {
        store.showAll = !store.showAll;
        saveStore();
        state.grid = visibleApps();
        state.gridIndex = Math.max(0, state.grid.length - 1);
        renderGrid();
        paintFocus();
        return;
      }
      if (state.editing) { toggleHome(app); return; }
      launch(app);
      return;
    }
    if (state.zone === "rail") {
      var rail = railItems()[state.railIndex];
      if (rail.key === "wifi") { launch({ id: NETWORK_SETTINGS, name: "Wi-Fi" }); return; }
      if (rail.key === "ambient") { launch({ id: "org.tizen.ambientapp", name: "Ambient" }); return; }
      if (rail.key === "livetv") { launch({ id: LIVETV_APP, name: "TV" }); return; }
      if (rail.key === "music") { openMusic(); return; }
      if (rail.key.indexOf("hdmi") === 0) {
        switchSource("HDMI" + rail.key.slice(4));
        return;
      }
      launch({ id: SOURCE_APP, name: "Sources" });
      return;
    }

    if (state.zone === "utils") {
      var util = utils[state.utilIndex];
      if (util.key === "all") { showGrid(false); return; }
      if (util.key === "edit") { showGrid(true); return; }
      if (util.key === "manage") { launch({ id: "org.volt.apps", name: "Apps" }); return; }
      if (util.key === "music") { openMusic(); return; }
      if (util.key === "theme") { cycleTheme(); return; }
      launch({ id: SAMSUNG_HOME, name: "Samsung Home" });
      return;
    }
    launch(state.dock[state.dockIndex]);
  }

  function showGrid(editing) {
    state.reordering = false;
    state.view = "grid";
    state.editing = !!editing;
    state.grid = visibleApps();
    state.gridIndex = 0;
    el.dock.hidden = true;
    el.rail.hidden = true;
    el.grid.hidden = false;
    el.grid.style.transform = "";
    renderGrid();
    paintFocus();
  }

  function showHome() {
    state.view = "home";
    state.editing = false;
    state.zone = "dock";
    el.grid.hidden = true;
    el.dock.hidden = !state.dock.length;
    el.rail.hidden = false;
    el.grid.style.transform = "";
    paintFocus();
  }

  function back() {
    if (state.view === "grid") { showHome(); return; }
    if (state.zone === "utils") { state.zone = "dock"; paintFocus(); return; }
    toast("Press the TV's Home button for Smart Hub");
  }

  // ---------------------------------------------------------------- keys
  function move(key) {
    if (state.reordering) {
      if (key === 37 && state.dockIndex > 0) {
        var left = state.dock[state.dockIndex - 1];
        state.dock[state.dockIndex - 1] = state.dock[state.dockIndex];
        state.dock[state.dockIndex] = left;
        state.dockIndex--;
      } else if (key === 39 && state.dockIndex < state.dock.length - 1) {
        var right = state.dock[state.dockIndex + 1];
        state.dock[state.dockIndex + 1] = state.dock[state.dockIndex];
        state.dock[state.dockIndex] = right;
        state.dockIndex++;
      } else {
        return;
      }
      store.dock = state.dock.map(function (a) { return a.id; });
      saveStore();
      renderDock();
      paintFocus();
      return;
    }

    if (state.view === "grid") {
      var i = state.gridIndex;
      if (key === 37) i = Math.max(0, i - 1);
      if (key === 39) i = Math.min(state.grid.length - 1, i + 1);
      if (key === 38 && i < state.columns) { showHome(); return; }
      if (key === 38) i = Math.max(0, i - state.columns);
      if (key === 40) i = Math.min(state.grid.length - 1, i + state.columns);
      state.gridIndex = i;
      paintFocus();
      return;
    }

    if (state.zone === "card") {
      if (key === 38) { state.zone = "utils"; state.utilIndex = 0; }
      if (key === 40) state.zone = "dock";
      paintFocus();
      return;
    }

    if (state.zone === "utils") {
      if (key === 37) state.utilIndex = Math.max(0, state.utilIndex - 1);
      if (key === 39) state.utilIndex = Math.min(utils.length - 1, state.utilIndex + 1);
      if (key === 40) {
        if (np && np.title) state.zone = "card";
        else state.zone = "dock";
      }
      if (key === 38) state.zone = "utils";
      paintFocus();
      return;
    }

    if (state.zone === "rail") {
      if (key === 37) state.railIndex = Math.max(0, state.railIndex - 1);
      if (key === 39) state.railIndex = Math.min(railItems().length - 1, state.railIndex + 1);
      if (key === 38) state.zone = "dock";
      paintFocus();
      return;
    }

    if (key === 37) state.dockIndex = Math.max(0, state.dockIndex - 1);
    if (key === 39) state.dockIndex = Math.min(Math.max(0, state.dock.length - 1), state.dockIndex + 1);
    if (key === 38) {
      if (np && np.title) state.zone = "card";
      else { state.zone = "utils"; state.utilIndex = 0; }
    }
    if (key === 40) { state.zone = "rail"; state.railIndex = 0; }
    paintFocus();
  }

  function enterReorder() {
    if (state.reordering) return;
    state.reordering = true;
    state.reorderOriginal = store.dock.slice();
    paintFocus();
  }

  function lockReorder() {
    state.reordering = false;
    store.dock = state.dock.map(function (a) { return a.id; });
    saveStore();
    toast("Dock order saved");
    paintFocus();
  }

  function cancelReorder() {
    if (!state.reordering) return;
    state.reordering = false;
    if (state.reorderOriginal) {
      store.dock = state.reorderOriginal.slice();
      state.dock = resolveDock(state.apps, store.dock);
      renderDock();
    }
    paintFocus();
  }

  function onKeyDown(event) {
    var key = event.keyCode;

    // Remote transport keys work while the launcher is on screen.
    if (key === 10252 || key === 415 || key === 19 || key === 178) {
      spotifyControl("toggle");
      event.preventDefault();
      return;
    }
    if (key === 10233 || key === 417) { spotifyControl("next"); event.preventDefault(); return; }
    if (key === 10232 || key === 412) { spotifyControl("previous"); event.preventDefault(); return; }

    if (perf.keyMs === null) {
      var t0 = performance.now();
      requestAnimationFrame(function () {
        perf.keyMs = Math.round(performance.now() - t0);
        sendPerf();
      });
    }

    if (state.musicOpen) {
      event.preventDefault();
      if (key === 10009) { closeMusic(); return; }
      if (key === 37) { state.musicIndex = Math.max(0, state.musicIndex - 1); updateMusicFocus(); return; }
      if (key === 39) { state.musicIndex = Math.min(2, state.musicIndex + 1); updateMusicFocus(); return; }
      return;
    }

    if (key === 13) {
      event.preventDefault();
      if (state.reordering) {
        state.suppressActivate = true;
        lockReorder();
        return;
      }
      if (event.repeat) {
        if (state.view === "home" && state.zone === "dock") enterReorder();
        return;
      }
      state.holdFired = false;
      clearTimeout(state.holdTimer);
      state.holdTimer = setTimeout(function () {
        if (state.view === "home" && state.zone === "dock") {
          state.holdFired = true;
          enterReorder();
        }
      }, 600);
      return;
    }

    if (key === 10009) {
      event.preventDefault();
      if (state.reordering) cancelReorder(); else back();
      return;
    }

    if (key >= 37 && key <= 40) { move(key); event.preventDefault(); }
  }

  function onKeyUp(event) {
    if (event.keyCode !== 13) return;
    if (state.musicOpen) { musicActivate(); event.preventDefault(); return; }
    clearTimeout(state.holdTimer);
    if (state.suppressActivate) {
      state.suppressActivate = false;
      event.preventDefault();
      return;
    }
    if (state.holdFired) { state.holdFired = false; event.preventDefault(); return; }
    if (state.reordering) return;
    activate();
    event.preventDefault();
  }

  // ---------------------------------------------------------------- clock
  function tick() {
    var now = new Date();
    el.time.textContent = two(now.getHours()) + ":" + two(now.getMinutes());
    el.date.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long"
    });
    if (el.greeting) el.greeting.textContent = greetingFor(now.getHours());
  }

  // ---------------------------------------------------------------- boot
  function fit() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    el.stage.style.transform = "scale(" + scale + ")";
    el.stage.style.left = ((window.innerWidth - 1920 * scale) / 2) + "px";
    el.stage.style.top = ((window.innerHeight - 1080 * scale) / 2) + "px";
  }

  var perf = {
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    firstPaint: Math.round(performance.now()),
    appsMs: null,
    keyMs: null,
    frame: null,
    jsHeap: null,
    memory: null,
    storage: null
  };
  var perfSent = false;

  function sendPerf() {
    if (perfSent) return;
    var payload = {
      ua: perf.ua,
      cores: perf.cores,
      deviceMemory: perf.deviceMemory,
      firstPaint: perf.firstPaint,
      appsMs: perf.appsMs,
      keyMs: perf.keyMs,
      frame: perf.frame,
      focus: perf.focus || null,
      cache: perf.cache || null,
      fetched: !!perf.fetched,
      jsHeap: null,
      memory: null
    };
    try {
      if (performance.memory) {
        payload.jsHeap = {
          usedMb: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalMb: Math.round(performance.memory.totalJSHeapSize / 1048576)
        };
      }
    } catch (e) { /* memory API hidden */ }
    try {
      if (perf.memory) {
        payload.memory = { total: perf.memory.total, available: perf.memory.available };
      }
    } catch (e) { /* odd shape */ }
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("http://192.168.100.24:8792/perf", JSON.stringify(payload));
        perfSent = true;
      }
    } catch (e) { /* diagnostics only */ }
  }

  function benchFocus() {
    var frames = [];
    var start = performance.now();
    var last = start;
    var moves = 0;
    var timer = setInterval(function () {
      if (!state.dock.length) return;
      state.view = "home";
      state.zone = "dock";
      state.dockIndex = (state.dockIndex + 1) % state.dock.length;
      if (perf.benchMode === "text") {
        el.title.textContent = "App " + moves;
      } else if (perf.benchMode === "ts") {
        el.title.textContent = "Item " + moves;
        el.sub.textContent = "Sub " + moves;
      } else if (perf.benchMode === "eyebrow") {
        el.eyebrow.textContent = "ITEM " + moves;
      } else if (perf.benchMode === "text3") {
        el.eyebrow.textContent = "CONTROLS";
        el.title.textContent = "Item " + moves;
        el.sub.textContent = "Subtitle " + moves;
      } else if (perf.benchMode === "clear") {
        clearFocus();
      } else if (perf.benchMode === "chips") {
        state.zone = "utils";
        state.utilIndex = moves % utils.length;
        setChips(el.rail, -1);
        setChips(el.utils, state.utilIndex);
      } else if (perf.benchMode === "utils") {
        state.zone = "utils";
        state.utilIndex = moves % utils.length;
        paintFocus();
      } else if (perf.benchMode === "menus") {
        var zones = ["utils", "rail", "dock"];
        state.zone = zones[moves % zones.length];
        if (state.zone === "utils") state.utilIndex = moves % utils.length;
        if (state.zone === "rail") state.railIndex = moves % railItems().length;
        if (state.zone === "dock") state.dockIndex = moves % state.dock.length;
        paintFocus();
      } else if (perf.benchMode === "plate") {
        movePlate(el.dockPlate, el.dock.children[state.dockIndex]);
      } else if (perf.benchMode === "paint") {
        paintFocus();
      }
      moves++;
      if (moves >= 16) clearInterval(timer);
    }, 120);

    function step(now) {
      frames.push(now - last);
      last = now;
      if (now - start < 2600) { requestAnimationFrame(step); return; }
      var total = 0, max = 0;
      frames.forEach(function (d) { total += d; if (d > max) max = d; });
      perf.focus = {
        moves: moves,
        samples: frames.length,
        avgMs: +(total / frames.length).toFixed(1),
        maxMs: +max.toFixed(1),
        fps: +(1000 / (total / frames.length)).toFixed(1),
        over33: frames.filter(function (d) { return d > 33; }).length,
        mode: perf.benchMode
      };
      perfSent = false;
      sendPerf();
    }
    requestAnimationFrame(step);
  }

  function sampleFrames(ms) {
    var frames = [];
    var start = performance.now();
    var last = start;
    function step(now) {
      frames.push(now - last);
      last = now;
      if (now - start < ms) { requestAnimationFrame(step); return; }
      var total = 0, max = 0;
      frames.forEach(function (d) { total += d; if (d > max) max = d; });
      perf.frame = {
        samples: frames.length,
        avgMs: +(total / frames.length).toFixed(1),
        maxMs: +max.toFixed(1),
        fps: +(1000 / (total / frames.length)).toFixed(1),
        over33ms: frames.filter(function (d) { return d > 33; }).length
      };
      sendPerf();
    }
    requestAnimationFrame(step);
  }

  function probeSystem() {
    if (!(window.tizen && window.tizen.systeminfo)) return;
    try {
      window.tizen.systeminfo.getPropertyValue("MEMORY", function (m) {
        perf.memory = m;
      }, function () {});
      window.tizen.systeminfo.getPropertyValue("STORAGE", function (s) {
        perf.storage = s;
      }, function () {});
    } catch (e) { /* older firmware */ }
  }

  function reportCaps() {
    var caps = {
      b2bapis: typeof window.b2bapis,
      systeminfo: !!(window.tizen && window.tizen.systeminfo),
      inputdevice: !!(window.tizen && window.tizen.tvinputdevice),
      userAgent: navigator.userAgent
    };
    caps.media = { api: (window.tizen && typeof window.tizen.mediacontroller) || "none" };
    function send() {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("http://192.168.100.24:8792/caps", JSON.stringify(caps));
        }
      } catch (e) { /* diagnostics only */ }
    }
    if (window.tizen && window.tizen.mediacontroller) {
      try {
        caps.media.keys = Object.keys(window.tizen.mediacontroller);
        window.tizen.mediacontroller.getActiveController(function (controller) {
          caps.media.active = true;
          caps.media.controllerKeys = Object.keys(controller || {});
          if (controller && controller.getPlaybackInfo) {
            controller.getPlaybackInfo(function (info) {
              caps.media.info = info;
              send();
            }, function (err) {
              caps.media.infoError = err && err.message;
              send();
            });
          } else {
            send();
          }
        }, function (err) {
          caps.media.activeError = err && err.message;
          send();
        });
      } catch (e) {
        caps.media.error = e.message;
        send();
      }
    } else {
      send();
    }

    if (window.tizen && window.tizen.systeminfo) {
      try {
        window.tizen.systeminfo.getPropertyValue("NETWORK", function (net) {
          caps.network = net;
          send();
        }, function (err) {
          caps.networkError = err && err.message;
          send();
        });
      } catch (e) { send(); }
    } else { send(); }
  }

  function report(raw) {
    try {
      var payload = JSON.stringify({
        app: SELF,
        count: raw.length,
        apps: raw
      });
      if (navigator.sendBeacon) navigator.sendBeacon("http://192.168.100.24:8792/dump", payload);
      var beacon = new Image();
      beacon.src = "http://192.168.100.24:8792/ping?n=" + raw.length + "&t=" + Date.now();
    } catch (e) { /* diagnostics only */ }
  }

  /* What a person should see in All apps. Everything else stays installed and
   * reachable behind the "Show all" tile. */
  var USER_IDS = [
    "org.tizen.netflix-app", "org.tizen.primevideo", "9Ur5IzDKqV.TizenYouTube",
    "com.samsung.tv.cobalt-yt", "com.samsung.tv.cobalt-ytkids", "com.samsung.tv.cobalt-yttv",
    "rJeHak5zRg.Spotify", "kIciSQlYEM.plex", "CXNLCPYe82.dstvnow",
    "org.tizen.globoplayapp", "com.samsung.tv.cobalt-gpm",
    "org.tizen.browser", "com.samsung.tv.gallery", "org.volt.apps",
    "com.samsung.tv.coba.livetv", "com.samsung.tv.coba.source", "com.samsung.tv.ambientapp",
    "com.samsung.tv.music-flex", "com.samsung.tv.mycontents",
    "org.tizen.ScreenMirroring-app-tv", "org.tizen.remotepc"
  ];

  /* When a brand appears twice (Prime Video + its dummy, YouTube + the Cobalt
   * shell), keep the Tizen app id and drop the wrapper. */
  var PREFERRED_IDS = {
    "netflix": "org.tizen.netflix-app",
    "youtube": "9Ur5IzDKqV.TizenYouTube",
    "prime video": "org.tizen.primevideo",
    "spotify": "rJeHak5zRg.Spotify",
    "plex": "kIciSQlYEM.plex",
    "globoplay": "org.tizen.globoplayapp"
  };

  /* Only streaming brands get a name-based pass. Samsung's own apps are matched
   * by exact id, because names like "Apps" and "Ambient" also belong to a dozen
   * internal components. */
  /* Brands the viewer actually uses. Other store apps still pass the
   * non-Samsung rule below, so a future Disney+ install shows up anyway. */
  var BRAND_PREFIXES = [
    "netflix", "youtube", "prime video", "spotify", "plex", "dstv"
  ];

  /* Samsung apps worth keeping in All apps. Everything else Samsung ships is
   * hidden behind the "Show all apps" tile. */
  var SAMSUNG_KEEP = [
    "com.samsung.tv.gallery",
    "org.tizen.ambientapp",
    "com.samsung.tv.coba.livetv"
  ];

  /* Samsung components that use store-style package ids and must not be
   * mistaken for apps the viewer installed. */
  var HIDE_IDS = [
    "adplatform.ADPlayer",
    "aQjWjLsPaO.MultiScreenWebLauncher",
    "NRi6kdBYJ0.AirPlayWebApp",
    "XPkceUl3N4.UsbCamApp",
    "WykOS4t4F0.cmsWebApp",
    "jPPp4KCHp4.emanual",
    "Oxv5Tb6i2d.SmartTV",
    "tv6pbVMQFF.PrivacyChoices",
    "yL49PNFmjW.service",
    "yL49PNFmjW.PromotionApp",
    "J9fZJDMi1v.SecurityCenter",
    "ZODRT12q2l.WebAccountExtension",
    "org.volt.apps"
  ];

  function isCurated(app) {
    if (!app || !app.id) return false;
    if (app.id === SELF || app.id === "tvunlock01.Peregrine") return false;
    if (/-dummy$/.test(app.id)) return false;
    if (HIDE_IDS.indexOf(app.id) >= 0) return false;
    if (SAMSUNG_KEEP.indexOf(app.id) >= 0) return true;

    var name = String(app.name || "").toLowerCase();
    if (/(test|suite|sample|demo)/i.test(name)) return false;

    // Samsung components that do not use a com.samsung/org.tizen id.
    if (/(daemon|framework|protocol|manager|support|hotel|preview|continuewatching|ep-|ewbs|p2p-|csapi|ug-|tvs-lite|agent|provider|panel|service)/i
        .test(app.id + " " + name)) return false;

    for (var i = 0; i < BRAND_PREFIXES.length; i++) {
      if (name.indexOf(BRAND_PREFIXES[i]) === 0) return true;
    }

    // Everything not shipped by Samsung is an app the viewer installed.
    if (app.id.indexOf("com.samsung.") === 0) return false;
    if (app.id.indexOf("org.tizen.") === 0) return false;
    return true;
  }

  function brandKey(name) {
    var value = String(name || "").toLowerCase();
    for (var i = 0; i < BRAND_PREFIXES.length; i++) {
      if (value.indexOf(BRAND_PREFIXES[i]) === 0) return BRAND_PREFIXES[i];
    }
    return null;
  }

  function dedupeBrands(list) {
    var available = {};
    list.forEach(function (app) { available[app.id] = true; });
    var chosen = {};
    var out = [];
    list.forEach(function (app) {
      var key = brandKey(app.name);
      if (!key) { out.push(app); return; }
      var preferred = PREFERRED_IDS[key];
      if (preferred && available[preferred]) {
        if (app.id === preferred) out.push(app);
        return;
      }
      if (chosen[key]) return;
      chosen[key] = true;
      out.push(app);
    });
    return out;
  }

  function visibleApps() {
    var list = store.showAll ? state.apps.slice() : dedupeBrands(state.apps.filter(isCurated));
    if (!state.editing) {
      list = list.slice();
      list.push({
        id: "__toggle",
        name: store.showAll ? "Show fewer apps" : "Show all apps",
        count: state.apps.length
      });
    }
    return list;
  }

  var APPS_CACHE = "cleanhome.apps.v1";
  var CACHE_MAX_AGE = 6 * 60 * 60 * 1000;

  function readAppsCache() {
    try {
      var raw = localStorage.getItem(APPS_CACHE);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.apps) || !parsed.apps.length) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeAppsCache(apps) {
    try { localStorage.setItem(APPS_CACHE, JSON.stringify({ t: Date.now(), apps: apps })); }
    catch (e) { /* quota; the launcher still works */ }
  }

  function prepareApps(raw) {
    var apps = [];
    (raw || []).forEach(function (app) {
      if (isConsumer(app)) apps.push({ id: app.id, name: app.name, iconPath: app.iconPath });
    });
    apps.sort(function (a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    return apps;
  }

  function adopt(apps) {
    if (!store.allReset) {
      store.showAll = false;
      store.allReset = true;
      saveStore();
    }
    state.apps = apps;
    state.grid = visibleApps();

    if (store.seeded && store.dockOrder) {
      state.dock = resolveDock(apps, store.dock);
      if (!store.liveTvInDock) {
        var live = findById(apps, "com.samsung.tv.coba.livetv");
        var gear = findById(apps, SETTINGS_APP);
        if (live && state.dock.indexOf(live) < 0 && state.dock.length < MAX_DOCK) {
          var at = state.dock.indexOf(gear);
          if (at >= 0) state.dock.splice(at, 0, live); else state.dock.push(live);
          store.dock = state.dock.map(function (a) { return a.id; });
        }
        store.liveTvInDock = true;
        saveStore();
      }
    } else {
      state.dock = defaultDock(apps);
      store.dock = state.dock.map(function (a) { return a.id; });
      store.seeded = true;
      store.dockOrder = true;
      saveStore();
    }

    el.empty.hidden = apps.length > 0;
    if (!apps.length) el.emptyText.textContent = "The TV returned an empty app list.";

    renderUtils();
    renderDock();
    renderGrid();
    paintFocus();
  }

  function fetchApps() {
    perf.fetched = true;
    var appsStart = performance.now();
    window.tizen.application.getAppsInfo(function (list) {
      perf.appsMs = Math.round(performance.now() - appsStart);
      var apps = prepareApps(list || []);
      writeAppsCache(apps);
      adopt(apps);
    }, function (err) {
      el.empty.hidden = false;
      el.emptyText.textContent = "Could not read the app list: " +
        (err && err.message ? err.message : "unknown error");
    });
  }

  function loadApps() {
    if (!hasTizen()) {
      adopt(DEMO_APPS.slice());
      return;
    }

    // Render from cache first: getAppsInfo blocks the main thread for ~4 s on
    // this set, so the UI must never wait for it.
    var cache = readAppsCache();
    if (cache) {
      perf.cache = { ageSec: Math.round((Date.now() - cache.t) / 1000), apps: cache.apps.length };
      adopt(prepareApps(cache.apps));
      if (Date.now() - cache.t < CACHE_MAX_AGE) return;
      setTimeout(fetchApps, 2000);
      return;
    }

    el.title.textContent = "Loading";
    el.sub.textContent = "Reading the app list (about 4 seconds)…";
    fetchApps();
  }

  window.addEventListener("load", function () {
    applyTheme();
    fit();
    tick();
    setInterval(tick, 15000);
    if (window.tizen && window.tizen.tvinputdevice) {
      ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop",
       "MediaTrackPrevious", "MediaTrackNext", "MediaFastForward", "MediaRewind"
      ].forEach(function (name) {
        try { window.tizen.tvinputdevice.registerKey(name); } catch (e) {}
      });
    }
    if (DIAGNOSTICS) reportCaps();
    renderRail();
    readNetwork();
    if (DIAGNOSTICS) probeSystem();
    var bench = /[?&]bench=([a-z]+)/.exec(location.search);
    if (bench) {
      perf.benchMode = bench[1];
      setTimeout(benchFocus, 4000);
    }
    loadApps();
    try { SPOTIFY_URL = localStorage.getItem("spotifyUrl") || SPOTIFY_URL; } catch (e) {}
    setTimeout(pollSpotify, 1500);
    if (/[?&]music=1/.test(location.search)) {
      setTimeout(function () { openMusic(); }, 1800);
    }
    var zone = /[?&]zone=([a-z]+)/.exec(location.search);
    if (zone) {
      setTimeout(function () {
        state.zone = zone[1] === "card" ? "card"
          : (zone[1] === "rail" ? "rail" : "utils");
        state.utilIndex = 0;
        state.railIndex = 0;
        paintFocus();
      }, 2600);
    }
  });

  window.addEventListener("resize", fit);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
})();
