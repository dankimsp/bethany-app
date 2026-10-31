var WO_KEY = "bethany-worship-key";
var WO_NUM = "bethany-worship-numbers";
var WO_SET = "bethany-worship-set";
var SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
var wo = { songs: [], byId: {}, view: "lib", cur: null, semi: 0, flats: false, auto: false, wake: null, raf: 0, meta: null };
var woPending = null;

function woPc(note) {
  var m = String(note || "").trim().match(/^([A-G])([#b])?/);
  if (!m) return 0;
  var n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (m[2] === "#") n++;
  if (m[2] === "b") n--;
  return (n + 12) % 12;
}
function woSpell(n, flats) { return (flats ? FLAT : SHARP)[(n + 12) % 12]; }
function woParseChord(ch) {
  var m = String(ch || "").trim().match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/);
  if (!m) return null;
  return { root: woPc(m[1]), q: m[2] || "", bass: m[3] ? woPc(m[3]) : null };
}
function woQuality(q) {
  var r = q || "", out = "";
  if (/^m(?!aj)/.test(r) || /^min\b/.test(r)) out += "m";
  if (/maj7|ma7|M7/.test(r)) out += "maj7";
  else if (/7/.test(r)) out += "7";
  if (/sus4/.test(r)) out += "sus4";
  else if (/sus2/.test(r)) out += "sus2";
  else if (/sus/.test(r)) out += "sus";
  if (/dim/.test(r)) out += "dim";
  if (/aug/.test(r)) out += "aug";
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
function woParseCho(text, id) {
  var song = { id: id || "song", title: "", artist: "", key: "C", youtube: "", sections: [] };
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
      if (seg.c && !woParseChord(seg.c)) errors.push("Unrecognized chord: " + seg.c);
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
function woKeyFor(song) { return woSpell(woPc(song.key) + wo.semi, wo.flats); }
function woKeyNow() { return wo.cur ? woKeyFor(wo.cur) : "C"; }
function woLabel(ch, song) {
  if (!ch) return "";
  var shown = woTranspose(ch, wo.semi, wo.flats);
  if (!woNumbersOn()) return shown;
  return woNashville(shown, woPc(woKeyFor(song)));
}
function woChart(song) {
  var root = document.createElement("div");
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
        c.textContent = seg.c ? woLabel(seg.c, song) : "\u00a0";
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
function woB64(buf) {
  var bytes = new Uint8Array(buf), s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function woFromB64(s) {
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function woLoadMeta() {
  if (wo.meta) return Promise.resolve(wo.meta);
  return fetch("songs.enc.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (meta) {
    if (!meta || meta.iterations < 100000 || meta.iterations > 2000000) throw 0;
    wo.meta = meta;
    return meta;
  });
}
function woDerive(pw, meta) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (mat) {
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: woFromB64(meta.salt), iterations: meta.iterations, hash: "SHA-256" },
      mat, { name: "AES-GCM", length: 256 }, true, ["decrypt"]
    );
  });
}
function woDecrypt(meta, key) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: woFromB64(meta.iv) }, key, woFromB64(meta.ciphertext)).then(function (buf) {
    var list = JSON.parse(new TextDecoder().decode(buf));
    if (!Array.isArray(list)) throw 0;
    wo.songs = list.map(function (item) { return woParseCho(item.cho, item.id); });
    wo.byId = {};
    wo.songs.forEach(function (s) { wo.byId[s.id] = s; });
  });
}
function woShowApp() {
  document.getElementById("wo-lock").hidden = true;
  document.getElementById("wo-app").hidden = false;
  woShow("lib");
  if (woPending) { woImport(woPending); woPending = null; }
}
function woUnlock(ev) {
  if (ev) ev.preventDefault();
  var pw = document.getElementById("wo-pw").value;
  var err = document.getElementById("wo-err");
  var btn = document.querySelector("#wo-form button");
  if (!pw) { err.textContent = "Please enter the worship password."; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Unlocking…"; err.hidden = true;
  woLoadMeta().then(function (meta) {
    return woDerive(pw, meta).then(function (key) { return woDecrypt(meta, key).then(function () { return key; }); });
  }).then(function (key) {
    if (document.getElementById("wo-remember").checked) {
      return crypto.subtle.exportKey("raw", key).then(function (raw) { localStorage.setItem(WO_KEY, woB64(raw)); });
    }
  }).then(function () {
    document.getElementById("wo-pw").value = "";
    woShowApp();
  }).catch(function () {
    err.textContent = "That password isn't right. Try again.";
    err.hidden = false;
  }).finally(function () { btn.disabled = false; btn.textContent = "Unlock"; });
}
function woTryRemember() {
  var saved; try { saved = localStorage.getItem(WO_KEY); } catch (e) { return; }
  if (!saved) return;
  woLoadMeta().then(function (meta) {
    return crypto.subtle.importKey("raw", woFromB64(saved), { name: "AES-GCM" }, false, ["decrypt"]).then(function (key) {
      return woDecrypt(meta, key);
    });
  }).then(woShowApp).catch(function () { localStorage.removeItem(WO_KEY); });
}
function woLock() {
  localStorage.removeItem(WO_KEY);
  wo.songs = []; wo.byId = {}; wo.cur = null;
  woExitPlay();
  document.getElementById("wo-app").hidden = true;
  document.getElementById("wo-lock").hidden = false;
  document.getElementById("wo-pw").value = "";
  document.getElementById("wo-remember").checked = false;
  document.getElementById("wo-err").hidden = true;
}
function woShow(view) {
  wo.view = view;
  ["lib", "song", "add"].forEach(function (name) {
    document.getElementById("wo-" + name).hidden = name !== view;
  });
  if (view === "lib") { woRenderLib(); woRenderSet(); }
  if (view === "song") woRenderSong();
  if (view === "add") woPreviewAdd();
}
function woRenderLib() {
  var q = (document.getElementById("wo-q").value || "").trim().toLowerCase();
  var box = document.getElementById("wo-list");
  box.replaceChildren();
  wo.songs.filter(function (s) {
    return !q || (s.title + " " + s.artist).toLowerCase().indexOf(q) >= 0;
  }).forEach(function (s) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wrow";
    b.innerHTML = "<b></b><span></span>";
    b.querySelector("b").textContent = s.title;
    b.querySelector("span").textContent = (s.artist ? s.artist + " · " : "") + "Key " + s.key;
    b.onclick = function () { woOpen(s.id, s.key); };
    box.appendChild(b);
  });
  if (!box.childElementCount) {
    var p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No songs match.";
    box.appendChild(p);
  }
}
function woOpen(id, keyName) {
  var s = wo.byId[id];
  if (!s) return;
  wo.cur = s;
  var target = woPc(keyName || s.key);
  wo.semi = (target - woPc(s.key) + 12) % 12;
  wo.flats = /b/.test(keyName || s.key);
  woShow("song");
  scrollTo(0, 0);
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
  back.onclick = function () { woShow("lib"); };
  var h = document.createElement("h1"); h.textContent = s.title;
  var sub = document.createElement("p"); sub.className = "muted"; sub.style.margin = "0";
  sub.textContent = (s.artist || "English") + " · original key " + s.key;
  var tools = document.createElement("div"); tools.className = "wtools";
  tools.appendChild(woToolBtn("−", function () { wo.semi--; woRenderSong(); }, false));
  var key = document.createElement("b"); key.className = "wkeyname"; key.textContent = woKeyNow();
  tools.appendChild(key);
  tools.appendChild(woToolBtn("+", function () { wo.semi++; woRenderSong(); }, false));
  tools.appendChild(woToolBtn("♯", function () { wo.flats = false; woRenderSong(); }, !wo.flats));
  tools.appendChild(woToolBtn("♭", function () { wo.flats = true; woRenderSong(); }, wo.flats));
  tools.appendChild(woToolBtn("Reset", function () { wo.semi = 0; wo.flats = /b/.test(s.key); woRenderSong(); }, false));
  tools.appendChild(woToolBtn("Numbers", function () { woSetNumbers(!woNumbersOn()); woRenderSong(); }, woNumbersOn()));
  if (s.youtube) {
    var listen = document.createElement("a");
    listen.className = "wmini"; listen.href = s.youtube; listen.target = "_blank"; listen.rel = "noopener"; listen.textContent = "Listen";
    tools.appendChild(listen);
  }
  tools.appendChild(woToolBtn("Play", function () { woEnterPlay(false); }, false));
  tools.appendChild(woToolBtn("Add to set", function () { woAddCurrent(); }, false));
  box.appendChild(back); box.appendChild(h); box.appendChild(sub); box.appendChild(tools);
  box.appendChild(woChart(s));
}
function woBlankSet() {
  var d = new Date(), add = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return { date: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), songs: [] };
}
function woLoadSet() {
  try { var s = JSON.parse(localStorage.getItem(WO_SET) || "null"); if (s && Array.isArray(s.songs)) return s; } catch (e) {}
  return woBlankSet();
}
function woSaveSet(set) { localStorage.setItem(WO_SET, JSON.stringify(set)); }
function woAddCurrent() {
  var set = woLoadSet();
  set.songs.push({ id: wo.cur.id, key: woKeyNow() });
  woSaveSet(set);
  var n = document.createElement("p");
  n.className = "muted"; n.id = "wo-added"; n.textContent = "Added in " + woKeyNow() + ".";
  document.getElementById("wo-song").appendChild(n);
}
function woRenderSet() {
  var set = woLoadSet();
  document.getElementById("wo-date").value = set.date || "";
  var box = document.getElementById("wo-set");
  box.replaceChildren();
  if (!set.songs.length) {
    var p = document.createElement("p"); p.className = "muted"; p.textContent = "No songs yet."; box.appendChild(p); return;
  }
  set.songs.forEach(function (item, i) {
    var song = wo.byId[item.id];
    var row = document.createElement("div");
    row.className = "sitem";
    var handle = document.createElement("button");
    handle.type = "button"; handle.className = "whandle"; handle.textContent = "⋮⋮";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.addEventListener("pointerdown", function (e) { woDrag(e, i); });
    var name = document.createElement("button");
    name.type = "button"; name.className = "lnkbtn"; name.style.flex = "1"; name.style.textAlign = "left";
    name.textContent = song ? song.title : item.id;
    name.onclick = function () { if (song) woOpen(item.id, item.key); };
    var key = document.createElement("span"); key.style.fontWeight = "800"; key.textContent = item.key;
    var minus = woToolBtn("−", function () { woNudgeSet(i, -1); }, false);
    var plus = woToolBtn("+", function () { woNudgeSet(i, 1); }, false);
    var del = woToolBtn("✕", function () { var s = woLoadSet(); s.songs.splice(i, 1); woSaveSet(s); woRenderSet(); }, false);
    del.setAttribute("aria-label", "Remove");
    row.appendChild(handle); row.appendChild(name); row.appendChild(minus); row.appendChild(key); row.appendChild(plus); row.appendChild(del);
    box.appendChild(row);
  });
}
function woNudgeSet(i, dir) {
  var set = woLoadSet();
  var song = wo.byId[set.songs[i].id];
  if (!song) return;
  var flats = /b/.test(set.songs[i].key);
  var next = woSpell(woPc(set.songs[i].key) + dir, flats);
  set.songs[i].key = next;
  woSaveSet(set);
  woRenderSet();
}
function woDrag(e, from) {
  e.preventDefault();
  var startY = e.clientY;
  e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  function up(ev) {
    e.target.onpointerup = null;
    e.target.onpointercancel = null;
    var set = woLoadSet();
    var shift = Math.round((ev.clientY - startY) / 64);
    var to = Math.max(0, Math.min(set.songs.length - 1, from + shift));
    if (to !== from) {
      var item = set.songs.splice(from, 1)[0];
      set.songs.splice(to, 0, item);
      woSaveSet(set);
    }
    woRenderSet();
  }
  e.target.onpointerup = up;
  e.target.onpointercancel = up;
}
function woDateChanged() {
  var set = woLoadSet();
  set.date = document.getElementById("wo-date").value;
  woSaveSet(set);
}
function woShare() {
  var set = woLoadSet();
  var payload = { d: set.date, s: set.songs.map(function (x) { return [x.id, x.key]; }) };
  var enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  var url = location.origin + location.pathname + location.search + "#worship/set/" + enc;
  var out = document.getElementById("wo-share");
  out.hidden = false;
  out.value = url;
  out.focus();
  out.select();
  if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
}
function woReadHash() {
  var h = location.hash || "";
  var m = h.match(/^#worship\/set\/([^/]+)/);
  if (!m) return null;
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
    songs.push({ id: pair[0], key: pair[1] || wo.byId[pair[0]].key });
  });
  woSaveSet({ date: data.d || woBlankSet().date, songs: songs });
  woShow("lib");
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
}
function woExitPlay() {
  document.getElementById("wo-play").hidden = true;
  document.body.classList.remove("wo-playing");
  woAuto(false);
  woWake(false);
}
function woRenderPlay() {
  var item = wo.playList[wo.playIndex];
  if (!item) return;
  wo.cur = item.song;
  wo.semi = (woPc(item.key) - woPc(item.song.key) + 12) % 12;
  wo.flats = /b/.test(item.key);
  document.getElementById("wo-play-title").textContent = item.song.title;
  document.getElementById("wo-play-key").textContent = woKeyNow();
  document.getElementById("wo-play-num").classList.toggle("on", woNumbersOn());
  document.getElementById("wo-play-num").setAttribute("aria-pressed", woNumbersOn() ? "true" : "false");
  var body = document.getElementById("wo-play-body");
  body.replaceChildren(woChart(item.song));
  body.scrollTop = 0;
  document.getElementById("wo-play-pos").textContent = (wo.playIndex + 1) + " / " + wo.playList.length;
}
function woPlayStep(dir) {
  if (!wo.playList || !wo.playList.length) return;
  wo.playIndex = (wo.playIndex + dir + wo.playList.length) % wo.playList.length;
  woRenderPlay();
  if (wo.auto) woAuto(true);
}
function woTogglePlayNumbers() {
  woSetNumbers(!woNumbersOn());
  woRenderPlay();
}
function woAuto(on) {
  wo.auto = on;
  var btn = document.getElementById("wo-play-auto");
  if (btn) { btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on ? "true" : "false"); }
  if (wo.raf) cancelAnimationFrame(wo.raf);
  wo.raf = 0;
  if (!on) return;
  var box = document.getElementById("wo-play-body");
  function step() {
    box.scrollTop += 0.45;
    wo.raf = requestAnimationFrame(step);
  }
  wo.raf = requestAnimationFrame(step);
}
function woWake(on) {
  if (!on) {
    if (wo.wake) { wo.wake.release().catch(function () {}); wo.wake = null; }
    return;
  }
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request("screen").then(function (lock) { wo.wake = lock; }).catch(function () {});
}
function woPreviewAdd() {
  var text = document.getElementById("wo-paste").value;
  var song = woParseCho(text, "preview");
  var errs = document.getElementById("wo-add-err");
  var prev = document.getElementById("wo-add-prev");
  errs.replaceChildren();
  prev.replaceChildren();
  if (!text.trim()) return;
  if (song.errors.length) {
    song.errors.forEach(function (e) {
      var p = document.createElement("p"); p.style.color = "#b00020"; p.style.fontWeight = "700"; p.style.margin = "4px 0"; p.textContent = e; errs.appendChild(p);
    });
  }
  if (song.title && song.sections.some(function (s) { return s.lines.length; })) {
    var prevCur = wo.cur, prevSemi = wo.semi, prevFlats = wo.flats;
    wo.semi = 0; wo.flats = /b/.test(song.key);
    var h = document.createElement("h2"); h.textContent = song.title; prev.appendChild(h);
    prev.appendChild(woChart(song));
    wo.cur = prevCur; wo.semi = prevSemi; wo.flats = prevFlats;
  }
}
function woCopyCho() {
  var text = document.getElementById("wo-paste").value;
  var note = document.getElementById("wo-add-note");
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { note.textContent = "Copied. Save it as a .cho file in songs/ and re-encrypt."; }).catch(function () { note.textContent = "Select the text and copy it, then save a .cho file in songs/."; });
  else note.textContent = "Select the text and copy it, then save a .cho file in songs/.";
}
function woDownloadCho() {
  var text = document.getElementById("wo-paste").value;
  var song = woParseCho(text, "song");
  var name = (song.title || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name + ".cho";
  document.body.appendChild(a); a.click(); a.remove();
  document.getElementById("wo-add-note").textContent = "Downloaded " + name + ".cho. Put it in songs/ and run the encrypt script. Nothing is uploaded.";
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && document.body.classList.contains("wo-playing")) woWake(true);
});
function worshipRoute() {
  var data = woReadHash();
  if (!data) return;
  if (wo.songs.length) woImport(data);
  else woPending = data;
}
document.getElementById("wo-form").onsubmit = woUnlock;
document.getElementById("wo-q").addEventListener("input", woRenderLib);
document.getElementById("wo-date").addEventListener("change", woDateChanged);
document.getElementById("wo-paste").addEventListener("input", woPreviewAdd);
addEventListener("hashchange", worshipRoute);
worshipRoute();
woTryRemember();
