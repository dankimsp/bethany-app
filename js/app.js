var LANG_KEY = "bethany-lang";
var TEAMS_KEY = "bethany-teams";
var NAME_KEY = "bethany-display-name";
var DEVICE_KEY = "bethany-device";
var PERSON_KEY = "bethany-availability-person";
var AVAIL_KEY = "bethany-availability";

function t(key) {
  var lang = appLang();
  var table = BETHANY_I18N[lang] || BETHANY_I18N.en;
  return table[key] != null ? table[key] : (BETHANY_I18N.en[key] || key);
}
function appLang() {
  try { return localStorage.getItem(LANG_KEY) === "ko" ? "ko" : "en"; } catch (e) { return "en"; }
}
function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang === "ko" ? "ko" : "en"); } catch (e) {}
  document.documentElement.lang = appLang() === "ko" ? "ko" : "en";
  applyI18n();
  renderAll();
}
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
}
function deviceId() {
  try {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch (e) { return "device"; }
}
function teams() {
  try { var list = JSON.parse(localStorage.getItem(TEAMS_KEY) || "[]"); return Array.isArray(list) ? list : []; } catch (e) { return []; }
}
function hasTeam(id) { return teams().indexOf(id) >= 0; }
function rememberTeam(id) {
  var list = teams();
  if (list.indexOf(id) < 0) list.push(id);
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list)); } catch (e) {}
}
window.bethanyAllowWorship = function () { return hasTeam("worship"); };
function displayName() {
  try { return localStorage.getItem("bethany-signup-name") || ""; } catch (e) { return ""; }
}
function laParts() {
  var p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function fmtTime(h, m) {
  var ap = h < 12 ? "AM" : "PM";
  var hr = h % 12 || 12;
  return hr + ":" + pad(m) + " " + ap;
}
function dayName(d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]; }
function dayKo(d) { return ["일", "월", "화", "수", "목", "금", "토"][d]; }
function nextService() {
  var n = laParts();
  var now = n.dow * 1440 + n.h * 60 + n.mi;
  var best = null;
  BETHANY_WEEKLY.forEach(function (s) {
    if (!s.worship) return;
    var tmin = s.day * 1440 + s.h * 60 + s.m;
    var diff = (tmin - now + 10080) % 10080;
    if (diff === 0) diff = 10080;
    if (!best || diff < best.diff) best = { s: s, diff: diff };
  });
  var when = new Date(Date.UTC(n.y, n.mo - 1, n.d));
  when.setUTCDate(when.getUTCDate() + Math.floor((now + best.diff) / 1440) - n.dow);
  return { item: best.s, date: when };
}
function ymd(dt) { return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()); }
function upcomingSundays(count) {
  var n = laParts();
  var add = (7 - n.dow) % 7;
  var first = new Date(Date.UTC(n.y, n.mo - 1, n.d + add));
  var out = [];
  for (var i = 0; i < count; i++) {
    var dt = new Date(first.getTime());
    dt.setUTCDate(first.getUTCDate() + i * 7);
    out.push(ymd(dt));
  }
  return out;
}
function prettySunday(iso) {
  var p = iso.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
  return { mon: mon.toUpperCase(), day: String(dt.getUTCDate()), label: "Sun, " + mon + " " + dt.getUTCDate() };
}
function weekItems() {
  var n = laParts();
  return BETHANY_WEEKLY.filter(function (s) {
    var ahead = (s.day - n.dow + 7) % 7;
    return ahead <= 6;
  }).slice(0, 3);
}
function specials() {
  var n = laParts();
  var today = n.y + "-" + pad(n.mo) + "-" + pad(n.d);
  return BETHANY_EVENTS.filter(function (ev) { return ev.date >= today; });
}
function icsFor(ev) {
  var start = ev.date.replace(/-/g, "") + "T" + ev.time.replace(":", "") + "00";
  var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bethany Church//EN", "BEGIN:VEVENT", "SUMMARY:" + ev.title + " – Bethany Church", "DTSTART;TZID=America/Los_Angeles:" + start, "LOCATION:15414 Ash Way\\, Lynnwood\\, WA 98087", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = "bethany-" + ev.id + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
}
function api(params) {
  if (typeof woApi === "function") return woApi(params);
  return Promise.reject(new Error("offline"));
}
function soonError(res) {
  if (!res || res.ok === false) {
    var err = res && res.error;
    if (!err || err === "action" || err === "soon" || err === "config") return true;
  }
  return false;
}

function renderHome() {
  var nx = nextService();
  var s = nx.item;
  var name = displayName();
  var hour = laParts().h;
  var part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  var hello = document.getElementById("greet");
  var helloWord = appLang() === "ko" ? t(part) : ("Good " + t(part));
  hello.innerHTML = helloWord + (name ? ", <em>" + escapeHtml(name) + "</em>" + (appLang() === "ko" ? "님" : "") : "");
  document.getElementById("hero-name").textContent = appLang() === "ko" ? s.ko : s.name;
  document.getElementById("hero-when").textContent = nx.date.toLocaleDateString(appLang() === "ko" ? "ko-KR" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  document.getElementById("hero-time").textContent = fmtTime(s.h, s.m);
  document.getElementById("watch-live").hidden = !s.live;
  var up = document.getElementById("home-events");
  up.replaceChildren();
  var head = document.createElement("div");
  head.className = "row-between";
  head.innerHTML = '<span class="eyebrow">' + t("upcoming") + '</span><button type="button" class="lnkbtn" id="see-events-2">' + t("seeAll") + "</button>";
  up.appendChild(head);
  head.querySelector("button").onclick = function () { location.hash = "#/events"; };
  var specs = specials();
  if (specs[0]) up.appendChild(specialCard(specs[0], true));
  var label = document.createElement("div");
  label.className = "eyebrow";
  label.style.margin = "10px 2px 0";
  label.textContent = t("thisWeek");
  up.appendChild(label);
  weekItems().forEach(function (item) {
    var row = document.createElement("div");
    row.className = "wkrow";
    row.innerHTML = '<span class="day">' + (appLang() === "ko" ? dayKo(item.day) : dayName(item.day)) + '</span><div class="tt">' + escapeHtml(appLang() === "ko" ? item.ko : item.name) + '</div><span class="tm">' + fmtTime(item.h, item.m) + "</span>";
    up.appendChild(row);
  });
  var tile = document.getElementById("home-ministry");
  tile.hidden = !teams().length;
  document.getElementById("sermon-tile").classList.toggle("wide", !teams().length);
}
function specialCard(ev, compact) {
  var p = ev.date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var mon = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  var box = document.createElement("div");
  box.className = compact ? "special-home" : "card ecard";
  box.innerHTML = '<div class="dblk"><small>' + mon + '</small><b>' + dt.getUTCDate() + '</b><span>' + (appLang() === "ko" ? "일" : "Sun") + '</span></div><div class="grow"><div class="eyebrow gold">' + t("special") + '</div><div class="tt">' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="row-between"><span class="mut">' + fmtTime(+ev.time.split(":")[0], +ev.time.split(":")[1]) + '</span><button type="button" class="pill sm white cal">' + t("addCal") + "</button></div></div>";
  box.querySelector(".cal").onclick = function () { icsFor(ev); };
  return box;
}
function renderEvents() {
  var weekly = document.getElementById("weekly-list");
  weekly.replaceChildren();
  BETHANY_WEEKLY.forEach(function (item) {
    var row = document.createElement("div");
    row.className = "wkrow";
    row.innerHTML = '<span class="day">' + dayName(item.day) + '</span><div class="tt">' + escapeHtml(appLang() === "ko" ? item.ko : item.name) + "</div>" + (item.live ? '<span class="chip acc">' + t("liveWord") + "</span>" : "") + '<span class="tm">' + fmtTime(item.h, item.m) + "</span>";
    weekly.appendChild(row);
  });
  var box = document.getElementById("special-list");
  box.replaceChildren();
  var list = specials();
  if (!list.length) {
    var p = document.createElement("p");
    p.className = "mut";
    p.textContent = appLang() === "ko" ? "예정된 특별 행사가 없습니다." : "No special events right now.";
    box.appendChild(p);
    return;
  }
  list.forEach(function (ev) { box.appendChild(specialCard(ev, false)); });
}
function renderMinistries() {
  var box = document.getElementById("ministry-list");
  box.replaceChildren();
  BETHANY_MINISTRIES.forEach(function (m) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "card ministry-row";
    b.innerHTML = '<span class="mic acc"><svg class="i"><use href="#i-' + m.icon + '"/></svg></span><div class="grow"><b>' + escapeHtml(appLang() === "ko" ? m.ko : m.name) + '</b><div class="mut">' + escapeHtml(appLang() === "ko" ? m.koBlurb : m.blurb) + '</div></div><span class="go"><svg class="i"><use href="#i-arr"/></svg></span>';
    b.onclick = function () { openMinistry(m.id); };
    box.appendChild(b);
  });
}
function openMinistry(id) {
  var m = ministryById(id);
  if (!m) return;
  if (m.code && !hasTeam(id)) { location.hash = "#/team-code?team=" + id; return; }
  if (id === "kitchen") { location.hash = "#/food-kitchen"; return; }
  location.hash = "#/ministry";
}
function ministryById(id) {
  var found = null;
  BETHANY_MINISTRIES.forEach(function (m) { if (m.id === id) found = m; });
  return found;
}
function renderMinistry() {
  var box = document.getElementById("my-tools");
  box.replaceChildren();
  var joined = BETHANY_MINISTRIES.filter(function (m) { return hasTeam(m.id); });
  document.getElementById("ministry-empty").hidden = !!joined.length;
  joined.forEach(function (m) {
    var head = document.createElement("div");
    head.className = "card who";
    head.innerHTML = '<span class="mic acc"><svg class="i"><use href="#i-' + m.icon + '"/></svg></span><div class="grow"><b>' + escapeHtml(m.name) + '</b><div class="mut">' + t("unlocked") + '</div></div><span class="chip acc">' + t("joined") + "</span>";
    box.appendChild(head);
    var grid = document.createElement("div");
    grid.className = "tgrid";
    m.tools.forEach(function (tool) {
      var a = document.createElement("a");
      a.className = "card tool";
      a.href = tool.href;
      a.innerHTML = '<div class="top"><span class="mic gold"><svg class="i"><use href="#i-list"/></svg></span></div><div><h3>' + escapeHtml(appLang() === "ko" ? tool.ko : tool.name) + "</h3><p>" + escapeHtml(tool.hint) + "</p></div>";
      grid.appendChild(a);
    });
    box.appendChild(grid);
  });
}
function renderKitchen() {
  document.getElementById("kitchen-blurb").textContent = appLang() === "ko" ? ministryById("kitchen").koBlurb : ministryById("kitchen").blurb;
  paintKitchenCard("km-food", "km-hint");
  paintKitchenCard("snack", "snack-hint");
}
function paintKitchenCard(kind, hintId) {
  var hint = document.getElementById(hintId);
  if (!hint) return;
  hint.hidden = true;
  api({ action: "getSignups", kind: kind }).then(function (res) {
    if (soonError(res) || !res) return;
    var rows = res.signups || [];
    var days = upcomingSundays(6);
    if (kind === "snack") {
      var taken = days.filter(function (iso) { return rows.some(function (row) { return row.sunday === iso; }); }).length;
      hint.hidden = false;
      hint.textContent = taken + " " + t("takenOf");
    } else {
      var first = days[0];
      var n = rows.filter(function (row) { return row.sunday === first; }).length;
      hint.hidden = false;
      hint.textContent = n + " " + t("signedThis");
    }
  }).catch(function () {});
}
function joinTeam(ev) {
  if (ev) ev.preventDefault();
  var code = document.getElementById("team-code-input").value.trim();
  var msg = document.getElementById("team-code-msg");
  var team = teamFromHash() || "worship";
  msg.hidden = true;
  if (!code) { msg.hidden = false; msg.textContent = t("wrongCode"); return; }
  api({ action: "verifyTeamCode", team: team, code: code }).then(function (res) {
    if (res && res.ok && res.team) {
      rememberTeam(res.team);
      document.getElementById("team-code-input").value = "";
      location.hash = res.team === "worship" ? "#/ministry" : "#/ministry";
      return;
    }
    msg.hidden = false;
    msg.textContent = soonError(res) ? t("soon") : t("wrongCode");
  }).catch(function () { msg.hidden = false; msg.textContent = t("soon"); });
}
function teamFromHash() {
  var h = location.hash || "";
  var m = h.match(/[?&]team=([a-z]+)/);
  return m ? m[1] : "";
}

var signupCache = {};
var signupPick = "";
function loadSignups(kind) {
  var msg = document.getElementById("signup-msg");
  paintSignups(kind, signupCache[kind] || []);
  api({ action: "getSignups", kind: kind }).then(function (res) {
    if (soonError(res)) { msg.hidden = false; msg.textContent = t("soon"); signupCache[kind] = signupCache[kind] || []; return; }
    msg.hidden = true;
    signupCache[kind] = (res && res.signups) || [];
    paintSignups(kind, signupCache[kind]);
  }).catch(function () { msg.hidden = false; msg.textContent = t("soon"); });
}
function paintSignups(kind, rows) {
  var box = document.getElementById("signup-list");
  var mine = document.getElementById("signup-mine");
  box.replaceChildren();
  var dev = deviceId();
  var exclusive = kind !== "km-food";
  var byDay = {};
  rows.forEach(function (row) {
    if (!byDay[row.sunday]) byDay[row.sunday] = [];
    byDay[row.sunday].push(row);
  });
  var own = null;
  upcomingSundays(6).forEach(function (iso) {
    var people = byDay[iso] || [];
    var mineRow = null;
    people.forEach(function (p) { if (p.deviceId === dev) mineRow = p; });
    if (mineRow) own = { iso: iso, name: mineRow.name };
    var taken = exclusive && people.length && !mineRow;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lr signup-day" + (taken ? " locked" : "") + (signupPick === iso ? " on" : "");
    btn.disabled = !!taken;
    var meta = prettySunday(iso);
    var names = people.map(function (p) { return p.deviceId === dev ? t("you") : p.name; }).join(", ");
    var sub = names ? (taken ? t("taken") + " · " + names : names) : (taken ? t("taken") : t("open"));
    btn.innerHTML = '<span class="day">' + meta.mon + '</span><div class="grow"><div class="tt">' + meta.label + '</div><div class="ts">' + escapeHtml(sub) + '</div></div>' + (taken ? "" : '<span class="radio' + (signupPick === iso ? " on" : "") + '"></span>');
    if (!taken) btn.onclick = function () { signupPick = iso; paintSignups(kind, rows); };
    box.appendChild(btn);
  });
  mine.hidden = !own;
  if (own) document.getElementById("signup-mine-label").textContent = own.name + " · " + prettySunday(own.iso).label;
  mine.dataset.sunday = own ? own.iso : "";
}
function addSignup(kind, iso) {
  var name = document.getElementById("signup-name").value.trim();
  var msg = document.getElementById("signup-msg");
  if (!iso) iso = signupPick;
  if (!name) { msg.hidden = false; msg.textContent = t("name"); return; }
  if (!iso) { msg.hidden = false; msg.textContent = t("which"); return; }
  try { localStorage.setItem("bethany-signup-name", name); } catch (e) {}
  msg.hidden = false;
  msg.textContent = t("saving");
  api({ action: "addSignup", kind: kind, sunday: iso, name: name, deviceId: deviceId() }).then(function (res) {
    if (soonError(res)) { msg.textContent = t("soon"); return; }
    if (res && res.error === "taken") { msg.textContent = t("taken"); loadSignups(kind); return; }
    msg.hidden = true;
    loadSignups(kind);
  }).catch(function () { msg.hidden = false; msg.textContent = t("soon"); });
}
function cancelSignup(kind) {
  var iso = document.getElementById("signup-mine").dataset.sunday;
  if (!iso) return;
  api({ action: "cancelSignup", kind: kind, sunday: iso, deviceId: deviceId() }).then(function () { loadSignups(kind); }).catch(function () {
    document.getElementById("signup-msg").hidden = false;
    document.getElementById("signup-msg").textContent = t("soon");
  });
}

function availMap() {
  try { return JSON.parse(localStorage.getItem(AVAIL_KEY) || "{}"); } catch (e) { return {}; }
}
function saveAvailLocal(map) { try { localStorage.setItem(AVAIL_KEY, JSON.stringify(map)); } catch (e) {} }
function personId() { try { return localStorage.getItem(PERSON_KEY) || ""; } catch (e) { return ""; } }
function renderAvailability() {
  var pick = document.getElementById("avail-pick");
  var member = document.getElementById("avail-member");
  var id = personId();
  pick.hidden = !!id;
  member.hidden = !id;
  if (!id) { renderRoster(); return; }
  var person = null;
  BETHANY_ROSTER.forEach(function (p) { if (p.id === id) person = p; });
  document.getElementById("avail-who").textContent = person ? person.name : id;
  var days = upcomingSundays(5);
  var map = availMap();
  var list = document.getElementById("avail-days");
  list.replaceChildren();
  var open = 0;
  days.forEach(function (iso) {
    var rec = map[id + "|" + iso] || {};
    if (!rec.status) open++;
    var card = document.createElement("div");
    card.className = "card sun" + (!rec.status ? " needs" : "");
    var meta = prettySunday(iso);
    card.innerHTML = '<div class="hd"><div class="dt">' + meta.label + '</div>' + (!rec.status ? '<span class="chip gold">' + t("needs") + "</span>" : "") + '</div><div class="av3"></div><input class="note" placeholder="' + t("note") + '" value="' + escapeAttr(rec.note || "") + '">';
    var av = card.querySelector(".av3");
    ["available", "maybe", "unavailable"].forEach(function (status) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = t(status === "available" ? "available" : status === "maybe" ? "maybe" : "unavailable");
      b.className = rec.status === status ? status : "";
      b.onclick = function () { setAvail(id, iso, status, card.querySelector(".note").value); };
      av.appendChild(b);
    });
    card.querySelector(".note").addEventListener("change", function (e) { setAvail(id, iso, rec.status || "", e.target.value); });
    list.appendChild(card);
  });
  document.getElementById("home-answer") && (document.getElementById("home-answer").textContent = open ? open + " " + t("answersSome") : t("saved"));
  renderTeamGrid(days, map);
}
function renderRoster() {
  var box = document.getElementById("roster");
  box.replaceChildren();
  BETHANY_ROSTER.forEach(function (p) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lr who";
    b.innerHTML = '<span class="avt">' + escapeHtml(initials(p.name)) + '</span><div class="grow"><div class="tt">' + escapeHtml(p.name) + '</div>' + (p.role ? '<div class="ts">' + escapeHtml(p.role) + "</div>" : "") + '</div><span class="radio"></span>';
    b.onclick = function () {
      try { localStorage.setItem(PERSON_KEY, p.id); } catch (e) {}
      renderAvailability();
    };
    box.appendChild(b);
  });
}
function initials(name) { return name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
function setAvail(person, iso, status, note) {
  var map = availMap();
  map[person + "|" + iso] = { status: status, note: note || "" };
  saveAvailLocal(map);
  document.getElementById("avail-status").textContent = t("saving");
  api({ action: "setAvailability", team: "worship", person: person, sunday: iso, status: status, note: note || "" }).then(function (res) {
    document.getElementById("avail-status").textContent = soonError(res) ? t("soon") : t("saved");
    renderAvailability();
  }).catch(function () { document.getElementById("avail-status").textContent = t("soon"); renderAvailability(); });
}
function renderTeamGrid(days, map) {
  var g = document.getElementById("avail-grid");
  if (!g) return;
  var html = '<colgroup><col class="who"><col span="' + days.length + '"></colgroup><tr><th></th>' + days.map(function (iso) { var p = prettySunday(iso); return "<th>" + p.mon + "<b>" + p.day + "</b></th>"; }).join("") + "</tr>";
  BETHANY_ROSTER.forEach(function (person) {
    html += '<tr><td class="nm">' + escapeHtml(person.name) + (person.role ? "<small>" + escapeHtml(person.role) + "</small>" : "") + "</td>";
    days.forEach(function (iso) {
      var rec = map[person.id + "|" + iso] || {};
      var cls = rec.status === "available" ? "a" : rec.status === "maybe" ? "m" : rec.status === "unavailable" ? "u" : "e";
      var icon = cls === "a" ? "ok" : cls === "m" ? "q" : cls === "u" ? "x" : "";
      html += '<td><div class="cl ' + cls + '">' + (icon ? '<svg class="i"><use href="#i-' + icon + '"/></svg>' : "") + "</div></td>";
    });
    html += "</tr>";
  });
  html += '<tr><td class="nm">' + t("available") + "</td>";
  days.forEach(function (iso) {
    var n = BETHANY_ROSTER.filter(function (p) { return (map[p.id + "|" + iso] || {}).status === "available"; }).length;
    html += '<td><div class="cnt">' + n + "\u00a0" + t("of") + "\u00a0" + BETHANY_ROSTER.length + "</div></td>";
  });
  html += "</tr>";
  g.innerHTML = html;
  var warn = document.getElementById("avail-warn");
  var empty = document.getElementById("avail-empty");
  var anyAnswer = false;
  days.forEach(function (iso) {
    BETHANY_ROSTER.forEach(function (p) { if ((map[p.id + "|" + iso] || {}).status) anyAnswer = true; });
  });
  if (empty) {
    empty.hidden = anyAnswer;
    empty.textContent = t("emptyAvail");
  }
  var warnDay = null;
  if (anyAnswer) {
    days.forEach(function (iso) {
      if (warnDay) return;
      var answered = BETHANY_ROSTER.filter(function (p) { return (map[p.id + "|" + iso] || {}).status; }).length;
      var available = BETHANY_ROSTER.filter(function (p) { return (map[p.id + "|" + iso] || {}).status === "available"; }).length;
      var soon = daysUntil(iso) <= 7;
      if (available < 3 && (answered > 0 || soon)) warnDay = { iso: iso, available: available, missing: BETHANY_ROSTER.length - answered };
    });
  }
  if (warnDay) {
    warn.hidden = false;
    warn.textContent = prettySunday(warnDay.iso).label + " " + t("short") + ": " + warnDay.available + " " + t("available").toLowerCase() + ", " + warnDay.missing + " " + t("havent") + ".";
  } else warn.hidden = true;
}
function daysUntil(iso) {
  var n = laParts();
  var today = Date.UTC(n.y, n.mo - 1, n.d);
  var p = iso.split("-");
  return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - today) / 86400000);
}
function pullAvailability() {
  api({ action: "getAvailability", team: "worship" }).then(function (res) {
    if (!res || !res.rows) return;
    var map = availMap();
    res.rows.forEach(function (row) { map[row.person + "|" + row.sunday] = { status: row.status, note: row.note || "" }; });
    saveAvailLocal(map);
    if ((location.hash || "").indexOf("availability") >= 0) renderAvailability();
  }).catch(function () {});
}

function show(name) {
  document.querySelectorAll(".screen").forEach(function (el) { el.hidden = el.id !== "s-" + name; });
  document.body.classList.toggle("in-worship", name === "worship");
  document.querySelectorAll(".nav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-nav") === navFor(name)); });
  if (name === "home") renderHome();
  if (name === "events") renderEvents();
  if (name === "ministries") renderMinistries();
  if (name === "ministry") renderMinistry();
  if (name === "food-kitchen") renderKitchen();
  if (name === "signup") loadSignups(signupKind());
  if (name === "availability") { renderAvailability(); pullAvailability(); }
  if (name === "more") renderMore();
}
function navFor(name) {
  if (name === "events") return "events";
  if (name === "ministries" || name === "food-kitchen" || name === "signup") return "ministries";
  if (name === "give") return "give";
  if (name === "more" || name === "team-code" || name === "ministry" || name === "availability" || name === "visit" || name === "notifications" || name === "serve") return "more";
  if (name === "worship") return "more";
  return "home";
}
function signupKind() {
  var h = (location.hash || "");
  if (h.indexOf("nursery") >= 0) return "nursery";
  if (h.indexOf("km-food") >= 0) return "km-food";
  return "snack";
}
function renderMore() {
  document.getElementById("more-ministry").hidden = !teams().length;
  document.getElementById("more-code").hidden = !!teams().length;
  var worship = hasTeam("worship");
  document.getElementById("more-worship-card").hidden = !worship;
}
function route() {
  var raw = (location.hash || "#/home").replace(/^#\/?/, "");
  var path = raw.split("?")[0];
  if (path.indexOf("worship") === 0) {
    if (!hasTeam("worship")) { if (path.indexOf("team-code") !== 0) location.replace("#/team-code?team=worship"); return; }
    show("worship");
    return;
  }
  var name = path.split("/")[0] || "home";
  if (name === "signup") {
    if (signupKind() === "nursery" && !hasTeam("nursery")) { location.replace("#/team-code?team=nursery"); return; }
    prepareSignup();
    show("signup");
    return;
  }
  if (name === "availability" && !hasTeam("worship")) { location.replace("#/team-code?team=worship"); return; }
  if (name === "give") renderGive();
  if (name === "visit") renderVisit();
  if (name === "team-code" || name === "ministry" || name === "availability" || name === "food-kitchen" || name === "events" || name === "ministries" || name === "give" || name === "more" || name === "visit" || name === "notifications" || name === "serve") {
    show(name);
    return;
  }
  show("home");
}
function prepareSignup() {
  var kind = signupKind();
  document.getElementById("signup-title").textContent = kind === "km-food" ? t("km") : kind === "nursery" ? (appLang() === "ko" ? "유아부 신청" : "Nursery sign-up") : t("snack");
  document.getElementById("signup-sub").textContent = kind === "km-food" ? t("kmBody") : kind === "snack" ? t("snackBody") : t("several");
  document.getElementById("signup-multi").hidden = kind !== "km-food";
  document.getElementById("signup-donation").hidden = kind !== "snack";
  signupPick = "";
  var savedName = displayName();
  if (savedName && !document.getElementById("signup-name").value) document.getElementById("signup-name").value = savedName;
  document.getElementById("signup-cancel").onclick = function () { cancelSignup(kind); };
}
function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

function renderAll() {
  applyI18n();
  document.getElementById("lang-en").classList.toggle("on", appLang() !== "ko");
  document.getElementById("lang-ko").classList.toggle("on", appLang() === "ko");
  route();
}

document.getElementById("lang-en").onclick = function () { setLang("en"); };
document.getElementById("lang-ko").onclick = function () { setLang("ko"); };
document.getElementById("team-form").onsubmit = joinTeam;
document.getElementById("signup-go").onclick = function () { addSignup(signupKind()); };
document.getElementById("avail-change").onclick = function () { try { localStorage.removeItem(PERSON_KEY); } catch (e) {} renderAvailability(); };
document.getElementById("view-answers").onclick = function () {
  document.getElementById("avail-member-pane").hidden = false;
  document.getElementById("avail-team-pane").hidden = true;
  document.getElementById("view-answers").classList.add("on");
  document.getElementById("view-team").classList.remove("on");
};
document.getElementById("view-team").onclick = function () {
  document.getElementById("avail-member-pane").hidden = true;
  document.getElementById("avail-team-pane").hidden = false;
  document.getElementById("view-team").classList.add("on");
  document.getElementById("view-answers").classList.remove("on");
  renderAvailability();
};
document.getElementById("more-lang").onclick = function () { setLang(appLang() === "ko" ? "en" : "ko"); };
document.getElementById("notif-toggle").onchange = function (e) {
  try { localStorage.setItem("bethany-reminders", e.target.checked ? "1" : "0"); } catch (err) {}
};
try { document.getElementById("notif-toggle").checked = localStorage.getItem("bethany-reminders") === "1"; } catch (e) {}
function renderGive() {
  document.getElementById("give-link").href = BETHANY.tithelyUrl;
  document.getElementById("venmo-link").href = BETHANY.venmoUrl;
  document.getElementById("venmo-handle").textContent = BETHANY.venmoHandle;
  document.getElementById("check-pay").textContent = BETHANY.checkPayable;
  document.getElementById("check-mail").textContent = BETHANY.address;
  document.getElementById("check-memo").textContent = BETHANY.checkMemo;
}
function renderVisit() {
  document.getElementById("visit-address").textContent = BETHANY.address;
  document.getElementById("visit-phone").textContent = BETHANY.phone;
  var map = document.getElementById("visit-map");
  map.href = BETHANY.mapsUrl;
}
document.getElementById("watch-live").onclick = function () { window.open(BETHANY.watchUrl, "_blank", "noopener"); };
document.getElementById("all-times").onclick = function () { location.hash = "#/events"; };
document.getElementById("see-events").onclick = function () { location.hash = "#/events"; };
document.getElementById("home-ministry").onclick = function () { location.hash = "#/ministry"; };
document.getElementById("feedback-link").onclick = function () {
  if (BETHANY.feedbackUrl) window.open(BETHANY.feedbackUrl, "_blank", "noopener");
};
window.addEventListener("hashchange", route);
document.documentElement.lang = appLang() === "ko" ? "ko" : "en";
renderAll();
