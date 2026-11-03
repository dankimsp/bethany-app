function tf(key, map) {
  var s = t(key);
  Object.keys(map || {}).forEach(function (k) { s = s.split("{" + k + "}").join(map[k] == null ? "" : map[k]); });
  return s;
}
function shortName(full) {
  var s = String(full || "").trim();
  if (!s) return "";
  if (/[가-힣]/.test(s) && !/[A-Za-z]/.test(s)) return s;
  var parts = s.split(/\s+/);
  if (parts.length < 2) return parts[0];
  return parts.slice(0, -1).join(" ") + " " + parts[parts.length - 1].charAt(0).toUpperCase() + ".";
}
function pairInitials(name) {
  var clean = String(name || "").replace(/\./g, "");
  var parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
function sundayParts(iso) {
  var p = String(iso || "").split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}
function sundayLong(iso) {
  var dt = sundayParts(iso);
  if (appLang() === "ko") return (dt.getUTCMonth() + 1) + "월 " + dt.getUTCDate() + "일 주일";
  var mon = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][dt.getUTCMonth()];
  return "Sunday, " + mon + " " + dt.getUTCDate();
}
function sundayShort(iso) {
  var dt = sundayParts(iso);
  if (appLang() === "ko") return (dt.getUTCMonth() + 1) + "월 " + dt.getUTCDate() + "일";
  var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
  return "Sun, " + mon + " " + dt.getUTCDate();
}
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function openSheet(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  document.body.classList.add("fb-open");
  var field = el.querySelector("input, textarea");
  if (field) field.focus();
}
function closeSheet(id) {
  var el = document.getElementById(id);
  if (el) el.hidden = true;
  if (!document.querySelector(".fb-layer:not([hidden])")) document.body.classList.remove("fb-open");
}
function showToast(message, undo) {
  var el = document.getElementById("app-toast");
  if (!el) return;
  el.replaceChildren();
  var span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (undo) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t("undo");
    btn.onclick = function () { el.hidden = true; undo(); };
    el.appendChild(btn);
  }
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { el.hidden = true; }, 6000);
}
function authCodeMessage(code) {
  var map = {
    "auth/requires-recent-login": "errRecent",
    "auth/weak-password": "errWeak",
    "auth/email-already-in-use": "errEmailUsed",
    "auth/credential-already-in-use": "errEmailUsed",
    "auth/provider-already-linked": "errAlready",
    "auth/wrong-password": "errWrong",
    "auth/invalid-credential": "errWrong",
    "auth/too-many-requests": "errMany",
    "auth/network-request-failed": "errOffline",
    "auth/invalid-email": "errEmail"
  };
  return t(map[code] || "errOther");
}
function currentUser() { return (window.bethanyUser && window.bethanyUser()) || {}; }
function userProviders() {
  var u = currentUser();
  if (u.providers && u.providers.length) return u.providers;
  if (u.provider) return [u.provider];
  return [];
}
function hasProvider(id) { return userProviders().indexOf(id) >= 0; }

var rosterState = { roster: null, at: 0, error: false, expanded: {}, pick: {}, offline: false };
var servingState = null;
var cancelSunday = "";

function rosterCacheKey() { return "bethany-nursery-roster"; }
function readRosterCache() {
  try { return JSON.parse(localStorage.getItem(rosterCacheKey()) || "null"); } catch (e) { return null; }
}
function writeRosterCache(roster) {
  var pack = { at: Date.now(), roster: roster };
  try { localStorage.setItem(rosterCacheKey(), JSON.stringify(pack)); } catch (e) {}
  rosterState.roster = roster;
  rosterState.at = pack.at;
  rosterState.error = false;
}

function countLine(day) {
  var n = day.count || (day.people || []).length;
  var g = day.goal;
  if (g == null || g === "") return tf("countOnly", { n: n });
  if (!n) return tf("needsOnly", { g: g });
  if (n >= g) return tf("countGoalMet", { n: n, g: g });
  return tf("countNeeds", { n: n, k: g - n });
}
function countClass(day) {
  var n = day.count || (day.people || []).length;
  if (day.goal == null || day.goal === "") return "mut";
  return n >= day.goal ? "meta-ok" : "meta-need";
}

function loadServing() {
  return api({ action: "getMyServing" }).then(function (res) {
    if (res && res.ok !== false && !res.error) servingState = res;
    return servingState;
  }).catch(function () { return servingState; });
}
function loadRoster() {
  var cached = readRosterCache();
  if (cached && cached.roster) { rosterState.roster = cached.roster; rosterState.at = cached.at || 0; }
  if (!navigator.onLine) { rosterState.offline = true; return Promise.resolve(rosterState.roster); }
  rosterState.offline = false;
  return api({ action: "getNurseryRoster", weeks: 8 }).then(function (res) {
    if (!res || res.ok === false) { rosterState.error = !rosterState.roster; return rosterState.roster; }
    writeRosterCache(res.roster || []);
    return rosterState.roster;
  }).catch(function () { rosterState.error = !rosterState.roster; rosterState.offline = !navigator.onLine; return rosterState.roster; });
}

function paintMoreServing() {
  var box = document.getElementById("more-serving");
  if (!box) return;
  var nursery = hasTeam("nursery");
  var worship = hasTeam("worship");
  if (!nursery && !worship) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren();
  var label = document.createElement("div");
  label.className = "grp";
  label.textContent = t("myServing");
  box.appendChild(label);
  var card = document.createElement("div");
  card.className = "card";
  var data = servingState || {};
  if (nursery && data.nursery && data.nursery.upcoming && data.nursery.upcoming.length) {
    data.nursery.upcoming.slice(0, 3).forEach(function (iso) {
      var row = document.createElement("a");
      row.className = "lr";
      row.href = "#/ministry/nursery";
      var withNames = data.nursery.next && data.nursery.next.sunday === iso ? (data.nursery.next.with || []).join(", ") : "";
      row.innerHTML = '<span class="rdate on"><small>' + escapeHtml(prettySunday(iso).mon) + '</small><b>' + escapeHtml(prettySunday(iso).day) + '</b></span><div class="grow"><div class="tt">' + escapeHtml(sundayShort(iso)) + '</div><div class="ts">' + escapeHtml(withNames ? tf("servingWith", { names: withNames }) : t("nurseryRoster")) + '</div></div>';
      card.appendChild(row);
    });
  } else if (nursery) {
    var link = document.createElement("a");
    link.className = "lr";
    link.href = "#/ministry/nursery";
    link.innerHTML = '<span class="mic plum"><svg class="i"><use href="#i-smile"/></svg></span><div class="grow"><div class="tt">' + escapeHtml(t("nurseryRoster")) + '</div><div class="ts">' + escapeHtml(t("pickSundays")) + '</div></div>';
    card.appendChild(link);
  }
  if (worship) {
    var n = data.worship ? data.worship.markedCount || 0 : 0;
    var w = document.createElement("a");
    w.className = "lr";
    w.href = "#/availability";
    w.innerHTML = '<span class="mic gold"><svg class="i"><use href="#i-users"/></svg></span><div class="grow"><div class="tt">' + escapeHtml(tf("worshipAvail", { n: n })) + '</div></div>';
    card.appendChild(w);
  }
  box.appendChild(card);
}
function paintNotifSummary() {
  var el = document.getElementById("notif-summary");
  if (!el) return;
  var p = loadProfile() || {};
  var bits = [];
  if (p.newsletter !== false) bits.push(t("newsletter"));
  if (p.churchComms !== false) bits.push(t("churchMail"));
  if (p.reminders !== false) bits.push(t("reminders"));
  el.textContent = tf("notifSub", { list: bits.join(", ") || "—" });
}
function paintMoreExtras() {
  paintNotifSummary();
  var ver = document.getElementById("about-version");
  if (ver) ver.textContent = tf("version", { v: BETHANY.version || "" });
  var sheetVer = document.getElementById("about-version-sheet");
  if (sheetVer) sheetVer.textContent = tf("version", { v: BETHANY.version || "" });
  var a2hs = document.getElementById("a2hs-row");
  if (a2hs) a2hs.hidden = isStandalone();
  var summary = document.getElementById("service-summary");
  if (summary) summary.textContent = BETHANY.shortAddress;
}

function paintHomeServing() {
  var box = document.getElementById("home-serving");
  if (!box) return;
  if (!hasTeam("nursery") || !rosterState.roster) { box.hidden = true; return; }
  var days = rosterState.roster;
  var first = days[0];
  var mine = days.filter(function (d) { return (d.people || []).some(function (p) { return p.isMe; }); });
  if (!mine.length) { box.hidden = true; return; }
  var onFirst = first && (first.people || []).some(function (p) { return p.isMe; });
  var today = upcomingSundays(1)[0] === ymd(new Date(Date.UTC(laParts().y, laParts().mo - 1, laParts().d))) && laParts().dow === 0;
  box.hidden = false;
  box.replaceChildren();
  var card = document.createElement("article");
  card.className = "card serve-card" + (onFirst ? "" : " quiet");
  if (onFirst) {
    var others = (first.people || []).filter(function (p) { return !p.isMe; });
    var stack = others.slice(0, 4).map(function (p) { return '<i>' + escapeHtml(pairInitials(p.name)) + '</i>'; }).join("");
    card.innerHTML = '<div class="eyebrow">' + escapeHtml(t("homeKicker")) + '</div><h2>' + escapeHtml(today ? t("homeServingToday") : t("homeServing")) + '</h2><div class="mut">' + escapeHtml(sundayLong(first.sunday)) + '</div>' +
      (others.length ? '<div class="mut" style="margin-top:8px">' + escapeHtml(t("servingWithLabel")) + '</div><div class="stack">' + stack + '</div><div>' + escapeHtml(others.map(function (p) { return p.name; }).join(", ")) + '</div>' : '<p>' + escapeHtml(t("onlyYou")) + '</p>') +
      '<div class="serve-actions"><button type="button" class="pill brand" id="home-roster">' + escapeHtml(t("viewRoster")) + '</button>' +
      (others.length || true ? '<button type="button" class="pill line" id="home-cant">' + escapeHtml(t("cantMake")) + '</button>' : '') + '</div>';
    box.appendChild(card);
    card.querySelector("#home-roster").onclick = function () { location.hash = "#/ministry/nursery"; };
    var cant = card.querySelector("#home-cant");
    if (cant) cant.onclick = function () { openCancel(first.sunday); };
  } else {
    var next = mine[0];
    var names = ((first && first.people) || []).map(function (p) { return p.name; }).join(", ");
    card.innerHTML = '<h2>' + escapeHtml(t("notThisSunday")) + '</h2><p>' + escapeHtml(tf("yourNext", { date: sundayLong(next.sunday) })) + '</p><p class="mut">' + escapeHtml(tf("thisSundayNames", { names: names || t("noOneYet") })) + '</p><div class="serve-actions"><button type="button" class="pill brand" id="home-roster">' + escapeHtml(t("viewRoster")) + '</button><button type="button" class="pill line" id="home-pick">' + escapeHtml(t("pickSundays")) + '</button></div>';
    box.appendChild(card);
    card.querySelector("#home-roster").onclick = function () { location.hash = "#/ministry/nursery"; };
    card.querySelector("#home-pick").onclick = function () { openPick(); };
  }
}

function namesLine(day) {
  var people = day.people || [];
  var you = people.filter(function (p) { return p.isMe; });
  var others = people.filter(function (p) { return !p.isMe; });
  var open = rosterState.expanded[day.sunday];
  var shown = open ? others : others.slice(0, 5);
  var html = you.length ? '<span class="chip you">' + escapeHtml(t("you")) + '</span> ' : "";
  html += escapeHtml(shown.map(function (p) { return p.name; }).join(" · "));
  if (!open && others.length > 5) html += ' <button type="button" class="lnkbtn" data-more="' + escapeAttr(day.sunday) + '">' + escapeHtml(tf("moreNames", { n: others.length - 5 })) + '</button>';
  return html || escapeHtml(t("noOneYet"));
}
function paintNurseryRoster() {
  var root = document.getElementById("nursery-root");
  var tools = document.getElementById("my-tools");
  var label = document.getElementById("ministry-tools-label");
  var emptyOld = document.getElementById("ministry-empty");
  if (tools) tools.hidden = true;
  if (label) label.hidden = true;
  if (emptyOld) emptyOld.hidden = true;
  if (!root) return;
  root.hidden = false;
  var days = rosterState.roster;
  if (!days) {
    root.innerHTML = rosterState.error
      ? '<div class="banner-err">' + escapeHtml(t("loadError")) + '</div><button type="button" class="pill line" id="nursery-retry">' + escapeHtml(t("tryAgain")) + '</button>'
      : '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    var retry0 = document.getElementById("nursery-retry");
    if (retry0) retry0.onclick = function () { rosterState.error = false; rosterState.roster = null; paintNurseryRoster(); loadRoster().then(paintNurseryRoster); };
    return;
  }
  var mineCount = days.filter(function (d) { return (d.people || []).some(function (p) { return p.isMe; }); }).length;
  var any = days.some(function (d) { return (d.people || []).length; });
  var html = '<div class="roster-sum"><div><b>' + escapeHtml(tf("youreOnN", { n: mineCount })) + '</b><div class="mut">' + escapeHtml(t("teamOnly")) + '</div></div><button type="button" class="pill brand sm" id="nursery-pick">' + escapeHtml(t("pickSundays")) + '</button></div>';
  if (rosterState.error && !any) {
    html += '<div class="banner-err">' + escapeHtml(t("loadError")) + '</div><button type="button" class="pill line" id="nursery-retry">' + escapeHtml(t("tryAgain")) + '</button>';
  } else if (!any) {
    html += '<div class="card empty"><div><b>' + escapeHtml(t("emptyRoster")) + '</b><div class="mut">' + escapeHtml(t("emptyRosterBody")) + '</div></div></div>';
  } else {
    if (rosterState.offline || rosterState.error) html += '<p class="mut">' + escapeHtml(tf("lastUpdated", { time: new Date(rosterState.at || Date.now()).toLocaleString() })) + '</p>';
    html += '<div class="eyebrow">' + escapeHtml(t("rosterLabel")) + '</div><div class="card" id="roster-list"></div>';
  }
  root.innerHTML = html;
  var pick = document.getElementById("nursery-pick");
  if (pick) pick.onclick = function () { openPick(); };
  var retry = document.getElementById("nursery-retry");
  if (retry) retry.onclick = function () { rosterState.roster = null; paintNurseryRoster(); loadRoster().then(paintNurseryRoster); };
  var list = document.getElementById("roster-list");
  if (!list) return;
  var first = upcomingSundays(1)[0];
  var today = laParts().dow === 0;
  days.forEach(function (day) {
    var on = (day.people || []).some(function (p) { return p.isMe; });
    var row = document.createElement("div");
    row.className = "roster-row";
    var tag = day.sunday === first ? '<div class="eyebrow">' + escapeHtml(today && day.sunday === first ? t("today") : t("thisSunday")) + '</div>' : "";
    var tile = prettySunday(day.sunday);
    row.innerHTML = '<div class="rdate' + (on ? " on" : "") + '"><small>' + escapeHtml(tile.mon) + '</small><b>' + escapeHtml(tile.day) + '</b></div><div class="grow">' + tag + '<div class="names">' + namesLine(day) + '</div><div class="' + countClass(day) + '">' + escapeHtml(countLine(day)) + '</div></div>' + (on ? '<button type="button" class="pill line cant" data-cant="' + escapeAttr(day.sunday) + '">' + escapeHtml(t("cantMake")) + '</button>' : "");
    list.appendChild(row);
  });
  list.querySelectorAll("[data-more]").forEach(function (btn) {
    btn.onclick = function () { rosterState.expanded[btn.getAttribute("data-more")] = true; paintNurseryRoster(); };
  });
  list.querySelectorAll("[data-cant]").forEach(function (btn) {
    btn.onclick = function () { openCancel(btn.getAttribute("data-cant")); };
  });
}

function openPick() {
  rosterState.pick = {};
  var grid = document.getElementById("pick-grid");
  grid.replaceChildren();
  (rosterState.roster || []).forEach(function (day) {
    var mine = (day.people || []).some(function (p) { return p.isMe; });
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sun-chip" + (mine ? " mine" : "");
    btn.disabled = !!mine || rosterState.offline;
    var sub = mine ? t("youreOnChip") : ((day.people || []).length ? countLine(day) : t("noOneYet"));
    btn.innerHTML = '<b>' + escapeHtml(sundayShort(day.sunday)) + '</b><small>' + escapeHtml(sub) + '</small>';
    btn.onclick = function () {
      if (mine) return;
      rosterState.pick[day.sunday] = !rosterState.pick[day.sunday];
      btn.classList.toggle("on", !!rosterState.pick[day.sunday]);
      var tick = btn.querySelector(".tick");
      if (rosterState.pick[day.sunday] && !tick) {
        var mark = document.createElement("span");
        mark.className = "tick";
        mark.textContent = "✓";
        btn.insertBefore(mark, btn.firstChild);
      } else if (!rosterState.pick[day.sunday] && tick) tick.remove();
      syncPickButton();
    };
    grid.appendChild(btn);
  });
  var who = shortName(displayName());
  document.getElementById("pick-as").innerHTML = escapeHtml(tf("signingAs", { name: who }));
  document.getElementById("pick-err").hidden = true;
  syncPickButton();
  openSheet("sheet-pick");
}
function syncPickButton() {
  var n = Object.keys(rosterState.pick).filter(function (k) { return rosterState.pick[k]; }).length;
  var btn = document.getElementById("pick-go");
  btn.disabled = !n || rosterState.offline;
  btn.textContent = n ? tf("confirmN", { n: n }) : t("selectSundays");
}
function confirmPick() {
  var dates = Object.keys(rosterState.pick).filter(function (k) { return rosterState.pick[k]; });
  if (!dates.length || rosterState.offline) return;
  var btn = document.getElementById("pick-go");
  btn.disabled = true;
  api({ action: "addNurseryDates", sundays: dates }).then(function (res) {
    if (!res || res.ok === false) { document.getElementById("pick-err").hidden = false; document.getElementById("pick-err").textContent = t("updateError"); btn.disabled = false; return; }
    writeRosterCache(res.roster || []);
    var failed = res.failed || [];
    if (failed.length) {
      rosterState.pick = {};
      failed.forEach(function (d) { rosterState.pick[d] = true; });
      document.getElementById("pick-err").hidden = false;
      document.getElementById("pick-err").textContent = t("updateError");
      paintNurseryRoster();
      return;
    }
    closeSheet("sheet-pick");
    paintNurseryRoster();
    paintHomeServing();
    showToast(tf("addedToast", { n: res.added || dates.length }));
  }).catch(function () {
    document.getElementById("pick-err").hidden = false;
    document.getElementById("pick-err").textContent = t("updateError");
    btn.disabled = false;
  });
}
function openCancel(iso) {
  cancelSunday = iso;
  var day = (rosterState.roster || []).filter(function (d) { return d.sunday === iso; })[0] || { people: [], goal: 2 };
  var others = (day.people || []).filter(function (p) { return !p.isMe; }).map(function (p) { return p.name; });
  document.getElementById("cancel-title").textContent = tf("cancelTitle", { date: sundayShort(iso) });
  var names = others.join(", ");
  var goal = day.goal;
  var remain = others.length;
  if (goal != null && goal !== "" && remain < goal) {
    document.getElementById("cancel-body").textContent = tf("cancelBody", { names: names || t("noOneYet"), k: goal - remain });
  } else {
    document.getElementById("cancel-body").textContent = tf("cancelBodyNoGoal", { names: names || t("noOneYet") });
  }
  openSheet("sheet-cancel");
}
function confirmCancel() {
  var iso = cancelSunday;
  if (!iso) return;
  var prev = JSON.stringify(rosterState.roster || []);
  rosterState.roster = (rosterState.roster || []).map(function (day) {
    if (day.sunday !== iso) return day;
    var people = (day.people || []).filter(function (p) { return !p.isMe; });
    return { sunday: day.sunday, goal: day.goal, count: people.length, people: people };
  });
  closeSheet("sheet-cancel");
  paintNurseryRoster();
  paintHomeServing();
  showToast(tf("removedToast", { date: sundayShort(iso) }), function () {
    api({ action: "addNurseryDates", sundays: [iso] }).then(function (res) {
      if (res && res.roster) writeRosterCache(res.roster);
      paintNurseryRoster();
      paintHomeServing();
    });
  });
  api({ action: "cancelNurseryDate", sunday: iso }).then(function (res) {
    if (!res || res.ok === false) throw new Error("fail");
    if (res.roster) writeRosterCache(res.roster);
    paintNurseryRoster();
    paintHomeServing();
  }).catch(function () {
    try { rosterState.roster = JSON.parse(prev); } catch (e) {}
    paintNurseryRoster();
    paintHomeServing();
    showToast(t("updateError"));
  });
}

function paintAccount() {
  var profile = document.getElementById("account-profile");
  var methods = document.getElementById("account-methods");
  var extra = document.getElementById("account-extra");
  if (!profile || !methods || !extra) return;
  var u = currentUser();
  var name = (loadProfile() && loadProfile().name) || u.displayName || "";
  var email = u.email || (loadProfile() && loadProfile().email) || "";
  var short = shortName(name);
  profile.innerHTML = '<div class="lr"><div class="grow"><div class="mut" data-i18n="name">' + escapeHtml(t("name")) + '</div><b>' + escapeHtml(name) + '</b><div class="mut">' + escapeHtml(tf("shownAs", { short: short })) + '</div></div><button type="button" class="lnkbtn" id="account-edit">' + escapeHtml(t("edit")) + '</button></div><div class="lr"><div class="grow"><div class="mut">' + escapeHtml(t("email")) + '</div><b id="account-email">' + escapeHtml(email) + '</b></div></div>';
  var google = hasProvider("google.com");
  var password = hasProvider("password");
  methods.innerHTML = (google ? '<div class="lr"><span class="mic gold"><svg class="i"><use href="#i-globe"/></svg></span><div class="grow"><div class="tt">Google</div><div class="ts">' + escapeHtml(email) + '</div></div><b>' + escapeHtml(t("onState")) + '</b></div>' : "") +
    '<div class="lr"><span class="mic acc"><svg class="i"><use href="#i-mail"/></svg></span><div class="grow"><div class="tt">' + escapeHtml(t("emailPw")) + '</div><div class="ts">' + escapeHtml(password ? t("onState") : t("notSetUp")) + '</div></div>' + (password ? '<b>' + escapeHtml(t("onState")) + '</b>' : '<button type="button" class="pill sm brand" id="add-password">' + escapeHtml(t("add")) + '</button>') + '</div>';
  extra.replaceChildren();
  if (password) {
    var wrap = document.createElement("div");
    wrap.innerHTML = '<div class="grp">' + escapeHtml(t("password")) + '</div><div class="card"><button type="button" class="lr" id="open-change"><div class="grow"><div class="tt">' + escapeHtml(t("changePw")) + '</div><div class="ts">' + escapeHtml(t("changePwSub")) + '</div></div></button><button type="button" class="lr" id="open-reset"><div class="grow"><div class="tt">' + escapeHtml(t("sendReset")) + '</div><div class="ts">' + escapeHtml(tf("sendResetSub", { email: email })) + '</div></div></button></div>';
    extra.appendChild(wrap);
    document.getElementById("open-change").onclick = function () { openSheet("sheet-changepw"); };
    document.getElementById("open-reset").onclick = function () { openReset(email); };
  } else {
    var note = document.createElement("p");
    note.className = "card mut";
    note.textContent = t("addPwBanner");
    extra.appendChild(note);
  }
  var edit = document.getElementById("account-edit");
  if (edit) edit.onclick = function () {
    document.getElementById("edit-name").value = name;
    document.getElementById("edit-name-hint").textContent = tf("teamsSee", { short: shortName(name) });
    document.getElementById("edit-name-err").hidden = true;
    openSheet("sheet-name");
  };
  var add = document.getElementById("add-password");
  if (add) add.onclick = function () {
    document.getElementById("setpw-email").textContent = email;
    document.getElementById("setpw-new").value = "";
    document.getElementById("setpw-confirm").value = "";
    document.getElementById("setpw-banner").hidden = true;
    document.getElementById("setpw-len").hidden = true;
    document.getElementById("setpw-match").hidden = true;
    openSheet("sheet-setpw");
  };
}
function saveEditedName() {
  var input = document.getElementById("edit-name");
  var name = input.value.trim();
  var err = document.getElementById("edit-name-err");
  if (!name || name.length > 40) { err.hidden = false; err.textContent = t("nameEmpty"); return; }
  if (window.bethanyUpdateName) window.bethanyUpdateName(name);
  pushProfile({ name: name });
  closeSheet("sheet-name");
  paintAccount();
  if (document.getElementById("acct-name")) document.getElementById("acct-name").textContent = name;
  showToast(t("nameSaved"));
}
function livePasswordHints() {
  var pw = document.getElementById("setpw-new").value;
  var confirm = document.getElementById("setpw-confirm").value;
  var len = document.getElementById("setpw-len");
  var match = document.getElementById("setpw-match");
  len.hidden = !pw;
  len.textContent = pw.length >= 8 ? t("min8") : t("errWeak");
  len.className = pw.length >= 8 ? "hint-ok" : "hint-no";
  match.hidden = !confirm;
  var ok = pw && pw === confirm;
  match.textContent = ok ? t("pwMatch") : t("errMismatch");
  match.className = ok ? "hint-ok" : "hint-no";
}
function saveNewPassword() {
  var pw = document.getElementById("setpw-new").value;
  var confirm = document.getElementById("setpw-confirm").value;
  var banner = document.getElementById("setpw-banner");
  banner.hidden = true;
  if (pw.length < 8) { document.getElementById("setpw-len").hidden = false; document.getElementById("setpw-len").textContent = t("errWeak"); return; }
  if (pw !== confirm) { document.getElementById("setpw-match").hidden = false; document.getElementById("setpw-match").textContent = t("errMismatch"); return; }
  if (window.bethanySetPendingPassword) window.bethanySetPendingPassword(pw);
  window.bethanyLinkPassword(pw).then(function () {
    if (window.bethanySetPendingPassword) window.bethanySetPendingPassword("");
    closeSheet("sheet-setpw");
    paintAccount();
    showToast(t("pwAdded"));
  }).catch(function (code) {
    if (code === "auth/provider-already-linked") { closeSheet("sheet-setpw"); paintAccount(); showToast(t("errAlready")); return; }
    if (code === "auth/requires-recent-login") {
      banner.hidden = false;
      banner.innerHTML = '<p>' + escapeHtml(t("errRecent")) + '</p><button type="button" class="pill brand" id="setpw-reauth">' + escapeHtml(t("continueGoogle")) + '</button>';
      document.getElementById("setpw-reauth").onclick = function () {
        window.bethanyReauthGoogle().then(function () {
          var again = window.bethanyTakePendingPassword ? window.bethanyTakePendingPassword() : pw;
          if (!again) return;
          return window.bethanyLinkPassword(again);
        }).then(function () { closeSheet("sheet-setpw"); paintAccount(); showToast(t("pwAdded")); }).catch(function (err) {
          banner.hidden = false;
          banner.textContent = authCodeMessage(err);
        });
      };
      return;
    }
    banner.hidden = false;
    banner.textContent = authCodeMessage(code);
    if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") {
      var fbBtn = document.createElement("button");
      fbBtn.type = "button";
      fbBtn.className = "pill line";
      fbBtn.textContent = t("feedback");
      fbBtn.onclick = function () { closeSheet("sheet-setpw"); if (window.openFeedback) window.openFeedback(); };
      banner.appendChild(fbBtn);
    }
  });
}
function saveChangedPassword() {
  var current = document.getElementById("changepw-current").value;
  var next = document.getElementById("changepw-new").value;
  var curErr = document.getElementById("changepw-current-err");
  var newErr = document.getElementById("changepw-new-err");
  var banner = document.getElementById("changepw-banner");
  curErr.hidden = true;
  newErr.hidden = true;
  banner.hidden = true;
  if (next.length < 8) { newErr.hidden = false; newErr.textContent = t("errWeak"); return; }
  window.bethanyChangePassword(current, next).then(function () {
    closeSheet("sheet-changepw");
    showToast(t("pwUpdated"));
  }).catch(function (code) {
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") { curErr.hidden = false; curErr.textContent = t("errWrong"); return; }
    if (code === "auth/weak-password") { newErr.hidden = false; newErr.textContent = t("errWeak"); return; }
    if (code === "auth/requires-recent-login") { banner.hidden = false; banner.textContent = t("errRecent"); return; }
    banner.hidden = false;
    banner.textContent = authCodeMessage(code);
  });
}
var resetLockedUntil = 0;
function openReset(email) {
  var addr = email || currentUser().email || "";
  document.getElementById("reset-to").textContent = tf("sendResetSub", { email: addr });
  document.getElementById("reset-form").hidden = false;
  document.getElementById("reset-done").hidden = true;
  document.getElementById("reset-err").hidden = true;
  document.getElementById("reset-neutral").textContent = tf("resetNeutral", { email: addr });
  openSheet("sheet-reset");
}
function sendReset(force) {
  var email = currentUser().email || (document.getElementById("signin-email") && document.getElementById("signin-email").value.trim()) || "";
  var err = document.getElementById("reset-err");
  var again = document.getElementById("reset-again");
  if (!force && Date.now() < resetLockedUntil) return;
  err.hidden = true;
  window.bethanyReset(email).then(function () { finishReset(email); }).catch(function (code) {
    if (code === "auth/invalid-email" || code === "auth/network-request-failed" || code === "auth/too-many-requests") {
      err.hidden = false;
      err.textContent = authCodeMessage(code);
      return;
    }
    finishReset(email);
  });
  function finishReset(addr) {
    document.getElementById("reset-neutral").textContent = tf("resetNeutral", { email: addr });
    document.getElementById("reset-form").hidden = true;
    document.getElementById("reset-done").hidden = false;
    resetLockedUntil = Date.now() + 30000;
    if (again) { again.disabled = true; setTimeout(function () { again.disabled = false; }, 30000); }
  }
}
function paintServiceSheet() {
  var list = document.getElementById("service-list");
  if (!list || list.childElementCount) return;
  BETHANY_WEEKLY.forEach(function (item) {
    var row = document.createElement("div");
    row.className = "lr";
    row.innerHTML = '<div class="grow"><div class="tt">' + escapeHtml(appLang() === "ko" ? item.ko : item.name) + '</div></div><span class="tm">' + fmtTime(item.h, item.m) + '</span>';
    list.appendChild(row);
  });
  document.getElementById("service-address").textContent = BETHANY.address;
  document.getElementById("service-directions").href = BETHANY.mapsUrl;
  var digits = String(BETHANY.phone || "").replace(/[^\d+]/g, "");
  document.getElementById("service-call").href = digits ? "tel:" + digits : "";
}
function checkForUpdates() {
  var btn = document.getElementById("check-updates");
  if (btn) btn.textContent = t("checking");
  var done = function () { location.reload(); };
  if (!navigator.serviceWorker) { done(); return; }
  navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.update() : null; }).then(done, done);
}

function bootMore() {
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () { closeSheet(btn.getAttribute("data-close")); });
  });
  var profile = document.getElementById("profile-card");
  if (profile) profile.onclick = function () { location.hash = "#/account"; };
  var accountRow = document.getElementById("account-row");
  if (accountRow) accountRow.onclick = function () { location.hash = "#/account"; };
  var notif = document.getElementById("notif-row");
  if (notif) notif.onclick = function () { openSheet("sheet-notif"); };
  var service = document.getElementById("service-row");
  if (service) service.onclick = function () { paintServiceSheet(); openSheet("sheet-service"); };
  var a2hs = document.getElementById("a2hs-row");
  if (a2hs) a2hs.onclick = function () { openSheet("sheet-a2hs"); };
  var about = document.getElementById("about-row");
  if (about) about.onclick = function () { paintMoreExtras(); openSheet("sheet-about"); };
  var back = document.getElementById("account-back");
  if (back) back.onclick = function () { location.hash = "#/more"; };
  var pickGo = document.getElementById("pick-go");
  if (pickGo) pickGo.onclick = confirmPick;
  var cancelYes = document.getElementById("cancel-yes");
  if (cancelYes) cancelYes.onclick = confirmCancel;
  var nameSave = document.getElementById("edit-name-save");
  if (nameSave) nameSave.onclick = saveEditedName;
  var setSave = document.getElementById("setpw-save");
  if (setSave) setSave.onclick = saveNewPassword;
  ["setpw-new", "setpw-confirm"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", livePasswordHints);
  });
  var changeSave = document.getElementById("changepw-save");
  if (changeSave) changeSave.onclick = saveChangedPassword;
  var changeForgot = document.getElementById("changepw-forgot");
  if (changeForgot) changeForgot.onclick = function () { closeSheet("sheet-changepw"); openReset(currentUser().email); };
  var resetSend = document.getElementById("reset-send");
  if (resetSend) resetSend.onclick = function () { sendReset(false); };
  var resetAgain = document.getElementById("reset-again");
  if (resetAgain) resetAgain.onclick = function () { if (Date.now() >= resetLockedUntil) sendReset(true); };
  var updates = document.getElementById("check-updates");
  if (updates) updates.onclick = checkForUpdates;
  var forgot = document.getElementById("forgot");
  if (forgot) forgot.onclick = function () { openReset(document.getElementById("signin-email").value.trim()); };
}
window.paintAccountPage = function () { paintAccount(); };
window.paintMorePage = function () { paintMoreExtras(); paintMoreServing(); if (hasTeam("nursery") || hasTeam("worship")) loadServing().then(paintMoreServing); };
window.paintNurseryPage = function () {
  paintNurseryRoster();
  loadRoster().then(function () { paintNurseryRoster(); paintHomeServing(); });
};
window.paintHomeServingCard = function () {
  if (!hasTeam("nursery")) { var box = document.getElementById("home-serving"); if (box) box.hidden = true; return; }
  var cached = readRosterCache();
  if (cached && cached.roster) { rosterState.roster = cached.roster; rosterState.at = cached.at || 0; paintHomeServing(); }
  loadRoster().then(function () { paintHomeServing(); });
  loadServing();
};
bootMore();
setTimeout(function () {
  var path = (location.hash || "").replace(/^#\/?/, "").split(/[/?]/)[0];
  if (path === "more" && window.paintMorePage) window.paintMorePage();
  if (path === "account" && window.paintAccountPage) window.paintAccountPage();
  if (path === "home" && window.paintHomeServingCard) window.paintHomeServingCard();
  if (path === "ministry" && (location.hash || "").indexOf("nursery") >= 0 && window.paintNurseryPage) window.paintNurseryPage();
}, 0);
