/* Preview fixture. Loaded only by preview/serve.py.
   Opening this file on the live site does nothing: the server flag is required. */
(function () {
  if (!window.__BETHANY_PREVIEW_SERVER__) return;

  var BLOCK = /script\.google\.com|firebaseio\.com|firebaseinstallations|identitytoolkit|securetoken|gstatic\.com\/firebasejs|www\.googleapis\.com/i;
  window.__PREVIEW_BLOCKED = [];

  var ROLES = {
    worship: {
      label: "Example worship member",
      uid: "preview-worship",
      email: "worship.member@example.test",
      name: "Example Worship Member",
      teams: ["worship"]
    },
    visitor: {
      label: "Not on the worship team",
      uid: "preview-visitor",
      email: "visitor@example.test",
      name: "Example Visitor",
      teams: []
    }
  };

  function roleName() {
    var saved = "";
    try { saved = localStorage.getItem("bethany-preview-role") || ""; } catch (e) {}
    return ROLES[saved] ? saved : "worship";
  }

  function nextSunday() {
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function applyRole(name) {
    var role = ROLES[name] || ROLES.worship;
    window.BETHANY_MOCK_AUTH = {
      uid: role.uid,
      email: role.email,
      displayName: role.name,
      providers: ["google.com"]
    };
    try {
      localStorage.setItem("bethany-preview-role", name);
      localStorage.setItem("bethany-lang", "en");
      localStorage.setItem("bethany-teams", JSON.stringify(role.teams));
      localStorage.setItem("bethany-profile", JSON.stringify({
        uid: role.uid,
        name: role.name,
        email: role.email,
        provider: "google.com",
        lang: "en",
        teams: role.teams.slice()
      }));
      localStorage.removeItem("bethany-need-name");
      if (name === "worship" && !localStorage.getItem("bethany-worship-sets")) {
        localStorage.setItem("bethany-worship-sets", JSON.stringify([{
          id: "preview-set",
          date: nextSunday(),
          title: "Example Sunday set",
          titleEdited: true,
          service: "English Service",
          language: "en",
          leader: "Pastor Woori",
          leaderNote: "",
          songs: [
            { id: "amazing-grace", key: "G", note: "" },
            { id: "holy-holy-holy", key: "D", note: "" }
          ]
        }]));
      }
    } catch (e) {}
  }

  applyRole(roleName());

  function readStore() {
    try { return JSON.parse(sessionStorage.getItem("bethany-preview-store") || "") || {}; } catch (e) { return {}; }
  }
  function writeStore(store) {
    try { sessionStorage.setItem("bethany-preview-store", JSON.stringify(store)); } catch (e) {}
  }
  function store() {
    var data = readStore();
    if (!data.sets) data.sets = {};
    if (!data.avail) data.avail = [];
    return data;
  }

  function currentProfile() {
    try { return JSON.parse(localStorage.getItem("bethany-profile") || "null") || {}; } catch (e) { return {}; }
  }

  function answer(params) {
    var action = params.action || "";
    var data = store();
    if (action === "getSongs") {
      if (params.etag) return { ok: true, unchanged: true };
      return { ok: true, songs: [], more: false, etag: "preview-bundled", version: "preview" };
    }
    if (action === "publish") {
      var payload = {};
      try { payload = JSON.parse(params.payload || "{}"); } catch (e) {}
      payload.updatedAt = Date.now();
      data.sets[payload.id || "set"] = payload;
      writeStore(data);
      return { ok: true, updatedAt: payload.updatedAt };
    }
    if (action === "get") {
      var found = data.sets[params.id];
      if (!found) return { ok: true, found: false };
      var copy = { ok: true, found: true };
      Object.keys(found).forEach(function (key) { copy[key] = found[key]; });
      return copy;
    }
    if (action === "setAvailability") {
      var items = params.items;
      if (!items || !items.length) items = [{ person: params.person, sunday: params.sunday, status: params.status, note: params.note || "" }];
      items.forEach(function (item) { data.avail.push(item); });
      writeStore(data);
      return { ok: true };
    }
    if (action === "getAvailability") return { ok: true, rows: data.avail };
    if (action === "getProfile") return { ok: true, profile: currentProfile() };
    if (action === "saveProfile") return { ok: true, profile: currentProfile() };
    if (action === "verifyTeamCode" || action === "feedback" || action === "request") return { ok: false, error: "preview" };
    if (action === "getMyServing") {
      var marked = data.avail.filter(function (row) { return row && row.status === "available"; }).length;
      return { ok: true, worship: { markedCount: marked } };
    }
    if (action === "getNurseryRoster") return { ok: false, error: "team" };
    return { ok: true };
  }

  function paramsFrom(url, body) {
    var out = {};
    try {
      var parsed = new URL(String(url), location.href);
      parsed.searchParams.forEach(function (value, key) { out[key] = value; });
    } catch (e) {}
    if (body) {
      try {
        var json = JSON.parse(body);
        if (json && typeof json === "object") Object.keys(json).forEach(function (key) { out[key] = json[key]; });
      } catch (e2) {}
    }
    return out;
  }

  function deliver(url, body) {
    var params = paramsFrom(url, body);
    var data = answer(params);
    var cb = params.callback;
    if (cb && typeof window[cb] === "function") window[cb](data);
    return data;
  }

  if (navigator.serviceWorker) {
    var regs = navigator.serviceWorker.getRegistrations && navigator.serviceWorker.getRegistrations();
    if (regs && regs.then) regs.then(function (list) { list.forEach(function (reg) { reg.unregister(); }); });
    navigator.serviceWorker.register = function () { return Promise.reject(new Error("preview")); };
  }
  if (window.caches && caches.keys) {
    caches.keys().then(function (keys) { keys.forEach(function (key) { caches.delete(key); }); });
  }

  var src = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  if (src && src.set) {
    Object.defineProperty(HTMLScriptElement.prototype, "src", {
      configurable: true,
      get: function () { return this.__previewBlocked || src.get.call(this); },
      set: function (value) {
        if (BLOCK.test(String(value))) {
          this.__previewBlocked = String(value);
          window.__PREVIEW_BLOCKED.push(String(value).split("?")[0]);
          return;
        }
        src.set.call(this, value);
      }
    });
  }

  var append = Element.prototype.appendChild;
  Element.prototype.appendChild = function (node) {
    if (node && node.__previewBlocked) {
      deliver(node.__previewBlocked, "");
      return node;
    }
    return append.call(this, node);
  };

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = (init && init.method) || "GET";
    if (BLOCK.test(url) || (method !== "GET" && url && url.indexOf(location.origin) !== 0 && !url.startsWith("/"))) {
      if (BLOCK.test(url) || method !== "GET") window.__PREVIEW_BLOCKED.push(url.split("?")[0]);
      if (BLOCK.test(url)) {
        var data = deliver(url, init && init.body);
        return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return origFetch.apply(this, arguments);
  };

  function paint() {
    if (document.getElementById("preview-bar")) return;
    var role = roleName();
    var bar = document.createElement("div");
    bar.id = "preview-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Preview fixture");
    bar.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:80;background:#fff;color:#0F2830;border:2px solid #00303F;border-radius:16px;padding:8px 10px;box-shadow:0 8px 24px rgba(0,40,50,.18);font:600 13px/1.3 'Open Sans',sans-serif;display:flex;flex-wrap:wrap;gap:6px;align-items:center";
    var note = document.createElement("div");
    note.style.cssText = "flex:1 1 220px";
    note.textContent = "Preview fixture. Not a sign-in. Example people only. Nothing is sent to the church. Library is the songs bundled in this build.";
    bar.appendChild(note);
    Object.keys(ROLES).forEach(function (name) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = ROLES[name].label;
      button.setAttribute("aria-pressed", name === role ? "true" : "false");
      button.style.cssText = "min-height:44px;padding:0 12px;border-radius:999px;border:0;font:inherit;cursor:pointer;background:" + (name === role ? "#00303F" : "#F2EFE7") + ";color:" + (name === role ? "#fff" : "#00303F");
      button.onclick = function () {
        if (name === roleName()) return;
        applyRole(name);
        location.reload();
      };
      bar.appendChild(button);
    });
    document.body.appendChild(bar);
    function hideCatalogNote() {
      var box = document.getElementById("wo-lib-empty");
      if (box && !box.hidden) box.hidden = true;
    }
    hideCatalogNote();
    new MutationObserver(hideCatalogNote).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  if (document.body) paint();
  else document.addEventListener("DOMContentLoaded", paint);
})();
