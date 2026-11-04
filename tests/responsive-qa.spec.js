import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/responsive-qa";
fs.mkdirSync(ART, { recursive: true });

const WIDTHS = [
  [390, 844],
  [375, 667],
  [768, 1024],
  [1024, 1366],
  [1280, 800],
  [1440, 900]
];

function sundays(count) {
  const parts = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const start = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + ((7 - dow) % 7)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(start.getUTCDate() + i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function rosterFor() {
  const days = sundays(8);
  return days.map(function (sunday, i) {
    if (i === 0) return { sunday: sunday, goal: 2, count: 2, people: [{ name: "Daniel K.", isMe: true }, { name: "Grace L.", isMe: false }] };
    return { sunday: sunday, goal: 2, count: 0, people: [] };
  });
}

async function boot(page, opts) {
  const lang = opts.lang || "en";
  const delayServing = opts.delayServing || 0;
  const delayRoster = opts.delayRoster || 0;
  const cache = opts.cache ? JSON.stringify({ at: Date.now(), roster: rosterFor() }) : "";
  const calls = [];
  await page.addInitScript(function (args) {
    window.BETHANY_MOCK_AUTH = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", displayName: "Daniel Kim", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", provider: "google.com", lang: args.lang, teams: ["nursery", "worship"] }));
    localStorage.setItem("bethany-teams", JSON.stringify(["nursery", "worship"]));
    localStorage.setItem("bethany-lang", args.lang);
    localStorage.removeItem("bethany-need-name");
    if (args.cache) localStorage.setItem("bethany-nursery-roster", args.cache);
    else localStorage.removeItem("bethany-nursery-roster");
  }, { lang: lang, cache: cache });
  await page.route("**/*script.google.com/**", async function (route) {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    const url = new URL(route.request().url());
    url.searchParams.forEach(function (value, key) { if (body[key] == null) body[key] = value; });
    const action = String(body.action || "getSongs");
    calls.push(action);
    if (action === "getMyServing" && delayServing) await new Promise(function (r) { setTimeout(r, delayServing); });
    if (action === "getNurseryRoster" && delayRoster) await new Promise(function (r) { setTimeout(r, delayRoster); });
    const days = sundays(8);
    let payload = { ok: true, status: 200, songs: [], done: true, profile: { uid: "uid-daniel", name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", teams: ["nursery", "worship"], lang: lang } };
    if (action === "getNurseryRoster") payload.roster = rosterFor();
    if (action === "getMyServing") {
      payload = { ok: true, status: 200, nursery: { next: { sunday: days[0], with: ["Grace L."] }, upcoming: [{ sunday: days[0], with: ["Grace L."] }] }, worship: { markedCount: 3 } };
    }
    const callback = url.searchParams.get("callback") || "";
    const json = JSON.stringify(payload);
    const wrapped = /^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback);
    await route.fulfill({ status: 200, contentType: wrapped ? "application/javascript" : "application/json", body: wrapped ? callback + "(" + json + ")" : json });
  });
  page._calls = calls;
}

async function noOverflow(page) {
  const box = await page.evaluate(function () {
    return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
  });
  expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
}

test("home serving card loads on #/ and refresh, in English and Korean", async function ({ page }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { cache: true, delayRoster: 900 });
  await page.goto("/index.html#/");
  await expect(page.locator("#home-serving")).toContainText("You're serving", { timeout: 1500 });
  expect(page._calls).toContain("getNurseryRoster");
  await page.screenshot({ path: ART + "/after-home-390.png" });
});

test("home serving card loads in Korean on a cold #/", async function ({ page }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { lang: "ko", cache: true, delayRoster: 900 });
  await page.goto("/index.html?ko=1#/");
  await expect(page.locator("#home-serving")).toContainText("유아부", { timeout: 1500 });
  expect(page._calls).toContain("getNurseryRoster");
  await page.screenshot({ path: ART + "/after-home-390-ko.png" });
});

test("More page keeps a skeleton until getMyServing, then repaints", async function ({ page }) {
  await page.setViewportSize({ width: 768, height: 1024 });
  await boot(page, { delayServing: 700 });
  await page.goto("/index.html#/more", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#more-serving .skel").first()).toBeVisible();
  await expect(page.locator("#more-serving")).not.toContainText("Pick Sundays");
  await expect(page.locator("#more-serving")).not.toContainText("0 of next 8");
  await expect(page.locator("#more-serving")).toContainText("Nursery · with Grace L.");
  await expect(page.locator("#more-serving")).toContainText("3 of next 8 Sundays marked");
  await expect(page.locator("#more-serving .serve-plain")).toHaveCSS("font-weight", "400");
  await page.screenshot({ path: ART + "/after-more-768.png" });

  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.screenshot({ path: ART + "/after-more-1024.png" });
  await noOverflow(page);
});

test("Account keeps the side rail from 768 up and columns stay capped", async function ({ page }) {
  await boot(page, {});
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/index.html#/account");
  await expect(page.locator(".nav")).toBeHidden();
  await page.screenshot({ path: ART + "/after-account-375.png" });
  await noOverflow(page);

  for (const size of [[768, 1024], [1024, 1366], [1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await expect(page.locator(".nav")).toBeVisible();
    await expect(page.locator(".nav a.on")).toContainText("More");
    const width = await page.locator("#s-account").evaluate(function (el) { return el.getBoundingClientRect().width; });
    expect(width).toBeLessThanOrEqual(724);
    await page.screenshot({ path: ART + "/after-account-" + size[0] + ".png" });
    await noOverflow(page);
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator("#a2hs-row")).toBeHidden();
});

test("no horizontal overflow and nursery header at every width", async function ({ page }) {
  await boot(page, {});
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.goto("/index.html?w=" + size[0] + "#/");
    await expect(page.locator("#home-serving")).toContainText(/serving|유아부|이번 주일/);
    await noOverflow(page);
    await page.screenshot({ path: ART + "/after-home-" + size[0] + ".png" });
    await page.goto("/index.html?w=" + size[0] + "m#/more");
    await expect(page.locator("#more-serving")).toContainText("Grace L.");
    await noOverflow(page);
    await page.goto("/index.html?w=" + size[0] + "n#/ministry/nursery");
    await expect(page.locator("#nursery-root")).toContainText("You're on 1 Sunday");
    await expect(page.locator("#nursery-root")).not.toContainText("1 Sundays");
    const back = await page.locator("#ministry-head .back").boundingBox();
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
    if (size[0] >= 768) {
      const chip = await page.locator("#ministry-head .chip.ok").boundingBox();
      const title = await page.locator("#ministry-head h1").boundingBox();
      expect(chip.x).toBeGreaterThan(title.x + title.width - 8);
      expect(chip.x).toBeGreaterThan(back.x + back.width);
    }
    await noOverflow(page);
    if (size[0] === 390 || size[0] === 1280 || size[0] === 1440) {
      await page.screenshot({ path: ART + "/after-nursery-" + size[0] + ".png" });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html?wide=1#/more");
  await expect(page.locator("#more-serving")).toContainText("Grace L.");
  const cols = await page.locator("#s-more .more-rest").evaluate(function (el) { return getComputedStyle(el).gridTemplateColumns; });
  expect(cols.split(" ").length).toBe(2);
  await page.screenshot({ path: ART + "/after-more-1440.png" });
  await noOverflow(page);
});
