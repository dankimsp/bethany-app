var SERVE_KEY = "bethany-serve-key", serveMetaPromise = null;
function b64ToBytes(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function bytesToB64(buf) { var bytes = new Uint8Array(buf), s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function loadServeMeta() {
  if (!serveMetaPromise) serveMetaPromise = fetch("serve-links.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (meta) {
    if (!meta || meta.iterations < 100000 || meta.iterations > 2000000) throw 0;
    return meta;
  });
  return serveMetaPromise;
}
function deriveServeKey(password, meta) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]).then(function (material) {
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64ToBytes(meta.salt), iterations: meta.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  });
}
function decryptServe(meta, key) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(meta.iv) }, key, b64ToBytes(meta.ciphertext)).then(function (plain) {
    return JSON.parse(new TextDecoder().decode(plain));
  });
}
function showServeLinks(links) {
  if (!Array.isArray(links) || !links.length) throw 0;
  var box = document.getElementById("serve-links");
  box.replaceChildren();
  links.forEach(function (item) {
    if (!item || typeof item.href !== "string" || !/^https:\/\//.test(item.href)) throw 0;
    var a = document.createElement("a");
    a.className = "pill brand";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = item.href;
    a.textContent = item.title || "Open";
    var p = document.createElement("p");
    p.className = "mut";
    p.textContent = item.note || "";
    box.appendChild(a);
    box.appendChild(p);
  });
  document.getElementById("serve-form").hidden = true;
  box.hidden = false;
  document.getElementById("serve-lock-row").hidden = false;
}
function lockServe() {
  localStorage.removeItem(SERVE_KEY);
  var box = document.getElementById("serve-links");
  box.replaceChildren();
  box.hidden = true;
  document.getElementById("serve-lock-row").hidden = true;
  document.getElementById("serve-form").hidden = false;
  document.getElementById("serve-pw").value = "";
  document.getElementById("serve-remember").checked = false;
  document.getElementById("serve-err").hidden = true;
}
function unlockServe(ev) {
  if (ev) ev.preventDefault();
  var pw = document.getElementById("serve-pw").value, err = document.getElementById("serve-err"), btn = document.querySelector("#serve-form button");
  if (!pw) { err.textContent = "Please enter the team password."; err.hidden = false; return; }
  btn.disabled = true;
  err.hidden = true;
  loadServeMeta().then(function (meta) {
    return deriveServeKey(pw, meta).then(function (key) { return decryptServe(meta, key).then(function (links) { return { key: key, links: links }; }); });
  }).then(function (res) {
    if (document.getElementById("serve-remember").checked) return crypto.subtle.exportKey("raw", res.key).then(function (raw) {
      localStorage.setItem(SERVE_KEY, bytesToB64(raw));
      showServeLinks(res.links);
      document.getElementById("serve-pw").value = "";
    });
    showServeLinks(res.links);
    document.getElementById("serve-pw").value = "";
  }).catch(function () { err.textContent = "That password isn't right. Try again."; err.hidden = false; }).finally(function () { btn.disabled = false; });
}
function tryRememberServe() {
  var saved;
  try { saved = localStorage.getItem(SERVE_KEY); } catch (e) { return; }
  if (!saved) return;
  loadServeMeta().then(function (meta) {
    return crypto.subtle.importKey("raw", b64ToBytes(saved), { name: "AES-GCM" }, false, ["decrypt"]).then(function (key) { return decryptServe(meta, key); });
  }).then(showServeLinks).catch(function () { localStorage.removeItem(SERVE_KEY); });
}
function sendRsvp(eventId, name, adults, kids, contact) {
  if (!RSVP_ENDPOINT) return Promise.reject(0);
  return fetch(RSVP_ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ event: eventId, name: name, adults: adults, kids: kids, contact: contact }) });
}
tryRememberServe();
