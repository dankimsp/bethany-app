import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/worship-chords";
fs.mkdirSync(ART, { recursive: true });

async function boot(page) {
  await page.addInitScript(function () {
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
      teams: ["worship"]
    }));
    localStorage.setItem("bethany-teams", JSON.stringify(["worship"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.setItem("bethany-worship-numbers", "0");
    localStorage.setItem("bethany-worship-sets", JSON.stringify([{
      id: "audit-set",
      date: "2026-11-08",
      title: "Audit set",
      titleEdited: true,
      service: "English Service",
      language: "en",
      leader: "Daniel",
      leaderNote: "",
      songs: [{ id: "amazing-grace", key: "Em", note: "" }]
    }]));
  });
  await page.route("**/*script.google.com/**", function (route) { return route.abort(); });
  await page.route("**/sw.js*", function (route) { return route.abort(); });
}

test("chord spelling, keys, and artist names", async function ({ page }) {
  await boot(page);
  await page.goto("/index.html?audit=1#/worship/library");
  await page.waitForFunction(function () { return window.wo && wo.songs && wo.songs.length >= 9; });

  const report = await page.evaluate(function () {
    var wrongKeys = [];
    var rawNumbers = [];
    var parseErrors = [];
    var numberRe = /^(?:#|b)?[1-7](?:\b|[^A-Ga-g]|$)/;
    wo.songs.forEach(function (song) {
      if (song.errors && song.errors.length) parseErrors.push({ id: song.id, errors: song.errors });
      var written = woSharpKey(song.key);
      for (var semi = 0; semi < 12; semi++) {
        wo.semi = semi;
        var shown = woKeyFor(song);
        var flats = woFlatsFor(song, semi);
        var pc = (((woPc(song.key) + semi) % 12) + 12) % 12;
        var spell = (flats ? FLAT : SHARP)[pc] + (woIsMinor(song.key) ? "m" : "");
        if (shown !== spell) wrongKeys.push({ id: song.id, semi: semi, shown: shown, spell: spell });
        if (semi === 0 && shown !== written) wrongKeys.push({ id: song.id, semi: 0, shown: shown, written: written });
      }
      wo.semi = 0;
      woSetNumbers(false);
      song.sections.forEach(function (sec) {
        sec.lines.forEach(function (line) {
          line.forEach(function (seg) {
            if (!seg.c) return;
            var label = woLabel(seg.c, song);
            if (numberRe.test(label)) rawNumbers.push({ id: song.id, chord: seg.c, label: label });
          });
        });
      });
    });
    wo.semi = 0;
    woSetNumbers(false);
    var artists = woSplitArtists("Hillsong Young & Free");
    var mixed = woSplitArtists("Hillsong Young & Free, feat. Someone");
    var ft = woSplitArtists("Hillsong Young & Free ft. Someone");
    var g = woPc("G");
    return {
      songs: wo.songs.map(function (s) { return s.id + ":" + s.key; }),
      wrongKeys: wrongKeys,
      rawNumbers: rawNumbers,
      parseErrors: parseErrors,
      artists: artists,
      mixed: mixed,
      ft: ft,
      sharp: { Em: woSharpKey("Em"), Ab: woSharpKey("Ab"), Fsm: woSharpKey("F#m"), Bb: woSharpKey("Bb") },
      numbers: {
        c2: woNashville("C2", g),
        add9: woNashville("Dadd9", g),
        six: woNashville("Am6", g),
        nine: woNashville("C9", g),
        maj7: woNashville("Cmaj7", g),
        b5: woNashville("Bm7b5", g)
      },
      parsed: ["1dim", "1aug", "1add9", "1b5", "1+", "b5"].filter(function (ch) { return !woParseNum(ch); })
    };
  });

  expect(report.wrongKeys, JSON.stringify(report.wrongKeys)).toEqual([]);
  expect(report.rawNumbers, JSON.stringify(report.rawNumbers)).toEqual([]);
  expect(report.parseErrors, JSON.stringify(report.parseErrors)).toEqual([]);
  expect(report.artists).toEqual(["Hillsong Young & Free"]);
  expect(report.mixed).toEqual(["Hillsong Young & Free", "Someone"]);
  expect(report.ft).toEqual(["Hillsong Young & Free", "Someone"]);
  expect(report.sharp).toEqual({ Em: "Em", Ab: "Ab", Fsm: "F#m", Bb: "Bb" });
  expect(report.numbers).toEqual({ c2: "4(2)", add9: "5(9)", six: "2m6", nine: "4(9)", maj7: "4maj7", b5: "3m7b5" });
  expect(report.parsed, JSON.stringify(report.parsed)).toEqual([]);

  await page.goto("/index.html?audit=2#/worship/song/amazing-grace");
  await expect(page.locator("#wo-song h1")).toContainText("Amazing Grace");
  const raise = page.locator("#wo-song").getByRole("button", { name: "Raise key" });
  await raise.click();
  await raise.click();
  await raise.click();
  await expect(page.locator("#wo-song .wkeyname")).toHaveText("Bb");
  await expect(page.getByText("Key Bb")).toBeVisible();
  await page.screenshot({ path: ART + "/amazing-grace-bb-letters.png" });

  await page.locator("#wo-song").getByRole("button", { name: "More song actions" }).click();
  await page.getByRole("menuitem", { name: "Numbers" }).click();
  await expect(page.locator("#wo-song .wkeyname")).toHaveText("Bb");
  await page.screenshot({ path: ART + "/amazing-grace-bb-numbers.png" });

  await page.goto("/index.html?audit=3#/worship/song/nae-jureul-gakkai");
  await expect(page.locator("#wo-song h1")).toContainText("내 주를 가까이");
  await expect(page.locator("#wo-song .wkeyname")).toHaveText("G");
  await expect(page.locator("#wo-song .wo-chart")).toContainText("Em");
  await page.locator("#wo-song .wo-chart").getByText("Em", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: ART + "/nae-jureul-em-letters.png" });
  await page.locator("#wo-song").getByRole("button", { name: "More song actions" }).click();
  await page.getByRole("menuitem", { name: "Numbers" }).click();
  await expect(page.locator("#wo-song .wo-chart")).toContainText("6m");
  await page.screenshot({ path: ART + "/nae-jureul-6m-numbers.png" });

  await page.goto("/index.html?audit=4#/worship/setlists/audit-set");
  const setKey = page.locator("#wo-set .wkeyname");
  await setKey.evaluate(function (el) { el.scrollIntoView({ block: "center" }); });
  await expect(setKey).toHaveText("Em");
  await page.locator("#wo-set").getByRole("button", { name: "Raise key" }).click();
  await expect(setKey).toHaveText("Fm");
  await setKey.evaluate(function (el) { el.scrollIntoView({ block: "center" }); });
  await page.screenshot({ path: ART + "/setlist-em-to-fm.png" });

  await page.goto("/index.html?audit=5#/worship/song/amazing-grace");
  await expect(page.locator("#wo-song h1")).toContainText("Amazing Grace");
  await page.locator("#wo-song").getByRole("button", { name: "More song actions" }).click();
  await page.getByRole("menuitem", { name: "Reset" }).click();
  await expect(page.locator("#wo-song .wkeyname")).toHaveText("G");
  const verse3 = page.locator("#wo-song .wsec", { hasText: "Verse 3" });
  const verse4 = page.locator("#wo-song .wsec", { hasText: "Verse 4" });
  await expect(verse3).toBeVisible();
  await expect(verse4).toBeVisible();
  await expect(page.locator("#wo-song")).toContainText("dangers");
  await expect(page.locator("#wo-song")).toContainText("thousand");
  await verse3.evaluate(function (el) { el.scrollIntoView({ block: "start" }); });
  await page.screenshot({ path: "/opt/cursor/artifacts/hymn-dedupe/amazing-grace-verse-3.png" });
  await verse4.evaluate(function (el) { el.scrollIntoView({ block: "start" }); });
  await page.screenshot({ path: "/opt/cursor/artifacts/hymn-dedupe/amazing-grace-verse-4.png" });

  await page.goto("/index.html?audit=6#/worship/song/i-surrender-all");
  await expect(page.locator("#wo-song h1")).toContainText("I Surrender All");
  const surrender = await page.evaluate(function () {
    var song = wo.byId["i-surrender-all"];
    return { themes: song.themes, youtube: song.youtube };
  });
  expect(surrender.themes).toEqual(["Surrender", "Salvation", "Love"]);
  expect(surrender.youtube).toBe("https://www.youtube.com/watch?v=UMYCJt4xo1Q");
  await page.screenshot({ path: "/opt/cursor/artifacts/hymn-dedupe/i-surrender-all.png" });
});
