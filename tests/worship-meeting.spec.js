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
        h: r.height,
        skip: !!el.hidden
      };
    });
    return {
      scroll: tools ? tools.scrollWidth - tools.clientWidth : 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
      buttons: buttons.filter(function (b) { return !b.skip; })
    };
  });
}

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

test("play controls stay on screen at phone and tablet", async function ({ page }) {
  await boot(page, ["worship"]);
  for (const size of [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.goto("/index.html?meet=play-" + size.w + "x" + size.h + "#/worship/song/amazing-grace");
    await expect(page.locator("#wo-song h1")).toContainText("Amazing Grace");
    await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("#wo-play")).toBeVisible();
    const box = await playControls(page);
    const off = box.buttons.filter(function (b) {
      return b.w < 8 || b.h < 44 || b.left < -1 || b.right > box.vw + 1 || b.top < -1 || b.bottom > box.vh + 1;
    });
    expect(box.scroll, size.w + "x" + size.h + " " + JSON.stringify(off)).toBeLessThanOrEqual(1);
    expect(off, size.w + "x" + size.h).toEqual([]);
    const names = box.buttons.map(function (b) { return b.t; });
    ["Exit", "Numbers", "Lyrics only", "Smaller text", "Larger text", "Fit", "Songs"].forEach(function (name) {
      expect(names, size.w + "x" + size.h).toContain(name);
    });
    expect(names).not.toContain("Prev");
    expect(names).not.toContain("Next");
    const rows = new Set(box.buttons.map(function (b) { return Math.round(b.top); }));
    if (size.w === 390) expect(rows.size).toBeLessThanOrEqual(2);
    await expect(page.locator("#wo-play-key")).toHaveText("Key: G");
    const keyPlace = await page.evaluate(function () {
      var key = document.getElementById("wo-play-key").getBoundingClientRect();
      var title = document.getElementById("wo-play-title").getBoundingClientRect();
      var bar = document.getElementById("wo-play-bar").getBoundingClientRect();
      return { keyTop: key.top, titleBottom: title.bottom, barBottom: bar.bottom };
    });
    expect(keyPlace.keyTop).toBeGreaterThanOrEqual(keyPlace.barBottom - 1);
    expect(keyPlace.keyTop).toBeLessThan(keyPlace.titleBottom + 8);
    await page.screenshot({ path: ART + "/play-controls-" + size.w + "x" + size.h + ".png" });
    if (size.w === 390) await page.screenshot({ path: "/opt/cursor/artifacts/bethany-meeting-review/phone-toolbar-390x844.png" });
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.locator("#wo-play")).toBeHidden();
  }
});

async function columnReport(page) {
  return page.evaluate(function () {
    var chart = document.querySelector("#wo-play-body .wo-chart");
    var orphans = [];
    var wrapped = [];
    document.querySelectorAll("#wo-play-body .wblock").forEach(function (block) {
      var head = block.querySelector(".wsec");
      var line = block.querySelector(".wline");
      if (!head || !line) return;
      var hr = head.getBoundingClientRect();
      var lr = line.getBoundingClientRect();
      if (Math.abs(hr.left - lr.left) > 24) orphans.push(head.textContent.trim());
    });
    document.querySelectorAll("#wo-play-body .wline").forEach(function (line) {
      var words = line.querySelectorAll(".wword");
      if (words.length < 2) return;
      var top = words[0].getBoundingClientRect().top;
      var box = line.getBoundingClientRect();
      for (var i = 0; i < words.length; i++) {
        var word = words[i].getBoundingClientRect();
        if (word.width > box.width + 1 || Math.abs(word.top - top) > 3) {
          wrapped.push(line.textContent.replace(/\s+/g, " ").trim().slice(0, 48));
          break;
        }
      }
    });
    var misaligned = [];
    Array.from(document.querySelectorAll("#wo-play-body .wseg")).slice(0, 8).forEach(function (seg) {
      var chord = seg.querySelector(".chord");
      var lyric = seg.querySelector(".wch + span");
      if (!chord || !lyric) return;
      var cr = chord.getBoundingClientRect();
      var lr = lyric.getBoundingClientRect();
      if (cr.width < 2 || lr.width < 2) return;
      var overlap = Math.min(cr.right, lr.right) - Math.max(cr.left, lr.left);
      if (overlap < Math.min(cr.width, lr.width) * 0.4) misaligned.push(chord.textContent);
    });
    return {
      cols: chart ? getComputedStyle(chart).columnCount : "0",
      orphans: orphans,
      wrapped: wrapped,
      misaligned: misaligned
    };
  });
}

test("play columns keep a verse heading with its first line", async function ({ page }) {
  await boot(page, ["worship"]);
  const shots = "/opt/cursor/artifacts/bethany-meeting-review";
  const sizes = [
    { w: 768, h: 1024, name: "768x1024" },
    { w: 1024, h: 768, name: "1024x768" },
    { w: 1024, h: 1366, name: "1024x1366" },
    { w: 1366, h: 1024, name: "1366x1024" },
    { w: 1440, h: 900, name: "1440x900" },
    { w: 390, h: 844, name: "390x844" }
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.goto("/index.html?meet=playcols-" + size.name + "#/worship/song/amazing-grace");
    await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("#wo-play")).toBeVisible();
    await page.waitForTimeout(250);
    const fit = await columnReport(page);
    expect(fit.orphans, size.name + " fit " + JSON.stringify(fit)).toEqual([]);
    expect(fit.misaligned, size.name + " fit").toEqual([]);
    if (size.w === 768) expect(["1", "auto"], size.name + " " + JSON.stringify(fit)).toContain(fit.cols);
    if (fit.cols !== "1" && fit.cols !== "auto") expect(fit.wrapped, size.name + " fit").toEqual([]);
    await page.screenshot({ path: shots + "/play-" + size.name + "-fit.png" });
    await page.getByRole("button", { name: "Larger text" }).click();
    await page.getByRole("button", { name: "Larger text" }).click();
    await page.waitForTimeout(150);
    const bigger = await columnReport(page);
    expect(bigger.orphans, size.name + " A+ " + JSON.stringify(bigger)).toEqual([]);
    expect(bigger.misaligned, size.name + " A+").toEqual([]);
    if (bigger.cols !== "1" && bigger.cols !== "auto") expect(bigger.wrapped, size.name + " A+").toEqual([]);
    await page.screenshot({ path: shots + "/play-" + size.name + "-larger.png" });
    await page.getByRole("button", { name: "Exit" }).click();
  }
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

test("two-song play controls change the chart", async function ({ browser }) {
  const dir = "/opt/cursor/artifacts/bethany-meeting-review";
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    recordVideo: { dir: "/tmp/wo-video", size: { width: 1024, height: 768 } }
  });
  const page = await context.newPage();
  await boot(page, ["worship"]);
  await page.addInitScript(function () {
    localStorage.setItem("bethany-worship-sets", JSON.stringify([{
      id: "preview-demo",
      date: "2026-11-08",
      title: "Example Sunday set",
      titleEdited: true,
      service: "English Service",
      language: "en",
      leader: "Pastor Woori",
      leaderNote: "",
      songs: [
        { id: "amazing-grace", key: "G", note: "" },
        { id: "holy-holy-holy", key: "D", note: "" }
      ]
    }]));
  });
  await page.goto("/index.html?meet=twosong#/worship/setlists/preview-demo");
  await page.getByRole("button", { name: "Play set" }).click();
  await expect(page.locator("#wo-play-title")).toHaveText("Amazing Grace");
  await expect(page.locator("#wo-play-prev")).toBeVisible();
  await expect(page.locator("#wo-play-next")).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#wo-play-title")).toHaveText("Holy, Holy, Holy");
  await expect(page.locator("#wo-play-key")).toHaveText("Key: D");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Prev", exact: true }).click();
  await expect(page.locator("#wo-play-title")).toHaveText("Amazing Grace");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Numbers" }).click();
  await expect(page.locator("#wo-play .chord").first()).toHaveText(/^[1-7]/);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Lyrics only" }).click();
  await expect.poll(async function () {
    return page.locator("#wo-play .wch").first().evaluate(function (el) { return getComputedStyle(el).display; });
  }).toBe("none");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Lyrics only" }).click();
  const before = await page.evaluate(function () { return parseFloat(getComputedStyle(document.getElementById("wo-play")).getPropertyValue("--wo-fs")); });
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByRole("button", { name: "Larger text" }).click();
  const after = await page.evaluate(function () { return parseFloat(getComputedStyle(document.getElementById("wo-play")).getPropertyValue("--wo-fs")); });
  expect(after).toBeGreaterThan(before);
  await page.waitForTimeout(300);
  await page.locator("#wo-play-body").evaluate(function (el) { el.scrollTop = Math.max(80, el.scrollHeight / 3); });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.waitForTimeout(600);
  const fit = await columnReport(page);
  expect(fit.orphans).toEqual([]);
  if (fit.cols !== "1") expect(fit.wrapped).toEqual([]);
  const video = page.video();
  await context.close();
  await video.saveAs(dir + "/play-controls-demo.webm");
});
