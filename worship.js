var WO_NUM = "bethany-worship-numbers";
var WO_LYRICS = "bethany-worship-lyrics";
var WO_PREFS = "bethany-worship-prefs";
var WO_NOTES = "bethany-worship-song-notes";
var WO_SET = "bethany-worship-set";
var SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
var wo = { songs: [], byId: {}, view: "lib", cur: null, semi: 0, flats: false, capo: 0, auto: false, wake: null, raf: 0, meta: null };
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
      else if (name === "tempo") { var bpm = parseInt(val, 10); if (bpm > 0) song.tempo = bpm; }
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
function woLyricsOn() { try { return localStorage.getItem(WO_LYRICS) === "1"; } catch (e) { return false; } }
function woSetLyrics(on) { try { localStorage.setItem(WO_LYRICS, on ? "1" : "0"); } catch (e) {} }
function woPrefs() { try { return JSON.parse(localStorage.getItem(WO_PREFS) || "{}"); } catch (e) { return {}; } }
function woSavePref(id) {
  var all = woPrefs();
  all[id] = { semi: wo.semi, flats: !!wo.flats, capo: wo.capo || 0 };
  try { localStorage.setItem(WO_PREFS, JSON.stringify(all)); } catch (e) {}
}
function woNotes() { try { return JSON.parse(localStorage.getItem(WO_NOTES) || "{}"); } catch (e) { return {}; } }
function woSongNote(id, val) {
  var all = woNotes();
  if (arguments.length < 2) return all[id] || "";
  all[id] = val;
  try { localStorage.setItem(WO_NOTES, JSON.stringify(all)); } catch (e) {}
}
function woKeyFor(song) { return woSpell(woPc(song.key) + wo.semi, wo.flats); }
function woKeyNow() { return wo.cur ? woKeyFor(wo.cur) : "C"; }
function woLabel(ch, song) {
  if (!ch || woLyricsOn()) return "";
  if (woNumbersOn()) return woNashville(woTranspose(ch, wo.semi, wo.flats), woPc(woKeyFor(song)));
  return woTranspose(ch, wo.semi - (wo.capo || 0), wo.flats);
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
function woLoadSongs() {
  return fetch("songs.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (list) {
    if (!Array.isArray(list)) throw 0;
    wo.songs = list.map(function (item) { return woParseCho(item.cho, item.id); });
    wo.byId = {};
    wo.songs.forEach(function (s) { wo.byId[s.id] = s; });
    woApplyRoute();
    if (!wo.songsRouted) woShow("lib");
  }).catch(function () {
    var box = document.getElementById("wo-list");
    if (box) box.textContent = "Couldn't load songs.";
  });
}
function woShow(view) {
  wo.view = view;
  ["lib", "sets", "edit", "song", "add"].forEach(function (name) {
    document.getElementById("wo-" + name).hidden = name !== view;
  });
  if (view === "lib") woRenderLib();
  if (view === "sets") woRenderSets();
  if (view === "edit") woRenderSet();
  if (view === "song") woRenderSong();
  if (view === "add") woPreviewAdd();
  woLiveWatch(view === "edit");
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
    b.querySelector("span").textContent = (s.artist ? s.artist + " · " : "") + "Key " + s.key + (s.tempo ? " · " + s.tempo + " BPM" : "");
    b.onclick = function () { location.hash = "#/worship/song/" + encodeURIComponent(s.id); };
    box.appendChild(b);
  });
  if (!box.childElementCount) {
    var p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No songs match.";
    box.appendChild(p);
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
    wo.flats = /b/.test(keyName);
  } else if (pref.semi != null) {
    wo.semi = pref.semi;
    wo.flats = !!pref.flats;
  } else {
    wo.semi = 0;
    wo.flats = /b/.test(s.key);
  }
  wo.capo = pref.capo || 0;
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
  back.onclick = function () { location.hash = "#/worship/library"; };
  var h = document.createElement("h1"); h.textContent = s.title;
  var sub = document.createElement("p"); sub.className = "muted"; sub.style.margin = "0";
  sub.textContent = (s.artist || "English") + " · original key " + s.key + (s.tempo ? " · " + s.tempo + " BPM" : "");
  var concert = document.createElement("p");
  concert.className = "muted"; concert.style.margin = "4px 0 0";
  concert.textContent = "Concert key: " + woKeyNow() + (wo.capo ? " · capo " + wo.capo : "");
  var tools = document.createElement("div"); tools.className = "wtools";
  function bumped(fn) { return function () { fn(); woSavePref(s.id); woRenderSong(); }; }
  tools.appendChild(woToolBtn("−", bumped(function () { wo.semi--; }), false));
  var key = document.createElement("b"); key.className = "wkeyname"; key.textContent = woKeyNow();
  tools.appendChild(key);
  tools.appendChild(woToolBtn("+", bumped(function () { wo.semi++; }), false));
  tools.appendChild(woToolBtn("♯", bumped(function () { wo.flats = false; }), !wo.flats));
  tools.appendChild(woToolBtn("♭", bumped(function () { wo.flats = true; }), wo.flats));
  tools.appendChild(woToolBtn("Reset", bumped(function () { wo.semi = 0; wo.flats = /b/.test(s.key); wo.capo = 0; }), false));
  var capo = document.createElement("select");
  capo.setAttribute("aria-label", "Capo");
  for (var fret = 0; fret <= 7; fret++) {
    var opt = document.createElement("option");
    opt.value = String(fret);
    opt.textContent = fret ? "Capo " + fret : "No capo";
    capo.appendChild(opt);
  }
  capo.value = String(wo.capo || 0);
  capo.onchange = function () { wo.capo = parseInt(capo.value, 10) || 0; woSavePref(s.id); woRenderSong(); };
  tools.appendChild(capo);
  tools.appendChild(woToolBtn("Numbers", function () { woSetNumbers(!woNumbersOn()); woRenderSong(); }, woNumbersOn()));
  tools.appendChild(woToolBtn("Lyrics only", function () { woSetLyrics(!woLyricsOn()); woRenderSong(); }, woLyricsOn()));
  if (s.youtube) {
    var listen = document.createElement("a");
    listen.className = "wmini"; listen.href = s.youtube; listen.target = "_blank"; listen.rel = "noopener"; listen.textContent = "Listen";
    tools.appendChild(listen);
  }
  tools.appendChild(woToolBtn("Play", function () { woEnterPlay(false); }, false));
  tools.appendChild(woToolBtn("Add to setlist", function () { woAddCurrent(); }, false));
  var note = document.createElement("textarea");
  note.placeholder = "Personal note for this song";
  note.value = woSongNote(s.id);
  note.addEventListener("input", function () { woSongNote(s.id, note.value); });
  box.appendChild(back); box.appendChild(h); box.appendChild(sub); box.appendChild(concert); box.appendChild(tools); box.appendChild(note);
  box.appendChild(woChart(s));
}
function woId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function woBlankSet() {
  var d = new Date(), add = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return { id: woId(), date: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), songs: [] };
}
function woLoadSets() {
  try {
    var list = JSON.parse(localStorage.getItem("bethany-worship-sets") || "null");
    if (Array.isArray(list)) return list;
  } catch (e) {}
  try {
    var old = JSON.parse(localStorage.getItem(WO_SET) || "null");
    if (old && Array.isArray(old.songs)) {
      var migrated = [{ id: old.id || woId(), date: old.date || woBlankSet().date, songs: old.songs }];
      localStorage.setItem("bethany-worship-sets", JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) {}
  return [];
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
function woAddCurrent() {
  var sets = woLoadSets();
  var set = wo.setId ? woGetSet(wo.setId) : null;
  if (!set) set = sets[0];
  if (!set) { set = woBlankSet(); sets.unshift(set); wo.setId = set.id; }
  set.songs.push({ id: wo.cur.id, key: woKeyNow(), note: "" });
  woSaveSet(set);
  var n = document.createElement("p");
  n.className = "muted"; n.textContent = "Added in " + woKeyNow() + ".";
  document.getElementById("wo-song").appendChild(n);
}
function woNewSet() {
  var set = woBlankSet();
  var sets = woLoadSets();
  sets.unshift(set);
  woSaveSets(sets);
  location.hash = "#/worship/setlists/" + set.id;
}
function woRenderSets() {
  var box = document.getElementById("wo-sets-list");
  box.replaceChildren();
  var sets = woLoadSets();
  if (!sets.length) {
    var empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No setlists yet.";
    box.appendChild(empty);
    return;
  }
  sets.forEach(function (set) {
    var card = document.createElement("div");
    card.className = "card";
    var h = document.createElement("h3");
    h.textContent = set.date || "Setlist";
    var count = document.createElement("p");
    count.className = "muted";
    count.style.margin = "0";
    var n = (set.songs || []).length;
    count.textContent = n + (n === 1 ? " song" : " songs");
    var row = document.createElement("div");
    row.className = "wtools";
    row.appendChild(woToolBtn("Open", function () { location.hash = "#/worship/setlists/" + set.id; }, false));
    row.appendChild(woToolBtn("Play", function () { wo.setId = set.id; wo.cur = null; woEnterPlay(true); }, false));
    row.appendChild(woToolBtn("Share", function () { woShare(set.id, "wo-share-list"); }, false));
    row.appendChild(woToolBtn("Send to band", function () { woSendToBand(set.id); }, false));
    row.appendChild(woToolBtn("Delete", function () {
      if (!confirm("Delete this setlist?")) return;
      woSaveSets(woLoadSets().filter(function (s) { return s.id !== set.id; }));
      woRenderSets();
    }, false));
    card.appendChild(h); card.appendChild(count); card.appendChild(row);
    box.appendChild(card);
  });
}
function woRenderSet() {
  var set = woLoadSet();
  document.getElementById("wo-date").value = set.date || "";
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
    var row = document.createElement("div");
    row.className = "sitem";
    var handle = document.createElement("button");
    handle.type = "button"; handle.className = "whandle"; handle.textContent = "⋮⋮";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.addEventListener("pointerdown", function (e) { woDrag(e, i); });
    var name = document.createElement("button");
    name.type = "button"; name.className = "lnkbtn"; name.style.flex = "1"; name.style.textAlign = "left";
    name.textContent = song ? song.title : item.id;
    name.onclick = function () { if (song) location.hash = "#/worship/song/" + encodeURIComponent(item.id) + "/" + encodeURIComponent(item.key); };
    var key = document.createElement("span"); key.style.fontWeight = "800"; key.textContent = item.key;
    var up = woToolBtn("Up", function () { woMove(i, -1); }, false);
    var down = woToolBtn("Down", function () { woMove(i, 1); }, false);
    var minus = woToolBtn("−", function () { woNudgeSet(i, -1); }, false);
    var plus = woToolBtn("+", function () { woNudgeSet(i, 1); }, false);
    var del = woToolBtn("✕", function () { var s = woLoadSet(); s.songs.splice(i, 1); woSaveSet(s); woRenderSet(); }, false);
    del.setAttribute("aria-label", "Remove");
    var noteIn = document.createElement("input");
    noteIn.value = item.note || "";
    noteIn.placeholder = "Short note";
    noteIn.setAttribute("aria-label", "Note for " + (song ? song.title : item.id));
    noteIn.addEventListener("change", function () {
      var current = woLoadSet();
      if (!current.songs[i]) return;
      current.songs[i].note = noteIn.value;
      woSaveSet(current);
    });
    row.appendChild(handle); row.appendChild(up); row.appendChild(down); row.appendChild(name); row.appendChild(minus); row.appendChild(key); row.appendChild(plus); row.appendChild(del);
    var wrap = document.createElement("div");
    wrap.appendChild(row);
    wrap.appendChild(noteIn);
    box.appendChild(wrap);
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
function woLeaderChanged() {
  var set = woLoadSet();
  set.leaderNote = document.getElementById("wo-leader").value;
  woSaveSet(set);
  var banner = document.getElementById("wo-leader-banner");
  if (banner) { banner.hidden = !set.leaderNote; banner.textContent = set.leaderNote || ""; }
}
function woShareUrl(set) {
  var payload = { id: set.id, d: set.date, n: set.leaderNote || "", s: (set.songs || []).map(function (x) { return [x.id, x.key, x.note || ""]; }) };
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
  var set = { id: data.id || woId(), date: data.d || woBlankSet().date, leaderNote: data.n || "", songs: songs };
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
  woAuto(false);
  woWake(false);
  woLiveWatch(wo.view === "edit");
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
  if (wo.auto) woAuto(true);
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
    b.textContent = (i + 1) + ". " + item.song.title + (item.key ? " · " + item.key : "");
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
function woLiveEnabled() { return typeof LIVE_SETLIST_ENDPOINT === "string" && LIVE_SETLIST_ENDPOINT.length > 0; }
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
  woJsonp({ id: wo.setId }).then(function (data) {
    if (!data || !data.found) return;
    var set = woGetSet(wo.setId);
    if (!set) return;
    if (set.updatedAt && data.updatedAt && data.updatedAt <= set.updatedAt) return;
    set.songs = data.songs || [];
    set.leaderNote = data.leaderNote || "";
    if (data.date) set.date = data.date;
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
  var passEl = document.getElementById("wo-pass");
  var pass = passEl ? passEl.value : "";
  var changeEl = document.getElementById("wo-change");
  var change = (changeEl && changeEl.value.trim()) || "Updated setlist";
  if (!pass) { woLiveMsg("Enter the leader passphrase."); return; }
  var set = woLoadSet();
  var body = { passphrase: pass, id: set.id, date: set.date, leaderNote: set.leaderNote || "", change: change, songs: set.songs || [] };
  var encoded = JSON.stringify(body);
  var done = function (res) {
    if (!res || !res.ok) { woLiveMsg(res && res.error === "pass" ? "That passphrase isn't right." : "Couldn't publish."); return; }
    set.updatedAt = res.updatedAt;
    set.change = change;
    woSaveSet(set);
    if (passEl) passEl.value = "";
    woLiveMsg("");
    woShowLiveBanner(res.updatedAt, change);
  };
  if (encoded.length < 6000) {
    woJsonp({ action: "publish", payload: encoded }).then(done).catch(function () { woLiveMsg("Couldn't reach the live sheet."); });
    return;
  }
  fetch(LIVE_SETLIST_ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: encoded }).then(function () {
    woLiveMsg("Sent. If the passphrase is wrong, the sheet will not update.");
  }).catch(function () { woLiveMsg("Couldn't reach the live sheet."); });
}
function woSendToBand(id) {
  var set = woGetSet(id);
  if (!set) return;
  var url = woShareUrl(set);
  var text = set.leaderNote || "Worship set";
  if (navigator.share) {
    navigator.share({ title: "Worship set " + (set.date || ""), text: text, url: url }).catch(function () {});
    return;
  }
  var full = text + "\n" + url;
  var copied = function () {
    var note = document.getElementById("wo-import");
    if (!note) return;
    note.hidden = false;
    note.textContent = "Copied the setlist link and leader note.";
  };
  if (navigator.clipboard) navigator.clipboard.writeText(full).then(copied).catch(function () { window.prompt("Copy this for the band:", full); });
  else window.prompt("Copy this for the band:", full);
}
function woThisSunday() {
  var today = new Date();
  var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  var target = woBlankSet().date;
  var sets = woLoadSets();
  var match = null;
  sets.forEach(function (s) { if (s.date === target) match = s; });
  if (!match) {
    sets.forEach(function (s) {
      if (s.date && s.date >= iso && (!match || s.date < match.date)) match = s;
    });
  }
  if (!match) { woNewSet(); return; }
  location.hash = "#/worship/setlists/" + match.id;
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
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { note.textContent = "Copied. Save it as a .cho file in songs/ and rebuild songs.json."; }).catch(function () { note.textContent = "Select the text and copy it, then save a .cho file in songs/."; });
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
  document.getElementById("wo-add-note").textContent = "Downloaded " + name + ".cho. Put it in songs/ and run node tools/encrypt-songs.mjs. Nothing is uploaded.";
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
document.getElementById("wo-leader").addEventListener("change", woLeaderChanged);
document.getElementById("wo-paste").addEventListener("input", woPreviewAdd);
addEventListener("hashchange", worshipRoute);
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
