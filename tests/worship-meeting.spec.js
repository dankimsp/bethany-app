import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/worship-preview";
fs.mkdirSync(ART, { recursive: true });

const CONTAMINATED = "Luke 9:23, Matthew 8:19-22 Song Finder WorshipTogether Home Songs Artists Sign in footer navigation scraped from the chart page and it keeps going with more website chrome that should never render in the yellow chip";

async function boot(page, teams) {
  await page.addInitScript(function (teams) {
    window.BETHANY_MOCK_AUTH = {
      uid: "uid-daniel",
      email: "daniel.kim@bethanychurch.test",
      displayName: "Daniel Kim",
      providers: ["google.com"]
    };
    localStorage.setItem("bethany-profile", JSON.stringify({
      name: "Daniel Kim",
      email: "daniel.kim@bethanychurch.test",
      provider: "google.com",
      lang: "en",
      teams: teams
    }));
    localStorage.setItem("bethany-teams", JSON.stringify(teams));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.setItem("bethany-worship-numbers", "0");
    localStorage.setItem("bethany-worship-lyrics", "0");
  }, teams);
  await page.route("**/*script.google.com/**", function (route) { return route.abort(); });
  await page.route("**/sw.js*", function (route) { return route.abort(); });
}

async function playControls(page) {
  return page.evaluate(function () {
    var tools = document.querySelector("#wo-play-tools");
    var buttons = Array.from(document.querySelectorAll("#wo-play-bar button, #wo-play-pos")).map(function (el) {
      var r = el.getBoundingClientRect();
      return {
        t: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim(),
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        w: r.width,
        h: r.height
      };
    });
    return {
      scroll: tools ? tools.scrollWidth - tools.clientWidth : 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
      buttons: buttons
    };
  });
}

test("play controls stay on screen at phone and tablet", async function ({ page }) {
  await boot(page, ["worship"]);
  for (const size of [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.goto("/index.html?meet=play-" + size.w + "x" + size.h + "#/worship/song/amazing-grace");
    await expect(page.locator("#wo-song h1")).toContainText("Amazing Grace");
    await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("#wo-play")).toBeVisible();
    const box = await playControls(page);
    const hidden = box.buttons.filter(function (b) {
      return b.w < 8 || b.left < -1 || b.right > box.vw + 1 || b.top < -1 || b.bottom > box.vh + 1;
    });
    expect(box.scroll, size.w + "x" + size.h + " " + JSON.stringify(hidden)).toBeLessThanOrEqual(1);
    expect(hidden, size.w + "x" + size.h).toEqual([]);
    const names = box.buttons.map(function (b) { return b.t; });
    ["Prev", "Next", "Numbers", "Lyrics only", "Smaller text", "Larger text", "Fit", "Songs", "Exit"].forEach(function (name) {
      expect(names, size.w + "x" + size.h).toContain(name);
    });
    await page.screenshot({ path: ART + "/play-controls-" + size.w + "x" + size.h + ".png" });
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.locator("#wo-play")).toBeHidden();
  }
});

test("scripture chip keeps the verse and drops scraped site text", async function ({ page }) {
  await boot(page, ["worship"]);
  await page.goto("/index.html?meet=scripture#/worship/library");
  await page.waitForFunction(function () { return window.woParseCho && window.woMetaChips; });
  const report = await page.evaluate(function (contaminated) {
    function chip(scripture) {
      var song = woParseCho("{title: All Day}\n{artist: Hillsong Kids}\n{key: G}\n{scripture: " + scripture + "}\n{start_of_verse: Verse}\n[G]All day\n{end_of_verse}\n", "all-day-fixture");
      return woMetaChips(song).textContent.replace(/\s+/g, " ").trim();
    }
    return {
      contaminated: chip(contaminated),
      genuine: chip("Luke 9:23, Matthew 8:19-22"),
      short: chip("Ephesians 2:8"),
      numbered: chip("1 Samuel 7:12"),
      range: chip("Genesis 28:10-22"),
      longRefs: chip("Luke 9:23, Matthew 8:19-22, John 3:16, Romans 8:28-39, 1 Corinthians 13:4-7, Psalm 23:1-6 extra commentary that is not a reference and should not fill the chip")
    };
  }, CONTAMINATED);
  expect(report.contaminated).toContain("Luke 9:23");
  expect(report.contaminated).toContain("Matthew 8:19-22");
  expect(report.contaminated).not.toContain("Song Finder");
  expect(report.contaminated).not.toContain("WorshipTogether");
  expect(report.contaminated).not.toContain("Sign in");
  expect(report.genuine).toBe("Luke 9:23, Matthew 8:19-22");
  expect(report.short).toBe("Ephesians 2:8");
  expect(report.numbered).toBe("1 Samuel 7:12");
  expect(report.range).toBe("Genesis 28:10-22");
  expect(report.longRefs).toContain("Luke 9:23");
  expect(report.longRefs).toContain("Psalm 23:1-6");
  expect(report.longRefs).not.toContain("extra commentary");
});

test("worship tools show for members and stay gated for everyone else", async function ({ page }) {
  await boot(page, ["worship"]);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/index.html?meet=tools#/ministries");
  await page.getByRole("button", { name: /Worship Team/ }).click();
  await expect(page).toHaveURL(/#\/ministry\/worship$/);
  await expect(page.getByRole("link", { name: /Chord sheets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Setlists/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Team availability/ })).toBeVisible();
  await page.screenshot({ path: ART + "/worship-tools-768x1024.png" });

  const guest = await page.context().newPage();
  await boot(guest, []);
  await guest.setViewportSize({ width: 768, height: 1024 });
  await guest.goto("/index.html?meet=guest#/ministry/worship");
  await expect(guest).toHaveURL(/#\/team-code\?team=worship/);
  await expect(guest.getByRole("link", { name: /Chord sheets/ })).toHaveCount(0);
  await guest.close();
});

test("tablet chart lines stay inside the song column", async function ({ page }) {
  await boot(page, ["worship"]);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/index.html?meet=chart#/worship/song/amazing-grace");
  await expect(page.locator("#wo-song h1")).toContainText("Amazing Grace");
  const clip = await page.evaluate(function () {
    var song = document.querySelector("#wo-song");
    var sr = song.getBoundingClientRect();
    return Array.from(document.querySelectorAll("#wo-song .wline")).slice(0, 4).map(function (el) {
      var r = el.getBoundingClientRect();
      return { t: el.textContent.replace(/\s+/g, " ").trim(), right: r.right, paneRight: sr.right, over: song.scrollWidth - song.clientWidth };
    });
  });
  expect(clip[0].t).toContain("sound");
  clip.forEach(function (line) {
    expect(line.right).toBeLessThanOrEqual(line.paneRight + 2);
    expect(line.over).toBeLessThanOrEqual(1);
  });
  await page.screenshot({ path: ART + "/song-tablet-768x1024.png" });
});

test("setlist create, add, reorder, and remove stay on this device", async function ({ page }) {
  await boot(page, ["worship"]);
  await page.setViewportSize({ width: 1024, height: 768 });
  const posts = [];
  page.on("request", function (req) { if (req.method() === "POST") posts.push(req.url()); });
  await page.goto("/index.html?meet=set#/worship/library");
  await page.waitForFunction(function () { return window.wo && wo.songs && wo.songs.length; });
  await page.getByRole("button", { name: "Add Amazing Grace to a setlist" }).click();
  await page.getByRole("button", { name: "New setlist" }).click();
  await expect(page.getByText(/Added to /)).toBeVisible();
  await page.getByRole("button", { name: "Add Holy, Holy, Holy to a setlist" }).click();
  await page.locator("#wo-add-pick").getByRole("button").first().click();
  const id = await page.evaluate(function () {
    return JSON.parse(localStorage.getItem("bethany-worship-sets"))[0].id;
  });
  await page.goto("/index.html?meet=edit#/worship/setlists/" + id);
  await expect(page.locator(".settitle").nth(0)).toContainText("Amazing Grace");
  await expect(page.locator(".settitle").nth(1)).toContainText("Holy, Holy, Holy");
  for (const name of ["Move down", "Move up", "Lower key", "Raise key", "Remove"]) {
    const button = page.getByRole("button", { name: name }).first();
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box, name).toBeTruthy();
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(1025);
    expect(box.y, name).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, name).toBeLessThanOrEqual(769);
  }
  await page.getByRole("button", { name: "Move down" }).first().click();
  await expect(page.locator(".settitle").nth(0)).toContainText("Holy, Holy, Holy");
  await page.getByRole("button", { name: "Raise key" }).first().click();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.locator(".settitle")).toHaveCount(1);
  await expect(page.locator("#wo-sets-list")).toContainText("1 song");
  expect(posts).toEqual([]);
  await page.screenshot({ path: ART + "/setlist-1024x768.png" });
});
