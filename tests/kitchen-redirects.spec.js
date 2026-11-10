import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/remove-kitchen";
fs.mkdirSync(ART, { recursive: true });

const OLD_LINKS = [
  "#/food-kitchen",
  "#/signup/km-food",
  "#/signup/snack",
  "#/ministry/kitchen",
  "#/kitchen",
  "#/km-food",
  "#/snack",
  "#/signup",
  "#/signup?kind=snack",
  "#/signup?kind=km-food"
];

async function signedIn(page, lang) {
  await page.addInitScript(function (code) {
    window.BETHANY_MOCK_AUTH = {
      uid: "uid-daniel",
      email: "daniel.kim@bethanychurch.test",
      displayName: "Daniel Kim",
      providers: ["google.com"]
    };
    localStorage.setItem("bethany-lang", code);
    localStorage.setItem("bethany-profile", JSON.stringify({
      name: "Daniel Kim",
      email: "daniel.kim@bethanychurch.test",
      provider: "google.com",
      lang: code,
      teams: ["nursery", "worship"]
    }));
    localStorage.setItem("bethany-teams", JSON.stringify(["nursery", "worship"]));
    localStorage.removeItem("bethany-need-name");
  }, lang || "en");
  await page.route("**/*script.google.com/**", function (route) {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "soon" }) });
  });
}

async function gridFills(page) {
  const report = await page.locator("#ministry-list").evaluate(function (el) {
    var cards = Array.prototype.map.call(el.querySelectorAll(".mcard"), function (card) {
      var r = card.getBoundingClientRect();
      return { top: Math.round(r.top), left: r.left, right: r.right, width: r.width, height: r.height };
    });
    var box = el.getBoundingClientRect();
    var rows = {};
    cards.forEach(function (card) {
      var key = String(card.top);
      if (!rows[key]) rows[key] = [];
      rows[key].push(card);
    });
    return {
      count: cards.length,
      rows: Object.keys(rows).map(function (key) {
        var row = rows[key].slice().sort(function (a, b) { return a.left - b.left; });
        var span = row[row.length - 1].right - row[0].left;
        return { cards: row.length, unused: box.width - span, height: row[0].height };
      })
    };
  });
  expect(report.count).toBe(2);
  expect(report.rows.length).toBeGreaterThan(0);
  report.rows.forEach(function (row) {
    expect(row.unused).toBeLessThan(24);
    expect(row.height).toBeGreaterThan(80);
  });
}

test("old kitchen and food sign-up links land on Ministries", async function ({ page }) {
  await signedIn(page, "en");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of OLD_LINKS) {
    await page.goto("/index.html?from=" + encodeURIComponent(hash) + hash);
    await expect(page).toHaveURL(/#\/ministries$/);
    await expect(page.locator("#s-ministries")).toBeVisible();
    await expect(page.locator("#s-food-kitchen")).toHaveCount(0);
    await expect(page.locator("#s-signup")).toHaveCount(0);
    await expect(page.locator("#ministry-list")).toContainText("Worship");
    await expect(page.locator("#ministry-list")).toContainText("Nursery");
    await expect(page.locator("#ministry-list")).not.toContainText("Food Kitchen");
    await expect(page.locator("#ministry-list")).not.toContainText("KM Food");
    await expect(page.locator("#ministry-list")).not.toContainText("Snack");
  }
});

test("nursery sign-up and worship tools stay on their own screens", async function ({ page }) {
  await signedIn(page, "en");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html#/signup/nursery");
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  await expect(page.locator("#s-ministry")).toBeVisible();
  await expect(page.locator("#ministry-head")).toContainText("Nursery");
  await page.goto("/index.html?kind=1#/signup?kind=nursery");
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  await expect(page.locator("#s-ministry")).toBeVisible();
  await page.goto("/index.html#/worship/library");
  await expect(page).toHaveURL(/#\/worship\/library/);
  await expect(page.locator("#s-worship")).toBeVisible();
  await expect(page.locator("#wo-lib")).toBeVisible();
});

test("ministries grid stays full in English and Korean", async function ({ page }) {
  const sizes = [[390, 844], [768, 1024], [1280, 800]];
  await signedIn(page, "en");
  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.goto("/index.html?w=" + size[0] + "#/ministries");
    await expect(page.locator("#s-ministries h1")).toHaveText("Ministries");
    await expect(page.locator("#ministry-list .mcard")).toHaveCount(2);
    await expect(page.locator("#ministry-list")).not.toContainText(/kitchen|음식|간식|snack/i);
    await gridFills(page);
    const box = await page.evaluate(function () {
      return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
    await page.screenshot({ path: ART + "/ministries-en-" + size[0] + "x" + size[1] + ".png" });
  }

  await page.addInitScript(function () { localStorage.setItem("bethany-lang", "ko"); });
  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.goto("/index.html?ko=" + size[0] + "#/ministries");
    await expect(page.locator("#s-ministries h1")).toHaveText("사역");
    await expect(page.locator("#ministry-list")).toContainText("찬양팀");
    await expect(page.locator("#ministry-list")).toContainText("유아부");
    await expect(page.locator("#ministry-list")).not.toContainText("음식 사역");
    await gridFills(page);
    await page.screenshot({ path: ART + "/ministries-ko-" + size[0] + "x" + size[1] + ".png" });
  }
});
