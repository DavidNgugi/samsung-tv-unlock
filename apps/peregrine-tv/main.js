/* Peregrine — deliberately tiny.
 *
 * Its only job is to prove the whole path end to end: build, sign with our own
 * certificate, install over sdb, launch from the TV's app row, receive remote
 * keys. No network, no storage, no launcher.
 */
(function () {
  "use strict";

  var el = {
    screen: document.getElementById("screen"),
    engine: document.getElementById("engine"),
    key: document.getElementById("key")
  };

  var KEY_NAMES = {
    13: "OK",
    37: "LEFT", 38: "UP", 39: "RIGHT", 40: "DOWN",
    10009: "BACK",
    10252: "PLAY/PAUSE",
    415: "PLAY", 19: "PAUSE", 413: "STOP", 417: "FAST FORWARD", 412: "REWIND"
  };

  function showScreen() {
    el.screen.textContent = window.innerWidth + " x " + window.innerHeight;
  }

  function showEngine() {
    var ua = navigator.userAgent || "unknown";
    var m = ua.match(/Chrome\/([0-9.]+)/);
    el.engine.textContent = m ? "Chromium " + m[1] : ua.slice(0, 48);
  }

  function showKey(event) {
    var name = KEY_NAMES[event.keyCode] || ("keyCode " + event.keyCode);
    el.key.textContent = name;
    el.key.className = "changed";
    setTimeout(function () { el.key.className = ""; }, 220);
  }

  window.addEventListener("load", function () {
    showScreen();
    showEngine();
  });

  window.addEventListener("resize", showScreen);

  document.addEventListener("keydown", function (event) {
    showKey(event);
    // BACK is the platform's: it should close the app.
  });
})();
