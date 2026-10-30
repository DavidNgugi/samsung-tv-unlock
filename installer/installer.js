(function () {
  "use strict";

  var TOKEN = window.INSTALLER_TOKEN || "";
  var STEPS = [
    { id: "welcome", title: "Welcome" },
    { id: "name", title: "Name and icon" },
    { id: "tv", title: "Your TV and developer mode" },
    { id: "install", title: "Install" },
    { id: "home", title: "Home button (optional)" },
    { id: "done", title: "Done" }
  ];

  var state = {
    step: 0,
    checks: null,
    settings: {},
    tvs: null,
    scanning: false,
    connected: false,
    job: null,
    jobTimer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ "X-Token": TOKEN }, options.headers || {});
    if (options.body) options.headers["Content-Type"] = "application/json";
    return fetch(path, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || ("HTTP " + response.status));
        return data;
      });
    });
  }

  function saveSettings(patch) {
    return api("/api/settings", { method: "POST", body: JSON.stringify(patch) }).then(function (data) {
      state.settings = data.settings || state.settings;
      return data;
    });
  }

  // ------------------------------------------------------------ sidebar
  function renderSidebar() {
    var host = $("steps");
    host.innerHTML = "";
    STEPS.forEach(function (step, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "step" + (index === state.step ? " active" : "") + (index < state.step ? " done" : "");
      button.innerHTML = '<span class="num">' + (index < state.step ? "✓" : index + 1) + "</span><span>" + esc(step.title) + "</span>";
      button.addEventListener("click", function () { go(index); });
      host.appendChild(button);
    });
  }

  // ------------------------------------------------------------ steps
  function stepWelcome() {
    var checks = state.checks || {};
    function chip(ok, label) {
      return '<span class="chip ' + (ok ? "ok" : "bad") + '">' + (ok ? "✓ " : "✗ ") + esc(label) + "</span>";
    }
    return (
      '<div class="card">' +
        '<div class="label">This computer</div>' +
        '<div class="chips">' +
          chip(checks.tizen, "Tizen CLI") +
          chip(checks.sdb, "sdb") +
          '<span class="chip">Python ' + esc(checks.python || "?") + "</span>" +
        "</div>" +
        '<p class="hint">The installer uses the Tizen CLI to build and install. If the Tizen chip is red, ' +
        "install Tizen Studio (and on macOS 27, Rosetta 2) first — the repo README has the one line.</p>" +
      "</div>" +
      '<div class="card">' +
        '<div class="label">What this does</div>' +
        '<p class="hint" style="font-size:14px;color:var(--muted)">' +
        "It installs Clean Home as a normal developer app over sdb. No root, no permanent change to the TV's software. " +
        "The optional Home-button step is separate and reversible.</p>" +
      "</div>"
    );
  }

  function stepName() {
    var name = state.settings.name || "Clean Home";
    return (
      '<div class="card">' +
        '<div class="label">Name</div>' +
        '<input id="app-name" class="field" maxlength="60" value="' + esc(name) + '">' +
        '<p class="hint">Shown in the TV\'s app list.</p>' +
      "</div>" +
      '<div class="card" style="margin-top:12px">' +
        '<div class="label">Icon</div>' +
        '<div class="icon-grid">' +
          '<div class="icon-tile sel" id="icon-current"><img id="icon-preview" src="/appicon?r=' + Date.now() + '" alt=""><span>Current</span></div>' +
          '<label class="icon-tile" for="icon-file" style="cursor:pointer">' +
            '<div style="width:96px;height:96px;border-radius:12px;border:1px dashed rgba(255,255,255,0.35);display:grid;place-items:center;font-size:26px;color:var(--faint)">+</div>' +
            "<span>Upload your own</span>" +
          "</label>" +
          '<input id="icon-file" type="file" accept="image/png,image/jpeg" style="display:none">' +
        "</div>" +
        '<p class="hint">A square PNG works best; the TV scales it. The default is the bundled icon.</p>' +
      "</div>"
    );
  }

  function stepTv() {
    var ip = state.settings.tvIp || "";
    var tvs = state.tvs;
    var list = "";
    if (state.scanning) {
      list = '<div class="progress"><i></i></div><p class="hint">Scanning the network for Samsung TVs…</p>';
    } else if (tvs) {
      list = tvs.length
        ? tvs.map(function (tv) {
            return '<div class="card tv"><div><div class="tv-name">' + esc(tv.name) + "</div>" +
              '<div class="tv-sub">' + esc(tv.ip) + " · " + esc(tv.model || "Samsung TV") +
              " · Developer Mode: " + esc(tv.developerMode === "1" ? "on" : "off") + "</div></div>" +
              '<button type="button" class="ghost pick-tv" data-ip="' + esc(tv.ip) + '">Use this TV</button></div>';
          }).join("")
        : '<p class="hint">No TV answered on port 8001. Check the TV is on and on the same network, or type its IP below.</p>';
    }
    return (
      '<div class="card">' +
        '<div class="row"><button type="button" class="ghost" id="scan-btn">Scan network</button>' +
        '<span class="hint" style="margin:0">Finds TVs via Samsung\'s port 8001.</span></div>' +
        '<div id="tv-list" style="margin-top:14px">' + list + "</div>" +
      "</div>" +
      '<div class="card">' +
        '<div class="label">TV IP address</div>' +
        '<div class="row"><input id="tv-ip" class="field" style="flex:1;min-width:220px" placeholder="192.168.1.50" value="' + esc(ip) + '">' +
        '<button type="button" class="ghost" id="connect-btn">Connect</button></div>' +
        '<p class="hint" id="connect-status"></p>' +
      "</div>" +
      '<div class="card">' +
        '<div class="label">Developer Mode</div>' +
        '<p class="hint" style="font-size:14px;color:var(--muted)">On the TV: <b>Apps → App Settings</b> (enter <b>12345</b>) → <b>Developer Mode</b> → on, then set <b>Host PC IP</b> to this computer:</p>' +
        '<p style="margin-top:10px;font-family:monospace;font-size:18px">' + esc((state.checks && state.checks.computerIp) || "—") + "</p>" +
        '<p class="hint">Reboot the TV after changing Developer Mode. Then come back and Connect.</p>' +
      "</div>"
    );
  }

  function stepInstall() {
    var profiles = (state.checks && state.checks.profiles) || [];
    var selected = state.settings.profile || profiles[0] || "peregrine-samsung";
    var options = profiles.map(function (p) {
      return '<option value="' + esc(p) + '"' + (p === selected ? " selected" : "") + ">" + esc(p) + "</option>";
    }).join("");
    if (!profiles.length) options = '<option value="peregrine-samsung">peregrine-samsung</option>';
    return (
      '<div class="card">' +
        '<div class="label">Certificate profile</div>' +
        '<select id="profile" class="field">' + options + "</select>" +
        '<p class="hint">Tizen signs the package with an author certificate. These are the profiles already on this computer. ' +
        "Create one with <code>tizen certificate</code> if the list is empty.</p>" +
      "</div>" +
      '<div class="card" style="margin-top:12px">' +
        '<div class="label">Family photos (optional)</div>' +
        '<input id="family-dir" class="field" value="' + esc(state.settings.familyDir || "~/Pictures/Clean Home/Family") + '">' +
        '<p class="hint">Put photos in this folder. They stay on this computer and are packaged only into this TV install; they are never added to Git.</p>' +
      "</div>" +
      '<div class="card" style="margin-top:12px">' +
        '<div class="row"><button type="button" class="primary" id="install-btn"' + (state.settings.tvIp ? "" : " disabled") + ">Install Clean Home</button>" +
        '<span class="hint" style="margin:0">' + (state.settings.tvIp ? "TV: " + esc(state.settings.tvIp) : "Connect to a TV first (previous step).") + "</span></div>" +
        '<div id="install-status"></div>' +
        '<div class="log" id="install-log" hidden></div>' +
      "</div>"
    );
  }

  function stepHome() {
    return (
      '<div class="card">' +
        '<div class="label">Make Home open Clean Home</div>' +
        '<p class="hint" style="font-size:14px;color:var(--muted)">' +
        "This is a separate, reversible database change on the TV (the Tizen 6.0 path in this repo). " +
        "It changes the XF86Home route so the physical Home key opens Clean Home instead of Smart Hub. " +
        "Back up the TV first so you can restore it.</p>" +
        '<div class="row" style="margin-top:14px"><button type="button" class="ghost" id="backup-btn">Back up TV data</button>' +
        '<a class="link" href="https://github.com/DavidNgugi/samsung-tv-unlock/blob/main/docs/HOME-BUTTON.md" target="_blank" rel="noreferrer">Read the steps</a></div>' +
        '<div class="log" id="backup-log" hidden></div>' +
      "</div>"
    );
  }

  function stepDone() {
    return (
      '<div class="card">' +
        '<div class="label">Installed</div>' +
        '<p class="hint" style="font-size:14px;color:var(--muted)">Clean Home is on the TV. Open it from the TV\'s Apps list, ' +
        "or launch it now. You can rerun this wizard any time to change the name, icon or TV.</p>" +
        '<div class="row" style="margin-top:16px"><button type="button" class="primary" id="open-btn">Open Clean Home</button></div>' +
        '<div id="open-status" class="hint"></div>' +
      "</div>" +
      '<div class="card"><div class="label">Preview it first</div>' +
        '<p class="hint" style="font-size:14px;color:var(--muted)">No TV handy? Run <code>tools/preview.sh</code> to use the launcher in a browser.</p></div>'
    );
  }

  var RENDER = { welcome: stepWelcome, name: stepName, tv: stepTv, install: stepInstall, home: stepHome, done: stepDone };

  function render() {
    renderSidebar();
    var step = STEPS[state.step];
    $("step-label").textContent = "Step " + (state.step + 1) + " of " + STEPS.length;
    $("step-title").textContent = step.title;
    var ledes = {
      welcome: "A quiet launcher for your Samsung TV. This wizard installs it over Developer Mode — no root, and the TV's own Apps list can remove it later.",
      name: "What Clean Home is called in the TV's app list, and the icon it shows there.",
      tv: "Find the TV on your network, then put it in Developer Mode so it accepts the install.",
      install: "Build and install the launcher on the TV. This is the step that changes the TV.",
      home: "Optionally, make the TV's Home key open Clean Home instead of Samsung's Smart Hub.",
      done: "All set. Open Clean Home from the TV's Apps list or right here."
    };
    $("step-lede").textContent = ledes[step.id] || "";
    $("step-body").innerHTML = RENDER[step.id]();
    $("back").style.visibility = state.step === 0 ? "hidden" : "visible";
    $("next").textContent = state.step === STEPS.length - 1 ? "Finish" : "Continue";
    wire(step.id);
  }

  // ------------------------------------------------------------ wiring
  function wire(id) {
    if (id === "name") {
      var file = $("icon-file");
      if (file) file.addEventListener("change", function () {
        var chosen = file.files && file.files[0];
        if (!chosen) return;
        var reader = new FileReader();
        reader.onload = function () {
          api("/api/icon", { method: "POST", body: JSON.stringify({ data: reader.result }) }).then(function () {
            $("icon-preview").src = "/appicon?r=" + Date.now();
          }).catch(function (error) { alert("Icon: " + error.message); });
        };
        reader.readAsDataURL(chosen);
      });
    }
    if (id === "tv") {
      $("scan-btn").addEventListener("click", scan);
      $("connect-btn").addEventListener("click", connect);
      Array.prototype.forEach.call(document.querySelectorAll(".pick-tv"), function (button) {
        button.addEventListener("click", function () {
          $("tv-ip").value = button.getAttribute("data-ip");
          connect();
        });
      });
    }
    if (id === "install") {
      $("install-btn").addEventListener("click", install);
      if (state.job && !state.job.done) paintJob(state.job, "install-log", "install-status");
    }
    if (id === "home") {
      $("backup-btn").addEventListener("click", backup);
    }
    if (id === "done") {
      $("open-btn").addEventListener("click", openLauncher);
    }
  }

  function scan() {
    state.scanning = true;
    state.tvs = null;
    render();
    api("/api/scan").then(function (data) {
      state.scanning = false;
      state.tvs = data.tvs || [];
      if (data.computerIp && state.checks) state.checks.computerIp = data.computerIp;
      render();
    }).catch(function (error) {
      state.scanning = false;
      state.tvs = [];
      render();
      alert("Scan: " + error.message);
    });
  }

  function connect() {
    var ip = ($("tv-ip").value || "").trim();
    if (!ip) return;
    $("connect-status").textContent = "Connecting…";
    api("/api/connect", { method: "POST", body: JSON.stringify({ ip: ip }) }).then(function (data) {
      state.connected = !!data.ok;
      state.settings.tvIp = ip;
      saveSettings({ tvIp: ip });
      $("connect-status").textContent = data.ok ? "Connected to " + ip + "." : "Could not connect. Check Developer Mode and the Host PC IP.";
    }).catch(function (error) {
      $("connect-status").textContent = "Connect: " + error.message;
    });
  }

  function install() {
    var profile = ($("profile") && $("profile").value) || "peregrine-samsung";
    var familyDir = (($('family-dir') && $('family-dir').value) || "").trim();
    saveSettings({ profile: profile, tvIp: state.settings.tvIp || "", familyDir: familyDir });
    $("install-btn").disabled = true;
    $("install-log").hidden = false;
    $("install-log").textContent = "";
    $("install-status").innerHTML = '<div class="progress"><i></i></div>';
    api("/api/install", { method: "POST", body: JSON.stringify({ ip: state.settings.tvIp, profile: profile, familyDir: familyDir }) }).then(function (data) {
      pollJob(data.job);
    }).catch(function (error) {
      $("install-btn").disabled = false;
      $("install-status").textContent = "Install: " + error.message;
    });
  }

  function backup() {
    $("backup-log").hidden = false;
    $("backup-log").textContent = "";
    api("/api/backup", { method: "POST", body: JSON.stringify({}) }).then(function (data) {
      pollJob(data.job, "backup-log", null);
    }).catch(function (error) {
      $("backup-log").textContent = "Backup: " + error.message;
    });
  }

  function pollJob(id, logId, statusId) {
    clearInterval(state.jobTimer);
    function tick() {
      api("/api/job?id=" + encodeURIComponent(id)).then(function (job) {
        state.job = job;
        paintJob(job, logId || "install-log", statusId || "install-status");
        if (job.done) {
          clearInterval(state.jobTimer);
          var button = $("install-btn");
          if (button) button.disabled = false;
          var status = $(statusId || "install-status");
          if (status) status.innerHTML = job.ok
            ? '<p class="hint" style="color:#93efb8">Done.</p>'
            : '<p class="hint" style="color:#ff9c9c">Failed — see the log.</p>';
        }
      }).catch(function () {});
    }
    tick();
    state.jobTimer = setInterval(tick, 800);
  }

  function paintJob(job, logId, statusId) {
    var log = $(logId);
    if (log) log.textContent = (job.log || []).join("\n");
    if (log) log.scrollTop = log.scrollHeight;
  }

  function openLauncher() {
    $("open-status").textContent = "Launching…";
    api("/api/open", { method: "POST", body: JSON.stringify({}) }).then(function (data) {
      $("open-status").textContent = data.ok ? "Sent. The TV should open Clean Home." : "Could not launch — open it from the TV's Apps.";
    }).catch(function (error) {
      $("open-status").textContent = "Launch: " + error.message;
    });
  }

  // ------------------------------------------------------------ navigation
  function go(index) {
    if (index === state.step) return;
    if (state.step === 1) {
      var name = ($("app-name") && $("app-name").value || "").trim();
      if (name) saveSettings({ name: name });
    }
    state.step = Math.max(0, Math.min(STEPS.length - 1, index));
    render();
  }

  $("back").addEventListener("click", function () { go(state.step - 1); });
  $("next").addEventListener("click", function () {
    if (state.step === STEPS.length - 1) { window.close(); return; }
    go(state.step + 1);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") go(Math.max(0, state.step - 1));
  });

  // ------------------------------------------------------------ boot
  api("/api/state").then(function (data) {
    state.checks = data;
    state.settings = data.settings || {};
    render();
  }).catch(function (error) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:sans-serif">Installer error: ' + esc(error.message) + "</div>";
  });
})();
