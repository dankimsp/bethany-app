// Standalone Apps Script web app for Bethany Worship.
// Deploy as Daniel (danielcyk123@gmail.com), execute as Me, access Anyone.
// Script properties: EN_FOLDER_ID, KO_FOLDER_ID.
// TEAM_HASH and LEADER_HASH are optional. When they are unset, songs and publishing are open.
// SPREADSHEET_ID is saved automatically the first time a setlist is published or a song is requested.
// Never put a password or a hash in this file.

var INDEX_NAME = "bethany-worship-index.json";
var INDEX_LIST_MS = 600000;
var INDEX_PAGE_SONGS = 40;
var INDEX_PAGE_CHARS = 120000;

function saveFolderIds() {
  PropertiesService.getScriptProperties().setProperties({
    EN_FOLDER_ID: "1zQlSfNr0kJK8YSqsFobT8A_A-lwNkwvb",
    KO_FOLDER_ID: "1YiqsYVRI4UaPCPEVP-YQM0j9b4t-U6bA"
  });
  Logger.log("Saved EN_FOLDER_ID and KO_FOLDER_ID.");
}

// Optional. The app does not send a password. Run this only if you want to turn TEAM_HASH or LEADER_HASH back on.
// Do not leave a secret in this file.
function hashPassword() {
  var password = "";
  if (!password) {
    Logger.log("Optional. Leave this empty unless you are turning a hash check back on.");
    return;
  }
  Logger.log(hashPass_(password));
  password = "";
}

function showSpreadsheet() {
  Logger.log(book_().getUrl());
}

function doGet(e) {
  e = e || { parameter: {} };
  return scriptOut_(handle_(e.parameter || {}), (e.parameter || {}).callback);
}

function doPost(e) {
  e = e || { parameter: {}, postData: { contents: "{}" } };
  var params = e.parameter || {};
  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || "{}"); } catch (err) { body = {}; }
  Object.keys(body).forEach(function (key) { params[key] = body[key]; });
  return scriptOut_(handle_(params), params.callback);
}

function handle_(params) {
  params = params || {};
  var auth = auth_(params.token);
  if (auth) return auth;
  var action = String(params.action || "getSongs");
  var open = { listSongs: true, getSongs: true, get: true, request: true, feedback: true };
  if (!open[action]) {
    var user = requireUser_(params);
    if (!user) return { ok: false, status: 401, error: "auth" };
    params._user = user;
  }
  if (action === "listSongs" || action === "getSongs") return songs_(params);
  if (action === "publish") return publish_(params.payload || params);
  if (action === "get") return readSet_(params.id);
  if (action === "request") return request_(params);
  if (action === "feedback") return feedback_(params);
  if (action === "verifyTeamCode") return verifyTeamCode_(params);
  if (action === "getSignups") return getSignups_(params);
  if (action === "addSignup") return addSignup_(params);
  if (action === "cancelSignup") return cancelSignup_(params);
  if (action === "getAvailability") return getAvailability_(params);
  if (action === "setAvailability") return setAvailability_(params);
  if (action === "getProfile") return getProfile_(params);
  if (action === "saveProfile") return saveProfile_(params);
  return { ok: false, status: 400, error: "action" };
}

function requireUser_(params) {
  var token = String(params.idToken || "");
  var props = PropertiesService.getScriptProperties();
  var grace = props.getProperty("AUTH_GRACE") === "1";
  if (!token) return grace ? { uid: "", email: "", name: "", grace: true } : null;
  var cache = CacheService.getScriptCache();
  var key = "id_" + hashPass_(token).slice(0, 40);
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) {}
  }
  var apiKey = props.getProperty("FIREBASE_API_KEY");
  if (!apiKey) return grace ? { uid: "", email: "", name: "", grace: true } : null;
  var res = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText() || "{}"); } catch (err) { body = {}; }
  if (res.getResponseCode() !== 200 || !body.users || !body.users.length) return null;
  var account = body.users[0];
  var user = { uid: String(account.localId || ""), email: String(account.email || ""), name: String(account.displayName || "") };
  if (!user.uid) return null;
  cache.put(key, JSON.stringify(user), 600);
  return user;
}

function verifyTeamCode_(params) {
  var team = String(params.team || "").toLowerCase();
  var code = String(params.code || "");
  var key = team === "worship" ? "TEAM_CODE_WORSHIP" : team === "nursery" ? "TEAM_CODE_NURSERY" : "";
  if (!key) return { ok: false, status: 400, error: "team" };
  var expected = PropertiesService.getScriptProperties().getProperty(key);
  if (!expected) return { ok: false, status: 503, error: "soon" };
  if (!codeOk_(code, expected)) return { ok: false, status: 401, error: "code" };
  if (params._user && params._user.uid) addMemberTeam_(params._user, team);
  return { ok: true, status: 200, team: team };
}

function codeOk_(code, expected) {
  expected = String(expected || "");
  if (!code || !expected) return false;
  if (/^[0-9a-f]{64}$/i.test(expected)) return hashPass_(code) === expected.toLowerCase();
  return code === expected;
}

function isoCell_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, "America/Los_Angeles", "yyyy-MM-dd");
  }
  var s = String(v == null ? "" : v).replace(/^'+/, "").trim();
  var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  if (s && /[A-Za-z]/.test(s)) {
    var parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, "America/Los_Angeles", "yyyy-MM-dd");
  }
  return s;
}

function signupSheet_() {
  var ss = book_();
  return ensureSheet_(ss, "Signups", ["updatedAt", "kind", "sunday", "name", "deviceId", "active", "uid"]);
}

function samePerson_(row, uid, deviceId) {
  if (uid && row.uid && row.uid === uid) return true;
  if (deviceId && row.deviceId === deviceId) return true;
  return false;
}

function signupList_(kind) {
  var rows = signupSheet_().getDataRange().getValues();
  var latest = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) !== String(kind)) continue;
    var sunday = isoCell_(rows[i][2]);
    latest[sunday + "|" + String(rows[i][4]) + "|" + String(rows[i][6] || "")] = {
      sunday: sunday,
      name: String(rows[i][3]),
      deviceId: String(rows[i][4]),
      uid: String(rows[i][6] || ""),
      active: String(rows[i][5]) !== "0"
    };
  }
  var list = [];
  Object.keys(latest).forEach(function (key) { if (latest[key].active) list.push(latest[key]); });
  return list;
}

function getSignups_(params) {
  var kind = String(params.kind || "");
  if (kind !== "snack" && kind !== "km-food" && kind !== "nursery") return { ok: false, status: 400, error: "kind" };
  return { ok: true, status: 200, kind: kind, signups: signupList_(kind) };
}

function addSignup_(params) {
  var kind = String(params.kind || "");
  var sunday = isoCell_(params.sunday);
  var name = String(params.name || "").trim();
  var deviceId = String(params.deviceId || "");
  var uid = params._user && params._user.uid ? params._user.uid : String(params.uid || "");
  if ((kind !== "snack" && kind !== "km-food" && kind !== "nursery") || !/^\d{4}-\d{2}-\d{2}$/.test(sunday) || !name || (!deviceId && !uid)) {
    return { ok: false, status: 400, error: "fields" };
  }
  var existing = signupList_(kind);
  if (kind !== "km-food") {
    var taken = existing.some(function (row) { return row.sunday === sunday && !samePerson_(row, uid, deviceId); });
    if (taken) return { ok: false, status: 409, error: "taken", signups: existing };
  }
  var when = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  signupSheet_().appendRow([when, kind, "'" + sunday, name, deviceId, "1", uid]);
  return { ok: true, status: 200, kind: kind, signups: signupList_(kind) };
}

function cancelSignup_(params) {
  var kind = String(params.kind || "");
  var sunday = isoCell_(params.sunday);
  var deviceId = String(params.deviceId || "");
  var uid = params._user && params._user.uid ? params._user.uid : String(params.uid || "");
  if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(sunday) || (!deviceId && !uid)) return { ok: false, status: 400, error: "fields" };
  var when = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  signupSheet_().appendRow([when, kind, "'" + sunday, "", deviceId, "0", uid]);
  return { ok: true, status: 200, kind: kind, signups: signupList_(kind) };
}

function availabilitySheet_() {
  var ss = book_();
  return ensureSheet_(ss, "Availability", ["updatedAt", "team", "person", "sunday", "status", "note"]);
}

function getAvailability_(params) {
  var team = String(params.team || "worship");
  var rows = availabilitySheet_().getDataRange().getValues();
  var latest = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) !== team) continue;
    var sunday = isoCell_(rows[i][3]);
    latest[String(rows[i][2]) + "|" + sunday] = {
      person: String(rows[i][2]),
      sunday: sunday,
      status: String(rows[i][4] || ""),
      note: String(rows[i][5] || "")
    };
  }
  var list = [];
  Object.keys(latest).forEach(function (key) { if (latest[key].status) list.push(latest[key]); });
  return { ok: true, status: 200, team: team, rows: list };
}

function setAvailability_(params) {
  var team = String(params.team || "worship");
  var person = String(params.person || "");
  var sunday = isoCell_(params.sunday);
  var status = String(params.status || "");
  var note = String(params.note || "");
  if (!person || !/^\d{4}-\d{2}-\d{2}$/.test(sunday)) return { ok: false, status: 400, error: "fields" };
  if (params._user && params._user.uid) {
    var member = memberByUid_(params._user.uid);
    if (member && member.rosterId && String(member.rosterId) !== person) return { ok: false, status: 403, error: "roster" };
    if (member && !member.rosterId) upsertMember_(params._user, { rosterId: person });
  }
  var when = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  availabilitySheet_().appendRow([when, team, person, "'" + sunday, status, note]);
  return { ok: true, status: 200, team: team };
}

function auth_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("TEAM_HASH");
  if (!expected) return null;
  if (!token || String(token).toLowerCase() !== String(expected).toLowerCase()) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return null;
}

function songs_(params) {
  params = params || {};
  try {
    var clientEtag = String(params.etag || "");
    var cursor = String(params.cursor || "");
    var props = PropertiesService.getScriptProperties();
    if (!cursor && clientEtag && props.getProperty("INDEX_READY") === "1" && props.getProperty("INDEX_ETAG") === clientEtag) {
      return {
        ok: true,
        status: 200,
        unchanged: true,
        more: false,
        ready: true,
        etag: clientEtag,
        version: clientEtag,
        count: Number(props.getProperty("INDEX_TOTAL") || 0)
      };
    }
    return songsBuild_(clientEtag, cursor, {});
  } catch (err) {
    return { ok: false, status: 500, error: "drive", message: String(err).slice(0, 180) };
  }
}

// Run once from the editor after pasting this file. Safe to run again; saved progress is kept.
function buildIndex() {
  var start = Date.now();
  var last = -1;
  var spins = 0;
  while (Date.now() - start < 270000) {
    var res;
    try { res = songsBuild_("", "", { budgetMs: 20000, maxReads: 30 }); }
    catch (err) { Logger.log(String(err).slice(0, 180)); return; }
    if (!res || res.ok === false) {
      Logger.log((res && (res.message || res.error)) || "Index failed.");
      return;
    }
    Logger.log("Indexed " + (res.indexed || 0) + " / " + (res.total || 0));
    if (res.ready) { Logger.log("Index complete."); return; }
    if ((res.indexed || 0) === last) {
      spins++;
      if (spins >= 4) {
        Logger.log("No further progress. Run buildIndex again if songs remain.");
        return;
      }
      Utilities.sleep(500);
    } else spins = 0;
    last = res.indexed || 0;
  }
  Logger.log("Paused before the time limit. Run buildIndex again to continue.");
}

function songsBuild_(clientEtag, cursor, opts) {
  opts = opts || {};
  var props = PropertiesService.getScriptProperties();
  var en = props.getProperty("EN_FOLDER_ID");
  var ko = props.getProperty("KO_FOLDER_ID");
  if (!en || !ko) return { ok: false, status: 500, error: "config" };
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(opts.lockMs || 1500); } catch (err) { locked = false; }
  var start = Date.now();
  var budgetMs = opts.budgetMs || 20000;
  var maxReads = opts.maxReads || 25;
  try {
    var index = loadIndex_();
    if (locked) {
      var changed = listStep_(index, en, ko, start, budgetMs);
      var reads = readStep_(index, start, budgetMs, maxReads);
      var readyNow = indexReady_(index);
      if (changed || reads || index.ready !== readyNow) {
        index.ready = readyNow;
        saveIndex_(index);
      }
      if (readyNow && index.etag) {
        if (props.getProperty("INDEX_READY") !== "1" || props.getProperty("INDEX_ETAG") !== index.etag) {
          props.setProperty("INDEX_READY", "1");
          props.setProperty("INDEX_ETAG", index.etag);
          props.setProperty("INDEX_TOTAL", String(index.total || (index.listed || []).length));
        }
      } else if (props.getProperty("INDEX_READY")) props.deleteProperty("INDEX_READY");
    }
    return pageIndex_(index, String(cursor || ""));
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (err2) {} }
  }
}

function loadIndex_() {
  try {
    var data = JSON.parse(indexFile_().getBlob().getDataAsString("UTF-8") || "{}");
    if (!data || typeof data !== "object") throw 0;
    if (!data.files || typeof data.files !== "object") data.files = {};
    if (!Array.isArray(data.listed)) data.listed = [];
    return data;
  } catch (err) {
    return { listedAt: 0, etag: "", total: 0, ready: false, listing: false, listed: [], files: {} };
  }
}

function saveIndex_(index) {
  indexFile_().setContent(JSON.stringify(index));
}

function indexFile_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("INDEX_FILE_ID");
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { id = ""; }
  }
  var found = DriveApp.getFilesByName(INDEX_NAME);
  while (found.hasNext()) {
    var file = found.next();
    if (file.getName() === INDEX_NAME) {
      props.setProperty("INDEX_FILE_ID", file.getId());
      return file;
    }
  }
  var created = DriveApp.createFile(INDEX_NAME, "{}", MimeType.PLAIN_TEXT);
  props.setProperty("INDEX_FILE_ID", created.getId());
  return created;
}

function listStep_(index, en, ko, start, budgetMs) {
  var stale = !index.listedAt || (Date.now() - Number(index.listedAt) > INDEX_LIST_MS);
  if (!index.listQueue && !stale && !index.listing) return false;
  if (!index.listQueue) {
    index.listQueue = [
      { id: en, language: "en", depth: 0 },
      { id: ko, language: "ko", depth: 0 }
    ];
    index.listSeen = {};
    index.listed = [];
    index.listing = true;
    index.ready = false;
    index.listedAt = 0;
  }
  var guard = 0;
  while (index.listQueue.length && Date.now() - start < budgetMs && guard < 8000) {
    guard++;
    var job = index.listQueue[0];
    var folder;
    try { folder = DriveApp.getFolderById(job.id); }
    catch (err) { index.listQueue.shift(); continue; }
    var files = folder.getFiles();
    var folderDone = true;
    while (files.hasNext()) {
      if (Date.now() - start > budgetMs) { folderDone = false; break; }
      var file = files.next();
      var fid = file.getId();
      if (index.listSeen[fid]) continue;
      index.listSeen[fid] = 1;
      if (!/\.cho$/i.test(file.getName())) continue;
      index.listed.push({
        id: fid,
        name: file.getName(),
        language: job.language,
        updated: file.getLastUpdated().getTime(),
        bytes: file.getSize()
      });
    }
    if (folderDone && job.depth < 4) {
      var subs = folder.getFolders();
      while (subs.hasNext()) {
        if (Date.now() - start > budgetMs) { folderDone = false; break; }
        var sub = subs.next();
        var sid = sub.getId();
        if (index.listSeen["folder:" + sid]) continue;
        index.listSeen["folder:" + sid] = 1;
        index.listQueue.push({ id: sid, language: job.language, depth: job.depth + 1 });
      }
    }
    if (!folderDone) break;
    index.listQueue.shift();
  }
  if (index.listQueue.length) return true;
  index.listed.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  index.etag = hashPass_(index.listed.map(function (file) { return file.id + "|" + file.updated + "|" + file.bytes; }).join("\n"));
  index.total = index.listed.length;
  index.listedAt = Date.now();
  index.listing = false;
  var keep = {};
  index.listed.forEach(function (file) {
    var prev = index.files[file.id];
    if (prev && prev.cho != null && prev.updated === file.updated && prev.bytes === file.bytes) keep[file.id] = prev;
  });
  index.files = keep;
  delete index.listQueue;
  delete index.listSeen;
  return true;
}

function readStep_(index, start, budgetMs, maxReads) {
  var reads = 0;
  var listed = index.listed || [];
  for (var i = 0; i < listed.length; i++) {
    if (Date.now() - start >= budgetMs || reads >= maxReads) break;
    var file = listed[i];
    var prev = index.files[file.id];
    if (prev && prev.cho != null && prev.updated === file.updated && prev.bytes === file.bytes) {
      if (!(prev.failed && prev.failed < 2 && !prev.cho)) continue;
    }
    try {
      var cho = DriveApp.getFileById(file.id).getBlob().getDataAsString("UTF-8");
      index.files[file.id] = { name: file.name, language: file.language, updated: file.updated, bytes: file.bytes, cho: cho };
    } catch (err) {
      index.files[file.id] = {
        name: file.name,
        language: file.language,
        updated: file.updated,
        bytes: file.bytes,
        cho: "",
        failed: prev && prev.failed ? prev.failed + 1 : 1
      };
    }
    reads++;
  }
  return reads;
}

function indexReady_(index) {
  if (index.listing || !index.listedAt || index.listQueue) return false;
  var listed = index.listed || [];
  for (var i = 0; i < listed.length; i++) {
    var file = listed[i];
    var prev = index.files[file.id];
    if (!prev || prev.cho == null || prev.updated !== file.updated || prev.bytes !== file.bytes) return false;
    if (prev.failed && prev.failed < 2 && !prev.cho) return false;
  }
  return true;
}

function indexedCount_(index) {
  var n = 0;
  var listed = index.listed || [];
  for (var i = 0; i < listed.length; i++) {
    var file = listed[i];
    var prev = index.files[file.id];
    if (prev && prev.cho != null && prev.updated === file.updated && prev.bytes === file.bytes) n++;
  }
  return n;
}

function freshFile_(index, file) {
  var prev = index.files[file.id];
  if (!prev || prev.cho == null || prev.updated !== file.updated || prev.bytes !== file.bytes) return false;
  if (prev.failed && prev.failed < 2 && !prev.cho) return false;
  return true;
}

function songFrom_(file, prev) {
  return {
    id: "drive-" + file.id,
    name: file.name || prev.name || "",
    language: file.language || prev.language || "",
    updated: file.updated,
    bytes: file.bytes,
    cho: prev.cho
  };
}

function pageIndex_(index, cursor) {
  var listed = index.listed || [];
  var ready = indexReady_(index);
  var songs = [];
  var used = 0;
  var next = cursor;
  var more = !ready;
  if (!index.listedAt || index.listing) {
    for (var i = 0; i < listed.length && songs.length < INDEX_PAGE_SONGS; i++) {
      var file = listed[i];
      if (!freshFile_(index, file) || !index.files[file.id].cho) continue;
      var early = songFrom_(file, index.files[file.id]);
      var earlySize = JSON.stringify(early).length;
      if (songs.length && used + earlySize > INDEX_PAGE_CHARS) break;
      songs.push(early);
      used += earlySize;
    }
    more = true;
    next = "";
  } else {
    var seenCursor = !cursor;
    for (var j = 0; j < listed.length; j++) {
      var item = listed[j];
      if (!seenCursor) {
        if (item.id === cursor) seenCursor = true;
        continue;
      }
      if (!freshFile_(index, item)) { more = true; break; }
      if (!index.files[item.id].cho) continue;
      var song = songFrom_(item, index.files[item.id]);
      var piece = JSON.stringify(song).length;
      if (songs.length && (songs.length >= INDEX_PAGE_SONGS || used + piece > INDEX_PAGE_CHARS)) { more = true; break; }
      songs.push(song);
      used += piece;
      next = item.id;
    }
    if (!seenCursor) return pageIndex_(index, "");
    if (!more) next = "";
  }
  return {
    ok: true,
    status: 200,
    etag: index.etag || "",
    version: index.etag || "",
    more: more,
    ready: ready,
    cursor: more ? next : "",
    indexed: indexedCount_(index),
    total: index.total || listed.length,
    count: index.total || listed.length,
    songs: songs
  };
}

function publish_(data) {
  if (typeof data === "string") data = parseJson_(data);
  data = data || {};
  if (!leaderOk_(data.passphrase)) return { ok: false, status: 403, error: "pass" };
  var updatedAt = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  var songs = data.songs || [];
  // A change note is optional. Autosave sends an empty string.
  var change = data.change || "";
  var stored = { date: data.date || "", service: data.service || "", language: data.language || "", songs: songs };
  if (data.title != null) stored.title = data.title || "";
  if (data.titleEdited === true || data.titleEdited === false) stored.titleEdited = data.titleEdited === true;
  if (data.leader != null) stored.leader = data.leader || "";
  book_().getSheetByName("Live Setlists").appendRow([
    updatedAt,
    data.id || "",
    change,
    data.leaderNote || "",
    JSON.stringify(stored)
  ]);
  var result = { ok: true, status: 200, found: true, id: data.id || "", updatedAt: updatedAt, change: change, leaderNote: data.leaderNote || "", date: data.date || "", service: data.service || "", language: data.language || "", songs: songs };
  if (data.title != null) result.title = data.title || "";
  if (data.titleEdited === true || data.titleEdited === false) result.titleEdited = data.titleEdited === true;
  if (data.leader != null) result.leader = data.leader || "";
  return result;
}

function readSet_(id) {
  if (!id) return { ok: true, status: 200, found: false };
  var rows = book_().getSheetByName("Live Setlists").getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]) !== String(id) || String(rows[i][1]) === "id") continue;
    var extra = {};
    try { extra = JSON.parse(rows[i][4] || "{}"); } catch (err) { extra = {}; }
    var found = {
      ok: true,
      status: 200,
      found: true,
      id: String(id),
      updatedAt: rows[i][0],
      change: rows[i][2] || "",
      leaderNote: rows[i][3] || "",
      date: extra.date || "",
      service: extra.service || "",
      language: extra.language || "",
      songs: extra.songs || []
    };
    if (Object.prototype.hasOwnProperty.call(extra, "title")) {
      found.title = extra.title || "";
      found.titleEdited = extra.titleEdited === true;
    }
    if (Object.prototype.hasOwnProperty.call(extra, "leader")) found.leader = extra.leader || "";
    return found;
  }
  return { ok: true, status: 200, found: false };
}

function request_(params) {
  var title = String(params.title || "").trim();
  var artist = String(params.artist || "").trim();
  var name = String(params.name || "").trim();
  if (!title || !artist) return { ok: false, status: 400, error: "fields" };
  var when = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  book_().getSheetByName("Song Requests").appendRow([when, title, artist, name]);
  var mailed = false;
  try {
    var to = PropertiesService.getScriptProperties().getProperty("REQUEST_EMAIL") || "danielcyk123@gmail.com";
    var note = "Title: " + title + "\nArtist: " + artist + (name ? "\nFrom: " + name : "");
    MailApp.sendEmail(to, "[Song Request] " + title + " by " + artist, note);
    mailed = true;
  } catch (err) {
    mailed = false;
  }
  return { ok: true, status: 200, mailed: mailed };
}

function feedback_(params) {
  var message = String(params.message == null ? "" : params.message).replace(/\r\n/g, "\n").trim();
  if (message.length > 2000) return { ok: false, status: 400, error: "long" };
  if (!message) return { ok: false, status: 400, error: "fields" };
  var category = String(params.category || "").trim().toLowerCase();
  if (category !== "idea" && category !== "bug" && category !== "other") category = "other";
  var name = String(params.name || "").trim().slice(0, 120);
  var emailIn = String(params.email || "").trim().slice(0, 200);
  var lang = String(params.lang || "").trim().toLowerCase() === "ko" ? "ko" : "en";
  var version = String(params.appVersion || "").trim().slice(0, 40);
  var contact = (params.contactBack === true || params.contactBack === 1 || params.contactBack === "1" || params.contactBack === "true") ? "1" : "0";
  var user = null;
  var token = String(params.idToken || "");
  if (token) {
    try { user = requireUser_(params); } catch (err) { user = null; }
  }
  var verified = !!(user && user.uid);
  if (!name && verified) name = String(user.name || "").trim().slice(0, 120);
  var email = verified ? String((user.email || emailIn) || "") : (emailIn ? ("unverified: " + emailIn) : "unverified");
  var uid = verified ? String(user.uid) : "";
  var who = (uid || emailIn || "anon").toLowerCase();
  var cache = CacheService.getScriptCache();
  var key = "fb_" + hashPass_(who).slice(0, 40);
  var nowMs = Date.now();
  var raw = cache.get(key) || "";
  var bits = raw.split("|");
  var count = Number(bits[0]) || 0;
  var until = Number(bits[1]) || 0;
  if (!until || nowMs > until) {
    count = 0;
    until = nowMs + 10 * 60 * 1000;
  }
  if (count >= 5) return { ok: false, status: 429, error: "limit" };
  cache.put(key, (count + 1) + "|" + until, 600);
  var when = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  book_().getSheetByName("Feedback").appendRow([when, category, message, name, email, uid, contact, lang, version]);
  var mailed = false;
  try {
    var to = PropertiesService.getScriptProperties().getProperty("REQUEST_EMAIL") || "danielcyk123@gmail.com";
    var subjectBit = message.replace(/\s+/g, " ").slice(0, 60);
    var note = "Category: " + category + "\nFrom: " + name + (email ? " <" + email + ">" : "") + "\nContact back: " + contact + "\nLang: " + lang + "\nApp: " + version + "\n\n" + message;
    MailApp.sendEmail(to, "[Bethany app feedback] " + category + ": " + subjectBit, note);
    mailed = true;
  } catch (err) {
    mailed = false;
  }
  return { ok: true, status: 200, mailed: mailed };
}

function leaderOk_(passphrase) {
  var expected = PropertiesService.getScriptProperties().getProperty("LEADER_HASH");
  if (!expected) return true;
  if (!passphrase) return false;
  return hashPass_(String(passphrase)) === String(expected).toLowerCase();
}

function book_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SPREADSHEET_ID");
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create("Bethany Worship");
    props.setProperty("SPREADSHEET_ID", ss.getId());
    ss.getSheets()[0].setName("Live Setlists");
  }
  ensureSheet_(ss, "Live Setlists", ["updatedAt", "id", "change", "leaderNote", "songs"]);
  ensureSheet_(ss, "Song Requests", ["time", "title", "artist", "name"]);
  ensureSheet_(ss, "Feedback", ["time", "category", "message", "name", "email", "uid", "contactBack", "lang", "appVersion"]);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else {
    var width = Math.max(sheet.getLastColumn(), 1);
    var have = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h || ""); });
    headers.forEach(function (h) {
      if (have.indexOf(h) < 0) {
        sheet.getRange(1, have.length + 1).setValue(h);
        have.push(h);
      }
    });
  }
  var dateCol = headers.indexOf("sunday") + 1;
  if (dateCol > 0) sheet.getRange(1, dateCol, Math.max(sheet.getMaxRows(), 2), 1).setNumberFormat("@");
  return sheet;
}

var MEMBER_HEADERS = ["uid", "email", "name", "provider", "teams", "rosterId", "newsletter", "churchComms", "reminders", "lang", "createdAt", "updatedAt"];

function memberSheet_() {
  return ensureSheet_(book_(), "Members", MEMBER_HEADERS);
}

function memberByUid_(uid) {
  var values = memberSheet_().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(uid)) return memberFromRow_(values[i]);
  }
  return null;
}

function memberFromRow_(row) {
  var rec = {};
  MEMBER_HEADERS.forEach(function (h, i) { rec[h] = row[i] == null ? "" : row[i]; });
  return rec;
}

function flag_(v, fallback) {
  if (v === true || v === "1" || v === 1 || v === "true") return "1";
  if (v === false || v === "0" || v === 0 || v === "false") return "0";
  return fallback;
}

function profileOut_(row) {
  var teams = String(row.teams || "").split(",").filter(function (id) { return id; });
  return {
    uid: String(row.uid || ""),
    email: String(row.email || ""),
    name: String(row.name || ""),
    provider: String(row.provider || ""),
    teams: teams,
    rosterId: String(row.rosterId || ""),
    newsletter: String(row.newsletter) !== "0",
    churchComms: String(row.churchComms) !== "0",
    reminders: String(row.reminders) !== "0",
    lang: String(row.lang || "en")
  };
}

function upsertMember_(user, patch) {
  var sheet = memberSheet_();
  var values = sheet.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  var row = null;
  var at = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(user.uid)) { row = memberFromRow_(values[i]); at = i + 1; }
  }
  if (!row) {
    row = { uid: user.uid, email: user.email || "", name: user.name || "", provider: "", teams: "", rosterId: "", newsletter: "1", churchComms: "1", reminders: "1", lang: "en", createdAt: now, updatedAt: now };
  }
  patch = patch || {};
  if (patch.email) row.email = patch.email;
  if (patch.name != null && patch.name !== "") row.name = patch.name;
  if (patch.provider) row.provider = patch.provider;
  if (patch.teams != null) row.teams = patch.teams;
  if (patch.rosterId != null && patch.rosterId !== "") row.rosterId = patch.rosterId;
  if (patch.newsletter != null) row.newsletter = flag_(patch.newsletter, "1");
  if (patch.churchComms != null) row.churchComms = flag_(patch.churchComms, "1");
  if (patch.reminders != null) row.reminders = flag_(patch.reminders, "1");
  if (patch.lang) row.lang = patch.lang;
  if (user.email && !row.email) row.email = user.email;
  row.updatedAt = now;
  var out = MEMBER_HEADERS.map(function (h) { return row[h] == null ? "" : row[h]; });
  if (at < 0) sheet.appendRow(out);
  else sheet.getRange(at, 1, 1, MEMBER_HEADERS.length).setValues([out]);
  return profileOut_(row);
}

function addMemberTeam_(user, team) {
  var row = memberByUid_(user.uid);
  var teams = row && row.teams ? String(row.teams).split(",").filter(function (id) { return id; }) : [];
  if (teams.indexOf(team) < 0) teams.push(team);
  return upsertMember_(user, { teams: teams.join(","), email: user.email || "" });
}

function getProfile_(params) {
  var user = params._user || {};
  if (!user.uid) return { ok: true, status: 200, profile: null, grace: true };
  var row = memberByUid_(user.uid);
  if (!row) {
    return { ok: true, status: 200, profile: profileOut_({ uid: user.uid, email: user.email, name: user.name, newsletter: "1", churchComms: "1", reminders: "1", lang: "en" }) };
  }
  return { ok: true, status: 200, profile: profileOut_(row) };
}

function saveProfile_(params) {
  var user = params._user || {};
  if (!user.uid) return { ok: false, status: 401, error: "auth" };
  var profile = upsertMember_(user, {
    name: params.name,
    email: params.email || user.email,
    provider: params.provider,
    rosterId: params.rosterId,
    newsletter: params.newsletter,
    churchComms: params.churchComms,
    reminders: params.reminders,
    lang: params.lang
  });
  return { ok: true, status: 200, profile: profile };
}

function hashPass_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var n = b < 0 ? b + 256 : b;
    return (n < 16 ? "0" : "") + n.toString(16);
  }).join("");
}

function parseJson_(text) {
  try { return JSON.parse(text || "{}"); } catch (err) { return {}; }
}

function scriptOut_(result, callback) {
  var text = JSON.stringify(result);
  if (/^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback || "")) {
    return ContentService.createTextOutput(callback + "(" + text + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
