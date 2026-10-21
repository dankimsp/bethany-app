import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const iterations = 600000;
const password = process.env.SERVE_PASSWORD;
const inputPath = process.argv[2];

if (!password) {
  console.error("Set SERVE_PASSWORD in the environment.");
  process.exit(1);
}
if (!inputPath) {
  console.error("Usage: node tools/encrypt-serve-links.mjs path/to/links.json");
  process.exit(1);
}

const raw = readFileSync(resolve(inputPath), "utf8");
const links = JSON.parse(raw);
if (!Array.isArray(links) || !links.length) {
  console.error("Links file must be a non-empty JSON array.");
  process.exit(1);
}
for (const item of links) {
  if (!item || typeof item.title !== "string" || typeof item.href !== "string" || !item.href.startsWith("https://")) {
    console.error("Each link needs a title and an https href.");
    process.exit(1);
  }
}

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
const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(links))));

const out = {
  v: 1,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations,
  salt: Buffer.from(salt).toString("base64"),
  iv: Buffer.from(iv).toString("base64"),
  ciphertext: Buffer.from(ciphertext).toString("base64")
};

writeFileSync(resolve("serve-links.json"), JSON.stringify(out, null, 2) + "\n");
console.log("Wrote serve-links.json");
