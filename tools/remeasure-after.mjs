/**
 * After-fix latency and scroll check. Same method as the audit:
 * Chromium CDP touch events, Event Timing click duration, nearest-rank p95.
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/audit/results");
const shots = "/opt/cursor/artifacts/bethany-usability-after/screenshots";
fs.mkdirSync(shots, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("missing"); return;
  }
  res.writeHead(200);
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(8788, "127.0.0.1", resolve));
const BASE = "http://127.0.0.1:8788/index.html";

function stats(values) {
  const v = values.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, min: null, median: null, p95: null, max: null };
  const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(v.length * p) - 1))];
  const round = (n) => Math.round(n * 10) / 10;
  return { n: v.length, min: round(v[0]), median: round(at(0.5)), p95: round(at(0.95)), max: round(v[v.length - 1]) };
}

const songs = ["amazing-grace", "holy-holy-holy", "i-surrender-all", "come-thou-fount", "o-for-a-thousand-tongues", "angels-we-have-heard-on-high"];
const setSongs = songs.concat(songs, songs, songs);
const sets = JSON.stringify([{
  id: "audit-set-0",
  date: "2026-11-15",
  title: "Audit local set",
  titleEdited: true,
  service: "English Service",
  language: "en",
  leader: "Daniel",
  leaderNote: "",
  songs: setSongs.map((id) => ({ id, key: "G", note: "" }))
}]);

function hooks() {
  return `(() => {
    if (window.__auditHooks) return;
    window.__auditHooks = true;
    window.__audit = { rects: 0, fitMs: 0, fitCalls: 0, handlerMs: 0, longtasks: [], events: [] };
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (window.__audit && window.__audit.counting) window.__audit.rects++;
      return origRect.apply(this, arguments);
    };
    ["woAutoFit", "woChooseCols", "woPlayStep", "woRenderPlay", "woToggleHighlight", "woTogglePlayTheme", "woNudgePlayKey", "woPickCols"].forEach(function (name) {
      const orig = window[name];
      if (typeof orig !== "function") return;
      window[name] = function () {
        const t = performance.now();
        const result = orig.apply(this, arguments);
        if (name === "woAutoFit" || name === "woChooseCols") {
          window.__audit.fitMs += performance.now() - t;
          window.__audit.fitCalls++;
        }
        window.__audit.handlerMs += performance.now() - t;
        return result;
      };
    });
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.entryType === "longtask") window.__audit.longtasks.push({ dur: e.duration, start: e.startTime });
          if (e.entryType === "event") window.__audit.events.push({ name: e.name, dur: e.duration, start: e.startTime });
        }
      });
      po.observe({ type: "longtask", buffered: false });
      po.observe({ type: "event", buffered: false, durationThreshold: 0 });
    } catch (e) {}
    document.addEventListener("pointerdown", () => {
      const a = window.__audit;
      if (!a || !a.arm) return;
      a.t0 = performance.now();
      a.counting = true;
      a.fitMs = 0; a.fitCalls = 0; a.handlerMs = 0; a.rects = 0;
      a.markLong = a.longtasks.length; a.markEvent = a.events.length;
    }, true);
  })()`;
}

async function boot(page) {
  await page.addInitScript((sets) => {
    window.BETHANY_MOCK_AUTH = { uid: "uid-audit", email: "audit.member@bethanychurch.test", displayName: "Audit Member", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Audit Member", email: "audit.member@bethanychurch.test", provider: "google.com", lang: "en", teams: ["worship", "nursery"] }));
    localStorage.setItem("bethany-teams", JSON.stringify(["worship", "nursery"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.setItem("bethany-worship-sets", sets);
    localStorage.removeItem("bethany-worship-sync");
    localStorage.removeItem("bethany-worship-play-size");
    localStorage.removeItem("bethany-worship-play-cols");
    localStorage.setItem("bethany-worship-numbers", "0");
    localStorage.setItem("bethany-worship-lyrics", "0");
  }, sets);
  await page.route("**/*script.google.com/**", (route) => route.abort());
  await page.route("**/*gstatic.com/firebasejs/**", (route) => route.abort());
  await page.route("**/sw.js*", (route) => route.abort());
}

async function tap(page, box) {
  const client = await page.context().newCDPSession(page);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(box.height / 2, 18));
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
  await new Promise((r) => setTimeout(r, 30));
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function timeTap(page, box, read) {
  await page.evaluate((source) => { eval(source); }, hooks());
  await page.evaluate((source) => {
    const readNow = new Function("return (" + source + ")");
    const a = window.__audit;
    a.arm = true;
    a.before = String(readNow());
    a.mutAt = 0;
    const mo = new MutationObserver(() => {
      const now = String(readNow());
      if (!window.__audit || !window.__audit.counting || window.__audit.mutAt) return;
      if (now !== window.__audit.before) window.__audit.mutAt = performance.now();
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    window.__audit.mo = mo;
  }, read);
  await tap(page, box);
  await page.waitForFunction(() => window.__audit && (window.__audit.mutAt || (window.__audit.t0 && performance.now() - window.__audit.t0 > 2500)), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(30);
  return page.evaluate(() => {
    const a = window.__audit;
    a.counting = false;
    a.arm = false;
    if (a.mo) a.mo.disconnect();
    const events = (a.events || []).slice(a.markEvent || 0).filter((e) => e.name === "click");
    const click = events.sort((x, y) => y.dur - x.dur)[0];
    return {
      eventClickMs: click ? click.dur : null,
      handlerMs: a.handlerMs || 0,
      fitMs: a.fitMs || 0,
      fitCalls: a.fitCalls || 0,
      rects: a.rects || 0
    };
  });
}

async function swipe(page, x, y, distance) {
  const client = await page.context().newCDPSession(page);
  const steps = 8;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
  for (let i = 1; i <= steps; i++) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(y - distance * i / steps), id: 0 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
}

const samples = [];
async function series(page, meta, n) {
  for (let i = 0; i < n; i++) {
    if (meta.reset) await meta.reset();
    const box = await page.locator(meta.selector).boundingBox();
    const sample = await timeTap(page, box, meta.read);
    samples.push(Object.assign({ sample: i + 1 }, meta, sample));
    await page.waitForTimeout(40);
  }
}

const browser = await chromium.launch({ headless: true });
const notes = [];

async function context(size) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, hasTouch: true, isMobile: size[0] < 1100, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await boot(page);
  return { ctx, page };
}

console.log("scroll and controls");
{
  const { ctx, page } = await context([768, 1024]);
  await page.goto(BASE + "#/events", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({ y: window.scrollY, split: document.body.classList.contains("wo-split"), bottom: document.querySelector("#special-list .ev-img:last-child").getBoundingClientRect().bottom, vh: innerHeight }));
  await swipe(page, 420, 800, 500);
  const after = await page.evaluate(() => window.scrollY);
  notes.push({ id: "tablet-events-scroll", before, after, moved: after - before.y });
  await page.screenshot({ path: path.join(shots, "after-tablet-768x1024-events.png") });
  if (!(before.split === false && after > before.y + 40)) throw new Error("tablet events did not scroll " + JSON.stringify(notes.at(-1)));
  await ctx.close();
}
{
  const { ctx, page } = await context([390, 844]);
  await page.goto(BASE + "#/events", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await swipe(page, 200, 700, 500);
  await page.screenshot({ path: path.join(shots, "after-phone-390x844-events.png") });
  await page.goto(BASE + "#/worship/library", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#wo-list .wopen");
  const row = await page.locator("#wo-list .wopen").nth(2).boundingBox();
  const y0 = await page.evaluate(() => window.scrollY);
  await swipe(page, row.x + 30, row.y + 20, 360);
  const y1 = await page.evaluate(() => ({ y: window.scrollY, hash: location.hash }));
  notes.push({ id: "phone-library-row-scroll", y0, y1 });
  if (!(y1.y > y0 + 20 && y1.hash.indexOf("/song/") < 0)) throw new Error("song row still blocks scroll " + JSON.stringify(notes.at(-1)));
  await page.goto(BASE + "#/worship/song/amazing-grace");
  await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForSelector("#wo-play:not([hidden])");
  const cols = await page.evaluate(() => ({
    c1: !document.getElementById("wo-col-1").hidden,
    c2: document.getElementById("wo-col-2").hidden,
    c3: document.getElementById("wo-col-3").hidden,
    edges: document.querySelectorAll(".wo-edge").length
  }));
  notes.push({ id: "phone-columns", cols });
  if (!cols.c1 || !cols.c2 || !cols.c3 || cols.edges) throw new Error("phone column rules " + JSON.stringify(cols));
  await page.screenshot({ path: path.join(shots, "after-phone-390x844-play.png") });
  await ctx.close();
}
{
  const { ctx, page } = await context([1200, 800]);
  await page.goto(BASE + "#/worship/song/i-surrender-all");
  await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400);
  const visible = await page.evaluate(() => [1, 2, 3].map((n) => !document.getElementById("wo-col-" + n).hidden));
  notes.push({ id: "desktop-columns-visible", visible });
  if (visible.some((v) => !v)) throw new Error("1100+ should offer 3 columns " + JSON.stringify(visible));
  const beforeKey = await page.locator("#wo-play-key").innerText();
  const beforeChord = await page.locator("#wo-play .chord").first().innerText();
  await page.locator("#wo-play-key-up").click();
  await page.waitForTimeout(80);
  const afterKey = await page.locator("#wo-play-key").innerText();
  const afterChord = await page.locator("#wo-play .chord").first().innerText();
  await page.locator("#wo-play-num").click();
  await page.waitForTimeout(40);
  const numberChord = await page.locator("#wo-play .chord").first().innerText();
  notes.push({ id: "key-and-numbers", beforeKey, beforeChord, afterKey, afterChord, numberChord });
  if (beforeKey === afterKey || !/^[1-7]/.test(numberChord)) throw new Error("key or numbers failed " + JSON.stringify(notes.at(-1)));
  await page.screenshot({ path: path.join(shots, "after-desktop-1200x800-play.png") });
  await ctx.close();
}
{
  const { ctx, page } = await context([768, 1024]);
  await page.goto(BASE + "#/worship/setlists/audit-set-0");
  await page.locator("#wo-edit-body").getByRole("button", { name: "Play set" }).click();
  await page.waitForTimeout(400);
  const label = await page.evaluate(() => document.getElementById("wo-this-sunday").textContent);
  notes.push({ id: "sunday-label", label });
  await page.screenshot({ path: path.join(shots, "after-tablet-768x1024-play.png") });
  const keyBox = await page.locator("#wo-play-key-up").boundingBox();
  const keySample = await timeTap(page, keyBox, "() => document.getElementById('wo-play-key').textContent");
  const stored = await page.evaluate(() => {
    const sets = JSON.parse(localStorage.getItem("bethany-worship-sets"));
    return sets[0].songs[0].key;
  });
  notes.push({ id: "play-key-saved", keySample, stored });
  if (stored === "G") throw new Error("setlist key was not saved");
  await ctx.close();
}

console.log("latency");
const plan = [
  { viewport: [768, 1024], action: "next", selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent", n: 20, fromSet: true },
  { viewport: [768, 1024], action: "prev", selector: "#wo-play-prev", read: "() => document.getElementById('wo-play-title').textContent", n: 8, fromSet: true },
  { viewport: [768, 1024], action: "lyrics", selector: "#wo-play-lyrics", read: "() => document.getElementById('wo-play-body').className", n: 6, fromSet: true },
  { viewport: [768, 1024], action: "numbers", selector: "#wo-play-num", read: "() => document.getElementById('wo-play-num').getAttribute('aria-pressed')", n: 6, fromSet: true },
  { viewport: [768, 1024], action: "highlight", selector: "#wo-play-hl", read: "() => document.getElementById('wo-play').className", n: 6, fromSet: true },
  { viewport: [768, 1024], action: "theme", selector: "#wo-play-theme", read: "() => document.getElementById('wo-play').className", n: 6, fromSet: true },
  { viewport: [768, 1024], action: "larger-text", selector: "#wo-fit-up", read: "() => getComputedStyle(document.getElementById('wo-play')).getPropertyValue('--wo-fs')", n: 4, fromSet: true },
  { viewport: [768, 1024], action: "fit", selector: "#wo-fit", read: "() => getComputedStyle(document.getElementById('wo-play')).getPropertyValue('--wo-fs')", n: 4, fromSet: true },
  { viewport: [390, 844], action: "next", selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent", n: 8, fromSet: true },
  { viewport: [1024, 768], action: "next", selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent", n: 8, fromSet: true },
  { viewport: [1440, 900], action: "next", selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent", n: 8, fromSet: true }
];

for (const item of plan) {
  const { ctx, page } = await context(item.viewport);
  await page.goto(BASE + "#/worship/setlists/audit-set-0", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { if (document.body.classList.contains("wo-playing")) woExitPlay(); woEnterPlay(true); });
  await page.waitForSelector("#wo-play-next");
  await page.waitForTimeout(300);
  console.log(" ", item.viewport.join("x"), item.action, "x" + item.n);
  await series(page, {
    browser: "chromium",
    viewport: item.viewport.join("x"),
    song: "i-surrender-all-set",
    action: item.action,
    phase: "warm",
    selector: item.selector,
    read: item.read,
    reset: async () => {
      if (item.action === "next" || item.action === "prev") {
        await page.evaluate((action) => {
          if (!wo.playList) return;
          const last = wo.playList.length - 1;
          if (action === "next" && wo.playIndex >= last) { wo.playIndex = 0; woRenderPlay(true); }
          if (action === "prev" && wo.playIndex <= 0) { wo.playIndex = last; woRenderPlay(true); }
        }, item.action);
        await page.waitForTimeout(30);
      }
      if (item.action === "fit") {
        await page.evaluate(() => document.getElementById("wo-play").style.setProperty("--wo-fs", "22px"));
      }
    }
  }, item.n);
  await ctx.close();
}

{
  const { ctx, page } = await context([768, 1024]);
  await page.goto(BASE + "#/home");
  await page.waitForTimeout(200);
  await series(page, {
    browser: "chromium", viewport: "768x1024", song: "", action: "home-language", phase: "warm",
    selector: "#lang-ko", read: "() => document.documentElement.lang",
    reset: async () => {
      const en = await page.locator("#lang-en").boundingBox();
      if (await page.evaluate(() => document.documentElement.lang) === "ko") await tap(page, en);
      await page.waitForTimeout(30);
    }
  }, 8);
  await page.goto(BASE + "#/worship/song/amazing-grace");
  await page.waitForSelector("#wo-song .keystep");
  await series(page, {
    browser: "chromium", viewport: "768x1024", song: "amazing-grace", action: "song-page-key", phase: "warm",
    selector: "#wo-song [aria-label='Raise key']", read: "() => document.querySelector('#wo-song .wkeyname').textContent"
  }, 8);
  await ctx.close();
}

const groups = {};
samples.forEach((s) => {
  const key = [s.viewport, s.action].join("|");
  if (!groups[key]) groups[key] = [];
  groups[key].push(s.eventClickMs);
});
const summary = Object.keys(groups).map((key) => {
  const [viewport, action] = key.split("|");
  return { viewport, action, clickToNextPaint: stats(groups[key]) };
});
const payload = {
  generatedAt: new Date().toISOString(),
  method: "Chromium CDP touch, Event Timing click duration, nearest-rank p95. Same definitions as the audit.",
  device: "Linux cloud VM, headless. Not a physical iPad.",
  notes,
  summary,
  samples
};
fs.writeFileSync(path.join(outDir, "after-latency.json"), JSON.stringify(payload, null, 2));
fs.writeFileSync("/opt/cursor/artifacts/bethany-usability-after/after-latency.json", JSON.stringify(payload, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
server.close();
