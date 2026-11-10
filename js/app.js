var LANG_KEY = "bethany-lang";
var TEAMS_KEY = "bethany-teams";
var NAME_KEY = "bethany-display-name";
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
  document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
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
function eventDate(ev) {
  var m = String(ev && ev.date || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  var y = +m[1], mo = +m[2], d = +m[3];
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return m[1] + "-" + m[2] + "-" + m[3];
}
function eventTime(ev) {
  var m = String(ev && ev.time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return { h: h, m: mi };
}
function eventParts(ev) {
  var date = eventDate(ev);
  var time = eventTime(ev);
  var dt = null;
  if (date) {
    var p = date.split("-");
    dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  return { date: date, dt: dt, time: time, schedulable: !!(date && time) };
}
function eventTimeLabel(ev) {
  var time = eventTime(ev);
  if (!time) return t("timeTbd");
  return fmtTime(time.h, time.m);
}
function cleanUrl(raw) {
  return String(raw || "").replace(/[),.;]+$/g, "");
}
function firstHttps(text) {
  var m = String(text || "").match(/https?:\/\/[^\s<>"]+/);
  return m ? cleanUrl(m[0]) : "";
}
function makeLink(href) {
  var a = document.createElement("a");
  a.className = "ev-link";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = href;
  a.addEventListener("click", function (e) { e.stopPropagation(); });
  return a;
}
function linkify(el, text) {
  el.replaceChildren();
  var src = String(text || "");
  var re = /https?:\/\/[^\s<>"]+/g;
  var last = 0;
  var match;
  while ((match = re.exec(src))) {
    if (match.index > last) el.appendChild(document.createTextNode(src.slice(last, match.index)));
    var href = cleanUrl(match[0]);
    el.appendChild(makeLink(href));
    if (href.length < match[0].length) el.appendChild(document.createTextNode(match[0].slice(href.length)));
    last = match.index + match[0].length;
  }
  if (last < src.length) el.appendChild(document.createTextNode(src.slice(last)));
}
function dateBadge(bits) {
  if (!bits.dt) return '<div class="date tbd"><b>' + escapeHtml(t("dateTbdBadge")) + "</b></div>";
  var mon = bits.dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  var wd = bits.dt.getUTCDay();
  return '<div class="date"><small>' + mon + "</small><b>" + bits.dt.getUTCDate() + "</b><span>" + (appLang() === "ko" ? dayKo(wd) : dayName(wd)) + "</span></div>";
}
function specials() {
  var n = laParts();
  var today = n.y + "-" + pad(n.mo) + "-" + pad(n.d);
  var rows = [];
  BETHANY_EVENTS.forEach(function (ev, i) {
    var date = eventDate(ev);
    if (date && date < today) return;
    rows.push({ ev: ev, date: date, i: i });
  });
  rows.sort(function (a, b) {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.i - b.i;
  });
  return rows.map(function (row) { return row.ev; });
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
  var bits = eventParts(ev);
  if (!bits.schedulable) return;
  var start = bits.date.replace(/-/g, "") + "T" + pad(bits.time.h) + pad(bits.time.m) + "00";
  var end = icsEnd(bits.date, pad(bits.time.h) + ":" + pad(bits.time.m), ev.end);
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
  var first = String(name || "").trim().split(/\s+/)[0] || "";
  hello.innerHTML = helloWord + (first ? ", <em>" + escapeHtml(first) + "</em>" + (appLang() === "ko" ? "님" : "") : "");
  var tabGreet = document.getElementById("greet-tab");
  if (tabGreet) tabGreet.innerHTML = hello.innerHTML;
  paintAvatars();
  document.getElementById("hero-name").textContent = appLang() === "ko" ? s.ko : s.name;
  var whenLabel = nx.date.toLocaleDateString(appLang() === "ko" ? "ko-KR" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  var wd = appLang() === "ko" ? dayKo(nx.date.getUTCDay()) : dayName(nx.date.getUTCDay());
  document.getElementById("hero-time").textContent = wd + " " + fmtTime(s.h, s.m);
  document.getElementById("hero-when").textContent = whenLabel + " · " + BETHANY.shortAddress + ", Lynnwood";
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
function paintAvatars() {
  var initial = initialsOf(displayName());
  ["home-avatar", "nav-avatar", "acct-initial"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = initial;
  });
}
function paintHomeMinistry() {
  var card = document.getElementById("home-ministry");
  var grid = document.getElementById("home-grid");
  var list = joinedMinistries();
  if (grid) grid.classList.toggle("has-ministry", !!list.length);
  card.hidden = !list.length;
  card.replaceChildren();
  if (!list.length) return;
  var head = document.createElement("div");
  head.className = "min-head";
  head.innerHTML = '<span class="eyebrow">' + t("myMin") + '</span><button type="button" class="min-open">' + t("openMinistry") + "</button>";
  head.querySelector("button").onclick = function () { location.hash = ministryHomeHash(); };
  card.appendChild(head);
  list.forEach(function (m) {
    var title = document.createElement("h3");
    title.style.margin = "12px 0 4px";
    title.style.fontFamily = "var(--serif)";
    title.style.fontSize = "20px";
    title.textContent = appLang() === "ko" ? m.ko : m.name;
    card.appendChild(title);
    var blurb = document.createElement("p");
    blurb.className = "mut";
    blurb.style.margin = "0 0 8px";
    blurb.textContent = appLang() === "ko" ? (m.koBlurb || m.blurb) : m.blurb;
    card.appendChild(blurb);
    (m.tools || []).forEach(function (tool) {
      var row = document.createElement("a");
      row.className = "min-row";
      row.href = tool.href;
      var icon = tool.icon || "list";
      var tone = icon === "music" ? "plum" : icon === "users" || icon === "smile" ? "gold" : "acc";
      row.innerHTML = '<span class="mic ' + tone + '"><svg class="i"><use href="#i-' + icon + '"/></svg></span><span class="grow"><span class="tt">' + escapeHtml(appLang() === "ko" ? tool.ko : tool.name) + '</span><span class="mut">' + escapeHtml(appLang() === "ko" ? (tool.koHint || tool.hint || "") : (tool.hint || "")) + '</span></span>';
      card.appendChild(row);
    });
  });
}
function homeSpecial(ev) {
  var bits = eventParts(ev);
  var when = bits.dt ? ((appLang() === "ko" ? dayKo(bits.dt.getUTCDay()) : dayName(bits.dt.getUTCDay())) + " · " + eventTimeLabel(ev)) : (t("dateTbd") + " · " + eventTimeLabel(ev));
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spec";
  btn.innerHTML = '<img alt="" loading="lazy" src="' + escapeAttr(ev.image || "assets/img/fellowship-group.webp") + '"><div class="grow"><div class="eyebrow gold">' + t("special") + '</div><div class="tt">' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="mut">' + escapeHtml(when) + "</div></div>";
  btn.onclick = function () { location.hash = "#/events/" + ev.id; };
  return btn;
}
function googleCalUrl(ev) {
  var bits = eventParts(ev);
  if (!bits.schedulable) return "";
  var start = bits.date.replace(/-/g, "") + "T" + pad(bits.time.h) + pad(bits.time.m) + "00";
  var end = icsEnd(bits.date, pad(bits.time.h) + ":" + pad(bits.time.m), ev.end);
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
  var bits = eventParts(ev);
  var box = document.createElement("div");
  box.className = compact ? "special-home" : "card ecard";
  box.innerHTML = dateBadge(bits) + '<div class="grow"><div class="eyebrow gold">' + t("special") + '</div><div class="tt">' + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</div><div class="row-between"><span class="mut">' + escapeHtml(eventTimeLabel(ev)) + "</span></div></div>";
  if (bits.schedulable) {
    var cal = document.createElement("button");
    cal.type = "button";
    cal.className = "pill sm white cal";
    cal.textContent = t("addCal");
    cal.onclick = function (e) { e.stopPropagation(); icsFor(ev); };
    box.querySelector(".row-between").appendChild(cal);
  }
  box.onclick = function () { location.hash = "#/events/" + ev.id; };
  return box;
}
function eventCard(ev) {
  var bits = eventParts(ev);
  var box = document.createElement("article");
  box.className = "ev-img";
  box.innerHTML = '<img class="ph" alt="" loading="lazy" src="' + escapeAttr(ev.image || "assets/img/fellowship-group.webp") + '">' + dateBadge(bits) + '<div class="body"><div class="eyebrow gold">' + t("special") + "</div><h3>" + escapeHtml(appLang() === "ko" ? (ev.ko || ev.title) : ev.title) + '</h3><div class="mut">' + escapeHtml(eventTimeLabel(ev)) + '</div><div class="acts"></div></div>';
  var note = appLang() === "ko" ? (ev.koNote || ev.note || "") : (ev.note || "");
  var url = firstHttps(note) || firstHttps(ev.note);
  if (url) {
    var line = document.createElement("p");
    line.className = "mut";
    line.appendChild(makeLink(url));
    box.querySelector(".body").insertBefore(line, box.querySelector(".acts"));
  }
  var acts = box.querySelector(".acts");
  if (bits.schedulable) {
    var cal = document.createElement("button");
    cal.type = "button";
    cal.className = "pill brand sm cal";
    cal.textContent = t("addCal");
    cal.onclick = function () { icsFor(ev); };
    acts.appendChild(cal);
  }
  var details = document.createElement("button");
  details.type = "button";
  details.className = "pill line sm details";
  details.textContent = t("details");
  details.onclick = function () { location.hash = "#/events/" + ev.id; };
  acts.appendChild(details);
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
  var openedTbd = false;
  list.forEach(function (ev) {
    if (!eventDate(ev) && !openedTbd) {
      openedTbd = true;
      var head = document.createElement("h3");
      head.className = "tbd-head";
      head.textContent = t("dateTbd");
      box.appendChild(head);
    }
    box.appendChild(eventCard(ev));
  });
}
function eventById(id) {
  var found = null;
  BETHANY_EVENTS.forEach(function (ev) { if (ev.id === id) found = ev; });
  return found;
}
function renderEvent(id) {
  var ev = eventById(id);
  if (!ev) { location.replace("#/events"); return; }
  var bits = eventParts(ev);
  document.getElementById("event-title").textContent = appLang() === "ko" ? (ev.ko || ev.title) : ev.title;
  linkify(document.getElementById("event-note"), appLang() === "ko" ? (ev.koNote || ev.note || "") : (ev.note || ""));
  document.getElementById("event-when").textContent = bits.dt ? bits.dt.toLocaleDateString(appLang() === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : t("dateTbd");
  document.getElementById("event-time").textContent = eventTimeLabel(ev);
  var welcome = document.getElementById("event-welcome");
  if (welcome) welcome.hidden = !ev.community;
  var google = document.getElementById("event-google");
  var icsBtn = document.getElementById("event-ics");
  var calHead = document.getElementById("event-cal-label");
  var u = window.bethanyUser && window.bethanyUser();
  var isGoogle = u && String(u.provider || "").indexOf("google") >= 0;
  google.className = "calbtn " + (isGoogle ? "g" : "a");
  icsBtn.className = "calbtn " + (isGoogle ? "a" : "g");
  google.hidden = !bits.schedulable;
  icsBtn.hidden = !bits.schedulable;
  if (calHead) calHead.hidden = !bits.schedulable;
  if (bits.schedulable) {
    google.href = googleCalUrl(ev);
    icsBtn.disabled = false;
    icsBtn.onclick = function () { icsFor(ev); };
  } else {
    google.removeAttribute("href");
    icsBtn.disabled = true;
    icsBtn.onclick = null;
  }
  document.getElementById("event-share").onclick = function () {
    var text = ev.title + " · " + (bits.date || t("dateTbd")) + " " + eventTimeLabel(ev) + " · Bethany Church";
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
    b.className = "mcard";
    var joined = hasTeam(m.id) ? '<span class="chip ok">' + t("joined") + "</span>" : "";
    var solid = m.id === "nursery" ? "solid-plum" : "solid-gold";
    b.innerHTML = '<div class="cv"><img alt="" loading="lazy" src="' + escapeAttr(m.cover || "") + '">' + joined + '<span class="mic ' + solid + '"><svg class="i"><use href="#i-' + m.icon + '"/></svg></span></div><div class="bd"><div class="grow"><b>' + escapeHtml(appLang() === "ko" ? m.ko : m.name) + '</b><div class="mut">' + escapeHtml(appLang() === "ko" ? m.koBlurb : m.blurb) + '</div></div><span class="go"><svg class="i"><use href="#i-chev"/></svg></span></div>';
    b.onclick = function () { openMinistry(m.id); };
    box.appendChild(b);
  });
}
function openMinistry(id) {
  var m = ministryById(id);
  if (!m) return;
  if (m.code && !hasTeam(id)) { location.hash = "#/team-code?team=" + id; return; }
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
function paintMinistryHead(head, m, onBack) {
  if (!head || !m) return;
  var name = appLang() === "ko" ? m.ko : m.name;
  var lead = appLang() === "ko" ? (m.koLead || m.koBlurb) : (m.lead || m.blurb);
  head.className = "mhead" + (m.illus ? " illus" : " photo");
  head.setAttribute("data-tone", m.id);
  var chip = hasTeam(m.id) ? '<span class="chip ok">' + escapeHtml(t("joined")) + "</span>" : "";
  head.innerHTML = '<div class="mart" aria-hidden="true"><img alt="" src="' + escapeAttr(m.cover || "") + '"></div><div class="row-between mtop"><button class="' + (m.illus ? "back" : "back glass") + '" type="button" aria-label="' + escapeAttr(t("back")) + '"><svg class="i"><use href="#i-back"/></svg></button></div><div class="mcopy"><div class="eyebrow">' + escapeHtml(t("myMin")) + '</div><div class="mtitle"><h1>' + escapeHtml(name) + "</h1>" + chip + '</div><div class="mut">' + escapeHtml(lead || "") + "</div></div>";
  head.querySelector("button").onclick = onBack;
}
function renderMinistry() {
  var id = ministryIdFromHash();
  var m = ministryById(id);
  var head = document.getElementById("ministry-head");
  var box = document.getElementById("my-tools");
  var empty = document.getElementById("ministry-empty");
  box.replaceChildren();
  if (!m) { location.replace("#/ministries"); return; }
  paintMinistryHead(head, m, function () { location.hash = "#/ministries"; });
  if (id === "nursery" && window.paintNurseryPage) {
    window.paintNurseryPage();
    return;
  }
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
function joinTeam(ev) {
  if (ev) ev.preventDefault();
  var code = document.getElementById("team-code-input").value.trim();
  var msg = document.getElementById("team-code-msg");
  var team = teamFromHash() || "worship";
  msg.hidden = true;
  if (!code) { msg.hidden = false; msg.textContent = t("wrongCode"); return; }
  api({ action: "verifyTeamCode", team: team, code: code }).then(function (res) {
    if (res && res.ok && res.team) {
      if (res.profile && res.profile.uid) saveProfileLocal(res.profile);
      else rememberTeam(res.team);
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

function availMap() {
  try { return JSON.parse(localStorage.getItem(AVAIL_KEY) || "{}"); } catch (e) { return {}; }
}
function saveAvailLocal(map) { try { localStorage.setItem(AVAIL_KEY, JSON.stringify(map)); } catch (e) {} }
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
var availSync = { timer: 0, pending: {}, base: null };
function setAvail(person, iso, status, note) {
  if (availSync.base == null) availSync.base = JSON.stringify(availMap());
  var map = availMap();
  var key = person + "|" + iso;
  map[key] = { status: status, note: note || "" };
  saveAvailLocal(map);
  var statusEl = document.getElementById("avail-status");
  if (statusEl && statusEl.textContent === t("saving")) statusEl.textContent = "";
  renderAvailability();
  availSync.pending[key] = { person: person, iso: iso, status: status, note: note || "" };
  clearTimeout(availSync.timer);
  availSync.timer = setTimeout(flushAvailSync, 280);
}
function flushAvailSync() {
  var pending = availSync.pending;
  var base = availSync.base;
  var keys = Object.keys(pending);
  availSync.pending = {};
  availSync.base = null;
  if (!keys.length) return;
  var items = keys.map(function (key) {
    var item = pending[key];
    return { person: item.person, sunday: item.iso, status: item.status, note: item.note };
  });
  var last = items[items.length - 1];
  api({
    action: "setAvailability",
    team: "worship",
    person: last.person,
    sunday: last.iso,
    status: last.status,
    note: last.note,
    items: items
  }).then(function (res) {
    var bad = !res || res.ok === false;
    if (!bad) return;
    if (base != null && !Object.keys(availSync.pending).length) {
      try { saveAvailLocal(JSON.parse(base)); } catch (e) {}
      renderAvailability();
    }
    if (typeof showToast === "function") showToast(t("updateError"));
  }).catch(function () {
    if (base != null && !Object.keys(availSync.pending).length) {
      try { saveAvailLocal(JSON.parse(base)); } catch (e) {}
      renderAvailability();
    }
    if (typeof showToast === "function") showToast(t("updateError"));
  });
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
    res.rows.forEach(function (row) {
      var key = row.person + "|" + isoDay(row.sunday);
      if (availSync.pending[key]) return;
      map[key] = { status: row.status, note: row.note || "" };
    });
    saveAvailLocal(map);
    if ((location.hash || "").indexOf("availability") >= 0) renderAvailability();
  }).catch(function () {});
}

function show(name) {
  if (name !== "worship" && document.body.classList.contains("wo-playing") && typeof woExitPlay === "function") woExitPlay();
  document.querySelectorAll(".screen").forEach(function (el) { el.hidden = el.id !== "s-" + name; });
  document.body.classList.toggle("in-worship", name === "worship");
  document.querySelectorAll(".nav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-nav") === navFor(name)); });
  document.body.classList.toggle("no-nav", name === "account");
  document.querySelectorAll(".fb-layer").forEach(function (el) { el.hidden = true; });
  document.body.classList.remove("fb-open");
  if (name === "home") renderHome();
  if (name === "events") renderEvents();
  if (name === "event") renderEvent(eventIdFromHash());
  if (name === "ministries") renderMinistries();
  if (name === "ministry") renderMinistry();
  if (name === "availability") { renderAvailability(); pullAvailability(); }
  if (name === "more") renderAccount();
  if (name === "account" && window.paintAccountPage) window.paintAccountPage();
  if (name === "home" && window.paintHomeServingCard) window.paintHomeServingCard();
  paintAuthLang();
}
function navFor(name) {
  if (name === "events" || name === "event") return "events";
  if (name === "ministries" || name === "ministry" || name === "team-code" || name === "availability" || name === "worship") return "ministries";
  if (name === "give") return "give";
  if (name === "more" || name === "visit" || name === "notifications" || name === "account") return "more";
  return "home";
}
function nurserySignupHash() {
  return (location.hash || "").toLowerCase().indexOf("nursery") >= 0;
}
function retiredKitchenPath(path) {
  var p = String(path || "").toLowerCase();
  if (p === "food-kitchen" || p === "kitchen" || p === "km-food" || p === "snack") return true;
  if (p.indexOf("food-kitchen") >= 0 || p.indexOf("km-food") >= 0) return true;
  if (/(^|\/)kitchen(\/|$)/.test(p)) return true;
  if (/(^|\/)snack(\/|$)/.test(p)) return true;
  return false;
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
  if (window.paintMorePage) window.paintMorePage();
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
function sendToNurseryCode() {
  var list = teams().filter(function (id) { return id !== "nursery"; });
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list)); } catch (e) {}
  var p = loadProfile();
  if (p) {
    p.teams = (Array.isArray(p.teams) ? p.teams : list).filter(function (id) { return id !== "nursery"; });
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  var hash = location.hash || "";
  if (hash.indexOf("team-code") >= 0) return;
  if (hash.indexOf("nursery") >= 0) location.replace("#/team-code?team=nursery");
  else if (window.paintHomeServingCard) window.paintHomeServingCard();
  if (hash.indexOf("more") >= 0) renderAccount();
}
function pullProfile() {
  var hadNursery = hasTeam("nursery");
  api({ action: "getProfile" }).then(function (res) {
    if (!(res && res.profile && res.profile.uid)) return;
    saveProfileLocal(res.profile);
    var serverHas = Array.isArray(res.profile.teams) && res.profile.teams.indexOf("nursery") >= 0;
    if ((location.hash || "").indexOf("more") >= 0) renderAccount();
    var here = (location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0];
    if (hadNursery && !serverHas) sendToNurseryCode();
    else if ((!here || here === "home") && window.paintHomeServingCard) window.paintHomeServingCard();
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
    if (nurserySignupHash()) {
      if (!hasTeam("nursery")) { location.replace("#/team-code?team=nursery"); return; }
      location.replace("#/ministry/nursery");
      return;
    }
    location.replace("#/ministries");
    return;
  }
  if (retiredKitchenPath(path)) { location.replace("#/ministries"); return; }
  if (name === "account") { show("account"); return; }
  if (name === "ministry") {
    var mid = path.split("/")[1] || "";
    if (!mid) { location.replace(ministryHomeHash()); return; }
    if (mid === "kitchen") { location.replace("#/ministries"); return; }
    var ministry = ministryById(mid);
    if (!ministry || (ministry.code && !hasTeam(mid))) { location.replace("#/team-code?team=" + mid); return; }
    show("ministry");
    return;
  }
  if (name === "availability" && !hasTeam("worship")) { location.replace("#/team-code?team=worship"); return; }
  if (name === "events" && path.split("/")[1]) { show("event"); return; }
  if (name === "give") renderGive();
  if (name === "visit") renderVisit();
  if (name === "team-code" || name === "availability" || name === "events" || name === "ministries" || name === "give" || name === "more" || name === "visit" || name === "notifications") {
    show(name);
    return;
  }
  show("home");
}
function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

function renderAll() {
  applyI18n();
  document.getElementById("lang-en").classList.toggle("on", appLang() !== "ko");
  document.getElementById("lang-ko").classList.toggle("on", appLang() === "ko");
  paintAvatars();
  route();
}

document.getElementById("lang-en").onclick = function () { setLang("en"); };
document.getElementById("lang-ko").onclick = function () { setLang("ko"); };
document.getElementById("team-form").onsubmit = joinTeam;
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
    if (btn.getAttribute("data-i18n") === "showPw") btn.textContent = t(show ? "hidePw" : "showPw");
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
var acctEdit = document.getElementById("acct-edit");
if (acctEdit) acctEdit.onclick = function () { var box = document.getElementById("name-edit"); if (box) box.hidden = false; };
var acctSave = document.getElementById("acct-save-name");
if (acctSave) acctSave.onclick = function () {
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
  var call = document.getElementById("visit-call");
  if (call) call.href = digits ? "tel:" + digits : "";
  var map = document.getElementById("visit-map");
  map.href = BETHANY.mapsUrl;
  var times = document.getElementById("visit-times");
  if (!times) return;
  times.replaceChildren();
  BETHANY_WEEKLY.filter(function (item) { return item.worship; }).forEach(function (item) {
    var row = document.createElement("div");
    row.className = "wkrow";
    row.innerHTML = '<span class="day">' + (appLang() === "ko" ? dayKo(item.day) : dayName(item.day)) + '</span><div class="tt">' + escapeHtml(appLang() === "ko" ? item.ko : item.name) + "</div>" + (item.live ? '<span class="chip acc">' + t("liveWord") + "</span>" : "") + '<span class="tm">' + fmtTime(item.h, item.m) + "</span>";
    times.appendChild(row);
  });
}
document.getElementById("watch-live").onclick = function () { window.open(BETHANY.watchUrl, "_blank", "noopener"); };
document.getElementById("all-times").onclick = function () { location.hash = "#/events"; };
document.getElementById("see-events").onclick = function () { location.hash = "#/events"; };
var APP_VERSION = (window.BETHANY && BETHANY.version) || "v41";
var fbCat = "idea";
var fbGen = 0;
function feedbackWho() {
  var p = loadProfile() || {};
  var u = (window.bethanyUser && window.bethanyUser()) || {};
  return {
    name: p.name || u.displayName || "",
    email: p.email || u.email || ""
  };
}
function setFeedbackCategory(cat) {
  fbCat = cat || "idea";
  document.querySelectorAll("#fb-sheet [data-cat]").forEach(function (btn) {
    var on = btn.getAttribute("data-cat") === fbCat;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  });
}
function syncFeedbackSend() {
  var btn = document.getElementById("fb-send");
  var msg = document.getElementById("fb-msg");
  if (!btn || !msg || btn.dataset.busy === "1") return;
  btn.disabled = !msg.value.trim();
}
function openFeedback() {
  fbGen++;
  var who = feedbackWho();
  document.getElementById("fb-name").textContent = who.name;
  document.getElementById("fb-email").textContent = who.email;
  document.getElementById("fb-msg").value = "";
  document.getElementById("fb-contact").checked = false;
  document.getElementById("fb-err").hidden = true;
  document.getElementById("fb-form").hidden = false;
  document.getElementById("fb-thanks").hidden = true;
  var send = document.getElementById("fb-send");
  send.dataset.busy = "";
  send.disabled = true;
  send.textContent = t("fbSend");
  setFeedbackCategory("idea");
  document.getElementById("fb-sheet").hidden = false;
  document.body.classList.add("fb-open");
  document.getElementById("fb-msg").focus();
}
function closeFeedback() {
  fbGen++;
  document.getElementById("fb-sheet").hidden = true;
  document.body.classList.remove("fb-open");
}
function sendFeedback() {
  var msgEl = document.getElementById("fb-msg");
  var message = msgEl.value.trim();
  var err = document.getElementById("fb-err");
  var send = document.getElementById("fb-send");
  if (!message || send.dataset.busy === "1") return;
  if (message.length > 2000) message = message.slice(0, 2000);
  var who = feedbackWho();
  var gen = ++fbGen;
  send.dataset.busy = "1";
  send.disabled = true;
  send.textContent = t("fbSending");
  err.hidden = true;
  api({
    action: "feedback",
    category: fbCat,
    message: message,
    name: who.name,
    email: who.email,
    contactBack: document.getElementById("fb-contact").checked ? "1" : "0",
    lang: appLang(),
    appVersion: APP_VERSION
  }).then(function (res) {
    if (gen !== fbGen || document.getElementById("fb-sheet").hidden) return;
    if (!res || res.ok === false) {
      send.dataset.busy = "";
      send.textContent = t("fbSend");
      syncFeedbackSend();
      err.hidden = false;
      err.textContent = t("fbError");
      return;
    }
    document.getElementById("fb-form").hidden = true;
    document.getElementById("fb-thanks").hidden = false;
    setTimeout(function () { if (gen === fbGen) closeFeedback(); }, 1600);
  }).catch(function () {
    if (gen !== fbGen || document.getElementById("fb-sheet").hidden) return;
    send.dataset.busy = "";
    send.textContent = t("fbSend");
    syncFeedbackSend();
    err.hidden = false;
    err.textContent = t("fbError");
  });
}
document.getElementById("feedback-link").onclick = function () { openFeedback(); };
document.getElementById("fb-close").onclick = function () { closeFeedback(); };
document.getElementById("fb-scrim").onclick = function () { closeFeedback(); };
document.getElementById("fb-msg").addEventListener("input", syncFeedbackSend);
document.getElementById("fb-send").onclick = function () { sendFeedback(); };
document.querySelectorAll("#fb-sheet [data-cat]").forEach(function (btn) {
  btn.onclick = function () { setFeedbackCategory(btn.getAttribute("data-cat")); };
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !document.getElementById("fb-sheet").hidden) closeFeedback();
});
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
