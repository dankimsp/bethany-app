var WO_NUM = "bethany-worship-numbers";
var WO_LYRICS = "bethany-worship-lyrics";
var WO_PREFS = "bethany-worship-prefs";
var WO_NOTES = "bethany-worship-song-notes";
var WO_SET = "bethany-worship-set";
var SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var wo = { songs: [], byId: {}, view: "lib", cur: null, semi: 0, flats: false, wake: null, meta: null };
var woPending = null;

function woPc(note) {
  var m = String(note || "").trim().match(/^([A-G])([#b])?/);
  if (!m) return 0;
  var n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (m[2] === "#") n++;
  if (m[2] === "b") n--;
  return (n + 12) % 12;
}
function woSpell(n) { return SHARP[(n + 12) % 12]; }
function woSharpKey(name) { return woSpell(woPc(name)); }
function woParseChord(ch) {
  var m = String(ch || "").trim().match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/);
  if (!m) return null;
  return { root: woPc(m[1]), q: m[2] || "", bass: m[3] ? woPc(m[3]) : null };
}
function woQuality(q) {
  var r = q || "", out = "";
  if (/^m(?!aj)/.test(r) || /^min\b/.test(r)) out += "m";
  if (/dim/.test(r)) out += "dim";
  if (/aug/.test(r)) out += "aug";
  if (/sus4/.test(r)) out += "sus4";
  else if (/sus2/.test(r)) out += "sus2";
  else if (/sus/.test(r)) out += "sus";
  if (/maj7|ma7|M7/.test(r)) out += "maj7";
  else if (/7/.test(r)) out += "7";
  return out;
}
function woDegree(interval) {
  return ["1","b2","2","b3","3","4","b5","5","b6","6","b7","7"][(interval + 12) % 12];
}
function woNashville(ch, keyPc) {
  var p = woParseChord(ch);
  if (!p) return ch;
  var name = woDegree(p.root - keyPc) + woQuality(p.q);
  if (p.bass != null) name += "/" + woDegree(p.bass - keyPc);
  return name;
}
function woTranspose(ch, semi, flats) {
  var p = woParseChord(ch);
  if (!p) return ch;
  var root = woSpell(p.root + semi, flats);
  var bass = p.bass == null ? "" : "/" + woSpell(p.bass + semi, flats);
  return root + p.q + bass;
}
function woParseLyric(line) {
  var re = /\[([^\]]+)\]/g, segs = [], last = 0, m, pending = null;
  while ((m = re.exec(line))) {
    var text = line.slice(last, m.index);
    if (pending == null) { if (text) segs.push({ c: null, t: text }); }
    else segs.push({ c: pending, t: text });
    pending = m[1];
    last = m.index + m[0].length;
  }
  var rest = line.slice(last);
  if (pending != null) segs.push({ c: pending, t: rest });
  else if (rest) segs.push({ c: null, t: rest });
  if (!segs.length) segs.push({ c: null, t: line });
  return segs;
}
function woSplitList(val) {
  return String(val || "").split(",").map(function (part) { return part.trim(); }).filter(Boolean);
}
function woNormList(val, allowed, message, errors) {
  return woSplitList(val).map(function (part) {
    var canon = allowed[part.toLowerCase()];
    if (!canon) errors.push(message);
    return canon || part;
  });
}
function woParseCho(text, id) {
  var song = { id: id || "song", title: "", artist: "", key: "C", youtube: "", language: "en", speed: "", themes: [], moment: [], season: [], range: [], time: [], difficulty: [], scripture: "", sections: [] };
  var cur = null, errors = [];
  function open(label) { cur = { label: label, lines: [] }; song.sections.push(cur); }
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var t = line.trim();
    var dm = t.match(/^\{([^:}]+)(?::\s*(.*))?\}$/);
    if (dm) {
      var name = dm[1].toLowerCase().trim(), val = (dm[2] || "").trim();
      if (name === "title" || name === "t") song.title = val;
      else if (name === "artist" || name === "subtitle" || name === "st") { if (!song.artist) song.artist = val; }
      else if (name === "key") song.key = val.replace(/\s+/g, "") || song.key;
      else if (name === "youtube") song.youtube = val;
      else if (name === "tempo") { var bpm = parseInt(val, 10); if (bpm > 0) song.tempo = bpm; }
      else if (name === "speed") {
        var sp = val.toLowerCase();
        if (sp === "slow" || sp === "medium" || sp === "fast") song.speed = sp;
        else errors.push("Speed must be slow, medium, or fast.");
      }
      else if (name === "themes") song.themes = woSplitList(val);
      else if (name === "language") {
        var lang = val.toLowerCase();
        song.language = (lang === "ko" || lang === "korean" || lang === "kr") ? "ko" : "en";
      }
      else if (name === "time") song.time = woSplitList(val);
      else if (name === "moment") song.moment = woNormList(val, { opener: "Opener", response: "Response", communion: "Communion", offering: "Offering", closing: "Closing" }, "Moment must be Opener, Response, Communion, Offering, or Closing.", errors);
      else if (name === "season") song.season = woSplitList(val);
      else if (name === "range") song.range = woNormList(val, { low: "low", medium: "medium", high: "high" }, "Range must be low, medium, or high.", errors);
      else if (name === "difficulty") song.difficulty = woNormList(val, { easy: "easy", medium: "medium", hard: "hard" }, "Difficulty must be easy, medium, or hard.", errors);
      else if (name === "scripture") song.scripture = val;
      else if (name === "start_of_verse" || name === "sov") open(val || "Verse");
      else if (name === "start_of_chorus" || name === "soc") open(val || "Chorus");
      else if (name === "start_of_bridge" || name === "sob") open(val || "Bridge");
      else if (name === "comment" || name === "c") open(val || "Section");
      else if (/^end_of_|^eov$|^eoc$|^eob$/.test(name)) cur = null;
      return;
    }
    if (!t) return;
    if (!cur) open("");
    var lyric = woParseLyric(line);
    lyric.forEach(function (seg) {
      if (seg.c && !woParseChord(seg.c) && !woParseNum(seg.c)) errors.push("Unrecognized chord: " + seg.c);
    });
    cur.lines.push(lyric);
  });
  if (!song.title) errors.unshift("Add a {title: Song Name} line.");
  var any = song.sections.some(function (s) { return s.lines.length; });
  if (!any) errors.push("No lyric lines found.");
  song.errors = errors;
  return song;
}
function woNumbersOn() { try { return localStorage.getItem(WO_NUM) === "1"; } catch (e) { return false; } }
function woSetNumbers(on) { try { localStorage.setItem(WO_NUM, on ? "1" : "0"); } catch (e) {} }
function woLyricsOn() { try { return localStorage.getItem(WO_LYRICS) === "1"; } catch (e) { return false; } }
function woSetLyrics(on) { try { localStorage.setItem(WO_LYRICS, on ? "1" : "0"); } catch (e) {} }
function woPrefs() { try { return JSON.parse(localStorage.getItem(WO_PREFS) || "{}"); } catch (e) { return {}; } }
function woSavePref(id) {
  var all = woPrefs();
  all[id] = { semi: wo.semi };
  try { localStorage.setItem(WO_PREFS, JSON.stringify(all)); } catch (e) {}
}
function woNotes() { try { return JSON.parse(localStorage.getItem(WO_NOTES) || "{}"); } catch (e) { return {}; } }
function woSongNote(id, val) {
  var all = woNotes();
  if (arguments.length < 2) return all[id] || "";
  all[id] = val;
  try { localStorage.setItem(WO_NOTES, JSON.stringify(all)); } catch (e) {}
}
function woDegSemi(token) {
  var m = String(token || "").match(/^([#b]?)([1-7])$/);
  if (!m) return null;
  var base = [0, 0, 2, 4, 5, 7, 9, 11][+m[2]];
  if (m[1] === "b") base -= 1;
  if (m[1] === "#") base += 1;
  return (base + 12) % 12;
}
function woParseNum(ch) {
  var m = String(ch || "").trim().match(/^([#b]?)([1-7])(.*)$/);
  if (!m) return null;
  var rest = m[3], bass = null;
  var slash = rest.match(/^(.*)\/([#b]?[1-7])$/);
  if (slash) { rest = slash[1]; bass = slash[2]; }
  if (/[^majsu\d()#]/.test(rest)) return null;
  var semi = woDegSemi(m[1] + m[2]);
  if (semi == null) return null;
  return { semi: semi, rest: rest, bass: bass ? woDegSemi(bass) : null };
}
function woNumSuffix(rest) {
  var r = rest || "", out = "";
  if (/^m(?!aj)/.test(r) || /^min/.test(r)) out += "m";
  if (/dim/.test(r)) out += "dim";
  if (/aug/.test(r)) out += "aug";
  if (/sus4/.test(r) || /\(4\)/.test(r)) out += "sus4";
  else if (/sus2/.test(r)) out += "sus2";
  else if (/sus/.test(r)) out += "sus";
  if (/\(2\)/.test(r) || (/2/.test(r) && !/sus2/.test(r))) out += "2";
  if (/11/.test(r)) out += "11";
  if (/maj7/i.test(r)) out += "maj7";
  else if (/#7/.test(r)) out += "#7";
  else if (/7/.test(r)) out += "7";
  else if (/#$/.test(r)) out += "#";
  return out;
}
function woNumToLetter(ch, keyPc, flats) {
  var p = woParseNum(ch);
  if (!p) return ch;
  var root = woSpell(p.semi + keyPc, flats);
  var bass = p.bass == null ? "" : "/" + woSpell(p.bass + keyPc, flats);
  return root + woNumSuffix(p.rest) + bass;
}
function woKeyFor(song) { return woSpell(woPc(song.key) + wo.semi, wo.flats); }
function woKeyNow() { return wo.cur ? woKeyFor(wo.cur) : "C"; }
function woLabel(ch, song) {
  if (!ch || woLyricsOn()) return "";
  if (woParseNum(ch)) {
    if (woNumbersOn()) return ch;
    return woNumToLetter(ch, woPc(woKeyNow()), wo.flats);
  }
  if (woNumbersOn()) return woNashville(woTranspose(ch, wo.semi, wo.flats), woPc(woKeyFor(song)));
  return woTranspose(ch, wo.semi, wo.flats);
}
function woChart(song) {
  var root = document.createElement("div");
  if (woLyricsOn()) root.className = "lyrics-only";
  song.sections.forEach(function (sec) {
    if (sec.label) {
      var h = document.createElement("div");
      h.className = "wsec";
      h.textContent = sec.label;
      root.appendChild(h);
    }
    sec.lines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "wline";
      line.forEach(function (seg) {
        var s = document.createElement("span");
        s.className = "wseg";
        var c = document.createElement("span");
        c.className = "wch";
        var label = seg.c ? woLabel(seg.c, song) : "";
        if (label) {
          var mark = document.createElement("span");
          mark.className = "chord";
          mark.textContent = label;
          c.appendChild(mark);
        } else c.textContent = "\u00a0";
        var t = document.createElement("span");
        t.textContent = seg.t || "\u00a0";
        s.appendChild(c);
        s.appendChild(t);
        row.appendChild(s);
      });
      root.appendChild(row);
    });
  });
  return root;
}
var WO_DRIVE = "bethany-worship-drive";
var WO_CLOSED = "The song library isn't open yet. Delete TEAM_HASH and LEADER_HASH in the worship script, then redeploy that web app as a new version.";
function woBackendEnabled() { return typeof WORSHIP_BACKEND_URL === "string" && WORSHIP_BACKEND_URL.length > 0; }
function woStillLocked(data) {
  return !!(data && (Number(data.status) === 401 || data.error === "unauthorized" || data.error === "pass"));
}
function woLockedMessage(data) {
  if (data && data.error === "pass") return "Publishing isn't open yet. Delete LEADER_HASH in the worship script and redeploy it as a new version.";
  return WO_CLOSED;
}
try { localStorage.removeItem("bethany-worship-team"); } catch (e) {}
function woPrivateMsg(text) {
  var el = document.getElementById("wo-private-msg");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}
function woSyncAdd() {
  var connected = woBackendEnabled();
  var off = document.getElementById("wo-req-off");
  var fields = document.getElementById("wo-req-fields");
  if (off) off.hidden = connected;
  if (fields) fields.hidden = !connected;
}
function woIdb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(); return; }
    var req = indexedDB.open("bethany-worship", 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains("songs")) req.result.createObjectStore("songs");
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
function woCacheLocal() {
  try { return JSON.parse(localStorage.getItem(WO_DRIVE) || "null"); } catch (e) { return null; }
}
function woCacheRead() {
  var idb = woIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var get = db.transaction("songs", "readonly").objectStore("songs").get("drive");
      get.onsuccess = function () { resolve(get.result || null); };
      get.onerror = function () { reject(get.error); };
    });
  }).catch(function () { return null; });
  var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2000); });
  return Promise.race([idb, timeout]).then(function (record) { return record || woCacheLocal(); });
}
function woCacheWrite(record) {
  try { localStorage.setItem(WO_DRIVE, JSON.stringify(record)); } catch (e) {}
  return woIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("songs", "readwrite");
      tx.objectStore("songs").put(record, "drive");
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }).catch(function () {});
}
function woApplyCatalog(driveItems) {
  var extra = [];
  (driveItems || []).forEach(function (item) {
    if (!item || !item.cho) return;
    var song = woParseCho(item.cho, item.id || "drive-song");
    if (item.language && !/\{language\s*:/i.test(item.cho)) song.language = item.language === "ko" ? "ko" : "en";
    extra.push(song);
  });
  wo.songs = (wo.bundled || []).concat(extra);
  wo.byId = {};
  wo.songs.forEach(function (s) { wo.byId[s.id] = s; });
  woInitFilters();
  if (wo.view === "lib" || document.body.classList.contains("wo-split")) woRenderLib();
  if (wo.view === "song" && wo.cur && wo.byId[wo.cur.id]) {
    wo.cur = wo.byId[wo.cur.id];
    woRenderSong();
  }
}
function woBackendQuery(params) {
  var q = [];
  Object.keys(params || {}).forEach(function (key) {
    if (params[key] == null || params[key] === "") return;
    q.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key])));
  });
  var base = WORSHIP_BACKEND_URL;
  return base + (base.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
}
function woApiFetch(params) {
  return fetch(woBackendQuery(params), { method: "GET", cache: "no-store", credentials: "omit" }).then(function (res) {
    if (res.status === 401) return { ok: false, status: 401, error: "unauthorized" };
    return res.text().then(function (text) { return JSON.parse(text); });
  });
}
function woBackendError(data, fallback) {
  var bits = [];
  if (data && typeof data === "object") {
    if (data.error) bits.push(String(data.error));
    if (data.message && String(data.message) !== String(data.error)) bits.push(String(data.message));
  } else if (typeof data === "string" && data) bits.push(data);
  var text = bits.join(": ").replace(/\s+/g, " ").replace(/[0-9a-f]{32,}/gi, "[redacted]").slice(0, 280);
  return text || fallback;
}
function woApiJsonp(params) {
  return new Promise(function (resolve, reject) {
    var cb = "woApi_" + Date.now() + Math.floor(Math.random() * 1000);
    var script = document.createElement("script");
    var settled = false;
    var timer = setTimeout(function () { finish(new Error("The song library didn't answer in time.")); }, 60000);
    function cleanup() { clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } script.remove(); }
    function finish(err, data) {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err); else resolve(data);
    }
    window[cb] = function (data) { finish(null, data); };
    script.onload = function () { setTimeout(function () { finish(new Error("The song library answered without data.")); }, 500); };
    script.src = woBackendQuery(params) + "&callback=" + cb;
    document.body.appendChild(script);
  });
}
function woApiPost(params) {
  var body = {};
  Object.keys(params || {}).forEach(function (key) { body[key] = params[key]; });
  return fetch(WORSHIP_BACKEND_URL, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  }).then(function (res) {
    if (res.status === 401) return { ok: false, status: 401, error: "unauthorized" };
    return res.text().then(function (text) { return JSON.parse(text); });
  });
}
function woApi(params) {
  var url = woBackendQuery(params);
  if (url.length > 7000) return woApiPost(params);
  if (String(WORSHIP_BACKEND_URL).indexOf("script.google.com") >= 0) return woApiJsonp(params);
  return woApiFetch(params).catch(function () { return woApiJsonp(params); });
}
function woFetchSongs() {
  if (!woBackendEnabled()) return Promise.resolve("off");
  return woApi({ action: "getSongs", etag: wo.driveEtag || "" }).then(function (data) {
    if (woStillLocked(data)) { woPrivateMsg(woLockedMessage(data)); return "locked"; }
    if (!data || data.ok === false) {
      woPrivateMsg(woBackendError(data, "Couldn't load the private songs."));
      return "error";
    }
    woPrivateMsg("");
    if (data.unchanged) return "ok";
    wo.driveEtag = data.etag || "";
    return woCacheWrite({ etag: data.etag || "", version: data.version || data.etag || "", songs: data.songs || [] }).then(function () {
      woApplyCatalog(data.songs || []);
      return "ok";
    });
  }).catch(function (err) {
    var fallback = wo.driveEtag ? "Couldn't reach Drive. Showing saved songs." : "Couldn't reach the song library.";
    woPrivateMsg(woBackendError(err, fallback));
    return "error";
  });
}
function woLoadPrivate() {
  woSyncAdd();
  if (!woBackendEnabled()) return Promise.resolve();
  return woCacheRead().then(function (cached) {
    if (cached && cached.songs) {
      wo.driveEtag = cached.etag || "";
      woApplyCatalog(cached.songs);
    }
    return woFetchSongs();
  });
}
function woRequestSong(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  var titleEl = document.getElementById("wo-req-title");
  var artistEl = document.getElementById("wo-req-artist");
  var title = titleEl ? titleEl.value.trim() : "";
  var artist = artistEl ? artistEl.value.trim() : "";
  var msg = document.getElementById("wo-req-msg");
  function say(text) { if (!msg) return; msg.hidden = !text; msg.textContent = text || ""; }
  if (!woBackendEnabled()) { say("Song requests aren't connected yet."); return false; }
  if (!title || !artist) { say("Add a song title and an artist name."); return false; }
  var member = typeof session === "function" ? session() : null;
  var name = member && member.name ? String(member.name).trim() : "";
  say("Sending…");
  woApiPost({ action: "request", title: title, artist: artist, name: name }).then(function (res) {
    if (woStillLocked(res)) { say(woLockedMessage(res)); return; }
    if (!res || res.ok === false) { say("Couldn't send the request."); return; }
    if (titleEl) titleEl.value = "";
    if (artistEl) artistEl.value = "";
    say("Thanks! Your request was sent.");
  }).catch(function () { say("Couldn't reach the song library."); });
  return false;
}
function woLoadSongs() {
  return fetch("songs.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (list) {
    if (!Array.isArray(list)) throw 0;
    wo.bundled = list.map(function (item) { return woParseCho(item.cho, item.id); });
    wo.songs = wo.bundled.slice();
    wo.byId = {};
    wo.songs.forEach(function (s) { wo.byId[s.id] = s; });
    woInitFilters();
    woApplyRoute();
    if (!wo.songsRouted) woShow("lib");
    return woLoadPrivate();
  }).catch(function () {
    var box = document.getElementById("wo-list");
    if (box) box.textContent = "Couldn't load songs.";
  });
}
function woTablet() {
  return !!(window.matchMedia && window.matchMedia("(min-width: 768px)").matches);
}
function woShow(view) {
  woCloseAddPicker();
  wo.view = view;
  woWasTablet = woTablet();
  var split = woWasTablet && (view === "lib" || view === "song");
  document.body.classList.toggle("wo-split", split);
  ["lib", "sets", "edit", "song", "add"].forEach(function (name) {
    var el = document.getElementById("wo-" + name);
    el.hidden = split ? !(name === "lib" || name === "song") : name !== view;
  });
  if (view === "lib" || split) woRenderLib();
  if (view === "sets") woRenderSets();
  if (view === "edit") woRenderSet();
  if (view === "song" || (split && wo.cur)) woRenderSong();
  else if (split) {
    var empty = document.getElementById("wo-song");
    empty.replaceChildren();
    var hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Select a song.";
    empty.appendChild(hint);
  }
  if (view === "add") woSyncAdd();
  woLiveWatch(view === "edit");
}
var woWasTablet = null;
var woF = { speed: "all", artist: "", theme: "", moment: [], season: [], range: [], time: [], difficulty: [], scripture: "", az: false, titleOnly: false, open: false, lang: "en", speedReady: false };
function woActiveFilters() {
  return (woF.speed !== "all" ? 1 : 0) + (woF.artist ? 1 : 0) + (woF.theme ? 1 : 0) + (woF.az ? 1 : 0) + (woF.titleOnly ? 1 : 0) + woF.moment.length + woF.season.length + woF.range.length + woF.time.length + woF.difficulty.length + (woF.scripture ? 1 : 0);
}
function woSpeedOf(song) {
  if (song.speed === "slow" || song.speed === "medium" || song.speed === "fast") return song.speed;
  if (!song.tempo) return "";
  if (song.tempo < 80) return "slow";
  if (song.tempo <= 110) return "medium";
  return "fast";
}
function woInitFilters() {
  if (!woF.speedReady) {
  woF.speedReady = true;
  var speedBox = document.getElementById("wo-speed");
  ["all", "slow", "medium", "fast"].forEach(function (sp) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (sp === "all" ? " on" : "");
    b.dataset.speed = sp;
    b.textContent = sp.charAt(0).toUpperCase() + sp.slice(1);
    b.onclick = function () {
      woF.speed = sp;
      speedBox.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.dataset.speed === sp); });
      woRenderLib();
    };
    speedBox.appendChild(b);
  });
  document.getElementById("wo-theme").onchange = function () {
    woF.theme = document.getElementById("wo-theme").value;
    woRenderLib();
  };
  var artist = document.getElementById("wo-artist");
  var names = {};
  wo.songs.forEach(function (s) { if (s.artist) names[s.artist] = 1; });
  var all = document.createElement("option");
  all.value = "";
  all.textContent = "All artists";
  artist.appendChild(all);
  Object.keys(names).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (name) {
    var o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    artist.appendChild(o);
  });
  artist.onchange = function () { woF.artist = artist.value; woRenderLib(); };
  document.getElementById("wo-az").onclick = function () {
    woF.az = !woF.az;
    document.getElementById("wo-az").classList.toggle("on", woF.az);
    woRenderLib();
  };
  document.getElementById("wo-titleonly").onclick = function () {
    woF.titleOnly = !woF.titleOnly;
    document.getElementById("wo-titleonly").classList.toggle("on", woF.titleOnly);
    document.getElementById("wo-q").placeholder = woF.titleOnly ? "Title" : "Title or artist";
    woRenderLib();
  };
  document.getElementById("wo-filter-btn").onclick = function () {
    woF.open = !woF.open;
    document.getElementById("wo-filters").hidden = !woF.open;
    document.getElementById("wo-filter-btn").setAttribute("aria-expanded", woF.open ? "true" : "false");
  };
  document.getElementById("wo-clear").onclick = function () {
    woF.speed = "all"; woF.artist = ""; woF.theme = ""; woF.moment = []; woF.season = []; woF.range = []; woF.time = []; woF.difficulty = []; woF.scripture = ""; woF.az = false; woF.titleOnly = false;
    var scripture = document.getElementById("wo-scripture"); if (scripture) scripture.value = "";
    document.getElementById("wo-q").value = "";
    document.getElementById("wo-q").placeholder = "Title or artist";
    document.getElementById("wo-artist").value = "";
    var themePick = document.getElementById("wo-theme"); if (themePick) themePick.value = "";
    document.querySelectorAll("#wo-speed button").forEach(function (b) { b.classList.toggle("on", b.dataset.speed === "all"); });
    document.getElementById("wo-az").classList.remove("on");
    document.getElementById("wo-titleonly").classList.remove("on");
    woRenderLib();
  };
  document.getElementById("wo-lang-en").onclick = function () { woF.lang = "en"; woRenderLib(); };
  document.getElementById("wo-lang-ko").onclick = function () { woF.lang = "ko"; woRenderLib(); };
  }
  woSyncLang();
  ["moment", "time"].forEach(woPruneField);
  woSyncTheme();
  var artist = document.getElementById("wo-artist");
  var chosen = woF.artist;
  artist.replaceChildren();
  var allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All artists";
  artist.appendChild(allOpt);
  var names = {};
  woLangSongs().forEach(function (s) { if (s.artist) names[s.artist] = 1; });
  Object.keys(names).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (name) {
    var o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    artist.appendChild(o);
  });
  if (chosen && names[chosen]) artist.value = chosen;
  else { woF.artist = ""; artist.value = ""; }
  woFillChoice("wo-moment", "moment");
  woFillChoice("wo-time", "time");
}
function woSyncTheme() {
  var theme = document.getElementById("wo-theme");
  if (!theme) return;
  var names = {};
  woLangSongs().forEach(function (s) { (s.themes || []).forEach(function (t) { names[t] = 1; }); });
  if (woF.theme && !names[woF.theme]) woF.theme = "";
  var chosen = woF.theme;
  theme.replaceChildren();
  var all = document.createElement("option");
  all.value = "";
  all.textContent = "All themes";
  theme.appendChild(all);
  Object.keys(names).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (name) {
    var o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    theme.appendChild(o);
  });
  theme.value = chosen || "";
}
function woSyncLang() {
  var en = document.getElementById("wo-lang-en");
  var ko = document.getElementById("wo-lang-ko");
  if (!en || !ko) return;
  en.classList.toggle("on", woF.lang !== "ko");
  ko.classList.toggle("on", woF.lang === "ko");
  en.setAttribute("aria-selected", woF.lang !== "ko" ? "true" : "false");
  ko.setAttribute("aria-selected", woF.lang === "ko" ? "true" : "false");
}
function woPruneField(field) {
  var known = {};
  woLangSongs().forEach(function (s) { (s[field] || []).forEach(function (v) { known[v] = 1; }); });
  woF[field] = (woF[field] || []).filter(function (v) { return known[v]; });
}
function woMetaChips(song) {
  var row = document.createElement("div");
  row.className = "meta-chips";
  function add(text) {
    if (!text) return;
    var chip = document.createElement("span");
    chip.className = "meta-chip";
    chip.textContent = text;
    row.appendChild(chip);
  }
  (song.moment || []).forEach(add);
  (song.season || []).forEach(add);
  (song.range || []).forEach(function (v) { add("Range " + v); });
  (song.time || []).forEach(add);
  (song.difficulty || []).forEach(function (v) { add(v.charAt(0).toUpperCase() + v.slice(1)); });
  if (song.scripture) add(song.scripture);
  return row;
}
function woMatchAny(values, selected) {
  if (!selected.length) return true;
  var have = values || [];
  return selected.some(function (item) { return have.indexOf(item) >= 0; });
}
function woLangSongs() {
  return wo.songs.filter(function (s) { return (s.language || "en") === woF.lang; });
}
function woFillChoice(id, field) {
  var box = document.getElementById(id);
  var lab = document.getElementById(id + "-lab");
  if (!box) return;
  box.replaceChildren();
  var values = {};
  woLangSongs().forEach(function (s) { (s[field] || []).forEach(function (v) { values[v] = 1; }); });
  var keys = Object.keys(values).sort(function (a, b) { return a.localeCompare(b); });
  if (lab) lab.hidden = !keys.length;
  box.hidden = !keys.length;
  keys.forEach(function (val) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (woF[field].indexOf(val) >= 0 ? " on" : "");
    b.textContent = val;
    b.onclick = function () {
      var at = woF[field].indexOf(val);
      if (at >= 0) woF[field].splice(at, 1); else woF[field].push(val);
      b.classList.toggle("on");
      woRenderLib();
    };
    box.appendChild(b);
  });
}
function woFilteredSongs() {
  var q = (document.getElementById("wo-q").value || "").trim().toLowerCase();
  var list = wo.songs.filter(function (s) {
    if ((s.language || "en") !== woF.lang) return false;
    var speed = woSpeedOf(s);
    if (woF.speed !== "all" && speed !== woF.speed) return false;
    if (woF.artist && s.artist !== woF.artist) return false;
    if (woF.theme && (s.themes || []).indexOf(woF.theme) < 0) return false;
    if (!woMatchAny(s.moment, woF.moment)) return false;
    if (!woMatchAny(s.season, woF.season)) return false;
    if (!woMatchAny(s.range, woF.range)) return false;
    if (!woMatchAny(s.time, woF.time)) return false;
    if (!woMatchAny(s.difficulty, woF.difficulty)) return false;
    if (woF.scripture && String(s.scripture || "").toLowerCase().indexOf(woF.scripture) < 0) return false;
    if (!q) return true;
    var hay = woF.titleOnly ? s.title : s.title + " " + (s.artist || "");
    return hay.toLowerCase().indexOf(q) >= 0;
  });
  if (woF.az) list = list.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
  return list;
}
function woRenderLib() {
  var pane = document.getElementById("wo-lib");
  var keep = pane ? pane.scrollTop : 0;
  woInitFilters();
  var box = document.getElementById("wo-list");
  box.replaceChildren();
  var list = woFilteredSongs();
  var count = document.getElementById("wo-count");
  if (count) count.textContent = list.length + (list.length === 1 ? " song" : " songs");
  var badge = document.getElementById("wo-filter-n");
  var active = woActiveFilters();
  if (badge) { badge.hidden = active === 0; badge.textContent = String(active); }
  list.forEach(function (s) {
    var row = document.createElement("div");
    row.className = "wrow";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wopen";
    b.innerHTML = "<b></b><span></span>";
    b.querySelector("b").textContent = s.title;
    var speed = woSpeedOf(s);
    b.querySelector("span").textContent = (s.artist ? s.artist + " · " : "") + "Key " + woSharpKey(s.key) + (speed ? " · " + speed.charAt(0).toUpperCase() + speed.slice(1) : "") + (s.tempo ? " · " + s.tempo + " BPM" : "");
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    b.onclick = function () { location.hash = "#/worship/song/" + encodeURIComponent(s.id); };
    var add = document.createElement("button");
    add.type = "button";
    add.className = "wadd";
    add.textContent = "Add";
    add.setAttribute("aria-label", "Add " + s.title + " to a setlist");
    add.onclick = function () { woShowAddPicker(s.id); };
    row.appendChild(b);
    row.appendChild(add);
    box.appendChild(row);
  });
  if (!box.childElementCount) {
    var p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No songs match.";
    box.appendChild(p);
  }
  if (pane) {
    pane.scrollTop = keep;
    requestAnimationFrame(function () { pane.scrollTop = keep; });
  }
}
function woOpen(id, keyName, fromRoute) {
  var s = wo.byId[id];
  if (!s) return;
  if (!fromRoute) {
    var extra = keyName && keyName !== s.key ? "/" + encodeURIComponent(keyName) : "";
    location.hash = "#/worship/song/" + encodeURIComponent(id) + extra;
    return;
  }
  wo.cur = s;
  var pref = woPrefs()[id] || {};
  if (keyName) {
    wo.semi = (woPc(keyName) - woPc(s.key) + 12) % 12;
    wo.flats = false;
  } else if (pref.semi != null) {
    wo.semi = pref.semi;
    wo.flats = false;
  } else {
    wo.semi = 0;
    wo.flats = false;
  }
  woShow("song");
  if (!document.body.classList.contains("wo-split")) scrollTo(0, 0);
}
function woToolBtn(label, fn, pressed) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "wmini" + (pressed ? " on" : "");
  b.textContent = label;
  b.setAttribute("aria-pressed", pressed ? "true" : "false");
  b.onclick = fn;
  return b;
}
function woRenderSong() {
  var s = wo.cur;
  var box = document.getElementById("wo-song");
  box.replaceChildren();
  var back = document.createElement("button");
  back.type = "button"; back.className = "lnkbtn"; back.textContent = "← Library";
  back.onclick = function () { location.hash = "#/worship/library"; };
  var h = document.createElement("h1"); h.textContent = s.title;
  var sub = document.createElement("p"); sub.className = "muted"; sub.style.margin = "0";
  sub.textContent = [s.artist, "original key " + woSharpKey(s.key), s.tempo ? s.tempo + " BPM" : ""].filter(Boolean).join(" · ");
  var concert = document.createElement("p");
  concert.className = "muted"; concert.style.margin = "4px 0 0";
  concert.textContent = "Key " + woKeyNow();
  var tools = document.createElement("div"); tools.className = "wtools";
  function bumped(fn) { return function () { fn(); woSavePref(s.id); woRenderSong(); }; }
  tools.appendChild(woToolBtn("−", bumped(function () { wo.semi--; }), false));
  var key = document.createElement("b"); key.className = "wkeyname"; key.textContent = woKeyNow();
  tools.appendChild(key);
  tools.appendChild(woToolBtn("+", bumped(function () { wo.semi++; }), false));
  tools.appendChild(woToolBtn("Reset", bumped(function () { wo.semi = 0; wo.flats = false; }), false));
  tools.appendChild(woToolBtn("Numbers", function () { woSetNumbers(!woNumbersOn()); woRenderSong(); }, woNumbersOn()));
  tools.appendChild(woToolBtn("Lyrics only", function () { woSetLyrics(!woLyricsOn()); woRenderSong(); }, woLyricsOn()));
  if (s.youtube) {
    var listen = document.createElement("a");
    listen.className = "wmini"; listen.href = s.youtube; listen.target = "_blank"; listen.rel = "noopener"; listen.textContent = "Listen";
    tools.appendChild(listen);
  }
  tools.appendChild(woToolBtn("Play", function () { woEnterPlay(false); }, false));
  tools.appendChild(woToolBtn("Add to setlist", function () { woShowAddPicker(s.id); }, false));
  var note = document.createElement("textarea");
  note.placeholder = "Personal note for this song";
  note.value = woSongNote(s.id);
  note.addEventListener("input", function () { woSongNote(s.id, note.value); });
  var chips = woMetaChips(s);
  box.appendChild(back); box.appendChild(h); box.appendChild(sub); box.appendChild(concert);
  if (chips.childElementCount) box.appendChild(chips);
  box.appendChild(tools); box.appendChild(note);
  box.appendChild(woChart(s));
}
function woId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function woNextSunday() {
  var d = new Date(), add = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function woDateLabel(iso) {
  var parts = String(iso || "").split("-");
  if (parts.length < 3) return iso || "No date";
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function woShortDate(iso) {
  var parts = String(iso || "").split("-");
  if (parts.length < 3) return iso || "";
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
var WO_LEADERS = ["Pastor Woori", "Palmy", "Daniel"];
function woDefaultLeader() { return WO_LEADERS[0]; }
function woDefaultTitle(iso, leader) {
  return "EM Setlist - " + woShortDate(iso || woNextSunday()) + " - " + (leader || woDefaultLeader());
}
function woTitleIsAuto(title, iso) {
  if (!title) return true;
  var prefix = "EM Setlist - " + woShortDate(iso || woNextSunday()) + " - ";
  return title.indexOf(prefix) === 0;
}
function woTitleWasEdited(set) {
  if (!set) return false;
  if (set.titleEdited === true) return true;
  if (!set.title) return !!set.service;
  return !woTitleIsAuto(set.title, set.date);
}
function woSetTitle(set) {
  if (set && set.title) return set.title;
  if (set && set.service) return set.service;
  return "Setlist";
}
function woLangLabel(code) {
  if (code === "ko") return "Korean";
  if (code === "en") return "English";
  return "";
}
function woNormalizeSet(set) {
  set = set || {};
  return {
    id: set.id || woId(),
    date: set.date || "",
    title: set.title || "",
    titleEdited: set.titleEdited === true,
    service: set.service === "Korean Service" ? "Korean Service" : (set.service === "English Service" ? "English Service" : (set.service || "")),
    language: set.language === "ko" || set.language === "en" ? set.language : "",
    leader: WO_LEADERS.indexOf(set.leader) >= 0 ? set.leader : "",
    leaderNote: set.leaderNote || "",
    songs: Array.isArray(set.songs) ? set.songs : [],
    updatedAt: set.updatedAt || "",
    change: set.change || ""
  };
}
function woBlankSet() {
  return { id: woId(), date: woNextSunday(), title: "", titleEdited: false, service: "English Service", language: "en", leader: woDefaultLeader(), leaderNote: "", songs: [] };
}
function woLoadSets() {
  var list = null;
  try { list = JSON.parse(localStorage.getItem("bethany-worship-sets") || "null"); } catch (e) { list = null; }
  if (!Array.isArray(list)) {
    try {
      var old = JSON.parse(localStorage.getItem(WO_SET) || "null");
      if (old && Array.isArray(old.songs)) list = [old];
    } catch (e2) { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  var changed = false;
  var out = list.map(function (set) {
    var next = woNormalizeSet(set);
    if (!set || !set.id || set.title == null || set.leader == null || set.service == null || set.language == null || !Array.isArray(set.songs)) changed = true;
    return next;
  });
  if (changed) localStorage.setItem("bethany-worship-sets", JSON.stringify(out));
  return out;
}
function woSaveSets(list) { localStorage.setItem("bethany-worship-sets", JSON.stringify(list)); }
function woGetSet(id) {
  var found = null;
  woLoadSets().forEach(function (s) { if (s.id === id) found = s; });
  return found;
}
function woLoadSet() { return woGetSet(wo.setId) || woBlankSet(); }
function woSaveSet(set) {
  var list = woLoadSets(), i = -1;
  list.forEach(function (s, idx) { if (s.id === set.id) i = idx; });
  if (i < 0) list.unshift(set); else list[i] = set;
  woSaveSets(list);
}
function woSongKey(songId) {
  var song = wo.byId[songId];
  if (!song) return "C";
  if (wo.cur && wo.cur.id === songId) return woKeyNow();
  return woSharpKey(song.key);
}
function woAddToSet(setId, songId) {
  var set = woGetSet(setId);
  var song = wo.byId[songId];
  if (!set || !song) return;
  var key = woSongKey(songId);
  set.songs.push({ id: songId, key: key, note: "" });
  woSaveSet(set);
  wo.setId = setId;
  woCloseAddPicker();
  var msg = "Added to " + woSetTitle(set) + " in " + key + ".";
  if (wo.view === "song" && document.getElementById("wo-song")) {
    var n = document.createElement("p");
    n.className = "muted";
    n.textContent = msg;
    document.getElementById("wo-song").appendChild(n);
    return;
  }
  var note = document.getElementById("wo-added");
  if (!note) {
    note = document.createElement("p");
    note.id = "wo-added";
    note.className = "muted";
    var list = document.getElementById("wo-list");
    if (list) list.parentNode.insertBefore(note, list);
  }
  if (note) { note.hidden = false; note.textContent = msg; }
}
function woCloseAddPicker() {
  var panel = document.getElementById("wo-add-pick");
  if (panel) panel.remove();
}
function woShowAddPicker(songId) {
  if (!wo.byId[songId]) return;
  woCloseAddPicker();
  var panel = document.createElement("div");
  panel.id = "wo-add-pick";
  panel.className = "card wo-addpick";
  var h = document.createElement("h3");
  h.textContent = "Add to setlist";
  panel.appendChild(h);
  woLoadSets().forEach(function (set) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-out";
    b.textContent = woSetTitle(set);
    b.onclick = function () { woAddToSet(set.id, songId); };
    panel.appendChild(b);
  });
  var created = document.createElement("button");
  created.type = "button";
  created.className = "btn btn-teal";
  created.textContent = "New setlist";
  created.onclick = function () {
    var set = woBlankSet();
    set.title = woDefaultTitle(set.date, woDefaultLeader());
    set.leader = woDefaultLeader();
    set.titleEdited = false;
    var sets = woLoadSets();
    sets.unshift(set);
    woSaveSets(sets);
    woAddToSet(set.id, songId);
  };
  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-out";
  cancel.textContent = "Cancel";
  cancel.onclick = woCloseAddPicker;
  panel.appendChild(created);
  panel.appendChild(cancel);
  document.getElementById("s-worship").appendChild(panel);
}
function woOpenNew(date) {
  wo.newOpen = true;
  wo.newDate = date || woNextSunday();
  var dateEl = document.getElementById("wo-new-date");
  var titleEl = document.getElementById("wo-new-title");
  var leaderEl = document.getElementById("wo-new-leader");
  var service = document.getElementById("wo-new-service");
  var lang = document.getElementById("wo-new-lang");
  var err = document.getElementById("wo-new-err");
  if (dateEl) dateEl.value = wo.newDate;
  if (leaderEl) leaderEl.value = woDefaultLeader();
  wo.titleEdited = false;
  wo.titleDefault = woDefaultTitle(wo.newDate, woDefaultLeader());
  if (titleEl) titleEl.value = wo.titleDefault;
  if (service) service.value = "English Service";
  if (lang) lang.value = "en";
  if (err) { err.hidden = true; err.textContent = ""; }
}
function woNewSet() {
  woOpenNew(woNextSunday());
  if ((location.hash || "").replace(/^#\/?/, "") === "worship/setlists") woShow("sets");
  else location.hash = "#/worship/setlists";
}
function woCancelNew() {
  wo.newOpen = false;
  woRenderSets();
}
function woCreateSet() {
  var dateEl = document.getElementById("wo-new-date");
  var titleEl = document.getElementById("wo-new-title");
  var leaderEl = document.getElementById("wo-new-leader");
  var serviceEl = document.getElementById("wo-new-service");
  var langEl = document.getElementById("wo-new-lang");
  var err = document.getElementById("wo-new-err");
  var date = dateEl && dateEl.value ? dateEl.value : woNextSunday();
  var leader = leaderEl && WO_LEADERS.indexOf(leaderEl.value) >= 0 ? leaderEl.value : woDefaultLeader();
  var title = titleEl ? titleEl.value.trim() : "";
  var service = serviceEl && serviceEl.value === "Korean Service" ? "Korean Service" : "English Service";
  var language = langEl && langEl.value === "ko" ? "ko" : "en";
  if (!title) title = woDefaultTitle(date, leader);
  if (err) err.hidden = true;
  var set = woBlankSet();
  set.date = date;
  set.leader = leader;
  set.title = title;
  set.titleEdited = title !== woDefaultTitle(date, leader);
  set.service = service;
  set.language = language;
  var sets = woLoadSets();
  sets.unshift(set);
  woSaveSets(sets);
  wo.newOpen = false;
  wo.focusDate = "";
  location.hash = "#/worship/setlists/" + set.id;
}
function woSyncServiceLang(input, lang) {
  if (!input || !lang) return;
  var v = input.value.trim().toLowerCase();
  if (v === "english service") lang.value = "en";
  else if (v === "korean service") lang.value = "ko";
}
function woRenderSets() {
  var form = document.getElementById("wo-new");
  if (form) form.hidden = !wo.newOpen;
  var box = document.getElementById("wo-sets-list");
  box.replaceChildren();
  var sets = woLoadSets();
  var groups = {};
  sets.forEach(function (set) {
    var key = set.date || "";
    if (!groups[key]) groups[key] = [];
    groups[key].push(set);
  });
  if (wo.focusDate && !groups[wo.focusDate]) groups[wo.focusDate] = [];
  var dates = Object.keys(groups).sort();
  if (!dates.length) {
    var empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No setlists yet.";
    box.appendChild(empty);
    return;
  }
  dates.forEach(function (date) {
    var h = document.createElement("h2");
    h.id = "wo-day-" + (date || "none");
    h.textContent = woDateLabel(date);
    box.appendChild(h);
    if (!groups[date].length) {
      var none = document.createElement("p");
      none.className = "muted";
      none.textContent = "No setlists for this day.";
      box.appendChild(none);
    }
    groups[date].forEach(function (set) {
      var card = document.createElement("div");
      card.className = "card";
      var title = document.createElement("h3");
      title.textContent = woSetTitle(set);
      var count = document.createElement("p");
      count.className = "muted";
      count.style.margin = "0";
      var n = (set.songs || []).length;
      var lang = woLangLabel(set.language);
      count.textContent = (lang ? lang + " · " : "") + n + (n === 1 ? " song" : " songs");
      var row = document.createElement("div");
      row.className = "wtools";
      row.appendChild(woToolBtn("Open", function () { location.hash = "#/worship/setlists/" + set.id; }, false));
      row.appendChild(woToolBtn("Play", function () { wo.setId = set.id; wo.cur = null; woEnterPlay(true); }, false));
      row.appendChild(woToolBtn("Share", function () { woShare(set.id, "wo-share-list"); }, false));
      row.appendChild(woToolBtn("Delete", function () {
        if (!confirm("Delete this setlist?")) return;
        woSaveSets(woLoadSets().filter(function (s) { return s.id !== set.id; }));
        woRenderSets();
      }, false));
      card.appendChild(title); card.appendChild(count); card.appendChild(row);
      box.appendChild(card);
    });
  });
  if (wo.focusDate) {
    var day = document.getElementById("wo-day-" + wo.focusDate);
    wo.focusDate = "";
    if (day) day.scrollIntoView({ block: "start" });
  }
}
function woRenderSet() {
  var set = woLoadSet();
  var heading = document.querySelector("#wo-edit h1");
  if (heading) heading.textContent = woSetTitle(set);
  var titleInput = document.getElementById("wo-title");
  if (titleInput && document.activeElement !== titleInput) titleInput.value = set.title || "";
  var leaderPick = document.getElementById("wo-set-leader");
  if (leaderPick && document.activeElement !== leaderPick) leaderPick.value = WO_LEADERS.indexOf(set.leader) >= 0 ? set.leader : woDefaultLeader();
  document.getElementById("wo-date").value = set.date || "";
  var service = document.getElementById("wo-service");
  if (service && document.activeElement !== service) service.value = set.service === "Korean Service" ? "Korean Service" : "English Service";
  var lang = document.getElementById("wo-set-lang");
  if (lang && document.activeElement !== lang) lang.value = set.language || "";
  var lead = document.getElementById("wo-leader");
  if (lead && document.activeElement !== lead) lead.value = set.leaderNote || "";
  var banner = document.getElementById("wo-leader-banner");
  if (banner) {
    banner.hidden = !set.leaderNote;
    banner.textContent = set.leaderNote || "";
  }
  var liveBox = document.getElementById("wo-live-box");
  var liveOff = document.getElementById("wo-live-off");
  var liveOn = woLiveEnabled();
  if (liveBox) liveBox.hidden = !liveOn;
  if (liveOff) liveOff.hidden = liveOn;
  var box = document.getElementById("wo-set");
  box.replaceChildren();
  if (!set.songs.length) {
    var p = document.createElement("p"); p.className = "muted"; p.textContent = "No songs yet."; box.appendChild(p); return;
  }
  set.songs.forEach(function (item, i) {
    var song = wo.byId[item.id];
    var card = document.createElement("div");
    card.className = "setcard";
    var line1 = document.createElement("div");
    line1.className = "setline";
    var handle = document.createElement("button");
    handle.type = "button"; handle.className = "whandle"; handle.textContent = "⋮⋮";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.addEventListener("pointerdown", function (e) { woDrag(e, i); });
    var name = document.createElement("button");
    name.type = "button"; name.className = "lnkbtn settitle";
    name.textContent = song ? song.title : item.id;
    name.onclick = function () { if (song) location.hash = "#/worship/song/" + encodeURIComponent(item.id) + "/" + encodeURIComponent(item.key); };
    var del = document.createElement("button");
    del.type = "button"; del.className = "wmini setx"; del.textContent = "✕";
    del.setAttribute("aria-label", "Remove");
    del.onclick = function () { var s = woLoadSet(); s.songs.splice(i, 1); woSaveSet(s); woRenderSet(); };
    line1.appendChild(handle); line1.appendChild(name); line1.appendChild(del);
    var line2 = document.createElement("div");
    line2.className = "setline";
    var up = document.createElement("button");
    up.type = "button"; up.className = "wmini wicon"; up.textContent = "↑"; up.setAttribute("aria-label", "Move up");
    up.onclick = function () { woMove(i, -1); };
    var down = document.createElement("button");
    down.type = "button"; down.className = "wmini wicon"; down.textContent = "↓"; down.setAttribute("aria-label", "Move down");
    down.onclick = function () { woMove(i, 1); };
    var minus = document.createElement("button");
    minus.type = "button"; minus.className = "wmini wicon"; minus.textContent = "−"; minus.setAttribute("aria-label", "Lower key");
    minus.onclick = function () { woNudgeSet(i, -1); };
    var key = document.createElement("span"); key.className = "wkeyname"; key.textContent = woSharpKey(item.key);
    var plus = document.createElement("button");
    plus.type = "button"; plus.className = "wmini wicon"; plus.textContent = "+"; plus.setAttribute("aria-label", "Raise key");
    plus.onclick = function () { woNudgeSet(i, 1); };
    line2.appendChild(up); line2.appendChild(down); line2.appendChild(minus); line2.appendChild(key); line2.appendChild(plus);
    var noteIn = document.createElement("input");
    noteIn.className = "setnote";
    noteIn.value = item.note || "";
    noteIn.placeholder = "Short note";
    noteIn.setAttribute("aria-label", "Note for " + (song ? song.title : item.id));
    noteIn.addEventListener("change", function () {
      var current = woLoadSet();
      if (!current.songs[i]) return;
      current.songs[i].note = noteIn.value;
      woSaveSet(current);
    });
    card.appendChild(line1); card.appendChild(line2); card.appendChild(noteIn);
    box.appendChild(card);
  });
}
function woMove(i, dir) {
  var set = woLoadSet();
  var j = i + dir;
  if (j < 0 || j >= set.songs.length) return;
  var item = set.songs.splice(i, 1)[0];
  set.songs.splice(j, 0, item);
  woSaveSet(set);
  woRenderSet();
}
function woNudgeSet(i, dir) {
  var set = woLoadSet();
  var song = wo.byId[set.songs[i].id];
  if (!song) return;
  var next = woSpell(woPc(set.songs[i].key) + dir);
  set.songs[i].key = next;
  woSaveSet(set);
  woRenderSet();
}
function woDrag(e, from) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  var handle = e.currentTarget;
  var card = handle.closest(".setcard");
  if (card) card.classList.add("dragging");
  try { handle.setPointerCapture(e.pointerId); } catch (err) {}
  function dropIndex(y) {
    var cards = document.querySelectorAll("#wo-set .setcard");
    var to = 0;
    for (var n = 0; n < cards.length; n++) {
      var rect = cards[n].getBoundingClientRect();
      if (y > rect.top + rect.height / 2) to = n;
    }
    return to;
  }
  function finish(ev) {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    var to = dropIndex(ev.clientY);
    var set = woLoadSet();
    if (to !== from && set.songs[from]) {
      var item = set.songs.splice(from, 1)[0];
      set.songs.splice(to, 0, item);
      woSaveSet(set);
    }
    woRenderSet();
  }
  function move() {}
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}
function woDateChanged() {
  var set = woLoadSet();
  set.date = document.getElementById("wo-date").value;
  woSaveSet(set);
}
function woServiceChanged() {
  var set = woLoadSet();
  var service = document.getElementById("wo-service");
  var lang = document.getElementById("wo-set-lang");
  set.service = service ? service.value.trim() : "";
  woSyncServiceLang(service, lang);
  if (lang) set.language = lang.value === "ko" || lang.value === "en" ? lang.value : "";
  woSaveSet(set);
  var heading = document.querySelector("#wo-edit h1");
  if (heading) heading.textContent = woSetTitle(set);
}
function woTitleChanged() {
  var set = woLoadSet();
  var input = document.getElementById("wo-title");
  var leaderEl = document.getElementById("wo-set-leader");
  set.title = input ? input.value.trim() : "";
  var leader = leaderEl && WO_LEADERS.indexOf(leaderEl.value) >= 0 ? leaderEl.value : (set.leader || woDefaultLeader());
  set.titleEdited = set.title !== woDefaultTitle(set.date, leader);
  woSaveSet(set);
  var heading = document.querySelector("#wo-edit h1");
  if (heading) heading.textContent = woSetTitle(set);
}
function woApplyAutoTitle(titleEl, iso, leader) {
  if (!titleEl || wo.titleEdited) return;
  var next = woDefaultTitle(iso, leader);
  titleEl.value = next;
  wo.titleDefault = next;
}
function woNewDateChanged() {
  var dateEl = document.getElementById("wo-new-date");
  var titleEl = document.getElementById("wo-new-title");
  var leaderEl = document.getElementById("wo-new-leader");
  if (!dateEl || !titleEl) return;
  var leader = leaderEl ? leaderEl.value : woDefaultLeader();
  if (!titleEl.value.trim() || titleEl.value === wo.titleDefault) wo.titleEdited = false;
  woApplyAutoTitle(titleEl, dateEl.value, leader);
  wo.titleDefault = woDefaultTitle(dateEl.value, leader);
}
function woNewLeaderChanged() {
  var dateEl = document.getElementById("wo-new-date");
  var titleEl = document.getElementById("wo-new-title");
  var leaderEl = document.getElementById("wo-new-leader");
  if (!titleEl || !leaderEl) return;
  var iso = dateEl && dateEl.value ? dateEl.value : woNextSunday();
  woApplyAutoTitle(titleEl, iso, leaderEl.value);
  wo.titleDefault = woDefaultTitle(iso, leaderEl.value);
}
function woNewTitleInput() {
  var dateEl = document.getElementById("wo-new-date");
  var titleEl = document.getElementById("wo-new-title");
  var leaderEl = document.getElementById("wo-new-leader");
  if (!titleEl) return;
  var iso = dateEl && dateEl.value ? dateEl.value : woNextSunday();
  var leader = leaderEl ? leaderEl.value : woDefaultLeader();
  wo.titleEdited = titleEl.value.trim() !== woDefaultTitle(iso, leader);
}
function woSetLeaderChanged() {
  var set = woLoadSet();
  var leaderEl = document.getElementById("wo-set-leader");
  var titleEl = document.getElementById("wo-title");
  var leader = leaderEl && WO_LEADERS.indexOf(leaderEl.value) >= 0 ? leaderEl.value : woDefaultLeader();
  set.leader = leader;
  if (!woTitleWasEdited(set)) {
    set.title = woDefaultTitle(set.date, leader);
    set.titleEdited = false;
    if (titleEl) titleEl.value = set.title;
    var heading = document.querySelector("#wo-edit h1");
    if (heading) heading.textContent = woSetTitle(set);
  }
  woSaveSet(set);
}
function woSetLangChanged() {
  var set = woLoadSet();
  var lang = document.getElementById("wo-set-lang");
  set.language = lang && (lang.value === "en" || lang.value === "ko") ? lang.value : "";
  woSaveSet(set);
  woRenderSet();
}
function woLeaderChanged() {
  var set = woLoadSet();
  set.leaderNote = document.getElementById("wo-leader").value;
  woSaveSet(set);
  var banner = document.getElementById("wo-leader-banner");
  if (banner) { banner.hidden = !set.leaderNote; banner.textContent = set.leaderNote || ""; }
}
function woShareUrl(set) {
  var payload = { id: set.id, d: set.date, t: set.title || "", svc: set.service || "", lang: set.language || "", ldr: set.leader || "", n: set.leaderNote || "", s: (set.songs || []).map(function (x) { return [x.id, x.key, x.note || ""]; }) };
  var enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.origin + location.pathname + location.search + "#/worship/set/" + enc;
}
function woShare(id, field) {
  var set = woGetSet(id || wo.setId) || woLoadSet();
  var url = woShareUrl(set);
  var out = document.getElementById(field || "wo-share");
  if (!out) return;
  out.hidden = false;
  out.value = url;
  out.focus();
  out.select();
  if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
}
function woReadHash() {
  var h = location.hash || "";
  var m = h.match(/#\/?worship\/set\/([^/?#]+)/);
  if (!m || m[1] === "lists") return null;
  try {
    var b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!data || !Array.isArray(data.s)) return null;
    return data;
  } catch (e) { return null; }
}
function woImport(data) {
  var songs = [], missing = 0;
  data.s.forEach(function (pair) {
    if (!pair || !wo.byId[pair[0]]) { missing++; return; }
    songs.push({ id: pair[0], key: pair[1] || wo.byId[pair[0]].key, note: pair[2] || "" });
  });
  var set = { id: data.id || woId(), date: data.d || woBlankSet().date, title: data.t || "", titleEdited: !!(data.t && !woTitleIsAuto(data.t, data.d || "")), service: data.svc || "", language: data.lang === "ko" || data.lang === "en" ? data.lang : "", leader: WO_LEADERS.indexOf(data.ldr) >= 0 ? data.ldr : "", leaderNote: data.n || "", songs: songs };
  var sets = woLoadSets().filter(function (s) { return s.id !== set.id; });
  sets.unshift(set);
  woSaveSets(sets);
  history.replaceState(null, "", location.pathname + location.search + "#/worship/setlists");
  woShow("sets");
  var note = document.getElementById("wo-import");
  note.hidden = false;
  note.textContent = "Imported a copy of the shared setlist." + (missing ? " " + missing + " song" + (missing > 1 ? "s were" : " was") + " not in the library." : "");
}
function woEnterPlay(fromSet) {
  var set = woLoadSet();
  var inSet = wo.cur && set.songs.some(function (s) { return s.id === wo.cur.id; });
  var list = [];
  if (fromSet || inSet) {
    list = set.songs.map(function (item) { return { song: wo.byId[item.id], key: item.key }; }).filter(function (x) { return x.song; });
  }
  if (!list.length && wo.cur) list = [{ song: wo.cur, key: woKeyNow() }];
  if (!list.length) return;
  wo.playList = list;
  wo.playIndex = 0;
  list.forEach(function (item, i) { if (wo.cur && item.song.id === wo.cur.id) wo.playIndex = i; });
  document.getElementById("wo-play").hidden = false;
  document.body.classList.add("wo-playing");
  woRenderPlay();
  woWake(true);
  if (fromSet) woLiveWatch(true);
}
function woExitPlay() {
  document.getElementById("wo-play").hidden = true;
  document.body.classList.remove("wo-playing");
  woWake(false);
  woLiveWatch(wo.view === "edit");
}
function woRenderPlay() {
  var item = wo.playList[wo.playIndex];
  if (!item) return;
  wo.cur = item.song;
  wo.semi = (woPc(item.key) - woPc(item.song.key) + 12) % 12;
  wo.flats = false;
  document.getElementById("wo-play-title").textContent = item.song.title;
  document.getElementById("wo-play-key").textContent = woKeyNow();
  document.getElementById("wo-play-num").classList.toggle("on", woNumbersOn());
  document.getElementById("wo-play-num").setAttribute("aria-pressed", woNumbersOn() ? "true" : "false");
  var body = document.getElementById("wo-play-body");
  body.replaceChildren(woChart(item.song));
  body.scrollTop = 0;
  document.getElementById("wo-play-pos").textContent = "Song " + (wo.playIndex + 1) + " of " + wo.playList.length;
  document.getElementById("wo-play-lyrics").classList.toggle("on", woLyricsOn());
  document.getElementById("wo-play-body").classList.toggle("lyrics-only", woLyricsOn());
  var jump = document.getElementById("wo-jump");
  if (jump) jump.hidden = true;
}
function woPlayStep(dir) {
  if (!wo.playList || !wo.playList.length) return;
  wo.playIndex = (wo.playIndex + dir + wo.playList.length) % wo.playList.length;
  woRenderPlay();
}
function woTogglePlayNumbers() {
  woSetNumbers(!woNumbersOn());
  woRenderPlay();
}
function woTogglePlayLyrics() {
  woSetLyrics(!woLyricsOn());
  woRenderPlay();
}
function woToggleJump() {
  var box = document.getElementById("wo-jump");
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.replaceChildren();
  (wo.playList || []).forEach(function (item, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = (i + 1) + ". " + item.song.title + (item.key ? " · " + woSharpKey(item.key) : "");
    b.onclick = function () { wo.playIndex = i; box.hidden = true; woRenderPlay(); };
    box.appendChild(b);
  });
  box.hidden = false;
}
function woSwipePlay(e) {
  if (!wo.playList || wo.playList.length < 2) return;
  var t = e.changedTouches && e.changedTouches[0];
  if (!t || !wo.touchX) return;
  var dx = t.clientX - wo.touchX, dy = t.clientY - wo.touchY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
  woPlayStep(dx < 0 ? 1 : -1);
}
function woLiveEnabled() {
  if (woBackendEnabled()) return true;
  return typeof LIVE_SETLIST_ENDPOINT === "string" && LIVE_SETLIST_ENDPOINT.length > 0;
}
function woLiveMsg(text) {
  var el = document.getElementById("wo-live-msg");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}
function woShowLiveBanner(iso, change) {
  var when = "";
  try { when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch (e) {}
  var text = "Updated " + when + ": " + (change || "setlist");
  ["wo-live-banner", "wo-play-banner"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  });
}
function woJsonp(params) {
  return new Promise(function (resolve, reject) {
    if (!woLiveEnabled()) { reject(); return; }
    var cb = "woLive_" + Date.now() + Math.floor(Math.random() * 1000);
    var script = document.createElement("script");
    var q = Object.keys(params).map(function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]); }).join("&");
    var timer = setTimeout(function () { cleanup(); reject(); }, 15000);
    function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = function (data) { cleanup(); resolve(data); };
    script.onerror = function () { cleanup(); reject(); };
    script.src = LIVE_SETLIST_ENDPOINT + (LIVE_SETLIST_ENDPOINT.indexOf("?") >= 0 ? "&" : "?") + q + "&callback=" + cb;
    document.body.appendChild(script);
  });
}
function woLivePull() {
  if (!woLiveEnabled() || !wo.setId) return;
  var pull = woBackendEnabled() ? woApi({ action: "get", id: wo.setId }) : woJsonp({ id: wo.setId });
  pull.then(function (data) {
    if (woStillLocked(data)) { woPrivateMsg(woLockedMessage(data)); return; }
    if (!data || !data.found) return;
    var set = woGetSet(wo.setId);
    if (!set) return;
    if (set.updatedAt && data.updatedAt && data.updatedAt <= set.updatedAt) return;
    set.songs = data.songs || [];
    set.leaderNote = data.leaderNote || "";
    if (data.date) set.date = data.date;
    if (data.service != null) set.service = data.service;
    if (data.language === "en" || data.language === "ko" || data.language === "") set.language = data.language;
    set.updatedAt = data.updatedAt;
    set.change = data.change || "";
    woSaveSet(set);
    if (wo.view === "edit") woRenderSet();
    woShowLiveBanner(data.updatedAt, data.change);
  }).catch(function () {});
}
function woLiveWatch(on) {
  if (wo.liveTimer) { clearInterval(wo.liveTimer); wo.liveTimer = 0; }
  if (!on || !woLiveEnabled() || !wo.setId) return;
  woLivePull();
  wo.liveTimer = setInterval(woLivePull, 30000);
}
function woPublish() {
  if (!woLiveEnabled()) { woLiveMsg("Live publishing isn't set up yet."); return; }
  var changeEl = document.getElementById("wo-change");
  var change = (changeEl && changeEl.value.trim()) || "Updated setlist";
  var set = woLoadSet();
  var body = { id: set.id, date: set.date, service: set.service || "", language: set.language || "", leader: set.leader || "", leaderNote: set.leaderNote || "", change: change, songs: set.songs || [] };
  var encoded = JSON.stringify(body);
  var done = function (res) {
    if (woStillLocked(res)) { woLiveMsg(woLockedMessage(res)); return; }
    if (!res || !res.ok) { woLiveMsg(woBackendError(res, "Couldn't publish.")); return; }
    set.updatedAt = res.updatedAt;
    set.change = change;
    woSaveSet(set);
    woLiveMsg("");
    woShowLiveBanner(res.updatedAt, change);
  };
  if (woBackendEnabled()) {
    woApi({ action: "publish", payload: encoded }).then(done).catch(function () { woLiveMsg("Couldn't reach the live sheet."); });
    return;
  }
  if (encoded.length < 6000) {
    woJsonp({ action: "publish", payload: encoded }).then(done).catch(function () { woLiveMsg("Couldn't reach the live sheet."); });
    return;
  }
  fetch(LIVE_SETLIST_ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: encoded }).then(function () {
    woLiveMsg("Sent.");
  }).catch(function () { woLiveMsg("Couldn't reach the live sheet."); });
}
function woThisSunday() {
  var target = woNextSunday();
  wo.focusDate = target;
  var found = woLoadSets().some(function (s) { return s.date === target; });
  if (!found) woOpenNew(target);
  else wo.newOpen = false;
  if ((location.hash || "").replace(/^#\/?/, "") === "worship/setlists") woShow("sets");
  else location.hash = "#/worship/setlists";
}
function woWake(on) {
  if (!on) {
    if (wo.wake) { wo.wake.release().catch(function () {}); wo.wake = null; }
    return;
  }
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request("screen").then(function (lock) { wo.wake = lock; }).catch(function () {});
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && document.body.classList.contains("wo-playing")) woWake(true);
});
function woApplyRoute() {
  var path = (location.hash || "").replace(/^#\/?/, "");
  if (path.indexOf("worship") !== 0) return;
  wo.songsRouted = true;
  var share = woReadHash();
  if (share) {
    if (!wo.songs.length) { woPending = share; return; }
    woImport(share);
    return;
  }
  var parts = path.split("/");
  var sub = parts[1] || "library";
  if (sub === "setlists" && parts[2]) {
    wo.setId = decodeURIComponent(parts[2]);
    if (!woGetSet(wo.setId)) { location.replace("#/worship/setlists"); return; }
    woShow("edit");
  } else if (sub === "setlists") woShow("sets");
  else if (sub === "song" && parts[2]) {
    if (!wo.byId[decodeURIComponent(parts[2])]) return;
    woOpen(decodeURIComponent(parts[2]), parts[3] ? decodeURIComponent(parts[3]) : null, true);
  } else if (sub === "add") woShow("add");
  else woShow("lib");
}
function worshipRoute() { woApplyRoute(); }
document.getElementById("wo-q").addEventListener("input", woRenderLib);
document.getElementById("wo-date").addEventListener("change", woDateChanged);
document.getElementById("wo-title").addEventListener("change", woTitleChanged);
document.getElementById("wo-new-date").addEventListener("change", woNewDateChanged);
document.getElementById("wo-new-title").addEventListener("input", woNewTitleInput);
document.getElementById("wo-new-leader").addEventListener("change", woNewLeaderChanged);
document.getElementById("wo-set-leader").addEventListener("change", woSetLeaderChanged);
document.getElementById("wo-service").addEventListener("change", woServiceChanged);
document.getElementById("wo-set-lang").addEventListener("change", woSetLangChanged);
document.getElementById("wo-new-service").addEventListener("change", function () { woSyncServiceLang(document.getElementById("wo-new-service"), document.getElementById("wo-new-lang")); });
document.getElementById("wo-leader").addEventListener("change", woLeaderChanged);
addEventListener("hashchange", worshipRoute);
addEventListener("resize", function () {
  if (!document.body.classList.contains("in-worship")) return;
  if (woTablet() === woWasTablet) return;
  woShow(wo.view);
});
var woPlayBody = document.getElementById("wo-play-body");
if (woPlayBody) {
  woPlayBody.addEventListener("touchstart", function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    wo.touchX = t.clientX;
    wo.touchY = t.clientY;
  }, { passive: true });
  woPlayBody.addEventListener("touchend", woSwipePlay, { passive: true });
}
worshipRoute();
woLoadSongs();
