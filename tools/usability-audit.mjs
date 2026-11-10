/**
 * Hands-on usability audit. Does not change product behavior.
 * Touch scrolls use Chromium CDP Input.dispatchTouchEvent and WebKit's
 * Input.dispatchTouchEvent. Wheel events are not used as a substitute.
 *
 * Safe fixtures only: Google Apps Script and Firebase are aborted.
 * Setlists are preloaded in localStorage and are not published.
 */
import { chromium, webkit } from "playwright";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { RawTouchscreenImpl } = require(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "node_modules/playwright-core/lib/server/webkit/wkInput.js"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = "/opt/cursor/artifacts/bethany-usability-audit";
const COPY = path.join(root, "docs/audit/results");
fs.mkdirSync(ART, { recursive: true });
fs.mkdirSync(path.join(ART, "screenshots"), { recursive: true });
fs.mkdirSync(COPY, { recursive: true });

let wkGesture = null;
const origTap = RawTouchscreenImpl.prototype.tap;
RawTouchscreenImpl.prototype.tap = function (progress, x, y, modifiers) {
  const job = wkGesture;
  if (!job) return origTap.call(this, progress, x, y, modifiers);
  wkGesture = null;
  const session = this._pageProxySession;
  const send = (type, touchPoints) => progress.race(session.send("Input.dispatchTouchEvent", { type, modifiers: 0, touchPoints }));
  return (async () => {
    const pts = job.points;
    await send("touchStart", [{ x: pts[0].x, y: pts[0].y, id: 0 }]);
    for (let i = 1; i < pts.length; i++) {
      if (job.gap) await new Promise((r) => setTimeout(r, job.gap));
      await send("touchMove", [{ x: pts[i].x, y: pts[i].y, id: 0 }]);
    }
    if (job.gap) await new Promise((r) => setTimeout(r, job.gap));
    await send("touchEnd", []);
  })();
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("missing"); return;
  }
  const ext = path.extname(file);
  const type = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(8777, "127.0.0.1", resolve));
const BASE = "http://127.0.0.1:8777/index.html";

const VIEWPORTS = [[320, 568], [390, 844], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900]];
const BREAKS = [[767, 1024], [769, 1024], [1099, 800], [1100, 800]];

function round(n) { return Math.round(n); }
function line(x1, y1, x2, y2, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push({ x: round(x1 + (x2 - x1) * i / steps), y: round(y1 + (y2 - y1) * i / steps) });
  return pts;
}
function stats(values) {
  const v = values.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, min: null, median: null, p95: null, max: null, unit: "ms", method: "nearest-rank" };
  const at = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(v.length * p) - 1))];
  const sum = v.reduce((a, b) => a + b, 0);
  return { n: v.length, min: round(v[0] * 10) / 10, median: round(at(0.5) * 10) / 10, p95: round(at(0.95) * 10) / 10, max: round(v[v.length - 1] * 10) / 10, mean: round((sum / v.length) * 10) / 10, unit: "ms", method: "nearest-rank on sorted samples; p95 index is ceil(0.95*n)-1" };
}
function writeBoth(name, data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(ART, name), text);
  fs.writeFileSync(path.join(COPY, name), text);
}
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const text = [keys.join(",")].concat(rows.map((row) => keys.map((k) => csvEscape(row[k])).join(","))).join("\n") + "\n";
  writeBoth(name, text);
}

const cdpSessions = new WeakMap();
async function touchGesture(page, browserName, points, gap) {
  const pts = points.map((p) => ({ x: round(p.x), y: round(p.y) }));
  if (browserName === "webkit") {
    wkGesture = { points: pts, gap: gap || 0 };
    await page.touchscreen.tap(pts[0].x, pts[0].y);
    return;
  }
  let client = cdpSessions.get(page);
  if (!client) {
    client = await page.context().newCDPSession(page);
    cdpSessions.set(page, client);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 0 }] });
  for (let i = 1; i < pts.length; i++) {
    if (gap) await new Promise((r) => setTimeout(r, gap));
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pts[i].x, y: pts[i].y, id: 0 }] });
  }
  if (gap) await new Promise((r) => setTimeout(r, gap));
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

function seedSets() {
  const once = ["amazing-grace", "holy-holy-holy", "i-surrender-all", "come-thou-fount", "o-for-a-thousand-tongues", "angels-we-have-heard-on-high"];
  const songs = once.concat(once, once, once);
  const sets = [];
  for (let i = 0; i < 8; i++) {
    sets.push({
      id: "audit-set-" + i,
      date: "2026-11-15",
      title: "Audit local set " + (i + 1),
      titleEdited: true,
      service: "English Service",
      language: "en",
      leader: "Daniel",
      leaderNote: "",
      songs: songs.map((id) => ({ id, key: "G", note: "" }))
    });
  }
  return JSON.stringify(sets);
}

async function prepare(page, opts) {
  const teams = opts.teams || ["worship", "nursery"];
  const needName = !!opts.needName;
  const authed = opts.authed !== false;
  await page.addInitScript((args) => {
    if (args.authed) {
      window.BETHANY_MOCK_AUTH = { uid: "uid-audit", email: "audit.member@bethanychurch.test", displayName: args.needName ? "" : "Audit Member", providers: ["google.com"] };
      localStorage.setItem("bethany-profile", JSON.stringify({ name: args.needName ? "" : "Audit Member", email: "audit.member@bethanychurch.test", provider: "google.com", lang: "en", teams: args.teams }));
      localStorage.setItem("bethany-teams", JSON.stringify(args.teams));
      if (args.needName) localStorage.setItem("bethany-need-name", "1");
      else localStorage.removeItem("bethany-need-name");
    } else {
      window.BETHANY_MOCK_AUTH = null;
      localStorage.removeItem("bethany-profile");
      localStorage.removeItem("bethany-teams");
    }
    localStorage.setItem("bethany-lang", "en");
    localStorage.setItem("bethany-worship-sets", args.sets);
    localStorage.removeItem("bethany-worship-sync");
    localStorage.setItem("bethany-worship-numbers", "0");
    localStorage.setItem("bethany-worship-lyrics", "0");
    localStorage.removeItem("bethany-worship-play-size");
    localStorage.removeItem("bethany-worship-play-theme");
    localStorage.removeItem("bethany-worship-play-hl");
  }, { teams, needName, authed, sets: seedSets() });
  const blocked = [];
  await page.route("**/*script.google.com/**", (route) => { blocked.push(route.request().url()); return route.abort(); });
  await page.route("**/*googleapis.com/**", (route) => { blocked.push(route.request().url()); return route.abort(); });
  await page.route("**/*gstatic.com/firebasejs/**", (route) => route.abort());
  await page.route("**/sw.js*", (route) => route.abort());
  page._blocked = blocked;
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err).split("\n")[0]));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 240)); });
  page._errors = errors;
}

async function openHash(page, hash) {
  await page.goto(BASE + hash, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
}

async function shot(page, name) {
  const file = path.join(ART, "screenshots", name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

function installHooks() {
  return `(() => {
    if (window.__auditHooks) return;
    window.__auditHooks = true;
    window.__audit = { rects: 0, fitMs: 0, fitCalls: 0, handlerMs: 0, steps: [], titles: [], longtasks: [], events: [] };
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (window.__audit && window.__audit.counting) window.__audit.rects++;
      return origRect.apply(this, arguments);
    };
    function wrap(name) {
      const orig = window[name];
      if (typeof orig !== "function" || orig.__audit) return;
      const next = function () {
        const t = performance.now();
        const result = orig.apply(this, arguments);
        if (name === "woAutoFit" || name === "woChooseCols") {
          window.__audit.fitMs += performance.now() - t;
          window.__audit.fitCalls++;
        }
        if (name === "woPlayStep" || name === "woRenderPlay" || name === "woTogglePlayLyrics" || name === "woTogglePlayNumbers" || name === "woNudgePlaySize" || name === "woResetPlaySize" || name === "woToggleHighlight" || name === "woTogglePlayTheme" || name === "woToggleJump" || name === "woExitPlay") {
          window.__audit.handlerMs += performance.now() - t;
        }
        if (name === "woPlayStep") window.__audit.steps.push({ t: performance.now(), index: window.wo && window.wo.playIndex });
        return result;
      };
      next.__audit = true;
      window[name] = next;
    }
    ["woAutoFit", "woChooseCols", "woPlayStep", "woRenderPlay", "woTogglePlayLyrics", "woTogglePlayNumbers", "woNudgePlaySize", "woResetPlaySize", "woToggleHighlight", "woTogglePlayTheme", "woToggleJump", "woExitPlay"].forEach(wrap);
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.entryType === "longtask") window.__audit.longtasks.push({ dur: e.duration, start: e.startTime, name: e.name });
          if (e.entryType === "event") window.__audit.events.push({ name: e.name, dur: e.duration, start: e.startTime, processingStart: e.processingStart, processingEnd: e.processingEnd });
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
      a.frames = []; a.lastFrame = 0;
      const loop = (t) => {
        if (!a.counting) return;
        if (a.lastFrame) a.frames.push(t - a.lastFrame);
        a.lastFrame = t;
        if (performance.now() - a.t0 < 4000) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }, true);
  })()`;
}

async function arm(page, read) {
  await page.evaluate((source) => { eval(source); }, installHooks());
  await page.evaluate((source) => {
    const readNow = new Function("return (" + source + ")");
    const a = window.__audit;
    a.arm = true;
    a.visible = 0;
    a.mutAt = 0;
    a.before = String(readNow());
    const title = document.getElementById("wo-play-title");
    if (title && !title.__auditMo) {
      const mo = new MutationObserver(() => {
        if (window.__audit && window.__audit.counting) window.__audit.titles.push(title.textContent);
      });
      mo.observe(title, { childList: true, characterData: true, subtree: true });
      title.__auditMo = true;
    }
    const mo = new MutationObserver(() => {
      const now = String(readNow());
      const audit = window.__audit;
      if (!audit || !audit.counting || audit.mutAt) return;
      if (now === audit.before) return;
      audit.mutAt = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { audit.visible = performance.now(); }));
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ["class", "style", "hidden", "aria-pressed"] });
    a.mo = mo;
  }, read);
}

async function collect(page) {
  await page.waitForFunction(() => window.__audit && (window.__audit.visible || (window.__audit.t0 && performance.now() - window.__audit.t0 > 3500)), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(40);
  return page.evaluate(() => {
    const a = window.__audit || {};
    a.counting = false;
    a.arm = false;
    if (a.mo) { a.mo.disconnect(); a.mo = null; }
    const frames = a.frames || [];
    const events = (a.events || []).slice(a.markEvent || 0).filter((e) => /click|pointerup|pointerdown|touchend/.test(e.name));
    const click = events.filter((e) => e.name === "click").sort((x, y) => y.dur - x.dur)[0] || null;
    const pointer = events.filter((e) => e.name === "pointerup" || e.name === "pointerdown").sort((x, y) => y.dur - x.dur)[0] || null;
    const longs = (a.longtasks || []).slice(a.markLong || 0);
    const longSum = longs.reduce((s, e) => s + e.dur, 0);
    return {
      inputToDoubleRafMs: a.t0 && a.visible ? a.visible - a.t0 : null,
      mutationMs: a.t0 && a.mutAt ? a.mutAt - a.t0 : null,
      eventClickMs: click ? click.dur : null,
      eventPointerMs: pointer ? pointer.dur : null,
      eventNames: events.map((e) => e.name + ":" + Math.round(e.dur)),
      handlerMs: a.handlerMs || 0,
      fitMs: a.fitMs || 0,
      fitCalls: a.fitCalls || 0,
      rects: a.rects || 0,
      longTaskMs: longSum,
      longTaskCount: longs.length,
      frameCount: frames.length,
      frameMaxMs: frames.length ? Math.max.apply(null, frames) : null,
      framesOver32: frames.filter((n) => n > 32).length,
      framesOver50: frames.filter((n) => n > 50).length,
      steps: (a.steps || []).length,
      titles: (a.titles || []).slice()
    };
  });
}

async function timeTap(page, browserName, box, read) {
  await arm(page, read);
  await touchGesture(page, browserName, [{ x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 22) }, { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 22) }], 30);
  return collect(page);
}

async function scrollState(page) {
  return page.evaluate(() => {
    function boxOf(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: el.scrollTop, left: el.scrollLeft, sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, oy: cs.overflowY, hidden: !!el.hidden };
    }
    const screen = document.querySelector(".screen:not([hidden])");
    const sr = screen ? screen.getBoundingClientRect() : { top: 0, height: 0 };
    const app = document.querySelector(".app");
    const body = getComputedStyle(document.body);
    const appCs = app ? getComputedStyle(app) : null;
    return {
      scrollY: window.scrollY,
      docTop: document.scrollingElement.scrollTop,
      docSh: document.scrollingElement.scrollHeight,
      docCh: document.scrollingElement.clientHeight,
      screenBottom: sr.top + sr.height,
      vh: window.innerHeight,
      vw: window.innerWidth,
      woSplit: document.body.classList.contains("wo-split"),
      inWorship: document.body.classList.contains("in-worship"),
      playing: document.body.classList.contains("wo-playing"),
      bodyOverflow: body.overflow,
      bodyHeight: body.height,
      appOverflowX: appCs && appCs.overflowX,
      appOverflowY: appCs && appCs.overflowY,
      lib: boxOf("#wo-lib"),
      song: boxOf("#wo-song"),
      sets: boxOf("#wo-sets"),
      edit: boxOf("#wo-edit"),
      play: boxOf("#wo-play-body"),
      fb: boxOf(".fb-panel")
    };
  });
}

const scrollRows = [];
const latencySamples = [];
const functional = [];

async function probeScroll(page, browserName, label, point, note) {
  const before = await scrollState(page);
  let error = "";
  try {
    await touchGesture(page, browserName, line(point.x, point.y, point.x2 == null ? point.x : point.x2, point.y - (point.distance || 460), 10), 16);
    await page.waitForTimeout(280);
  } catch (e) { error = String(e).split("\n")[0]; }
  const after = await scrollState(page);
  const target = point.target || "document";
  const pick = (s) => target === "document" ? s.scrollY : (s[target] && s[target].top);
  const moved = (pick(after) || 0) - (pick(before) || 0);
  const overflowPx = Math.round(before.screenBottom - before.vh);
  const inner = target === "document" ? null : before[target];
  const innerGap = inner ? inner.sh - inner.ch : 0;
  const row = {
    browser: browserName,
    viewport: before.vw + "x" + before.vh,
    page: label,
    target,
    before: pick(before) || 0,
    after: pick(after) || 0,
    moved,
    contentPastFoldPx: overflowPx,
    targetScrollHeight: target === "document" ? before.docSh : (before[target] && before[target].sh),
    targetClientHeight: target === "document" ? before.docCh : (before[target] && before[target].ch),
    woSplit: before.woSplit,
    bodyOverflow: before.bodyOverflow,
    appOverflowY: before.appOverflowY,
    innerGap,
    reachable: innerGap > 30 ? moved > 20 : (overflowPx <= 24 || moved > 20),
    error,
    note: note || ""
  };
  scrollRows.push(row);
  return row;
}

async function withBrowser(browserType, browserName, run) {
  const browser = await browserType.launch({ headless: true });
  try { await run(browser); }
  finally { await browser.close(); }
}

async function contextFor(browser, size, browserName) {
  const ctx = await browser.newContext({
    viewport: { width: size[0], height: size[1] },
    hasTouch: true,
    isMobile: size[0] < 1100,
    deviceScaleFactor: 1
  });
  const page = await ctx.newPage();
  await prepare(page, { teams: ["worship", "nursery"] });
  page._browserName = browserName;
  return { ctx, page };
}

console.log("scroll matrix");
if (process.env.SKIP_SCROLL === "1") console.log("skipping scroll; keeping the saved matrix");
if (process.env.SKIP_SCROLL !== "1") await withBrowser(chromium, "chromium", async (browser) => {
  for (const size of VIEWPORTS.concat(BREAKS)) {
    const { ctx, page } = await contextFor(browser, size, "chromium");
    await openHash(page, "#/events");
    const x = Math.round(size[0] * 0.55);
    const y = Math.round(size[1] * 0.72);
    const row = await probeScroll(page, "chromium", "events", { x, y, target: "document" }, "fresh load, touch on main column");
    if ((size[0] === 768 && size[1] === 1024) || (size[0] === 390 && size[1] === 844) || (size[0] === 1440) || (size[0] === 767) || (size[0] === 769)) {
      await shot(page, "chromium-" + size[0] + "x" + size[1] + "-events");
    }
    await openHash(page, "#/home");
    await probeScroll(page, "chromium", "home", { x, y, target: "document" });
    await openHash(page, "#/more");
    await probeScroll(page, "chromium", "more", { x, y, target: "document" });
    await openHash(page, "#/worship/library");
    await page.waitForSelector("#wo-list .wopen");
    const rowBox = await page.locator("#wo-list .wopen").first().boundingBox();
    if (rowBox) await probeScroll(page, "chromium", "library-on-row", { x: rowBox.x + 30, y: rowBox.y + 20, target: "lib" }, "gesture starts on a song title button");
    await probeScroll(page, "chromium", "library-gutter", { x: 40, y: Math.round(size[1] * 0.7), target: "lib" }, "gesture starts on the left padding");
    if (size[0] === 768 && size[1] === 1024) await shot(page, "chromium-768x1024-library");
    await openHash(page, "#/worship/setlists");
    await page.waitForSelector("#wo-sets-list .card");
    await probeScroll(page, "chromium", "setlists", { x: Math.min(180, size[0] - 40), y: Math.round(size[1] * 0.62), target: "sets" });
    if (size[0] === 768 && size[1] === 1024) await shot(page, "chromium-768x1024-setlists");
    await openHash(page, "#/worship/song/i-surrender-all");
    await page.waitForSelector("#wo-song h1");
    await probeScroll(page, "chromium", "chord-sheet", { x: Math.round(size[0] * 0.7), y: Math.round(size[1] * 0.7), target: size[0] >= 768 ? "song" : "document" });
    if (size[0] === 768 && size[1] === 1024) await shot(page, "chromium-768x1024-chord-sheet");
    await ctx.close();
    console.log(" chromium", size.join("x"), "events moved", row.moved, "split", row.woSplit);
  }
  const { ctx, page } = await contextFor(browser, [1440, 900], "chromium");
  await openHash(page, "#/events");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await probeScroll(page, "chromium", "events-resize-1440-to-390", { x: 200, y: 640, target: "document" }, "resized while events was open; no reload");
  await shot(page, "chromium-resize-1440-to-390-events");
  await ctx.close();
  const up = await contextFor(browser, [390, 844], "chromium");
  await openHash(up.page, "#/events");
  await up.page.setViewportSize({ width: 820, height: 1180 });
  await up.page.waitForTimeout(200);
  await probeScroll(up.page, "chromium", "events-resize-390-to-820", { x: 420, y: 900, target: "document" }, "resized up while events was open; no reload");
  await up.ctx.close();
  const play = await contextFor(browser, [768, 1024], "chromium");
  await openHash(play.page, "#/worship/setlists/audit-set-0");
  await play.page.waitForSelector("#wo-edit-body");
  await play.page.locator("#wo-edit-body").getByRole("button", { name: "Play set" }).click();
  await play.page.waitForSelector("#wo-play:not([hidden])");
  await play.page.evaluate(() => { woApplyPlaySize(42, 1); });
  await play.page.waitForTimeout(100);
  await probeScroll(play.page, "chromium", "play-center", { x: 384, y: 760, distance: 380, target: "play" }, "center of sheet, away from 18% edge zones");
  await probeScroll(play.page, "chromium", "play-left-edge", { x: 30, y: 760, distance: 280, target: "play" }, "inside the invisible previous-song edge");
  await shot(play.page, "chromium-768x1024-play");
  await play.page.setViewportSize({ width: 1180, height: 820 });
  await play.page.waitForTimeout(250);
  await probeScroll(play.page, "chromium", "play-after-rotate", { x: 590, y: 620, distance: 280, target: "play" }, "viewport changed while play mode stayed open");
  await shot(play.page, "chromium-1180x820-play-after-resize");
  await play.ctx.close();
  const phonePlay = await contextFor(browser, [320, 568], "chromium");
  await openHash(phonePlay.page, "#/worship/song/amazing-grace");
  await phonePlay.page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
  await phonePlay.page.waitForSelector("#wo-play:not([hidden])");
  await shot(phonePlay.page, "chromium-320x568-play");
  const controls = await phonePlay.page.evaluate(() => {
    return Array.from(document.querySelectorAll("#wo-play button")).map((el) => {
      const r = el.getBoundingClientRect();
      return { t: (el.getAttribute("aria-label") || el.textContent || "").trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, hidden: !!el.hidden };
    });
  });
  functional.push({ id: "play-controls-320", viewport: "320x568", controls });
  await phonePlay.ctx.close();
  const fb = await contextFor(browser, [390, 700], "chromium");
  await openHash(fb.page, "#/more");
  await fb.page.locator("#feedback-link").click();
  await fb.page.waitForSelector("#fb-sheet:not([hidden])");
  await probeScroll(fb.page, "chromium", "feedback-panel", { x: 200, y: 560, distance: 180, target: "fb" }, "feedback sheet open");
  await shot(fb.page, "chromium-390x700-feedback");
  await fb.page.locator("#fb-close").click();
  functional.push({ id: "feedback-close", hidden: await fb.page.locator("#fb-sheet").isHidden(), bodyFb: await fb.page.evaluate(() => document.body.classList.contains("fb-open")) });
  await fb.ctx.close();
});

console.log("webkit touch scroll");
if (process.env.SKIP_SCROLL !== "1") await withBrowser(webkit, "webkit", async (browser) => {
  for (const size of [[390, 844], [768, 1024], [820, 1180], [1024, 768], [1440, 900]]) {
    const { ctx, page } = await contextFor(browser, size, "webkit");
    await openHash(page, "#/events");
    const row = await probeScroll(page, "webkit", "events", { x: Math.round(size[0] * 0.55), y: Math.round(size[1] * 0.72), target: "document" }, "WebKit Input.dispatchTouchEvent, not a physical iPad");
    if (size[0] === 768) await shot(page, "webkit-768x1024-events");
    await openHash(page, "#/worship/library");
    await page.waitForSelector("#wo-list .wopen");
    const rowBox = await page.locator("#wo-list .wopen").first().boundingBox();
    if (rowBox) await probeScroll(page, "webkit", "library-on-row", { x: rowBox.x + 24, y: rowBox.y + 16, target: "lib" }, "gesture starts on song title; pointerdown calls preventDefault");
    await probeScroll(page, "webkit", "library-gutter", { x: 36, y: Math.round(size[1] * 0.68), target: "lib" });
    if (size[0] === 768) await shot(page, "webkit-768x1024-library");
    await openHash(page, "#/worship/setlists");
    await page.waitForSelector("#wo-sets-list .card");
    await probeScroll(page, "webkit", "setlists", { x: Math.min(170, size[0] - 30), y: Math.round(size[1] * 0.62), target: "sets" });
    await openHash(page, "#/worship/song/i-surrender-all");
    await page.waitForSelector("#wo-song .wline");
    await probeScroll(page, "webkit", "chord-sheet", { x: Math.round(size[0] * 0.72), y: Math.round(size[1] * 0.7), target: size[0] >= 768 ? "song" : "document" });
    if (size[0] === 768) await shot(page, "webkit-768x1024-chord-sheet");
    await ctx.close();
    console.log(" webkit", size.join("x"), "events moved", row.moved, "split", row.woSplit);
  }
  const { ctx, page } = await contextFor(browser, [768, 1024], "webkit");
  await openHash(page, "#/worship/setlists/audit-set-0");
  await page.locator("#wo-edit-body").getByRole("button", { name: "Play set" }).click();
  await page.waitForSelector("#wo-play:not([hidden])");
  await page.evaluate(() => woApplyPlaySize(42, 1));
  await probeScroll(page, "webkit", "play-center", { x: 390, y: 780, distance: 360, target: "play" });
  await probeScroll(page, "webkit", "play-left-edge", { x: 28, y: 780, distance: 260, target: "play" });
  await shot(page, "webkit-768x1024-play");
  await ctx.close();
});

if (process.env.SKIP_SCROLL === "1") {
  const saved = JSON.parse(fs.readFileSync(path.join(ART, "scroll.json"), "utf8"));
  saved.rows.forEach((row) => scrollRows.push(row));
} else {
  writeBoth("scroll.json", { generatedAt: new Date().toISOString(), input: "touch move events, not mouse wheel", rows: scrollRows, webkitNativeScroll: "Playwright WebKit delivers touchmove events but does not perform native scrolling, including on a plain tall page. WebKit rows are CSS and event-delivery evidence, not proof of iPad finger scrolling." });
  writeCsv("scroll.csv", scrollRows.map((r) => ({
    browser: r.browser, viewport: r.viewport, page: r.page, target: r.target, before: r.before, after: r.after, moved: r.moved,
    contentPastFoldPx: r.contentPastFoldPx, woSplit: r.woSplit, bodyOverflow: r.bodyOverflow, reachable: r.reachable, note: r.note, error: r.error
  })));
}
console.log("scroll rows", scrollRows.length);

function pushLatency(meta, sample) {
  latencySamples.push(Object.assign({}, meta, sample, { phase: meta.phase }));
}

async function measureSeries(page, browserName, meta, taps) {
  if (meta.action === "next" || meta.action === "prev") {
    await page.evaluate((action) => {
      if (!window.wo || !wo.playList || !wo.playList.length) return;
      wo.playIndex = action === "next" ? 0 : wo.playList.length - 1;
      woRenderPlay();
    }, meta.action);
    await page.waitForTimeout(400);
  }
  for (let i = 0; i < taps; i++) {
    if (meta.action === "next" || meta.action === "prev") {
      const room = await page.evaluate((action) => {
        if (!window.wo || !wo.playList) return true;
        if (action === "next" && wo.playIndex >= wo.playList.length - 1) {
          wo.playIndex = 0;
          woRenderPlay();
          return false;
        }
        if (action === "prev" && wo.playIndex <= 0) {
          wo.playIndex = wo.playList.length - 1;
          woRenderPlay();
          return false;
        }
        return true;
      }, meta.action);
      if (!room) await page.waitForTimeout(400);
    }
    if (meta.action === "fit") {
      await page.evaluate(() => {
        const play = document.getElementById("wo-play");
        if (play) play.style.setProperty("--wo-fs", "22px");
      });
    }
    const box = await page.locator(meta.selector).boundingBox();
    if (!box) {
      pushLatency(meta, { sample: i + 1, error: "no box" });
      continue;
    }
    const sample = await timeTap(page, browserName, box, meta.read);
    sample.sample = i + 1;
    pushLatency(meta, sample);
    await page.waitForTimeout(60);
  }
}

async function enterPlay(page, song) {
  await openHash(page, "#/worship/song/" + song);
  await page.waitForSelector("#wo-song h1");
  await page.evaluate(() => localStorage.removeItem("bethany-worship-play-size"));
  await page.evaluate(installHooks);
  const box = await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).boundingBox();
  return { box };
}

console.log("latency");
const songs = ["i-surrender-all", "amazing-grace"];
await withBrowser(chromium, "chromium", async (browser) => {
  for (const size of [[768, 1024], [390, 844], [1024, 768], [1440, 900]]) {
    for (const song of (size[0] === 768 ? songs : ["i-surrender-all"])) {
      const { ctx, page } = await contextFor(browser, size, "chromium");
      const entered = await enterPlay(page, song);
      const cold = await timeTap(page, "chromium", entered.box, "() => document.getElementById('wo-play').hidden ? 'closed' : document.getElementById('wo-play-title').textContent");
      pushLatency({ browser: "chromium", viewport: size.join("x"), song, action: "enter-play", phase: "cold", selector: "", read: "" }, Object.assign(cold, { sample: 1 }));
      await page.waitForTimeout(80);
      const repeats = size[0] === 768 && song === "i-surrender-all" ? 20 : 8;
      const actions = [
        { action: "next", selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent", n: repeats, needsSet: true },
        { action: "prev", selector: "#wo-play-prev", read: "() => document.getElementById('wo-play-title').textContent", n: Math.min(8, repeats), needsSet: true },
        { action: "lyrics", selector: "#wo-play-lyrics", read: "() => document.getElementById('wo-play-body').className", n: 6 },
        { action: "numbers", selector: "#wo-play-num", read: "() => document.getElementById('wo-play-num').getAttribute('aria-pressed')", n: 6 },
        { action: "highlight", selector: "#wo-play-hl", read: "() => document.getElementById('wo-play').className", n: 6 },
        { action: "theme", selector: "#wo-play-theme", read: "() => document.getElementById('wo-play').className", n: 6 },
        { action: "larger-text", selector: "#wo-fit-up", read: "() => getComputedStyle(document.getElementById('wo-play')).getPropertyValue('--wo-fs')", n: 4 },
        { action: "fit", selector: "#wo-fit", read: "() => getComputedStyle(document.getElementById('wo-play')).getPropertyValue('--wo-fs')", n: 4 }
      ];
      if (size[0] !== 768 || song !== "i-surrender-all") {
        actions.forEach((a) => { if (a.action !== "next") a.n = Math.min(a.n, 3); });
      }
      for (const action of actions) {
        if (action.needsSet) {
          await openHash(page, "#/worship/setlists/audit-set-0");
          await page.evaluate(() => { if (document.body.classList.contains("wo-playing")) woExitPlay(); woEnterPlay(true); });
          await page.waitForSelector("#wo-play-next");
          await page.waitForTimeout(250);
        }
        console.log(" ", size.join("x"), song, action.action, "x" + action.n);
        await measureSeries(page, "chromium", {
          browser: "chromium", viewport: size.join("x"), song, action: action.action, phase: "warm",
          selector: action.selector, read: action.read
        }, action.n);
      }
      if (size[0] === 768 && song === "i-surrender-all") {
        await arm(page, "() => (document.getElementById('wo-play-title')||{}).textContent + '|' + (window.__audit.titles||[]).length");
        const next = await page.locator("#wo-play-next").boundingBox();
        const tStart = Date.now();
        for (let i = 0; i < 5; i++) {
          await touchGesture(page, "chromium", [{ x: next.x + 10, y: next.y + 10 }, { x: next.x + 10, y: next.y + 10 }], 16);
          await page.waitForTimeout(40);
        }
        const rapid = await collect(page);
        rapid.wallMs = Date.now() - tStart;
        rapid.index = await page.evaluate(() => wo.playIndex);
        pushLatency({ browser: "chromium", viewport: "768x1024", song, action: "rapid-next-x5", phase: "burst", selector: "", read: "" }, Object.assign(rapid, { sample: 1 }));
        const body = await page.locator("#wo-play-body").boundingBox();
        const titleBefore = await page.locator("#wo-play-title").innerText();
        const indexBefore = await page.evaluate(() => wo.playIndex);
        await arm(page, "() => document.getElementById('wo-play-title').textContent");
        const swipeT = Date.now();
        await touchGesture(page, "chromium", line(body.x + body.width * 0.7, body.y + 180, body.x + body.width * 0.2, body.y + 190, 8), 16);
        const swipe = await collect(page);
        swipe.wallMs = Date.now() - swipeT;
        swipe.titleBefore = titleBefore;
        swipe.indexBefore = indexBefore;
        swipe.indexAfter = await page.evaluate(() => wo.playIndex);
        swipe.scrollTop = await page.evaluate(() => document.getElementById("wo-play-body").scrollTop);
        pushLatency({ browser: "chromium", viewport: "768x1024", song, action: "swipe-next", phase: "gesture", selector: "", read: "" }, Object.assign(swipe, { sample: 1 }));
        const verticalBefore = await page.evaluate(() => ({ index: wo.playIndex, top: document.getElementById("wo-play-body").scrollTop }));
        await page.evaluate(() => woApplyPlaySize(40, 1));
        await touchGesture(page, "chromium", line(body.x + body.width * 0.5, body.y + 280, body.x + body.width * 0.5 + 36, body.y + 40, 8), 16);
        await page.waitForTimeout(200);
        const verticalAfter = await page.evaluate(() => ({ index: wo.playIndex, top: document.getElementById("wo-play-body").scrollTop }));
        functional.push({ id: "vertical-drift-while-playing", before: verticalBefore, after: verticalAfter, note: "mostly vertical touch with 36px horizontal drift" });
        await shot(page, "chromium-768x1024-play-latency");
      }
      fs.writeFileSync(path.join(ART, "latency-partial.json"), JSON.stringify(latencySamples));
      await ctx.close();
    }
  }
  const base = await contextFor(browser, [768, 1024], "chromium");
  await openHash(base.page, "#/home");
  await base.page.evaluate(installHooks);
  for (let i = 0; i < 8; i++) {
    const target = await base.page.locator("#lang-ko").boundingBox();
    const sample = await timeTap(base.page, "chromium", target, "() => document.documentElement.lang");
    pushLatency({ browser: "chromium", viewport: "768x1024", song: "", action: "home-language", phase: "warm", selector: "#lang-ko", read: "" }, Object.assign(sample, { sample: i + 1 }));
    const back = await base.page.locator("#lang-en").boundingBox();
    await touchGesture(base.page, "chromium", [{ x: back.x + 8, y: back.y + 8 }, { x: back.x + 8, y: back.y + 8 }], 20);
    await base.page.waitForTimeout(40);
  }
  await openHash(base.page, "#/worship/song/amazing-grace");
  await base.page.waitForSelector("#wo-song .keystep");
  for (let i = 0; i < 8; i++) {
    const plus = await base.page.locator("#wo-song").getByRole("button", { name: "Raise key" }).boundingBox();
    const sample = await timeTap(base.page, "chromium", plus, "() => document.querySelector('#wo-song .wkeyname').textContent");
    pushLatency({ browser: "chromium", viewport: "768x1024", song: "amazing-grace", action: "song-page-key", phase: "warm", selector: "", read: "" }, Object.assign(sample, { sample: i + 1 }));
  }
  await shot(base.page, "chromium-768x1024-song-key");
  await base.ctx.close();
});

await withBrowser(webkit, "webkit", async (browser) => {
  const { ctx, page } = await contextFor(browser, [768, 1024], "webkit");
  await openHash(page, "#/worship/setlists/audit-set-0");
  await page.locator("#wo-edit-body").getByRole("button", { name: "Play set" }).click();
  await page.waitForSelector("#wo-play-next");
  await page.waitForTimeout(300);
  console.log(" webkit next x12");
  await measureSeries(page, "webkit", {
    browser: "webkit", viewport: "768x1024", song: "set", action: "next", phase: "warm",
    selector: "#wo-play-next", read: "() => document.getElementById('wo-play-title').textContent"
  }, 12);
  await measureSeries(page, "webkit", {
    browser: "webkit", viewport: "768x1024", song: "set", action: "lyrics", phase: "warm",
    selector: "#wo-play-lyrics", read: "() => document.getElementById('wo-play-body').className"
  }, 4);
  const body = await page.locator("#wo-play-body").boundingBox();
  const before = await page.evaluate(() => ({ index: wo.playIndex, title: document.getElementById("wo-play-title").textContent }));
  await arm(page, "() => document.getElementById('wo-play-title').textContent");
  await touchGesture(page, "webkit", line(body.x + body.width * 0.75, body.y + 160, body.x + 80, body.y + 170, 8), 16);
  const swipe = await collect(page);
  swipe.indexBefore = before.index;
  swipe.indexAfter = await page.evaluate(() => wo.playIndex);
  pushLatency({ browser: "webkit", viewport: "768x1024", song: "set", action: "swipe-next", phase: "gesture", selector: "", read: "" }, Object.assign(swipe, { sample: 1 }));
  await shot(page, "webkit-768x1024-play-after-swipe");
  await ctx.close();
});

function summarizeLatency(samples) {
  const groups = {};
  samples.forEach((s) => {
    const key = [s.browser, s.viewport, s.song, s.action, s.phase].join("|");
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  return Object.keys(groups).map((key) => {
    const rows = groups[key];
    const paint = rows.map((r) => r.eventClickMs);
    const raf = rows.map((r) => r.inputToDoubleRafMs);
    const fit = rows.map((r) => r.fitMs);
    const handler = rows.map((r) => r.handlerMs);
    return {
      browser: rows[0].browser,
      viewport: rows[0].viewport,
      song: rows[0].song,
      action: rows[0].action,
      phase: rows[0].phase,
      eventClickToNextPaint: stats(paint),
      pointerDownToDoubleRaf: stats(raf),
      handlerExecution: stats(handler),
      autoFitOrChooseCols: stats(fit),
      medianRects: stats(rows.map((r) => r.rects)).median,
      medianLongTaskMs: stats(rows.map((r) => r.longTaskMs)).median,
      maxFrameGapMs: stats(rows.map((r) => r.frameMaxMs)).max
    };
  });
}

const latencySummary = summarizeLatency(latencySamples);
writeBoth("latency.json", {
  generatedAt: new Date().toISOString(),
  device: "Linux cloud VM, headless. Not a physical iPad or Daniel's tablet.",
  method: {
    touch: "Real touch events. Chromium: CDP Input.dispatchTouchEvent. WebKit: protocol Input.dispatchTouchEvent. Not mouse wheel.",
    eventClickToNextPaint: "Event Timing API duration of the click entry (input timestamp through the next paint after handlers and rAF). durationThreshold 0. Null when the browser records no click entry.",
    pointerDownToDoubleRaf: "performance.now() at pointerdown until the second requestAnimationFrame after the watched DOM value changes. This is about one frame later than first paint and includes woAutoFit when that work is queued as rAF during the click.",
    handlerExecution: "Time inside the wrapped play-mode function only. This is not the visible result.",
    units: "milliseconds",
    acceptanceTargetsAreNotMeasurements: "Targets in the design doc are goals, not descriptions of this run."
  },
  summary: latencySummary,
  samples: latencySamples
});
writeCsv("latency.csv", latencySamples.map((s) => ({
  browser: s.browser, viewport: s.viewport, song: s.song, action: s.action, phase: s.phase, sample: s.sample,
  eventClickToNextPaintMs: s.eventClickMs, pointerDownToDoubleRafMs: s.inputToDoubleRafMs, mutationMs: s.mutationMs,
  handlerMs: s.handlerMs, fitMs: s.fitMs, fitCalls: s.fitCalls, rects: s.rects, longTaskMs: s.longTaskMs,
  frameMaxMs: s.frameMaxMs, framesOver32: s.framesOver32, framesOver50: s.framesOver50, error: s.error || ""
})));

console.log("functional inventory");
async function record(page, id, extra) {
  const state = await page.evaluate(() => {
    const screen = document.querySelector(".screen:not([hidden])");
    const heading = screen ? (screen.querySelector("h1") || {}).textContent || "" : "";
    const buttons = Array.from(document.querySelectorAll(".screen:not([hidden]) button, .screen:not([hidden]) a.pill, .nav a")).slice(0, 40).map((el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return { hash: location.hash, heading: (heading || "").replace(/\s+/g, " ").trim(), buttons, signedOut: document.body.classList.contains("signed-out"), split: document.body.classList.contains("wo-split") };
  });
  functional.push(Object.assign({ id, errors: page._errors.slice(-4), blockedNetwork: page._blocked.length }, state, extra || {}));
}

await withBrowser(chromium, "chromium", async (browser) => {
  const sizes = [[390, 844], [820, 1180], [1280, 800]];
  for (const size of sizes) {
    const { ctx, page } = await contextFor(browser, size, "chromium");
    const routes = ["#/home", "#/events", "#/events/thanksgiving-sunday-20261122", "#/ministries", "#/ministry/worship", "#/ministry/nursery", "#/food-kitchen", "#/signup/km-food", "#/signup/snack", "#/give", "#/more", "#/account", "#/visit", "#/notifications", "#/availability", "#/worship/library", "#/worship/song/amazing-grace", "#/worship/setlists", "#/worship/setlists/audit-set-0", "#/worship/add"];
    for (const hash of routes) {
      await openHash(page, hash);
      await record(page, "route " + hash, { viewport: size.join("x") });
    }
    await openHash(page, "#/events/thanksgiving-sunday-20261122");
    const links = await page.evaluate(() => ({
      watch: (document.getElementById("watch-live") || {}).textContent || null,
      eventGoogle: (document.getElementById("event-google") || {}).href || null,
      visitMap: (document.getElementById("visit-map") || {}).href || null,
      give: Array.from(document.querySelectorAll("#s-give a")).map((a) => a.href).slice(0, 6)
    }));
    await openHash(page, "#/home");
    const homeLinks = await page.evaluate(() => ({
      watch: (document.getElementById("watch-live") || {}).getAttribute && document.getElementById("watch-live").tagName,
      sermon: (document.getElementById("sermon-tile") || {}).href || null,
      past: (document.getElementById("watch-tile") || {}).href || null
    }));
    await openHash(page, "#/visit");
    const visit = await page.evaluate(() => ({ phone: (document.getElementById("visit-phone") || {}).href || null, map: (document.getElementById("visit-map") || {}).href || null }));
    await openHash(page, "#/give");
    const give = await page.evaluate(() => Array.from(document.querySelectorAll("#s-give a, #s-give button")).map((el) => ({ t: (el.innerText || "").replace(/\s+/g, " ").trim(), href: el.href || "" })).slice(0, 12));
    functional.push({ id: "external-links", viewport: size.join("x"), links, homeLinks, visit, give, note: "hrefs checked only; no payment, no message, no live site navigation" });
    if (size[0] === 820) {
      await openHash(page, "#/worship/library");
      await page.waitForSelector("#wo-this-sunday");
      const label = await page.locator("#wo-this-sunday").innerText();
      await page.locator("#wo-filter-btn").click();
      const filtersOpen = await page.locator("#wo-filters").isVisible();
      await page.locator("#wo-theme").selectOption({ index: 1 }).catch(() => {});
      await page.locator("#wo-clear").click();
      await page.locator("#wo-q").fill("grace");
      await page.waitForTimeout(100);
      const filtered = await page.locator("#wo-list .wopen").count();
      await page.locator("#wo-q").fill("");
      await page.locator("#wo-lang-ko").click();
      await page.waitForTimeout(100);
      const koCount = await page.locator("#wo-list .wopen").count();
      await page.locator("#wo-this-sunday").click();
      await page.waitForTimeout(200);
      functional.push({ id: "library-filters-and-this-sunday", label, filtersOpen, filtered, koCount, hashAfterSunday: await page.evaluate(() => location.hash), sundayButtonNow: await page.locator("#wo-this-sunday").count() });
      await openHash(page, "#/worship/song/amazing-grace");
      const beforeKey = await page.locator("#wo-song .wkeyname").innerText();
      const beforeChord = await page.locator("#wo-song .chord").first().innerText();
      await page.locator("#wo-song").getByRole("button", { name: "Raise key" }).click();
      const afterKey = await page.locator("#wo-song .wkeyname").innerText();
      const afterChord = await page.locator("#wo-song .chord").first().innerText();
      await page.locator("#wo-song").getByRole("button", { name: "More song actions" }).click();
      await page.locator(".songmenu").getByRole("menuitem", { name: "Numbers" }).click();
      const numberChord = await page.locator("#wo-song .chord").first().innerText();
      await page.locator("#wo-song").getByRole("button", { name: "Lyrics" }).click();
      const lyricsDisplay = await page.locator("#wo-song .wch").first().evaluate((el) => getComputedStyle(el).display);
      await page.locator("#wo-song").getByRole("button", { name: "More song actions" }).click();
      const menu = await page.locator(".songmenu").isVisible();
      await page.keyboard.press("Escape");
      const playHasCols = await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click().then(() => page.evaluate(() => ({
        cols: !!document.querySelector("[data-cols], #wo-play-cols, #wo-col-1"),
        keyButtons: Array.from(document.querySelectorAll("#wo-play button")).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()),
        label: document.getElementById("wo-play-key").textContent
      })));
      functional.push({ id: "song-and-play-controls", beforeKey, beforeChord, afterKey, afterChord, numberChord, lyricsDisplay, menu, playHasCols });
      await page.locator("#wo-play-exit").click();
      await openHash(page, "#/more");
      await page.locator("#feedback-link").click();
      const fbSendDisabled = await page.locator("#fb-send").isDisabled();
      await page.locator("#fb-close").click();
      functional.push({ id: "feedback-empty-stays-local", fbSendDisabled, closed: await page.locator("#fb-sheet").isHidden(), note: "Send stays disabled with an empty message. The request was not submitted." });
      await shot(page, "chromium-820x1180-home");
      await openHash(page, "#/home");
      await shot(page, "chromium-820x1180-home-after");
    }
    await ctx.close();
  }
  const signed = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const sp = await signed.newPage();
  await prepare(sp, { authed: false });
  await openHash(sp, "#/signin");
  await record(sp, "signed-out-signin");
  await openHash(sp, "#/create");
  await record(sp, "signed-out-create");
  await shot(sp, "chromium-390x844-signin");
  await signed.close();
  const named = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const np = await named.newPage();
  await prepare(np, { needName: true });
  await openHash(np, "#/home");
  await record(np, "needs-name");
  await named.close();
  const guest = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const gp = await guest.newPage();
  await prepare(gp, { teams: [] });
  await openHash(gp, "#/worship/library");
  await record(gp, "worship-gated");
  await openHash(gp, "#/team-code?team=worship");
  await gp.locator("#team-code-input").fill("");
  await gp.locator("#team-form button[type=submit]").click();
  functional.push({ id: "team-code-empty", msg: await gp.locator("#team-code-msg").innerText(), blocked: gp._blocked.length });
  await guest.close();
});

let production = {};
try {
  const js = await fetch("https://app.bethanychurchwa.org/worship.js").then((r) => r.text());
  const html = await fetch("https://app.bethanychurchwa.org/").then((r) => r.text());
  production = {
    checkedAt: new Date().toISOString(),
    readOnly: true,
    hasUnconditionalWoShowLib: js.includes('if (!wo.songsRouted) woShow("lib")'),
    hasAutoFit: js.includes("function woAutoFit("),
    hasSwipe: js.includes("function woSwipePlay("),
    htmlHasThisSunday: html.includes(">This Sunday<"),
    htmlHasSplitLock: html.includes("body.wo-split{overflow:hidden;height:100dvh}"),
    htmlHasPlayKeyStep: html.includes("wo-play-key-minus") || html.includes("Lower key")
  };
} catch (e) {
  production = { error: String(e).split("\n")[0] };
}

const summary = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  userAgentNote: "Headless Chromium and Playwright WebKit with hasTouch. Emulated viewports are not a physical iPad.",
  playwright: require("playwright/package.json").version,
  production,
  scrollFailures: scrollRows.filter((r) => r.reachable === false || r.error),
  latencyHeadline: latencySummary,
  functional
};
writeBoth("summary.json", summary);
writeBoth("functional.json", functional);
console.log("done", "scroll", scrollRows.length, "latency", latencySamples.length, "functional", functional.length);
server.close();
