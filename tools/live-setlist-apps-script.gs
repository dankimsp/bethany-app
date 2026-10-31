// Container-bound to the live setlist spreadsheet.
// Script property LEADER_PASS_HASH is the SHA-256 hex of the leader passphrase.
// Set it from the log of hashLeaderPassphrase, then clear the passphrase from this file.

function hashLeaderPassphrase() {
  var passphrase = "";
  Logger.log(hashPass_(passphrase));
}

function doGet(e) {
  e = e || { parameter: {} };
  var result = e.parameter.action === "publish" ? publish_(safeJson_(e.parameter.payload)) : read_(e.parameter.id);
  return scriptOut_(result, e.parameter.callback);
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }
  return scriptOut_(publish_(data), "");
}

function publish_(data) {
  data = data || {};
  if (!leaderOk_(data.passphrase)) return { ok: false, error: "pass" };
  var updatedAt = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM-dd'T'HH:mm:ssXXX");
  var songs = data.songs || [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
    updatedAt,
    data.id || "",
    data.change || "",
    data.leaderNote || "",
    JSON.stringify({ date: data.date || "", songs: songs })
  ]);
  return { ok: true, found: true, id: data.id || "", updatedAt: updatedAt, change: data.change || "", leaderNote: data.leaderNote || "", date: data.date || "", songs: songs };
}

function read_(id) {
  if (!id) return { ok: true, found: false };
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]) !== String(id)) continue;
    var extra = {};
    try { extra = JSON.parse(rows[i][4] || "{}"); } catch (err) { extra = {}; }
    return {
      ok: true,
      found: true,
      id: id,
      updatedAt: rows[i][0],
      change: rows[i][2] || "",
      leaderNote: rows[i][3] || "",
      date: extra.date || "",
      songs: extra.songs || []
    };
  }
  return { ok: true, found: false };
}

function leaderOk_(passphrase) {
  var expected = PropertiesService.getScriptProperties().getProperty("LEADER_PASS_HASH");
  if (!expected || !passphrase) return false;
  return hashPass_(String(passphrase)) === String(expected).toLowerCase();
}

function hashPass_(passphrase) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, passphrase, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var n = b < 0 ? b + 256 : b;
    return (n < 16 ? "0" : "") + n.toString(16);
  }).join("");
}

function safeJson_(text) {
  try { return JSON.parse(text || "{}"); } catch (err) { return {}; }
}

function scriptOut_(result, callback) {
  var text = JSON.stringify(result);
  if (/^woLive_[A-Za-z0-9]+$/.test(callback || "")) {
    return ContentService.createTextOutput(callback + "(" + text + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
