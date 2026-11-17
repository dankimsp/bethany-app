import { test, expect } from "@playwright/test";

function song(id, title) {
  return {
    id: id,
    name: title + ".cho",
    language: "en",
    cho: "{title: " + title + "}\n{key: C}\n[C]Hello\n"
  };
}

async function boot(page) {
  await page.addInitScript(function () {
    window.BETHANY_MOCK_AUTH = {
      uid: "uid-daniel",
      email: "daniel.kim@bethanychurch.test",
      displayName: "Daniel Kim",
      providers: ["google.com"]
    };
    localStorage.setItem("bethany-teams", JSON.stringify(["worship"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.setItem("bethany-profile", JSON.stringify({
      name: "Daniel Kim",
      email: "daniel.kim@bethanychurch.test",
      provider: "google.com",
      lang: "en",
      teams: ["worship"]
    }));
    localStorage.removeItem("bethany-need-name");
  });
  await page.route("**/sw.js*", function (route) { return route.abort(); });
}

function fulfillScript(route, payload) {
  const url = new URL(route.request().url());
  const callback = url.searchParams.get("callback") || "";
  const action = url.searchParams.get("action") || "";
  const body = action && action !== "getSongs" ? { ok: true, status: 200 } : payload;
  const json = JSON.stringify(body);
  return route.fulfill({
    status: 200,
    contentType: callback ? "application/javascript" : "application/json",
    body: callback ? callback + "(" + json + ")" : json
  });
}

test("a fresh library starts fetching before songs.json finishes and loads one pack", async function ({ page }) {
  let songsReleased = false;
  let scriptDuringSongs = false;
  const calls = [];
  await boot(page);
  await page.addInitScript(function () {
    localStorage.removeItem("bethany-worship-drive");
  });
  await page.route("**/songs.json", async function (route) {
    await new Promise(function (resolve) { setTimeout(resolve, 1500); });
    songsReleased = true;
    await route.continue();
  });
  await page.route("**/*script.google.com/**", async function (route) {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") === "getSongs" && !songsReleased) scriptDuringSongs = true;
    calls.push({
      action: url.searchParams.get("action"),
      pack: url.searchParams.get("pack"),
      cursor: url.searchParams.get("cursor")
    });
    const songs = [];
    for (let i = 0; i < 45; i++) songs.push(song("drive-pack-" + i, "Pack Song " + String(i).padStart(2, "0")));
    await fulfillScript(route, {
      ok: true,
      status: 200,
      more: false,
      ready: true,
      etag: "etag-pack",
      version: "etag-pack",
      api: 2,
      songs: songs
    });
  });

  await page.goto("/index.html#/worship/library");
  await expect(page.locator("#wo-list")).toContainText("Pack Song 44");
  expect(scriptDuringSongs).toBe(true);
  const gets = calls.filter(function (call) { return call.action === "getSongs"; });
  expect(gets).toHaveLength(1);
  expect(gets[0].pack).toBe("1");
  expect(gets[0].cursor).toBeNull();
});

test("an old script that ignores pack still returns every page", async function ({ page }) {
  const cursors = [];
  await boot(page);
  await page.addInitScript(function () {
    localStorage.removeItem("bethany-worship-drive");
  });
  await page.route("**/*script.google.com/**", async function (route) {
    const url = new URL(route.request().url());
    const cursor = Number(url.searchParams.get("cursor") || "0");
    cursors.push(cursor);
    const songs = [];
    for (let i = cursor; i < Math.min(cursor + 40, 85); i++) songs.push(song("drive-old-" + i, "Old Song " + String(i).padStart(2, "0")));
    const more = cursor + 40 < 85;
    await fulfillScript(route, {
      ok: true,
      status: 200,
      more: more,
      ready: true,
      etag: "old-etag",
      version: "old-etag",
      cursor: more ? String(cursor + 40) : "",
      songs: songs
    });
  });

  await page.goto("/index.html#/worship/library");
  await page.locator("#wo-q").fill("Old Song 84");
  await expect(page.locator("#wo-list")).toContainText("Old Song 84");
  expect(cursors).toEqual([0, 40, 80]);
});

test("an unfinished index does not replace a saved library", async function ({ page }) {
  await boot(page);
  await page.addInitScript(function () {
    localStorage.setItem("bethany-worship-drive", JSON.stringify({
      etag: "saved-etag",
      version: "saved-etag",
      songs: [{ id: "drive-saved", name: "Saved.cho", language: "en", cho: "{title: Saved Whole Song}\n{key: D}\n[D]Keep\n" }]
    }));
  });
  await page.route("**/*script.google.com/**", async function (route) {
    await fulfillScript(route, {
      ok: true,
      status: 200,
      more: false,
      ready: false,
      etag: "",
      version: "",
      songs: [song("drive-partial", "Partial Only Song")]
    });
  });

  await page.goto("/index.html#/worship/library");
  await expect(page.locator("#wo-list")).toContainText("Saved Whole Song");
  await expect(page.locator("#wo-list")).not.toContainText("Partial Only Song");
  const stored = await page.evaluate(function () { return localStorage.getItem("bethany-worship-drive"); });
  expect(stored).toContain("Saved Whole Song");
  expect(stored).not.toContain("Partial Only Song");
});
