var WO_NUM = "bethany-worship-numbers";
var WO_LYRICS = "bethany-worship-lyrics";
var WO_PREFS = "bethany-worship-prefs";
var WO_NOTES = "bethany-worship-song-notes";
var WO_SET = "bethany-worship-set";
var WO_SYNC = "bethany-worship-sync";
var WO_PLAY_SIZE = "bethany-worship-play-size";
var SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var wo = { songs: [], byId: {}, view: "lib", cur: null, semi: 0, flats: false, wake: null, meta: null, syncText: "", syncTimer: 0, syncFlight: false, syncGen: 0, fitGen: 0, fitTimer: 0 };
var woPending = null;

function woPc(note) {
  var m = String(note || "").trim().match(/^([A-G])([#b])?/);
  if (!m) return 0;
  var n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (m[2] === "#") n++;
  if (m[2] === "b") n--;
  return (n + 12) % 12;
}
var FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
function woSpell(n, flats) { return (flats ? FLAT : SHARP)[((n % 12) + 12) % 12]; }
function woIsMinor(name) { return /^[A-G][#b]?m(?!aj)/.test(String(name || "").trim()); }
// Spell accidentals the way a chart in the sounding key is written: flat keys (F, Bb, Eb, Ab, Db and
// their relative minors) use flats; Gb/F# follows how the song's own key is written.
function woFlatsFor(song, semi) {
  if (!song || !song.key) return false;
  var minor = woIsMinor(song.key);
  var pc = (((woPc(song.key) + (semi || 0)) % 12) + 12) % 12;
  var maj = minor ? (pc + 3) % 12 : pc;
  if ([5, 10, 3, 8, 1].indexOf(maj) >= 0) return true;
  if (maj === 6) return !(semi % 12) && /^[A-G]b/.test(String(song.key).trim());
  return false;
}
// Display name of a key as written in the song file (keeps flats and minor: "Ab", "Em", "F#m").
function woSharpKey(name) {
  var m = String(name || "").trim().match(/^([A-G][#b]?)(m(?!aj))?/);
  return m ? m[1] + (m[2] || "") : String(name || "");
}
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
// Number-chart quality: keep everything the letter chord says, but write added tones in
// parentheses so they can't be misread as a degree (C2 in G -> 4(2), Dsus4 -> 5sus4, Bm7b5 -> 3m7b5).
function woNumQuality(q) {
  var r = String(q || "");
  r = r.replace(/^min(?!or)/, "m").replace(/^-/, "m").replace(/^(M7|ma7)/, "maj7");
  if (!/^m(?!aj)/.test(r)) r = r.replace(/^(add)?(2|4|6|7|9|11|13)/, function (_, add, d) { return "(" + d + ")"; });
  else r = r.replace(/^m(add)?(2|4|9|11)(?=$|\/)/, function (_, add, d) { return "m(" + d + ")"; });
  return r;
}
function woNashville(ch, keyPc) {
  var p = woParseChord(ch);
  if (!p) return ch;
  var name = woDegree(p.root - keyPc) + woNumQuality(p.q);
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
var WO_ARTIST_KEEP = [
  ["Crosby, Stills, Nash & Young", "Crosby, Stills, Nash & Young"],
  ["Holy, Holy, Holy, Lord God Almighty!", "Holy, Holy, Holy, Lord God Almighty!"],
  ["Holy, Holy, Holy, Lord God Alighty!", "Holy, Holy, Holy, Lord God Alighty!"],
  ["O, Lord My God! When I In Awesome Wonder", "O, Lord My God! When I In Awesome Wonder"],
  ["What A Fellowship, What A Joy Divine", "What A Fellowship, What A Joy Divine"],
  ["Let Us Rejoice And Be Glad", "Let Us Rejoice And Be Glad"],
  ["Lord, I Lift Your Name On High", "Lord, I Lift Your Name On High"],
  ["Crosby, Stills & Nash", "Crosby, Stills & Nash"],
  ["All Sons & Daughters", "All Sons & Daughters"],
  ["Earth, Wind & Fire", "Earth, Wind & Fire"],
  ["For King & Country", "For King & Country"],
  ["Simon & Garfunkel", "Simon & Garfunkel"],
  ["Citizens & Saints", "Citizens & Saints"],
  ["Mumford & Sons", "Mumford & Sons"],
  ["Sons & Daughters", "Sons & Daughters"],
  ["Shane and Shane", "Shane & Shane"],
  ["Brooks & Dunn", "Brooks & Dunn"],
  ["Shane & Shane", "Shane & Shane"],
  ["Shane&Shane", "Shane & Shane"],
  ["Hall & Oates", "Hall & Oates"]
];
var WO_ARTIST_ALIAS = {
  "elevation": "Elevation Worship",
  "hillsong": "Hillsong Worship",
  "maverick city": "Maverick City Music",
  "rend collective experiment": "Rend Collective"
};
function woCanonArtist(name) {
  var cleaned = String(name || "").replace(/\s+/g, " ").trim();
  return WO_ARTIST_ALIAS[woArtistKey(cleaned)] || cleaned;
}
function woArtistKey(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function woArtistCaps(name) {
  var score = 0;
  String(name || "").replace(/[A-Z]/g, function () { score++; return ""; });
  return score;
}
function woShareSurname(left, right) {
  var l = String(left || "").trim().split(/\s+/);
  var r = String(right || "").trim().split(/\s+/);
  if (l.length === 1 && r.length === 2 && l[0] && r[0] && r[1]) return [l[0] + " " + r[1], r.join(" ")];
  return null;
}
function woSplitArtists(raw) {
  var text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  var held = [];
  var parens = [];
  WO_ARTIST_KEEP.slice().sort(function (a, b) { return b[0].length - a[0].length; }).forEach(function (pair) {
    var pattern = pair[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    text = text.replace(new RegExp(pattern, "ig"), function () {
      held.push(pair[1]);
      return "\u0001" + (held.length - 1) + "\u0001";
    });
  });
  text = text.replace(/\(([^)]*)\)/g, function (_, inner) {
    parens.push(inner);
    return " \u0002" + (parens.length - 1) + "\u0002 ";
  });
  function tokenToName(token) {
    return String(token || "").replace(/\u0001(\d+)\u0001/g, function (_, n) { return held[Number(n)]; });
  }
  function restore(part) {
    return tokenToName(String(part || "").replace(/\u0002(\d+)\u0002/g, function (_, n) {
      return "(" + tokenToName(parens[Number(n)]) + ")";
    })).replace(/\s+/g, " ").trim();
  }
  var re = /,\s*(?:(?:featuring|feat\.?|ft\.?)\s+)?|\s+(?:featuring|feat\.?|ft\.?)\s+/gi;
  var parts = [], seps = [], last = 0, match;
  while ((match = re.exec(text))) {
    parts.push(text.slice(last, match.index));
    seps.push(match[0]);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  parts = parts.map(function (part) { return part.trim(); }).filter(Boolean);
  if (!parts.length) return [];
  var out = [];
  if (parts.length === 1) out = [restore(parts[0])];
  else {
    var acc = parts[0];
    for (var i = 0; i < seps.length; i++) {
      var sep = seps[i].replace(/\s+/g, " ").trim().toLowerCase();
      var next = parts[i + 1];
      var share = (sep === "&" || sep === "and") && acc.indexOf("\u0001") < 0 && next.indexOf("\u0001") < 0 ? woShareSurname(acc, next) : null;
      if (share) { out.push(share[0]); acc = share[1]; }
      else { out.push(restore(acc)); acc = next; }
    }
    out.push(restore(acc));
  }
  var flat = [];
  out.forEach(function (name) {
    woExpandArtist(name).forEach(function (part) {
      part = woCanonArtist(part);
      if (part) flat.push(part);
    });
  });
  return flat;
}
function woExpandArtist(name) {
  var m = String(name || "").match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  if (!m) return [name];
  var inner = m[2].trim();
  var outer = (m[1] + " " + m[3]).replace(/\s+/g, " ").trim();
  if (!outer) return [name];
  if (/psalm|^\d{3,4}$/i.test(inner)) return [outer];
  if (/arr\.?/i.test(inner)) inner = inner.replace(/\barr\.?/ig, " ");
  return [outer].concat(woSplitArtists(inner));
}
function woArtistNames(song) {
  if (!song) return [];
  if (!song.artists) song.artists = woSplitArtists(song.artist);
  return song.artists;
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
      else if (name === "artist") song.artist = val;
      else if ((name === "subtitle" || name === "st") && !song.artist) song.artist = val;
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
var WO_HL = "bethany-worship-play-hl";
var WO_THEME = "bethany-worship-play-theme";
function woHighlightOn() { try { return localStorage.getItem(WO_HL) === "1"; } catch (e) { return false; } }
function woPlayDark() { try { return localStorage.getItem(WO_THEME) === "dark"; } catch (e) { return false; } }
function woApplyPlayLook() {
  var play = document.getElementById("wo-play");
  if (!play) return;
  play.classList.toggle("wo-light", !woPlayDark());
  play.classList.toggle("wo-hl", woHighlightOn());
  var hl = document.getElementById("wo-play-hl");
  if (hl) {
    hl.classList.toggle("on", woHighlightOn());
    hl.setAttribute("aria-pressed", woHighlightOn() ? "true" : "false");
  }
  var theme = document.getElementById("wo-play-theme");
  if (theme) {
    var dark = woPlayDark();
    theme.classList.toggle("on", dark);
    theme.setAttribute("aria-pressed", dark ? "true" : "false");
    theme.textContent = dark ? "Dark" : "Light";
  }
}
function woToggleHighlight() {
  try { localStorage.setItem(WO_HL, woHighlightOn() ? "0" : "1"); } catch (e) {}
  woApplyPlayLook();
  if (document.body.classList.contains("wo-playing")) woFitPlay();
}
function woTogglePlayTheme() {
  try { localStorage.setItem(WO_THEME, woPlayDark() ? "light" : "dark"); } catch (e) {}
  woApplyPlayLook();
}
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
  if (!/^(?:m(?!aj)|min|maj|dim|aug|sus|add|[0-9()#b+°ø])*$/.test(rest)) return null;
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
  if (/\+/.test(r) && !/aug/.test(r)) out += "aug";
  if (/add9|\(9\)/.test(r)) out += "add9";
  if (/add4/.test(r)) out += "add4";
  if (/^m?6/.test(r)) out += "6";
  if (/11/.test(r)) out += "11";
  if (/maj7/i.test(r)) out += "maj7";
  else if (/#7/.test(r)) out += "#7";
  else if (/7/.test(r)) out += "7";
  else if (/#$/.test(r)) out += "#";
  if (/b5/.test(r)) out += "b5";
  return out;
}
function woNumToLetter(ch, keyPc, flats) {
  var p = woParseNum(ch);
  if (!p) return ch;
  var root = woSpell(p.semi + keyPc, flats);
  var bass = p.bass == null ? "" : "/" + woSpell(p.bass + keyPc, flats);
  return root + woNumSuffix(p.rest) + bass;
}
function woKeyFor(song) { return woSpell(woPc(song.key) + wo.semi, woFlatsFor(song, wo.semi)) + (woIsMinor(song.key) ? "m" : ""); }
function woKeyNow() { return wo.cur ? woKeyFor(wo.cur) : "C"; }
function woLabel(ch, song) {
  if (!ch || woLyricsOn()) return "";
  if (woParseNum(ch)) {
    if (woNumbersOn()) return ch;
    return woNumToLetter(ch, woPc(woKeyNow()), woFlatsFor(song || wo.cur, wo.semi));
  }
  if (woNumbersOn()) return woNashville(ch, woPc(song.key));
  if (!wo.semi) return ch; // untransposed: show the chart's own spelling (Bb stays Bb, G# stays G#)
  return woTranspose(ch, wo.semi, woFlatsFor(song, wo.semi));
}
function woAccidental(text) {
  return String(text || "").replace(/#/g, "\u266F").replace(/b/g, "\u266D");
}
function woFillChord(el, label) {
  el.replaceChildren();
  String(label || "").split("/").forEach(function (part, index) {
    if (index) el.appendChild(document.createTextNode("/"));
    var note = part.match(/^([A-G])([#b]?)(.*)$/);
    if (!note) { el.appendChild(document.createTextNode(woAccidental(part))); return; }
    var acc = note[2] === "#" ? "\u266F" : note[2] === "b" ? "\u266D" : "";
    el.appendChild(document.createTextNode(note[1] + acc));
    var rest = note[3];
    if (/^m(?!aj)/.test(rest)) { el.appendChild(document.createTextNode("m")); rest = rest.slice(1); }
    else if (/^min(?!or)/.test(rest)) { el.appendChild(document.createTextNode("m")); rest = rest.slice(3); }
    if (!rest) return;
    var ext = document.createElement("sup");
    ext.className = "wo-ext";
    ext.textContent = woAccidental(rest);
    el.appendChild(ext);
  });
}
function woSectionHead(label) {
  var h = document.createElement("div");
  h.className = "wsec";
  var role = String(label || "").match(/^(.*?)(?:\s+(Solo|Parts))$/i);
  var name = document.createElement("span");
  name.className = "wsec-name";
  name.textContent = String(role ? role[1] : label || "").toUpperCase();
  h.appendChild(name);
  if (role) {
    h.appendChild(document.createTextNode(" "));
    var mark = document.createElement("span");
    mark.className = "wsec-role";
    mark.textContent = role[2].charAt(0).toUpperCase() + role[2].slice(1).toLowerCase();
    h.appendChild(mark);
  }
  return h;
}
function woChart(song) {
  var root = document.createElement("div");
  root.className = "wo-chart wbody" + (woLyricsOn() ? " lyrics-only" : "");
  song.sections.forEach(function (sec) {
    var block = document.createElement("div");
    block.className = "wblock";
    if (sec.label) block.appendChild(woSectionHead(sec.label));
    sec.lines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "wline";
      var word = null;
      line.forEach(function (seg, i) {
        var text = seg.t == null ? "" : String(seg.t);
        var prev = i ? String(line[i - 1].t == null ? "" : line[i - 1].t) : "";
        var startsWord = !word || /^\s/.test(text) || /\s$/.test(prev);
        if (startsWord) {
          word = document.createElement("span");
          word.className = "wword";
          row.appendChild(word);
        }
        var s = document.createElement("span");
        s.className = "wseg";
        var c = document.createElement("span");
        c.className = "wch";
        var label = seg.c ? woLabel(seg.c, song) : "";
        if (label) {
          var mark = document.createElement("span");
          mark.className = "chord";
          woFillChord(mark, label);
          c.appendChild(mark);
        } else c.textContent = "\u00a0";
        var lyric = document.createElement("span");
        lyric.textContent = text.length ? text : "\u00a0";
        s.appendChild(c);
        s.appendChild(lyric);
        var next = line[i + 1];
        var nextText = next && next.t != null ? String(next.t) : "";
        var continues = !!(next && text && !/\s$/.test(text) && nextText && !/^\s/.test(nextText));
        var letters = text.replace(/\s/g, "");
        if (label && label.length > letters.length) {
          s.style.minWidth = (label.length + 0.6) + "ch";
          if (continues) s.classList.add("cont");
        }
        word.appendChild(s);
      });
      block.appendChild(row);
    });
    root.appendChild(block);
  });
  return root;
}
var WO_DRIVE = "bethany-worship-drive";
var WO_UNAVAILABLE = "Couldn't load songs right now.";
function woBackendEnabled() { return typeof WORSHIP_BACKEND_URL === "string" && WORSHIP_BACKEND_URL.length > 0; }
function woStillLocked(data) {
  return !!(data && (Number(data.status) === 401 || data.error === "unauthorized" || data.error === "pass"));
}
try { localStorage.removeItem("bethany-worship-team"); } catch (e) {}
function woPrivateMsg(text, retry) {
  var el = document.getElementById("wo-private-msg");
  if (!el) return;
  el.className = "mut";
  el.replaceChildren();
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.appendChild(document.createTextNode(text));
  if (retry) {
    el.appendChild(document.createTextNode(" · "));
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lnkbtn";
    b.textContent = "Retry";
    b.onclick = function () { woFetchSongs(); };
    el.appendChild(b);
  }
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
  wo.songs = (wo.bundled || []).concat(extra).sort(function (a, b) {
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  });
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
  var merged = {};
  var cursor = "";
  var etag = wo.driveEtag || "";
  var steps = 0;
  var stalls = 0;
  function fail(data, err) {
    console.warn("Worship library:", woBackendError(data || err, WO_UNAVAILABLE));
    if (!wo.songs.length) woPrivateMsg(WO_UNAVAILABLE, true);
    else woPrivateMsg("Showing saved songs", true);
    return woStillLocked(data) ? "locked" : "error";
  }
  function call(params) {
    function send(token) {
      var body = {};
      Object.keys(params || {}).forEach(function (k) { body[k] = params[k]; });
      if (token) body.idToken = token;
      return woApi(body);
    }
    if (window.bethanyIdToken) return window.bethanyIdToken().then(send, function () { return send(""); });
    return send("");
  }
  function step() {
    if (++steps > 80) return fail(null, "The song library is still indexing.");
    var params = { action: "getSongs" };
    if (cursor) params.cursor = cursor;
    else if (etag) params.etag = etag;
    return call(params).then(function (data) {
      if (woStillLocked(data) || !data || data.ok === false) return fail(data);
      woPrivateMsg("");
      if (data.unchanged && !cursor) return "ok";
      var added = 0;
      (data.songs || []).forEach(function (item) {
        if (!item || !item.id || !item.cho) return;
        if (!merged[item.id]) added++;
        merged[item.id] = item;
      });
      var list = Object.keys(merged).map(function (key) { return merged[key]; });
      if (list.length) woApplyCatalog(list);
      if (data.more === true) {
        var next = typeof data.cursor === "string" ? data.cursor : cursor;
        if (!added && next === cursor) {
          stalls++;
          if (stalls > 40) return fail(data, "The song library is still indexing.");
        } else stalls = 0;
        cursor = next;
        return new Promise(function (resolve) { setTimeout(resolve, added ? 80 : 400); }).then(step);
      }
      wo.driveEtag = data.etag || etag || "";
      return woCacheWrite({ etag: wo.driveEtag, version: data.version || wo.driveEtag, songs: list }).then(function () { return "ok"; });
    });
  }
  return step().catch(function (err) { return fail(null, err); });
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
  if (!confirm("Send this request?")) return false;
  var member = typeof session === "function" ? session() : null;
  var name = member && member.name ? String(member.name).trim() : "";
  say("Sending…");
  woApiPost({ action: "request", title: title, artist: artist, name: name }).then(function (res) {
    if (woStillLocked(res)) { console.warn("Worship request:", woBackendError(res, "Couldn't send the request.")); say("Couldn't send the request."); return; }
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
    wo.bundled = list.map(function (item) {
      var song = woParseCho(item.cho, item.id);
      song.bundled = true;
      return song;
    });
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
  var splitLib = woWasTablet && (view === "lib" || view === "song");
  var splitSet = woWasTablet && (view === "sets" || view === "edit");
  var hasSet = (view === "edit" && !!woGetSet(wo.setId)) || (splitSet && wo.newOpen);
  document.body.classList.toggle("wo-split", splitLib || splitSet);
  ["lib", "sets", "edit", "song", "add"].forEach(function (name) {
    var el = document.getElementById("wo-" + name);
    if (splitLib) el.hidden = !(name === "lib" || name === "song");
    else if (splitSet) el.hidden = !(name === "sets" || (name === "edit" && (hasSet || view === "sets")));
    else el.hidden = name !== view;
  });
  var editBody = document.getElementById("wo-edit-body");
  var editHint = document.getElementById("wo-edit-hint");
  if (editBody && editHint) {
    var showForm = view === "edit" && !!woGetSet(wo.setId);
    editBody.hidden = !showForm;
    editHint.hidden = showForm || !splitSet;
    if (editHint.querySelector("b") && typeof t === "function") editHint.querySelector("b").textContent = t("pickSet");
    if (editHint.querySelector(".mut") && typeof t === "function") editHint.querySelector(".mut").textContent = t("pickSetBody");
    if (splitSet && !showForm) document.getElementById("wo-edit").hidden = false;
  }
  if (view === "lib" || splitLib) woRenderLib();
  if (view === "sets" || splitSet) woRenderSets();
  if (view === "edit") woRenderSet();
  if (view === "song" || (splitLib && wo.cur)) woRenderSong();
  else if (splitLib) {
    var empty = document.getElementById("wo-song");
    empty.replaceChildren();
    var hint = document.createElement("div");
    hint.className = "card empty wo-empty";
    var title = typeof t === "function" ? t("pickSong") : "Pick a song";
    var body = typeof t === "function" ? t("pickSongBody") : "Choose a title from the library.";
    hint.innerHTML = '<img src="assets/img/illus-empty.svg" alt=""><div><b></b><div class="mut"></div></div>';
    hint.querySelector("b").textContent = title;
    hint.querySelector(".mut").textContent = body;
    empty.appendChild(hint);
  }
  if (view === "add") woSyncAdd();
  woLiveWatch(view === "edit");
}
var woWasTablet = null;
var woF = { speed: "all", artist: "", theme: "", moment: [], season: [], range: [], time: [], difficulty: [], scripture: "", az: true, titleOnly: false, open: false, lang: "en", speedReady: false };
function woActiveFilters() {
  return (woF.speed !== "all" ? 1 : 0) + (woF.artist ? 1 : 0) + (woF.theme ? 1 : 0) + (woF.titleOnly ? 1 : 0) + woF.moment.length + woF.season.length + woF.range.length + woF.time.length + woF.difficulty.length + (woF.scripture ? 1 : 0);
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
  artist.onchange = function () { woF.artist = artist.value; woRenderLib(); };
  document.getElementById("wo-az").onclick = function () {
    woF.az = !woF.az;
    document.getElementById("wo-az").classList.toggle("on", woF.az);
    woRenderLib();
  };
  document.getElementById("wo-titleonly").onclick = function () {
    woF.titleOnly = !woF.titleOnly;
    document.getElementById("wo-titleonly").classList.toggle("on", woF.titleOnly);
    document.getElementById("wo-q").placeholder = woF.titleOnly ? woT("title") : woT("titleOrArtist");
    woRenderLib();
  };
  document.getElementById("wo-filter-btn").onclick = function () {
    woF.open = !woF.open;
    document.getElementById("wo-filters").hidden = !woF.open;
    document.getElementById("wo-filter-btn").setAttribute("aria-expanded", woF.open ? "true" : "false");
  };
  document.getElementById("wo-clear").onclick = function () {
    woF.speed = "all"; woF.artist = ""; woF.theme = ""; woF.moment = []; woF.season = []; woF.range = []; woF.time = []; woF.difficulty = []; woF.scripture = ""; woF.az = true; woF.titleOnly = false;
    var scripture = document.getElementById("wo-scripture"); if (scripture) scripture.value = "";
    document.getElementById("wo-q").value = "";
    document.getElementById("wo-q").placeholder = "Title or artist";
    document.getElementById("wo-artist").value = "";
    var themePick = document.getElementById("wo-theme"); if (themePick) themePick.value = "";
    document.querySelectorAll("#wo-speed button").forEach(function (b) { b.classList.toggle("on", b.dataset.speed === "all"); });
    document.getElementById("wo-az").classList.add("on");
    document.getElementById("wo-titleonly").classList.remove("on");
    woRenderLib();
  };
  function woPickLang(lang) {
    woF.lang = lang;
    woF.langPicked = true;
    var q = document.getElementById("wo-q");
    if (q) q.value = "";
    woRenderLib();
  }
  document.getElementById("wo-lang-en").onclick = function () { woPickLang("en"); };
  document.getElementById("wo-lang-ko").onclick = function () { woPickLang("ko"); };
  }
  woSyncLang();
  ["moment", "time"].forEach(woPruneField);
  woSyncTheme();
  woFillArtists();
  woFillChoice("wo-moment", "moment");
  woFillChoice("wo-time", "time");
}
function woFillArtists() {
  var artist = document.getElementById("wo-artist");
  if (!artist) return;
  var chosen = woF.artist;
  var byKey = {};
  woLangSongs().forEach(function (s) {
    woArtistNames(s).forEach(function (name) {
      var key = woArtistKey(name);
      if (!key) return;
      var prev = byKey[key];
      if (!prev || woArtistCaps(name) > woArtistCaps(prev)) byKey[key] = name;
    });
  });
  artist.replaceChildren();
  var allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = woT("allArtists");
  artist.appendChild(allOpt);
  Object.keys(byKey).sort(function (a, b) { return byKey[a].localeCompare(byKey[b], undefined, { sensitivity: "base" }); }).forEach(function (key) {
    var o = document.createElement("option");
    o.value = key;
    o.textContent = byKey[key];
    artist.appendChild(o);
  });
  if (chosen && byKey[chosen]) artist.value = chosen;
  else { woF.artist = ""; artist.value = ""; }
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
  all.textContent = woT("allThemes");
  theme.appendChild(all);
  Object.keys(names).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (name) {
    var o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    theme.appendChild(o);
  });
  theme.value = chosen || "";
}
function woKo() { return typeof appLang === "function" && appLang() === "ko"; }
function woT(key) {
  var dict = {
    library: ["Library", "악보"], thisSunday: ["This Sunday", "이번 주일"], songName: ["Song name", "곡 이름"],
    titleOrArtist: ["Title or artist", "제목 또는 아티스트"], title: ["Title", "제목"], filters: ["Filters", "필터"],
    artist: ["Artist", "아티스트"], theme: ["Theme", "주제"], az: ["A–Z", "가나다"], titleOnly: ["Title only", "제목만"],
    moment: ["Moment", "순서"], time: ["Time", "박자"], clear: ["Clear filters", "필터 지우기"], addSong: ["Add song", "곡 추가"],
    add: ["Add", "추가"], song: ["song", "곡"], songs: ["songs", "곡"], allArtists: ["All artists", "모든 아티스트"],
    allThemes: ["All themes", "모든 주제"], none: ["No songs match.", "맞는 곡이 없습니다."],
    enAdding: ["English songs are being added.", "영어 곡을 추가하는 중입니다."],
    showMore: ["Show more", "더 보기"],
    libEn: ["English CCM", "영어 CCM"], libKo: ["Korean CCM", "한국어 CCM"], key: ["Key", "키"],
    all: ["All", "전체"], slow: ["Slow", "느림"], medium: ["Medium", "보통"], fast: ["Fast", "빠름"]
  };
  var pair = dict[key];
  return pair ? pair[woKo() ? 1 : 0] : key;
}
function woCountLang(lang) {
  return (wo.songs || []).filter(function (s) { return (s.language || "en") === lang; }).length;
}
function woDriveCount(lang) {
  return (wo.songs || []).filter(function (s) { return (s.language || "en") === lang && !s.bundled; }).length;
}
function woPreferLibLang() {
  var want = woKo() ? "ko" : "en";
  var other = want === "ko" ? "en" : "ko";
  if (woCountLang(want) === 0 && woCountLang(other) > 0) return other;
  return want;
}
function woApplyChrome() {
  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  setText("wo-lib-title", woT("library"));
  setText("wo-this-sunday", woT("thisSunday"));
  setText("wo-q-lab", woT("songName"));
  setText("wo-filter-label", woT("filters"));
  setText("wo-artist-lab", woT("artist"));
  setText("wo-theme-lab", woT("theme"));
  setText("wo-az", woT("az"));
  setText("wo-titleonly", woT("titleOnly"));
  setText("wo-moment-lab", woT("moment"));
  setText("wo-time-lab", woT("time"));
  setText("wo-clear", woT("clear"));
  setText("wo-add-song", woT("addSong"));
  var q = document.getElementById("wo-q");
  if (q) q.placeholder = woF.titleOnly ? woT("title") : woT("titleOrArtist");
  document.querySelectorAll("#wo-speed button").forEach(function (b) { if (b.dataset.speed) b.textContent = woT(b.dataset.speed); });
  var empty = document.getElementById("wo-lib-empty");
  if (empty) {
    var show = woF.lang === "en" && woDriveCount("en") === 0;
    empty.hidden = !show;
    empty.textContent = woT("enAdding");
  }
  woSyncLang();
}
function woSyncLang() {
  var en = document.getElementById("wo-lang-en");
  var ko = document.getElementById("wo-lang-ko");
  if (!en || !ko) return;
  en.textContent = woT("libEn") + " · " + woCountLang("en");
  ko.textContent = woT("libKo") + " · " + woCountLang("ko");
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
function woScriptureLabel(raw) {
  var text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  var marker = text.search(/song finder|worshiptogether|worship together|all rights reserved|create a free account|privacy policy|cookie policy/i);
  if (marker > 0) text = text.slice(0, marker).replace(/[\s|·•,;:\-–—]+$/, "").trim();
  if (text.length > 120) {
    var refs = text.match(/^((?:\d\s*)?[A-Za-z][A-Za-z.'’\- ]{0,28}?\d{1,3}:\d{1,3}(?:\s*[-–]\s*\d{1,3})?(?:\s*,\s*(?:\d\s*)?[A-Za-z][A-Za-z.'’\- ]{0,28}?\d{1,3}:\d{1,3}(?:\s*[-–]\s*\d{1,3})?)*)/);
    if (refs && refs[1] && refs[1].length >= 4) text = refs[1].replace(/,\s*$/, "").trim();
    else text = text.slice(0, 120).replace(/[\s,;:|·•\-–—]+$/, "").trim();
  }
  return text;
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
  if (song.scripture) add(woScriptureLabel(song.scripture));
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
    if (woF.artist && woArtistNames(s).map(woArtistKey).indexOf(woF.artist) < 0) return false;
    if (woF.theme && (s.themes || []).indexOf(woF.theme) < 0) return false;
    if (!woMatchAny(s.moment, woF.moment)) return false;
    if (!woMatchAny(s.season, woF.season)) return false;
    if (!woMatchAny(s.range, woF.range)) return false;
    if (!woMatchAny(s.time, woF.time)) return false;
    if (!woMatchAny(s.difficulty, woF.difficulty)) return false;
    if (woF.scripture && String(s.scripture || "").toLowerCase().indexOf(woF.scripture) < 0) return false;
    if (!q) return true;
    var hay = woF.titleOnly ? s.title : [s.title, s.artist || ""].concat(woArtistNames(s)).join(" ");
    return hay.replace(/\s+/g, " ").toLowerCase().indexOf(q.replace(/\s+/g, " ")) >= 0;
  });
  if (woF.az) list = list.slice().sort(function (a, b) { return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }); });
  return list;
}
function woLetter(title) {
  var ch = String(title || "").trim().charAt(0);
  var code = ch.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    var initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    return initials[Math.floor((code - 0xAC00) / 588)];
  }
  var up = ch.toUpperCase();
  return /[A-Z]/.test(up) ? up : "#";
}
function woLibSignature() {
  var q = document.getElementById("wo-q");
  return [woF.lang, woF.speed, woF.artist, woF.theme, woF.az ? "1" : "0", woF.titleOnly ? "1" : "0", (woF.moment || []).join(","), (woF.season || []).join(","), (woF.range || []).join(","), (woF.time || []).join(","), (woF.difficulty || []).join(","), woF.scripture || "", q ? q.value : ""].join("|");
}
function woJumpLetter(letter, list) {
  var at = -1;
  list.forEach(function (s, i) { if (at < 0 && woLetter(s.title) === letter) at = i; });
  if (at < 0) return;
  if ((wo.libShown || 60) < at + 1) wo.libShown = Math.ceil((at + 1) / 60) * 60;
  wo.holdScroll = true;
  woRenderLib();
  var target = document.getElementById("wo-L-" + encodeURIComponent(letter));
  if (target) target.scrollIntoView({ block: "start" });
}
function woRenderLib() {
  if (!woF.langPicked) woF.lang = woPreferLibLang();
  var pane = document.getElementById("wo-lib");
  var keep = pane ? pane.scrollTop : 0;
  woInitFilters();
  woApplyChrome();
  var box = document.getElementById("wo-list");
  box.replaceChildren();
  var list = woFilteredSongs();
  var sig = woLibSignature();
  if (wo.libSig !== sig) { wo.libSig = sig; wo.libShown = 60; }
  if (!wo.libShown) wo.libShown = 60;
  var shown = list.slice(0, wo.libShown);
  var count = document.getElementById("wo-count");
  if (count) count.textContent = list.length + " " + woT(list.length === 1 ? "song" : "songs");
  var badge = document.getElementById("wo-filter-n");
  var active = woActiveFilters();
  if (badge) { badge.hidden = active === 0; badge.textContent = String(active); }
  if (list.length && woF.az) {
    var rail = document.createElement("div");
    rail.className = "wo-az";
    rail.setAttribute("aria-label", "A to Z");
    var seenLetter = {};
    var letters = [];
    list.forEach(function (s) {
      var letter = woLetter(s.title);
      if (!seenLetter[letter]) { seenLetter[letter] = 1; letters.push(letter); }
    });
    var tight = false;
    if (window.matchMedia && window.matchMedia("(max-width: 767px)").matches) {
      var avail = window.innerHeight - 100 - 110;
      tight = letters.length * 20 > avail;
    }
    letters.forEach(function (letter, i) {
      var jump = document.createElement("button");
      jump.type = "button";
      var dot = tight && i % 2 === 1;
      jump.className = dot ? "wo-az-dot" : "wo-az-letter";
      jump.textContent = dot ? "·" : letter;
      jump.setAttribute("aria-label", "Jump to " + letter);
      jump.onclick = function () { woJumpLetter(letter, list); };
      rail.appendChild(jump);
    });
    box.appendChild(rail);
  }
  var lastLetter = "";
  shown.forEach(function (s) {
    if (woF.az) {
      var letter = woLetter(s.title);
      if (letter !== lastLetter) {
        var head = document.createElement("div");
        head.className = "wo-letter";
        head.id = "wo-L-" + encodeURIComponent(letter);
        head.textContent = letter;
        box.appendChild(head);
        lastLetter = letter;
      }
    }
    var row = document.createElement("div");
    row.className = "wrow";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wopen";
    b.innerHTML = "<b></b><span></span>";
    b.querySelector("b").textContent = s.title;
    var speed = woSpeedOf(s);
    b.querySelector("span").textContent = (s.artist ? s.artist + " · " : "") + woT("key") + " " + woSharpKey(s.key) + (speed ? " · " + speed.charAt(0).toUpperCase() + speed.slice(1) : "") + (s.tempo ? " · " + s.tempo + " BPM" : "");
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    b.onclick = function () { location.hash = "#/worship/song/" + encodeURIComponent(s.id); };
    var add = document.createElement("button");
    add.type = "button";
    add.className = "wadd";
    add.textContent = woT("add");
    add.setAttribute("aria-label", "Add " + s.title + " to a setlist");
    add.onclick = function () { woShowAddPicker(s.id); };
    row.appendChild(b);
    row.appendChild(add);
    box.appendChild(row);
  });
  if (!shown.length) {
    var p = document.createElement("p");
    p.className = "muted";
    p.textContent = woT("none");
    box.appendChild(p);
  } else if (shown.length < list.length) {
    var more = document.createElement("button");
    more.type = "button";
    more.className = "pill line wo-more";
    more.textContent = woT("showMore") + " (" + (list.length - shown.length) + ")";
    more.onclick = function () { wo.libShown += 60; woRenderLib(); };
    box.appendChild(more);
  }
  if (pane && !wo.holdScroll) {
    pane.scrollTop = keep;
    requestAnimationFrame(function () { pane.scrollTop = keep; });
  }
  wo.holdScroll = false;
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
function woPlacePopover(pop, anchor) {
  var margin = 12;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  pop.style.position = "fixed";
  pop.style.right = "auto";
  pop.style.bottom = "auto";
  pop.style.maxWidth = (vw - margin * 2) + "px";
  pop.style.maxHeight = (vh - margin * 2) + "px";
  pop.style.left = "0px";
  pop.style.top = "0px";
  var rect = pop.getBoundingClientRect();
  var width = Math.min(rect.width, vw - margin * 2);
  var height = Math.min(rect.height, vh - margin * 2);
  var box = anchor.getBoundingClientRect();
  var left = box.right - width;
  if (left < margin) left = margin;
  if (left + width > vw - margin) left = Math.max(margin, vw - margin - width);
  var top = box.bottom + 8;
  if (top + height > vh - margin) {
    var above = box.top - 8 - height;
    top = above >= margin ? above : Math.max(margin, vh - margin - height);
  }
  pop.style.left = Math.round(left) + "px";
  pop.style.top = Math.round(top) + "px";
}
function woCloseSongMenu() {
  document.querySelectorAll(".songmenu").forEach(function (menu) { menu.hidden = true; });
  document.querySelectorAll(".songmore > button").forEach(function (btn) { btn.setAttribute("aria-expanded", "false"); });
}
function woBindMenus() {
  if (wo.menuBound) return;
  wo.menuBound = true;
  document.addEventListener("click", function (e) {
    if (e.target.closest && (e.target.closest(".songmenu") || e.target.closest(".songmore"))) return;
    woCloseSongMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { woCloseSongMenu(); woCloseAddPicker(); }
  });
  window.addEventListener("resize", function () {
    var menu = document.querySelector(".songmenu");
    var btn = document.querySelector(".songmore > button");
    if (menu && !menu.hidden && btn) woPlacePopover(menu, btn);
  });
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
  var tools = document.createElement("div"); tools.className = "songbar";
  function bumped(fn) { return function () { fn(); woSavePref(s.id); woRenderSong(); }; }
  var step = document.createElement("div");
  step.className = "keystep";
  step.setAttribute("role", "group");
  step.setAttribute("aria-label", "Key");
  var minus = woToolBtn("−", bumped(function () { wo.semi--; }), false);
  minus.setAttribute("aria-label", "Lower key");
  var key = document.createElement("b");
  key.className = "wkeyname";
  key.textContent = woKeyNow();
  var plus = woToolBtn("+", bumped(function () { wo.semi++; }), false);
  plus.setAttribute("aria-label", "Raise key");
  step.appendChild(minus); step.appendChild(key); step.appendChild(plus);
  var seg = document.createElement("div");
  seg.className = "songseg";
  seg.setAttribute("role", "tablist");
  seg.setAttribute("aria-label", "Chords or lyrics");
  var chords = woToolBtn("Chords", function () { if (woLyricsOn()) { woSetLyrics(false); woRenderSong(); } }, !woLyricsOn());
  var lyrics = woToolBtn("Lyrics", function () { if (!woLyricsOn()) { woSetLyrics(true); woRenderSong(); } }, woLyricsOn());
  seg.appendChild(chords); seg.appendChild(lyrics);
  var play = woToolBtn("Play", function () { woEnterPlay(false); }, false);
  play.classList.add("is-play");
  var wrap = document.createElement("div");
  wrap.className = "songmore";
  var more = document.createElement("button");
  more.type = "button";
  more.className = "pill line";
  more.textContent = "⋯";
  more.setAttribute("aria-label", "More song actions");
  more.setAttribute("aria-expanded", "false");
  var menu = document.createElement("div");
  menu.className = "songmenu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  function menuItem(label, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "songmenu-item";
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    b.onclick = function () { woCloseSongMenu(); fn(); };
    menu.appendChild(b);
  }
  menuItem("Reset", bumped(function () { wo.semi = 0; wo.flats = false; }));
  menuItem(woNumbersOn() ? "Numbers on" : "Numbers", function () { woSetNumbers(!woNumbersOn()); woRenderSong(); });
  if (s.youtube) {
    var listen = document.createElement("a");
    listen.className = "songmenu-item";
    listen.href = s.youtube;
    listen.target = "_blank";
    listen.rel = "noopener";
    listen.textContent = "Listen";
    menu.appendChild(listen);
  }
  menuItem("Add to setlist", function () { woShowAddPicker(s.id); });
  more.onclick = function (e) {
    e.stopPropagation();
    var open = menu.hidden;
    woCloseSongMenu();
    if (!open) return;
    menu.hidden = false;
    more.setAttribute("aria-expanded", "true");
    woPlacePopover(menu, more);
  };
  woBindMenus();
  wrap.appendChild(more);
  wrap.appendChild(menu);
  tools.appendChild(step);
  tools.appendChild(seg);
  tools.appendChild(play);
  tools.appendChild(wrap);
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
function woDirtyIds() {
  try {
    var ids = JSON.parse(localStorage.getItem(WO_SYNC) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch (e) { return []; }
}
function woMarkDirty(id) {
  if (!id) return;
  var ids = woDirtyIds();
  if (ids.indexOf(id) < 0) ids.push(id);
  localStorage.setItem(WO_SYNC, JSON.stringify(ids));
}
function woClearDirty(id) {
  localStorage.setItem(WO_SYNC, JSON.stringify(woDirtyIds().filter(function (item) { return item !== id; })));
}
function woSyncStatus(text) {
  wo.syncText = text || "";
  ["wo-sync", "wo-sync-list"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !wo.syncText;
    el.textContent = wo.syncText;
  });
}
function woScheduleSync(id) {
  if (!id || !woLiveEnabled()) return;
  woMarkDirty(id);
  wo.syncGen++;
  woSyncStatus("Saving…");
  if (wo.syncTimer) clearTimeout(wo.syncTimer);
  wo.syncTimer = setTimeout(woFlushSync, 1500);
}
function woFlushSync() {
  if (wo.syncFlight) {
    if (!wo.syncTimer) wo.syncTimer = setTimeout(woFlushSync, 200);
    return;
  }
  if (wo.syncTimer) { clearTimeout(wo.syncTimer); wo.syncTimer = 0; }
  var ids = woDirtyIds();
  if (!ids.length || !woLiveEnabled()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    woSyncStatus("Offline, will sync");
    return;
  }
  var id = ids[0];
  var set = woGetSet(id);
  if (!set) { woClearDirty(id); woFlushSync(); return; }
  var gen = wo.syncGen;
  wo.syncFlight = true;
  woSyncStatus("Saving…");
  woPublishSet(set).then(function (ok) {
    wo.syncFlight = false;
    if (!ok) { woSyncStatus("Offline, will sync"); return; }
    if (wo.syncGen === gen) woClearDirty(id);
    if (woDirtyIds().length) {
      woSyncStatus("Saving…");
      if (!wo.syncTimer) wo.syncTimer = setTimeout(woFlushSync, 200);
    } else woSyncStatus("Saved");
  });
}
function woGetSet(id) {
  var found = null;
  woLoadSets().forEach(function (s) { if (s.id === id) found = s; });
  return found;
}
function woLoadSet() { return woGetSet(wo.setId) || woBlankSet(); }
function woSaveSet(set, remote) {
  var list = woLoadSets(), i = -1;
  list.forEach(function (s, idx) { if (s.id === set.id) i = idx; });
  if (i < 0) list.unshift(set); else list[i] = set;
  woSaveSets(list);
  if (!remote) woScheduleSync(set.id);
  var setsPane = document.getElementById("wo-sets");
  if (setsPane && !setsPane.hidden) woRenderSets();
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
  woScheduleSync(set.id);
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
  woSyncStatus(wo.syncText);
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
        woClearDirty(set.id);
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
  woSyncStatus(wo.syncText);
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
    noteIn.addEventListener("input", function () {
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
  var cur = set.songs[i].key, next = woSpell(woPc(cur) + dir, woFlatsFor({ key: cur }, dir)) + (woIsMinor(cur) ? "m" : "");
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
  var lead = document.getElementById("wo-leader");
  if (!lead) return;
  set.leaderNote = lead.value;
  woSaveSet(set);
}
function woShareUrl(set) {
  var payload = { id: set.id, d: set.date, t: set.title || "", svc: set.service || "", lang: set.language || "", ldr: set.leader || "", n: set.leaderNote || "", s: (set.songs || []).map(function (x) { return [x.id, x.key, x.note || ""]; }) };
  var enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.origin + location.pathname + location.search + "#/worship/set/" + enc;
}
function woShare(id, field) {
  var set = woGetSet(id || wo.setId) || woLoadSet();
  var url = woShareUrl(set);
  var title = woSetTitle(set);
  function fallback() {
    var out = document.getElementById(field || "wo-share");
    if (!out) return;
    out.hidden = false;
    out.value = url;
    out.focus();
    out.select();
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
  }
  if (navigator.share) {
    navigator.share({ title: title, text: set.leaderNote || title, url: url }).catch(function (err) {
      if (err && err.name === "AbortError") return;
      fallback();
    });
    return;
  }
  fallback();
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
  woScheduleSync(set.id);
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
  if (!fromSet) list.forEach(function (item, i) { if (wo.cur && item.song.id === wo.cur.id) wo.playIndex = i; });
  document.getElementById("wo-play").hidden = false;
  document.body.classList.add("wo-playing");
  woRenderPlay();
  woSizePlayChrome();
  woWake(true);
  if (fromSet) woLiveWatch(true);
}
function woSizePlayChrome() {
  var bar = document.getElementById("wo-play-bar");
  var play = document.getElementById("wo-play");
  if (!bar || !play) return;
  play.style.setProperty("--wo-bar", Math.ceil(bar.getBoundingClientRect().height) + "px");
}
window.addEventListener("resize", function () {
  if (!document.body.classList.contains("wo-playing")) return;
  woSizePlayChrome();
  woFitPlay();
});
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
  document.getElementById("wo-play-key").textContent = "Key: " + woKeyNow();
  woPlayNav();
  document.getElementById("wo-play-num").classList.toggle("on", woNumbersOn());
  document.getElementById("wo-play-num").setAttribute("aria-pressed", woNumbersOn() ? "true" : "false");
  var body = document.getElementById("wo-play-body");
  body.replaceChildren(woChart(item.song));
  body.scrollTop = 0;
  document.getElementById("wo-play").classList.add("wo-fitting");
  woFitPlay();
  document.getElementById("wo-play-pos").textContent = "Song " + (wo.playIndex + 1) + " of " + wo.playList.length;
  woSizePlayChrome();
  document.getElementById("wo-play-lyrics").classList.toggle("on", woLyricsOn());
  document.getElementById("wo-play-body").classList.toggle("lyrics-only", woLyricsOn());
  woApplyPlayLook();
  var jump = document.getElementById("wo-jump");
  if (jump) jump.hidden = true;
}
function woPlaySizes() {
  try {
    var map = JSON.parse(localStorage.getItem(WO_PLAY_SIZE) || "{}");
    return map && typeof map === "object" ? map : {};
  } catch (e) { return {}; }
}
function woPlaySize(id) {
  var n = Number(woPlaySizes()[id]);
  return n >= 8 && n <= 48 ? n : 0;
}
function woSetPlaySize(id, px) {
  var map = woPlaySizes();
  map[id] = px;
  localStorage.setItem(WO_PLAY_SIZE, JSON.stringify(map));
}
function woClearPlaySize(id) {
  var map = woPlaySizes();
  delete map[id];
  localStorage.setItem(WO_PLAY_SIZE, JSON.stringify(map));
}
function woApplyPlaySize(px, cols) {
  var play = document.getElementById("wo-play");
  var body = document.getElementById("wo-play-body");
  if (!play || !body) return;
  var n = cols === true ? 2 : (Number(cols) || 1);
  play.classList.add("wo-fitting");
  play.style.setProperty("--wo-fs", px + "px");
  body.classList.toggle("wo-cols", n > 1);
  body.style.setProperty("--wo-cols", String(Math.max(1, n)));
}
function woPlayBlocks() {
  return Array.from(document.querySelectorAll("#wo-play-body .wblock"));
}
function woOccupiedCols() {
  var seen = [];
  woPlayBlocks().forEach(function (block) {
    var x = block.getBoundingClientRect().left;
    if (!seen.some(function (v) { return Math.abs(v - x) < 40; })) seen.push(x);
  });
  return seen.length;
}
function woInkHits(a, b) {
  var x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  var y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 3 && y > 3;
}
function woLinesFit() {
  var lines = document.querySelectorAll("#wo-play-body .wline");
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].scrollWidth > lines[i].clientWidth + 2) return false;
    var words = lines[i].querySelectorAll(".wword");
    if (!words.length) continue;
    var box = lines[i].getBoundingClientRect();
    var top = words[0].getBoundingClientRect().top;
    for (var j = 0; j < words.length; j++) {
      var word = words[j].getBoundingClientRect();
      if (word.width > box.width + 2) return false;
      if (words.length > 1 && Math.abs(word.top - top) > 3) return false;
    }
  }
  var chords = Array.from(document.querySelectorAll("#wo-play-body .chord"));
  var lyrics = Array.from(document.querySelectorAll("#wo-play-body .wseg > span:last-child"));
  for (var c = 0; c < chords.length; c++) {
    var cr = chords[c].getBoundingClientRect();
    if (cr.width < 2 || cr.height < 2) continue;
    var seg = chords[c].parentElement && chords[c].parentElement.parentElement;
    for (var d = c + 1; d < chords.length; d++) {
      if (woInkHits(cr, chords[d].getBoundingClientRect())) return false;
    }
    for (var k = 0; k < lyrics.length; k++) {
      if (seg && seg.contains(lyrics[k])) continue;
      if (!lyrics[k].textContent.replace(/\s/g, "")) continue;
      if (woInkHits(cr, lyrics[k].getBoundingClientRect())) return false;
    }
  }
  return true;
}
function woSongFullyVisible() {
  var body = document.getElementById("wo-play-body");
  var blocks = woPlayBlocks();
  if (!body || !blocks.length) return false;
  var kept = body.scrollTop;
  body.scrollTop = 0;
  var view = body.getBoundingClientRect();
  var ok = blocks.every(function (block) {
    var rect = block.getBoundingClientRect();
    return rect.top >= view.top - 1 && rect.bottom <= view.bottom + 2 && rect.left >= view.left - 2 && rect.right <= view.right + 2;
  });
  body.scrollTop = kept;
  return ok;
}
function woScrollReachesEnd() {
  var body = document.getElementById("wo-play-body");
  var blocks = woPlayBlocks();
  if (!body || !blocks.length) return false;
  var kept = body.scrollTop;
  body.scrollTop = body.scrollHeight;
  var view = body.getBoundingClientRect();
  var last = blocks[blocks.length - 1].getBoundingClientRect();
  var ok = last.bottom <= view.bottom + 2 && last.top < view.bottom - 4;
  body.scrollTop = kept;
  return ok;
}
function woLayoutOk(cols) {
  var n = cols === true ? 2 : (Number(cols) || 1);
  if (!woLinesFit()) return false;
  if (n > 1 && woOccupiedCols() < Math.min(n, woPlayBlocks().length)) return false;
  return true;
}
function woChooseCols(px) {
  var options = [1];
  if (woWidePlay()) options.push(2);
  if (window.innerWidth >= 1100) options.push(3);
  var fitted = 0;
  var scrollable = 0;
  options.forEach(function (n) {
    woApplyPlaySize(px, n);
    if (!woLayoutOk(n)) return;
    if (woSongFullyVisible()) fitted = n;
    else if (woScrollReachesEnd()) scrollable = n;
  });
  var choice = fitted || scrollable || 1;
  woApplyPlaySize(px, choice);
  if (!woLayoutOk(choice) || (!woSongFullyVisible() && !woScrollReachesEnd())) woApplyPlaySize(px, 1);
}
function woPlayFits(px, cols) {
  woApplyPlaySize(px, cols);
  var n = cols === true ? 2 : (Number(cols) || 1);
  return woLayoutOk(n) && woSongFullyVisible();
}
function woPlayNav() {
  var multi = !!(wo.playList && wo.playList.length > 1);
  ["wo-play-prev", "wo-play-next", "wo-play-pos"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = !multi;
  });
  document.querySelectorAll("#wo-play .wo-edge").forEach(function (el) { el.hidden = !multi; });
}
function woBestFit(cols) {
  var lo = 8, hi = 48, best = 8, fits = false;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (woPlayFits(mid, cols)) { best = mid; fits = true; lo = mid + 1; }
    else hi = mid - 1;
  }
  return { px: best, fits: fits };
}
function woWidePlay() {
  var w = window.innerWidth, h = window.innerHeight;
  return w >= 768 || (w > h && w >= 700);
}
function woAutoFit() {
  var one = woBestFit(1);
  var two = woWidePlay() ? woBestFit(2) : null;
  var three = window.innerWidth >= 1100 ? woBestFit(3) : null;
  var cols = 1;
  var px = one.px;
  if (two && two.fits && (!one.fits || two.px >= one.px)) { cols = 2; px = two.px; }
  if (three && three.fits && three.px >= px) { cols = 3; px = three.px; }
  woApplyPlaySize(px, cols);
}
function woFitPlay() {
  var gen = ++wo.fitGen;
  requestAnimationFrame(function () {
    if (gen !== wo.fitGen) return;
    var item = wo.playList && wo.playList[wo.playIndex];
    if (!item || !item.song) return;
    var saved = woPlaySize(item.song.id);
    if (saved) woChooseCols(saved);
    if (!saved || !woSongFullyVisible()) woAutoFit();
  });
}
function woNudgePlaySize(delta) {
  var item = wo.playList && wo.playList[wo.playIndex];
  if (!item || !item.song) return;
  var cur = woPlaySize(item.song.id);
  if (!cur) {
    var raw = getComputedStyle(document.getElementById("wo-play")).getPropertyValue("--wo-fs");
    cur = parseFloat(raw) || 16;
  }
  var next = Math.max(8, Math.min(48, Math.round(cur + delta)));
  woSetPlaySize(item.song.id, next);
  woChooseCols(next);
}
function woResetPlaySize() {
  var item = wo.playList && wo.playList[wo.playIndex];
  if (!item || !item.song) return;
  woClearPlaySize(item.song.id);
  woAutoFit();
}
function woPlayStep(dir) {
  if (!wo.playList || !wo.playList.length) return;
  var next = wo.playIndex + dir;
  if (next < 0 || next >= wo.playList.length) return;
  wo.playIndex = next;
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
    if (woStillLocked(data)) { console.warn("Worship setlist:", woBackendError(data, WO_UNAVAILABLE)); return; }
    if (!data || !data.found) return;
    var set = woGetSet(wo.setId);
    if (!set) return;
    if (set.updatedAt && data.updatedAt && data.updatedAt <= set.updatedAt) return;
    set.songs = data.songs || [];
    set.leaderNote = data.leaderNote || "";
    if (data.date) set.date = data.date;
    if (typeof data.title === "string") {
      set.title = data.title;
      set.titleEdited = data.titleEdited === true;
    }
    if (typeof data.leader === "string" && data.leader) set.leader = data.leader;
    if (data.service != null) set.service = data.service;
    if (data.language === "en" || data.language === "ko" || data.language === "") set.language = data.language;
    set.updatedAt = data.updatedAt;
    set.change = data.change || "";
    woSaveSet(set, true);
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
function woPublishSet(set) {
  var body = {
    id: set.id,
    date: set.date,
    title: set.title || "",
    titleEdited: set.titleEdited === true,
    service: set.service || "",
    language: set.language || "",
    leader: set.leader || "",
    leaderNote: set.leaderNote || "",
    change: "",
    songs: set.songs || []
  };
  var encoded = JSON.stringify(body);
  function done(res) {
    if (woStillLocked(res) || !res || res.ok === false) {
      console.warn("Worship publish:", woBackendError(res, "Couldn't publish."));
      return false;
    }
    set.updatedAt = res.updatedAt || set.updatedAt;
    set.change = "";
    woSaveSet(set, true);
    return true;
  }
  if (woBackendEnabled()) return woApi({ action: "publish", payload: encoded }).then(done).catch(function () { return false; });
  if (encoded.length < 6000) return woJsonp({ action: "publish", payload: encoded }).then(done).catch(function () { return false; });
  return fetch(LIVE_SETLIST_ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: encoded }).then(function () {
    woSaveSet(set, true);
    return true;
  }).catch(function () { return false; });
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
  if (window.bethanyAllowWorship && !window.bethanyAllowWorship()) {
    var next = encodeURIComponent(path);
    if ((location.hash || "").indexOf("team-code") < 0) location.replace("#/team-code?next=" + next);
    return;
  }
  document.body.classList.add("in-worship");
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
woBindMenus();
document.getElementById("wo-q").addEventListener("input", woRenderLib);
document.getElementById("wo-date").addEventListener("change", woDateChanged);
document.getElementById("wo-title").addEventListener("input", woTitleChanged);
document.getElementById("wo-new-date").addEventListener("change", woNewDateChanged);
document.getElementById("wo-new-title").addEventListener("input", woNewTitleInput);
document.getElementById("wo-new-leader").addEventListener("change", woNewLeaderChanged);
document.getElementById("wo-set-leader").addEventListener("change", woSetLeaderChanged);
document.getElementById("wo-service").addEventListener("change", woServiceChanged);
document.getElementById("wo-set-lang").addEventListener("change", woSetLangChanged);
document.getElementById("wo-new-service").addEventListener("change", function () { woSyncServiceLang(document.getElementById("wo-new-service"), document.getElementById("wo-new-lang")); });
var woLeaderInput = document.getElementById("wo-leader");
if (woLeaderInput) woLeaderInput.addEventListener("input", woLeaderChanged);
addEventListener("online", function () { if (woDirtyIds().length) woFlushSync(); });
addEventListener("hashchange", worshipRoute);
addEventListener("resize", function () {
  if (document.body.classList.contains("in-worship") && woTablet() !== woWasTablet) woShow(wo.view);
  var play = document.getElementById("wo-play");
  if (!play || play.hidden) return;
  if (wo.fitTimer) clearTimeout(wo.fitTimer);
  wo.fitTimer = setTimeout(function () {
    var item = wo.playList && wo.playList[wo.playIndex];
    if (!item || !item.song) return;
    if (woPlaySize(item.song.id)) woApplyPlaySize(woPlaySize(item.song.id), false);
    else woAutoFit();
  }, 120);
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
woFlushSync();
