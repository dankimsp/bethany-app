// Standalone Apps Script web app for Bethany Worship.
// Deploy as Daniel (danielcyk123@gmail.com), execute as Me, access Anyone.
// Script properties: TEAM_HASH, LEADER_HASH, EN_FOLDER_ID, KO_FOLDER_ID.
// SPREADSHEET_ID is saved automatically the first time a setlist is published or a song is requested.
// Never put a password or a hash in this file.

var CACHE_SECONDS = 600;
var CACHE_CHUNK = 50000;

function saveFolderIds() {
  PropertiesService.getScriptProperties().setProperties({
    EN_FOLDER_ID: "1zQlSfNr0kJK8YSqsFobT8A_A-lwNkwvb",
    KO_FOLDER_ID: "1YiqsYVRI4UaPCPEVP-YQM0j9b4t-U6bA"
  });
  Logger.log("Saved EN_FOLDER_ID and KO_FOLDER_ID.");
}

function hashPassword() {
  var password = "";
  if (!password) {
    Logger.log("Type the password between the quotes, run this, copy the log into Script Properties, then make the quotes empty again.");
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
  if (action === "listSongs" || action === "getSongs") return songs_(params.etag || "");
  if (action === "publish") return publish_(params.payload || params);
  if (action === "get") return readSet_(params.id);
  if (action === "request") return request_(params);
  return { ok: false, status: 400, error: "action" };
}

function auth_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("TEAM_HASH");
  if (!expected) return { ok: false, status: 500, error: "config" };
  if (!token || String(token).toLowerCase() !== String(expected).toLowerCase()) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return null;
}

function songs_(clientEtag) {
  try {
    return songsBuild_(String(clientEtag || ""));
  } catch (err) {
    return { ok: false, status: 500, error: "drive", message: String(err).slice(0, 180) };
  }
}

function songsBuild_(clientEtag) {
  var props = PropertiesService.getScriptProperties();
  var en = props.getProperty("EN_FOLDER_ID");
  var ko = props.getProperty("KO_FOLDER_ID");
  if (!en || !ko) return { ok: false, status: 500, error: "config" };

  var metaText = cacheGet_("wo:meta");
  if (metaText) {
    var meta = parseJson_(metaText);
    if (meta.etag && clientEtag && clientEtag === meta.etag) {
      return { ok: true, status: 200, unchanged: true, etag: meta.etag, version: meta.etag, count: meta.count || 0 };
    }
    if (meta.etag) {
      var hit = cacheGet_("wo:body:" + meta.etag);
      if (hit) return parseJson_(hit);
    }
  }

  var listed = listTree_(DriveApp.getFolderById(en), "en", 0).concat(listTree_(DriveApp.getFolderById(ko), "ko", 0));
  listed.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  var etag = hashPass_(listed.map(function (file) { return file.id + "|" + file.updated + "|" + file.bytes; }).join("\n"));
  if (clientEtag && clientEtag === etag) {
    cachePut_("wo:meta", JSON.stringify({ etag: etag, count: listed.length }), CACHE_SECONDS);
    return { ok: true, status: 200, unchanged: true, etag: etag, version: etag, count: listed.length };
  }
  var cached = cacheGet_("wo:body:" + etag);
  if (cached) {
    cachePut_("wo:meta", JSON.stringify({ etag: etag, count: listed.length }), CACHE_SECONDS);
    return parseJson_(cached);
  }

  var songs = listed.map(function (file) {
    return {
      id: "drive-" + file.id,
      name: file.name,
      language: file.language,
      updated: file.updated,
      bytes: file.bytes,
      cho: DriveApp.getFileById(file.id).getBlob().getDataAsString("UTF-8")
    };
  });
  var result = { ok: true, status: 200, etag: etag, version: etag, count: songs.length, songs: songs };
  var text = JSON.stringify(result);
  if (text.length < 800000) {
    cachePut_("wo:body:" + etag, text, CACHE_SECONDS);
    cachePut_("wo:meta", JSON.stringify({ etag: etag, count: songs.length }), CACHE_SECONDS);
  }
  return result;
}

function listTree_(folder, language, depth) {
  var out = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (!/\.cho$/i.test(file.getName())) continue;
    out.push({
      id: file.getId(),
      name: file.getName(),
      language: language,
      updated: file.getLastUpdated().getTime(),
      bytes: file.getSize()
    });
  }
  if (depth >= 4) return out;
  var subs = folder.getFolders();
  while (subs.hasNext()) out = out.concat(listTree_(subs.next(), language, depth + 1));
  return out;
}

function publish_(data) {
  if (typeof data === "string") data = parseJson_(data);
  data = data || {};
  if (!leaderOk_(data.passphrase)) return { ok: false, status: 403, error: "pass" };
  var updatedAt = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  var songs = data.songs || [];
  book_().getSheetByName("Live Setlists").appendRow([
    updatedAt,
    data.id || "",
    data.change || "",
    data.leaderNote || "",
    JSON.stringify({ date: data.date || "", service: data.service || "", language: data.language || "", songs: songs })
  ]);
  return { ok: true, status: 200, found: true, id: data.id || "", updatedAt: updatedAt, change: data.change || "", leaderNote: data.leaderNote || "", date: data.date || "", service: data.service || "", language: data.language || "", songs: songs };
}

function readSet_(id) {
  if (!id) return { ok: true, status: 200, found: false };
  var rows = book_().getSheetByName("Live Setlists").getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]) !== String(id) || String(rows[i][1]) === "id") continue;
    var extra = {};
    try { extra = JSON.parse(rows[i][4] || "{}"); } catch (err) { extra = {}; }
    return {
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

function leaderOk_(passphrase) {
  var expected = PropertiesService.getScriptProperties().getProperty("LEADER_HASH");
  if (!expected || !passphrase) return false;
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
  return ss;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
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

function cachePut_(key, text, seconds) {
  var cache = CacheService.getScriptCache();
  var n = Math.ceil(text.length / CACHE_CHUNK) || 1;
  for (var i = 0; i < n; i++) cache.put(key + ":" + i, text.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK), seconds);
  cache.put(key + ":n", String(n), seconds);
}

function cacheGet_(key) {
  var cache = CacheService.getScriptCache();
  var n = cache.get(key + ":n");
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < Number(n); i++) {
    var part = cache.get(key + ":" + i);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join("");
}

function scriptOut_(result, callback) {
  var text = JSON.stringify(result);
  if (/^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback || "")) {
    return ContentService.createTextOutput(callback + "(" + text + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
