import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const iterations = 600000;
const password = process.env.WORSHIP_PASSWORD;
const dir = resolve(process.argv[2] || "songs");

if (!password) {
  console.error("Set WORSHIP_PASSWORD in the environment.");
  process.exit(1);
}

let names = [];
try {
  names = readdirSync(dir).filter((name) => name.endsWith(".cho")).sort();
} catch {
  console.error("No songs directory at " + dir);
  process.exit(1);
}
if (!names.length) {
  console.error("No .cho files in " + dir);
  process.exit(1);
}

const songs = names.map((name) => ({
  id: name.replace(/\.cho$/i, ""),
  cho: readFileSync(resolve(dir, name), "utf8")
}));

const subtle = globalThis.crypto.subtle;
const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
const material = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey(
  { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
  material,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"]
);
const ciphertext = new Uint8Array(
  await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(songs)))
);

const out = {
  v: 1,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations,
  salt: Buffer.from(salt).toString("base64"),
  iv: Buffer.from(iv).toString("base64"),
  ciphertext: Buffer.from(ciphertext).toString("base64")
};

writeFileSync(resolve("songs.enc.json"), JSON.stringify(out) + "\n");
console.log("Wrote songs.enc.json (" + songs.length + " songs)");
