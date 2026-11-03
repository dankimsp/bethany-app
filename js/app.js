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
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    if (el.children.length) return;
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
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
var PROFILE_KEY = "bethany-profile";
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (e) { return null; }
}
function saveProfileLocal(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  if (p && Array.isArray(p.teams)) {
    try { localStorage.setItem(TEAMS_KEY, JSON.stringify(p.teams)); } catch (e) {}
  }
  if (p && p.rosterId) {
    try { localStorage.setItem(PERSON_KEY, p.rosterId); } catch (e) {}
  }
}
function currentUid() {
  var u = window.bethanyUser && window.bethanyUser();
  return u && u.uid ? u.uid : "";
}
function profileName() {
  var p = loadProfile();
  if (p && p.name) return p.name;
  var u = window.bethanyUser && window.bethanyUser();
  return (u && u.displayName) || "";
}
function needsName() {
  try { if (localStorage.getItem("bethany-need-name") === "1") return true; } catch (e) {}
  if (profileName()) return false;
  return true;
}
function displayName() {
  var named = profileName();
  if (named) return named;
  try { return localStorage.getItem("bethany-signup-name") || ""; } catch (e) { return ""; }
}
function initialsOf(name) {
  var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}
function laParts() {
  var p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function fmtTime(h, m) {
  var hr = h % 12 || 12;
  var clock = hr + ":" + pad(m);
  if (appLang() === "ko") return (h < 12 ? "오전" : "오후") + " " + clock;
  return clock + " " + (h < 12 ? "AM" : "PM");
}
function isoDay(v) {
  var s = String(v == null ? "" : v).replace(/^'+/, "").trim();
  var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  if (!s || !/[A-Za-z]/.test(s)) return s;
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  var p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}
function normSignup(row) {
  return { sunday: isoDay(row && row.sunday), name: row && row.name || "", deviceId: row && row.deviceId || "", uid: row && row.uid || "" };
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
  var p = String(iso || "").split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var wd = dt.getUTCDay();
  if (appLang() === "ko") {
    return { mon: (dt.getUTCMonth() + 1) + "월", day: String(dt.getUTCDate()), label: (dt.getUTCMonth() + 1) + "월 " + dt.getUTCDate() + "일 (" + dayKo(wd) + ")" };
  }
  var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
  return { mon: mon.toUpperCase(), day: String(dt.getUTCDate()), label: dayName(wd) + ", " + mon + " " + dt.getUTCDate() };
}
function weekItems() {
  var n = laParts();
  var nowMin = n.h * 60 + n.mi;
  return BETHANY_WEEKLY.filter(function (s) {
    var ahead = (s.day - n.dow + 7) % 7;
    if (ahead === 0 && (s.h * 60 + s.m) <= nowMin) return false;
    return true;
  }).sort(function (a, b) {
    var aa = (a.day - n.dow + 7) % 7;
    var bb = (b.day - n.dow + 7) % 7;
    if (aa !== bb) return aa - bb;
    return (a.h * 60 + a.m) - (b.h * 60 + b.m);
  }).slice(0, 3);
}
function specials() {
  var n = laParts();
  var today = n.y + "-" + pad(n.mo) + "-" + pad(n.d);
  return BETHANY_EVENTS.filter(function (ev) { return ev.date >= today; });
}
function icsStamp(dt) {
  return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + "T" + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + pad(dt.getUTCSeconds()) + "Z";
}
function icsEnd(date, time, end) {
  var parts = String(end || "").split(":");
  var sh = +String(time || "0:0").split(":")[0];
  var sm = +String(time || "0:0").split(":")[1] || 0;
  var eh = parts.length > 1 ? +parts[0] : sh + 2;
  var em = parts.length > 1 ? (+parts[1] || 0) : sm;
  var extra = 0;
  if (eh >= 24) { extra = Math.floor(eh / 24); eh = eh % 24; }
  var p = date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + extra));
  var endDate = dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate());
  return endDate + "T" + pad(eh) + pad(em) + "00";
}
function icsFor(ev) {
  var hm = String(ev.time || "12:00").split(":");
  var start = ev.date.replace(/-/g, "") + "T" + pad(+hm[0]) + pad(+hm[1] || 0) + "00";
  var end = icsEnd(ev.date, ev.time, ev.end);
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bethany Church//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
    "X-LIC-LOCATION:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "UID:" + ev.id + "@bethanychurchwa.org",
    "DTSTAMP:" + icsStamp(new Date()),
    "SUMMARY:" + ev.title + " – Bethany Church",
    "DTSTART;TZID=America/Los_Angeles:" + start,
    "DTEND;TZID=America/Los_Angeles:" + end,
    "LOCATION:15414 Ash Way\\, Lynnwood\\, WA 98087",
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  var body = lines.join("\r\n") + "\r\n";
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = "bethany-" + ev.id + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
}
function api(params) {
  function send(token) {
    var body = {};
    Object.keys(params || {}).forEach(function (k) { body[k] = params[k]; });
    if (token) body.idToken = token;
    if (token && typeof woApiPost === "function") return woApiPost(body);
    if (typeof woApi === "function") return woApi(body);
    return Promise.reject(new Error("offline"));
  }
  if (window.bethanyIdToken) return window.bethanyIdToken().then(send, function () { return send(""); });
  return send("");
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
  var tabGreet = document.getElementById("greet-tab");
  if (tabGreet) tabGreet.innerHTML = hello.innerHTML;
  var initial = initialsOf(name);
  var av = document.getElementById("home-avatar");
  var navAv = document.getElementById("nav-avatar");
  if (av) av.textContent = initial;
  if (navAv) navAv.textContent = initial;
  document.getElementById("hero-name").textContent = appLang() === "ko" ? s.ko : s.name;
  document.getElementById("hero-when").textContent = nx.date.toLocaleDateString(appLang() === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  document.getElementById("hero-time").textContent = fmtTime(s.h, s.m);
  document.getElementById("watch-live").hidden = !s.live;
  document.getElementById("hero-live").hidden = !s.live;
  var up = document.getElementById("home-events");
  up.replaceChildren();
  var head = document.createElement("div");
  head.className = "row-between";
  head.innerHTML = '<span class="eyebrow">' + t("upcoming") + '</span><button type="button" class="lnkbtn" id="see-events-2">' + t("seeAll") + "</button>";
  up.appendChild(head);
  head.querySelector("button").onclick = function () { location.hash = "#/events"; };
  var specs = specials();
  if (specs[0]) up.appendChild(homeSpecial(specs[0]));
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
  paintHomeMinistry();
}
function joinedMinistries() {
  return teams().map(ministryById).filter(Boolean);
}
function paintHomeMinistry() {
  var tile = document.getElementById("home-ministry");
  var sermon = document.getElementById("sermon-tile");
  var list = joinedMinistries();
  tile.hidden = !list.length;
  sermon.classList.toggle("wide", list.length === 0);
  tile.className = "tile";
  tile.style.backgroundImage = "";
  if (!list.length) return;
  if (list.length === 1) {
    var m = list[0];
    var title = appLang() === "ko" ? m.ko : m.name;
    var info = appLang() === "ko" ? (m.koBlurb || m.blurb) : m.blurb;
    tile.classList.add("cover");
    if (m.illus) tile.classList.add("illus");
    var overlay = m.illus ? "" : "linear-gradient(180deg,rgba(0,32,42,.05),rgba(0,32,42,.78)),";
    tile.style.backgroundImage = overlay + "url(" + (m.cover || "") + ")";
    tile.innerHTML = '<div class="eyebrow"' + (m.illus ? "" : ' style="color:#F0D57A"') + ">" + t("myMin") + "</div><div><b>" + escapeHtml(title) + '</b><div class="mut"' + (m.illus ? "" : ' style="color:rgba(255,255,255,.88)"') + ">" + escapeHtml(info) + "</div></div>";
    return;
  }
  tile.innerHTML = '<div class="eyebrow">' + t("myTeams") + '</div><div class="home-chips">' + list.map(function (m) {
    return "<span>" + escapeHtml(appLang() === "ko" ? m.ko : m.name) + "</span>";
  }).join("") + "</div>";
}
function homeSpecial(ev) {
  var p = ev.date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var mon = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spec";
  btn.innerHTML = '<img alt="" loading="lazy" src="' + escapeAttr(ev.image || "assets/img/fellowship-group.webp") + '"><div class="grow"><div class="eyebrow gold">' + t("special") + '</div><div class="tt">' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="mut">' + (appLang() === "ko" ? dayKo(dt.getUTCDay()) : dayName(dt.getUTCDay())) + " · " + fmtTime(+ev.time.split(":")[0], +ev.time.split(":")[1]) + "</div></div>";
  btn.onclick = function () { location.hash = "#/events/" + ev.id; };
  return btn;
}
function googleCalUrl(ev) {
  var hm = String(ev.time || "12:00").split(":");
  var start = ev.date.replace(/-/g, "") + "T" + pad(+hm[0]) + pad(+hm[1] || 0) + "00";
  var end = icsEnd(ev.date, ev.time, ev.end);
  var q = [
    "action=TEMPLATE",
    "text=" + encodeURIComponent(ev.title + " – Bethany Church"),
    "dates=" + encodeURIComponent(start + "/" + end),
    "ctz=America/Los_Angeles",
    "location=" + encodeURIComponent(BETHANY.address),
    "details=" + encodeURIComponent(ev.note || "")
  ];
  return "https://calendar.google.com/calendar/render?" + q.join("&");
}
function specialCard(ev, compact) {
  var p = ev.date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var mon = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  var box = document.createElement("div");
  box.className = compact ? "special-home" : "card ecard";
  var wd = dt.getUTCDay();
  box.innerHTML = '<div class="dblk"><small>' + mon + '</small><b>' + dt.getUTCDate() + '</b><span>' + (appLang() === "ko" ? dayKo(wd) : dayName(wd)) + '</span></div><div class="grow"><div class="eyebrow gold">' + t("special") + '</div><div class="tt">' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="row-between"><span class="mut">' + fmtTime(+ev.time.split(":")[0], +ev.time.split(":")[1]) + '</span><button type="button" class="pill sm white cal">' + t("addCal") + "</button></div></div>";
  box.querySelector(".cal").onclick = function (e) { e.stopPropagation(); icsFor(ev); };
  box.onclick = function () { location.hash = "#/events/" + ev.id; };
  return box;
}
function eventCard(ev) {
  var p = ev.date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var mon = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  var wd = dt.getUTCDay();
  var box = document.createElement("article");
  box.className = "ev-img";
  box.innerHTML = '<img class="ph" alt="" loading="lazy" src="' + escapeAttr(ev.image || "assets/img/fellowship-group.webp") + '"><div class="date"><small>' + mon + "</small><b>" + dt.getUTCDate() + "</b><span>" + (appLang() === "ko" ? dayKo(wd) : dayName(wd)) + '</span></div><div class="body"><div class="eyebrow gold">' + t("special") + '</div><h3>' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="mut">' + fmtTime(+ev.time.split(":")[0], +ev.time.split(":")[1]) + '</div><div class="acts"><button type="button" class="pill brand sm cal">' + t("addCal") + '</button><button type="button" class="pill line sm details">' + t("seeAll") + "</button></div></div>";
  box.querySelector(".cal").onclick = function () { icsFor(ev); };
  box.querySelector(".details").onclick = function () { location.hash = "#/events/" + ev.id; };
  return box;
}
function renderEvents() {
  var weekly = document.getElementById("weekly-list");
  weekly.replaceChildren();
  var groups = {};
  BETHANY_WEEKLY.forEach(function (item) {
    if (!groups[item.day]) groups[item.day] = [];
    groups[item.day].push(item);
  });
  Object.keys(groups).sort(function (a, b) { return +a - +b; }).forEach(function (day) {
    var card = document.createElement("div");
    card.className = "card";
    var head = document.createElement("div");
    head.className = "eyebrow";
    head.textContent = appLang() === "ko" ? dayKo(+day) : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][+day];
    card.appendChild(head);
    groups[day].forEach(function (item) {
      var row = document.createElement("div");
      row.className = "wkrow";
      row.innerHTML = '<div class="tt">' + escapeHtml(appLang() === "ko" ? item.ko : item.name) + "</div>" + (item.live ? '<span class="chip acc">' + t("liveWord") + "</span>" : "") + '<span class="tm">' + fmtTime(item.h, item.m) + "</span>";
      card.appendChild(row);
    });
    weekly.appendChild(card);
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
  list.forEach(function (ev) { box.appendChild(eventCard(ev)); });
}
function eventById(id) {
  var found = null;
  BETHANY_EVENTS.forEach(function (ev) { if (ev.id === id) found = ev; });
  return found;
}
function renderEvent(id) {
  var ev = eventById(id);
  if (!ev) { location.replace("#/events"); return; }
  var p = ev.date.split("-");
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  document.getElementById("event-title").textContent = appLang() === "ko" ? (ev.ko || ev.title) : ev.title;
  document.getElementById("event-note").textContent = appLang() === "ko" ? (ev.koNote || ev.note || "") : (ev.note || "");
  document.getElementById("event-when").textContent = dt.toLocaleDateString(appLang() === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  document.getElementById("event-time").textContent = fmtTime(+ev.time.split(":")[0], +ev.time.split(":")[1]);
  var google = document.getElementById("event-google");
  google.href = googleCalUrl(ev);
  var u = window.bethanyUser && window.bethanyUser();
  var isGoogle = u && String(u.provider || "").indexOf("google") >= 0;
  google.className = "calbtn " + (isGoogle ? "g" : "a");
  document.getElementById("event-ics").className = "calbtn " + (isGoogle ? "a" : "g");
  document.getElementById("event-ics").onclick = function () { icsFor(ev); };
  document.getElementById("event-share").onclick = function () {
    var text = ev.title + " · " + ev.date + " " + ev.time + " · Bethany Church";
    if (navigator.share) navigator.share({ title: ev.title, text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  };
}
function renderMinistries() {
  var box = document.getElementById("ministry-list");
  box.replaceChildren();
  BETHANY_MINISTRIES.forEach(function (m) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mcard" + (m.id === "worship" ? " span2" : "");
    var joined = hasTeam(m.id) ? '<span class="chip ok">' + t("joined") + "</span>" : "";
    var solid = m.id === "nursery" ? "solid-plum" : m.id === "kitchen" ? "solid-acc" : "solid-gold";
    b.innerHTML = '<div class="cv"><img alt="" loading="lazy" src="' + escapeAttr(m.cover || "") + '">' + joined + '<span class="mic ' + solid + '"><svg class="i"><use href="#i-' + m.icon + '"/></svg></span></div><div class="bd"><div class="grow"><b>' + escapeHtml(appLang() === "ko" ? m.ko : m.name) + '</b><div class="mut">' + escapeHtml(appLang() === "ko" ? m.koBlurb : m.blurb) + '</div></div><span class="go"><svg class="i"><use href="#i-chev"/></svg></span></div>';
    b.onclick = function () { openMinistry(m.id); };
    box.appendChild(b);
  });
}
function openMinistry(id) {
  var m = ministryById(id);
  if (!m) return;
  if (m.code && !hasTeam(id)) { location.hash = "#/team-code?team=" + id; return; }
  if (id === "kitchen") { location.hash = "#/food-kitchen"; return; }
  location.hash = "#/ministry/" + id;
}
function ministryHomeHash() {
  var ids = teams().filter(function (id) { var m = ministryById(id); return m && m.code; });
  if (ids.length === 1) return "#/ministry/" + ids[0];
  return "#/ministries";
}
function ministryById(id) {
  var found = null;
  BETHANY_MINISTRIES.forEach(function (m) { if (m.id === id) found = m; });
  return found;
}
function ministryIdFromHash() {
  var raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
  var parts = raw.split("/");
  return parts[0] === "ministry" ? (parts[1] || "") : "";
}
function renderMinistry() {
  var id = ministryIdFromHash();
  var m = ministryById(id);
  var head = document.getElementById("ministry-head");
  var box = document.getElementById("my-tools");
  var empty = document.getElementById("ministry-empty");
  box.replaceChildren();
  if (!m) { location.replace("#/ministries"); return; }
  var name = appLang() === "ko" ? m.ko : m.name;
  var lead = appLang() === "ko" ? (m.koLead || m.koBlurb) : (m.lead || m.blurb);
  var back = m.illus ? "back" : "back glass";
  head.className = "mhead" + (m.illus ? " illus" : "");
  head.style.backgroundImage = "url(" + (m.cover || "") + ")";
  head.innerHTML = '<div class="row-between"><button class="' + back + '" type="button" id="ministry-back"><svg class="i"><use href="#i-back"/></svg></button>' + (hasTeam(m.id) ? '<span class="chip ok">' + t("joined") + "</span>" : "") + '</div><div><div class="eyebrow">' + t("myMin") + "</div><h1>" + escapeHtml(name) + '</h1><div class="mut">' + escapeHtml(lead || "") + "</div></div>";
  document.getElementById("ministry-back").onclick = function () { location.hash = "#/ministries"; };
  m.tools.forEach(function (tool, i) {
    var a = document.createElement("a");
    a.className = "tool" + (m.tools.length === 1 || i === m.tools.length - 1 && m.tools.length > 2 ? " wide" : "");
    a.href = tool.href;
    var icon = tool.icon || "list";
    var hint = appLang() === "ko" ? (tool.koHint || tool.hint) : tool.hint;
    var tone = icon === "music" ? "gold" : icon === "smile" || icon === "users" ? "plum" : "acc";
    a.innerHTML = '<span class="corner" style="background:var(--' + (tone === "gold" ? "gold" : tone === "plum" ? "plum" : "accent") + '-soft)"></span><span class="mic ' + tone + '"><svg class="i"><use href="#i-' + icon + '"/></svg></span><div class="grow"><h3>' + escapeHtml(appLang() === "ko" ? tool.ko : tool.name) + "</h3><p>" + escapeHtml(hint) + "</p></div>";
    box.appendChild(a);
  });
  if (empty) {
    empty.hidden = id !== "nursery";
    empty.innerHTML = '<img src="assets/img/illus-empty.svg" alt="" loading="lazy"><div><b>' + t("noSundays") + '</b><div class="mut">' + t("noSundaysBody") + '</div></div>';
  }
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
    var rows = (res.signups || []).map(normSignup);
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
      location.hash = "#/ministry/" + res.team;
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
    signupCache[kind] = ((res && res.signups) || []).map(normSignup);
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
    people.forEach(function (p) { if (isMineRow(p, dev)) mineRow = p; });
    if (mineRow) own = { iso: iso, name: mineRow.name };
    var taken = exclusive && people.length && !mineRow;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lr signup-day" + (taken ? " locked" : "") + (signupPick === iso ? " on" : "");
    btn.disabled = !!taken;
    var meta = prettySunday(iso);
    var names = people.map(function (p) { return isMineRow(p, dev) ? t("you") : p.name; }).join(", ");
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
  if (!name) { msg.hidden = false; msg.textContent = t("nameNeed"); return; }
  if (!iso) { msg.hidden = false; msg.textContent = t("pickSunday"); return; }
  try { localStorage.setItem("bethany-signup-name", name); } catch (e) {}
  msg.hidden = false;
  msg.textContent = t("saving");
  api({ action: "addSignup", kind: kind, sunday: iso, name: name, deviceId: deviceId(), uid: currentUid() }).then(function (res) {
    if (soonError(res)) { msg.textContent = t("soon"); return; }
    if (res && res.error === "taken") { msg.textContent = t("taken"); loadSignups(kind); return; }
    msg.hidden = true;
    loadSignups(kind);
  }).catch(function () { msg.hidden = false; msg.textContent = t("soon"); });
}
function cancelSignup(kind) {
  var iso = document.getElementById("signup-mine").dataset.sunday;
  if (!iso) return;
  api({ action: "cancelSignup", kind: kind, sunday: iso, deviceId: deviceId(), uid: currentUid() }).then(function () { loadSignups(kind); }).catch(function () {
    document.getElementById("signup-msg").hidden = false;
    document.getElementById("signup-msg").textContent = t("soon");
  });
}

function availMap() {
  try { return JSON.parse(localStorage.getItem(AVAIL_KEY) || "{}"); } catch (e) { return {}; }
}
function saveAvailLocal(map) { try { localStorage.setItem(AVAIL_KEY, JSON.stringify(map)); } catch (e) {} }
function isMineRow(row, dev) {
  var uid = currentUid();
  if (uid && row.uid && row.uid === uid) return true;
  return row.deviceId === dev;
}
function personId() {
  var p = loadProfile();
  if (p && p.rosterId) return p.rosterId;
  try { return localStorage.getItem(PERSON_KEY) || ""; } catch (e) { return ""; }
}
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
      var prof = loadProfile() || {};
      prof.rosterId = p.id;
      saveProfileLocal(prof);
      pushProfile({ rosterId: p.id });
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
    res.rows.forEach(function (row) { map[row.person + "|" + isoDay(row.sunday)] = { status: row.status, note: row.note || "" }; });
    saveAvailLocal(map);
    if ((location.hash || "").indexOf("availability") >= 0) renderAvailability();
  }).catch(function () {});
}

function show(name) {
  if (name !== "worship" && document.body.classList.contains("wo-playing") && typeof woExitPlay === "function") woExitPlay();
  document.querySelectorAll(".screen").forEach(function (el) { el.hidden = el.id !== "s-" + name; });
  document.body.classList.toggle("in-worship", name === "worship");
  document.querySelectorAll(".nav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-nav") === navFor(name)); });
  if (name === "home") renderHome();
  if (name === "events") renderEvents();
  if (name === "event") renderEvent(eventIdFromHash());
  if (name === "ministries") renderMinistries();
  if (name === "ministry") renderMinistry();
  if (name === "food-kitchen") renderKitchen();
  if (name === "signup") loadSignups(signupKind());
  if (name === "availability") { renderAvailability(); pullAvailability(); }
  if (name === "more") renderAccount();
  paintAuthLang();
}
function navFor(name) {
  if (name === "events" || name === "event") return "events";
  if (name === "ministries" || name === "food-kitchen" || name === "signup" || name === "ministry" || name === "team-code" || name === "availability" || name === "worship") return "ministries";
  if (name === "give") return "give";
  if (name === "more" || name === "visit" || name === "notifications") return "more";
  return "home";
}
function signupKind() {
  var h = (location.hash || "");
  if (h.indexOf("nursery") >= 0) return "nursery";
  if (h.indexOf("km-food") >= 0) return "km-food";
  return "snack";
}
function renderAccount() {
  var p = loadProfile() || {};
  var u = (window.bethanyUser && window.bethanyUser()) || {};
  var name = p.name || u.displayName || "";
  document.getElementById("acct-initial").textContent = initialsOf(name);
  document.getElementById("acct-name").textContent = name;
  document.getElementById("acct-email").textContent = p.email || u.email || "";
  var provider = p.provider || u.provider || "password";
  document.getElementById("acct-provider").textContent = String(provider).indexOf("google") >= 0 ? t("signedGoogle") : t("signedEmail");
  var chips = document.getElementById("acct-teams");
  chips.replaceChildren();
  teams().forEach(function (id) {
    var m = ministryById(id);
    if (!m) return;
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mchip";
    chip.textContent = appLang() === "ko" ? m.ko : m.name;
    chip.onclick = function () { openMinistry(id); };
    chips.appendChild(chip);
  });
  var add = document.createElement("button");
  add.type = "button";
  add.className = "mchip add";
  add.textContent = t("joinCode");
  add.onclick = function () { document.getElementById("team-pick").hidden = !document.getElementById("team-pick").hidden; };
  chips.appendChild(add);
  setSwitch("pref-news", p.newsletter !== false);
  setSwitch("pref-church", p.churchComms !== false);
  setSwitch("pref-remind", p.reminders !== false);
  document.getElementById("acct-en").classList.toggle("on", appLang() !== "ko");
  document.getElementById("acct-ko").classList.toggle("on", appLang() === "ko");
}
function setSwitch(id, on) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("on", !!on);
  el.setAttribute("aria-pressed", on ? "true" : "false");
}
function pushProfile(patch) {
  var p = loadProfile() || { newsletter: true, churchComms: true, reminders: true, teams: teams(), lang: appLang() };
  Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
  var u = (window.bethanyUser && window.bethanyUser()) || {};
  p.uid = p.uid || u.uid || "";
  p.email = p.email || u.email || "";
  p.provider = p.provider || u.provider || "";
  saveProfileLocal(p);
  api({
    action: "saveProfile",
    name: p.name || "",
    email: p.email || "",
    provider: p.provider || "",
    rosterId: p.rosterId || "",
    newsletter: p.newsletter !== false,
    churchComms: p.churchComms !== false,
    reminders: p.reminders !== false,
    lang: p.lang || appLang()
  }).then(function (res) {
    if (res && res.profile) saveProfileLocal(res.profile);
  }).catch(function () {});
}
function pullProfile() {
  api({ action: "getProfile" }).then(function (res) {
    if (res && res.profile && res.profile.uid) {
      saveProfileLocal(res.profile);
      if ((location.hash || "").indexOf("more") >= 0) renderAccount();
    }
  }).catch(function () {});
}
function eventIdFromHash() {
  var raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
  var parts = raw.split("/");
  return parts[0] === "events" ? (parts[1] || "") : "";
}
function paintAuthLang() {
  ["auth-en", "create-en", "name-en"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("on", appLang() !== "ko");
  });
  ["auth-ko", "create-ko", "name-ko"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("on", appLang() === "ko");
  });
}
function route() {
  if (!(window.bethanyAuthReady && window.bethanyAuthReady())) return;
  var authed = window.bethanyUser && window.bethanyUser();
  document.body.classList.toggle("signed-out", !authed || needsName());
  if (!authed) {
    var screen = ((location.hash || "#/signin").replace(/^#\/?/, "").split("?")[0] === "create") ? "create" : "signin";
    show(screen);
    return;
  }
  if (needsName()) { show("name"); return; }
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
  if (name === "ministry") {
    var mid = path.split("/")[1] || "";
    if (!mid) { location.replace(ministryHomeHash()); return; }
    var ministry = ministryById(mid);
    if (!ministry || (ministry.code && !hasTeam(mid))) { location.replace("#/team-code?team=" + mid); return; }
    if (mid === "kitchen") { location.replace("#/food-kitchen"); return; }
    show("ministry");
    return;
  }
  if (name === "availability" && !hasTeam("worship")) { location.replace("#/team-code?team=worship"); return; }
  if (name === "events" && path.split("/")[1]) { show("event"); return; }
  if (name === "give") renderGive();
  if (name === "visit") renderVisit();
  if (name === "team-code" || name === "availability" || name === "food-kitchen" || name === "events" || name === "ministries" || name === "give" || name === "more" || name === "visit" || name === "notifications") {
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
document.getElementById("acct-en").onclick = function () { setLang("en"); pushProfile({ lang: "en" }); };
document.getElementById("acct-ko").onclick = function () { setLang("ko"); pushProfile({ lang: "ko" }); };
["auth-en", "create-en", "name-en"].forEach(function (id) { document.getElementById(id).onclick = function () { setLang("en"); }; });
["auth-ko", "create-ko", "name-ko"].forEach(function (id) { document.getElementById(id).onclick = function () { setLang("ko"); }; });
document.querySelectorAll("[data-eye]").forEach(function (btn) {
  btn.onclick = function () {
    var input = document.getElementById(btn.getAttribute("data-eye"));
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
  };
});
document.getElementById("signin-form").onsubmit = function (e) {
  e.preventDefault();
  window.bethanySignInEmail(document.getElementById("signin-email").value.trim(), document.getElementById("signin-pw").value).then(function () {
    location.hash = "#/home";
  }).catch(function (code) { document.getElementById("signin-msg").textContent = window.bethanyAuthMessage(code); });
};
document.getElementById("signin-google").onclick = function () {
  window.bethanySignInGoogle().then(function () { location.hash = "#/home"; }).catch(function (code) { document.getElementById("signin-msg").textContent = window.bethanyAuthMessage(code); });
};
document.getElementById("forgot").onclick = function () {
  var email = document.getElementById("signin-email").value.trim();
  window.bethanyReset(email).then(function () { document.getElementById("signin-msg").textContent = t("resetSent"); }).catch(function (code) { document.getElementById("signin-msg").textContent = window.bethanyAuthMessage(code); });
};
document.getElementById("create-form").onsubmit = function (e) {
  e.preventDefault();
  var pw = document.getElementById("create-pw").value;
  if (pw.length < 8) { document.getElementById("create-msg").textContent = window.bethanyAuthMessage("auth/weak-password"); return; }
  window.bethanyCreateEmail(document.getElementById("create-email").value.trim(), pw).then(function () {
    try { localStorage.setItem("bethany-need-name", "1"); } catch (err) {}
    location.hash = "#/name";
    route();
  }).catch(function (code) { document.getElementById("create-msg").textContent = window.bethanyAuthMessage(code); });
};
document.getElementById("create-google").onclick = function () {
  window.bethanySignInGoogle().then(function () {
    try { localStorage.setItem("bethany-need-name", "1"); } catch (err) {}
    location.hash = "#/name";
    route();
  }).catch(function (code) { document.getElementById("create-msg").textContent = window.bethanyAuthMessage(code); });
};
function previewName() {
  var full = (document.getElementById("name-first").value.trim() + " " + document.getElementById("name-last").value.trim()).trim();
  document.getElementById("name-preview").textContent = full;
  document.getElementById("name-initial").textContent = initialsOf(full);
}
document.getElementById("name-first").oninput = previewName;
document.getElementById("name-last").oninput = previewName;
document.getElementById("name-form").onsubmit = function (e) {
  e.preventDefault();
  var full = (document.getElementById("name-first").value.trim() + " " + document.getElementById("name-last").value.trim()).trim();
  if (!full) { document.getElementById("name-msg").textContent = t("nameNeed"); return; }
  try { localStorage.removeItem("bethany-need-name"); } catch (err) {}
  var u = (window.bethanyUser && window.bethanyUser()) || {};
  pushProfile({ name: full, email: u.email || "", provider: u.provider || "password", newsletter: true, churchComms: true, reminders: true, lang: appLang() });
  if (window.bethanyUpdateName) window.bethanyUpdateName(full);
  location.hash = "#/home";
  route();
};
document.getElementById("name-back").onclick = function () { location.hash = "#/create"; };
document.getElementById("acct-edit").onclick = function () { document.getElementById("name-edit").hidden = false; };
document.getElementById("acct-save-name").onclick = function () {
  var full = (document.getElementById("acct-first").value.trim() + " " + document.getElementById("acct-last").value.trim()).trim();
  if (!full) return;
  pushProfile({ name: full });
  document.getElementById("name-edit").hidden = true;
  renderAccount();
};
[["pref-news", "newsletter"], ["pref-church", "churchComms"], ["pref-remind", "reminders"]].forEach(function (pair) {
  document.getElementById(pair[0]).onclick = function () {
    var p = loadProfile() || {};
    var next = p[pair[1]] === false;
    setSwitch(pair[0], next);
    var patch = {};
    patch[pair[1]] = next;
    pushProfile(patch);
  };
});
document.querySelectorAll("[data-join]").forEach(function (btn) {
  btn.onclick = function () { location.hash = "#/team-code?team=" + btn.getAttribute("data-join"); };
});
document.getElementById("sign-out").onclick = function () {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(TEAMS_KEY);
    localStorage.removeItem(PERSON_KEY);
    localStorage.removeItem("bethany-need-name");
  } catch (e) {}
  window.bethanySignOut().then(function () { location.hash = "#/signin"; route(); });
};
document.getElementById("home-avatar").onclick = function () { location.hash = "#/more"; };
document.getElementById("nav-avatar").onclick = function () { location.hash = "#/more"; };
document.getElementById("team-code-eye").onclick = function () {
  var input = document.getElementById("team-code-input");
  var show = input.type === "password";
  input.type = show ? "text" : "password";
  this.setAttribute("aria-pressed", show ? "true" : "false");
  this.setAttribute("aria-label", show ? t("hideCode") : t("showCode"));
};
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
  var phone = document.getElementById("visit-phone");
  var digits = String(BETHANY.phone || "").replace(/[^\d+]/g, "");
  if (digits && digits.charAt(0) !== "+") digits = "+1" + digits.replace(/^1/, "");
  phone.textContent = BETHANY.phone;
  phone.href = digits ? "tel:" + digits : "";
  var map = document.getElementById("visit-map");
  map.href = BETHANY.mapsUrl;
}
document.getElementById("watch-live").onclick = function () { window.open(BETHANY.watchUrl, "_blank", "noopener"); };
document.getElementById("all-times").onclick = function () { location.hash = "#/events"; };
document.getElementById("see-events").onclick = function () { location.hash = "#/events"; };
document.getElementById("home-ministry").onclick = function () { location.hash = ministryHomeHash(); };
document.getElementById("feedback-link").onclick = function () {
  if (BETHANY.feedbackUrl) window.open(BETHANY.feedbackUrl, "_blank", "noopener");
};
window.addEventListener("hashchange", route);
document.documentElement.lang = appLang() === "ko" ? "ko" : "en";
window.bethanyOnAuth = function () {
  var u = window.bethanyUser && window.bethanyUser();
  if (u) {
    var p = loadProfile() || { newsletter: true, churchComms: true, reminders: true, lang: appLang(), teams: [] };
    p.uid = u.uid;
    p.email = u.email || p.email || "";
    p.provider = u.provider || p.provider || "";
    if (!p.name && u.displayName && localStorage.getItem("bethany-need-name") !== "1") p.name = u.displayName;
    saveProfileLocal(p);
    pullProfile();
  }
  renderAll();
};
if (window.bethanyAuthReady && window.bethanyAuthReady()) window.bethanyOnAuth();
