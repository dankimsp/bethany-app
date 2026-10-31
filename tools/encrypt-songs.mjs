import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2] || "songs");

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

writeFileSync(resolve("songs.json"), JSON.stringify(songs, null, 1) + "\n");
console.log("Wrote songs.json (" + songs.length + " songs)");
