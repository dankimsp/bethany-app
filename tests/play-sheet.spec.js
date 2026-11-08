import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/play-sheets";
fs.mkdirSync(ART, { recursive: true });

const DENSE = "{title: 10,000 Reasons (Bless the Lord)}\n{key: G}\n{start_of_chorus: Chorus}\n[C]Bless the [G]Lord, O my [D/F#]soul, [Em]O my soul,\n[G]Worship His [Gsus4]holy [D]name.\n[C]Sing like [Em]never before, [D]O my [Em]soul.\nI'll [C]worship Your [D]holy [C/G]name. [G]\n{end_of_chorus}\n{start_of_verse: Verse 1}\n[C]The sun comes [G]up, it's a new [D]day [Em]dawning;\n[G]It's time to [Gsus4]sing Your [D]song again.\n[C]Whatever may [G]pass, and whatever lies [Em]before me,\n[C2]Let me be [G]singing when the [Dsus4]evening [D]comes. [G][Gsus4][G]\n{end_of_verse}\n{start_of_verse: Verse 2}\n[C]You're rich in [G]love, and You're [D]slow to [Em]anger.\n[C]Your name is [G]great, and Your [D]heart is [Em]kind.\n[C]For all Your [G]goodness, I will [D]keep on [Em]singing;\n[C2]Ten thousand [G]reasons for my [Dsus4]heart [D]to [G]find. [Gsus4][G]\n{end_of_verse}\n";

const SIZES = [
  [390, 844],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1280, 800]
];

async function boot(page) {
  await page.addInitScript(function () {
    window.BETHANY_MOCK_AUTH = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", displayName: "Daniel Kim", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", provider: "google.com", lang: "en", teams: ["worship"] }));
    localStorage.setItem("bethany-teams", JSON.stringify(["worship"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.removeItem("bethany-worship-play-size");
    localStorage.setItem("bethany-worship-sets", JSON.stringify([{
      id: "sheet-demo",
      date: "2026-11-08",
      title: "EM Setlist - Nov 8 - Pastor Woori",
      titleEdited: true,
      service: "English Service",
      language: "en",
      leader: "Pastor Woori",
      leaderNote: "Do not show this note",
      songs: [{ id: "amazing-grace", key: "G", note: "" }]
    }]));
  });
  await page.route("**/*script.google.com/**", function (route) { return route.abort(); });
  await page.route("**/sw.js*", function (route) { return route.abort(); });
}

async function openDense(page) {
  await page.goto("/index.html?sheet=1#/worship/library");
  await page.waitForFunction(function () { return window.woParseCho && window.woRenderPlay; });
  await page.evaluate(function (cho) {
    var song = woParseCho(cho, "ten-thousand-reasons");
    wo.byId[song.id] = song;
    wo.songs.push(song);
    wo.cur = song;
    wo.playList = [{ song: song, key: "G" }];
    wo.playIndex = 0;
    document.getElementById("wo-play").hidden = false;
    document.body.classList.add("wo-playing");
    woRenderPlay();
  }, DENSE);
  await page.waitForTimeout(350);
}

async function collisions(page) {
  return page.evaluate(function () {
    function hit(a, b) {
      var x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return x > 3 && y > 3;
    }
    var chords = Array.from(document.querySelectorAll("#wo-play-body .chord"));
    var lyrics = Array.from(document.querySelectorAll("#wo-play-body .wseg > span:last-child"));
    var bad = [];
    chords.forEach(function (chord, i) {
      var cr = chord.getBoundingClientRect();
      var seg = chord.parentElement && chord.parentElement.parentElement;
      chords.slice(i + 1).forEach(function (other) {
        if (hit(cr, other.getBoundingClientRect())) bad.push(chord.textContent + " x " + other.textContent);
      });
      lyrics.forEach(function (ly) {
        if (seg && seg.contains(ly)) return;
        if (!ly.textContent.replace(/\s/g, "")) return;
        if (hit(cr, ly.getBoundingClientRect())) bad.push(chord.textContent + " on " + ly.textContent.trim().slice(0, 18));
      });
    });
    var play = document.getElementById("wo-play");
    var fs = parseFloat(getComputedStyle(play).getPropertyValue("--wo-fs")) || 16;
    var minGap = fs * 0.5;
    var tight = [];
    document.querySelectorAll("#wo-play-body .wline").forEach(function (line) {
      var row = Array.from(line.querySelectorAll(".chord")).map(function (el) {
        var r = el.getBoundingClientRect();
        return { t: el.textContent.replace(/\uFE0E/g, ""), left: r.left, right: r.right };
      }).sort(function (a, b) { return a.left - b.left; });
      for (var n = 1; n < row.length; n++) {
        var gap = row[n].left - row[n - 1].right;
        if (gap < minGap - 1) tight.push(row[n - 1].t + " | " + row[n].t + " (" + Math.round(gap) + "px)");
      }
    });
    var lyric = document.querySelector("#wo-play-body .wline");
    var chord = document.querySelector("#wo-play-body .chord");
    var acc = document.querySelector("#wo-play .wo-acc");
    var kern = null;
    if (acc && acc.previousElementSibling) {
      var ar = acc.getBoundingClientRect();
      var rr = acc.previousElementSibling.getBoundingClientRect();
      kern = Math.round((ar.left - rr.right) * 10) / 10;
    }
    return {
      bad: bad.slice(0, 8),
      tight: tight.slice(0, 8),
      count: bad.length + tight.length,
      lyricSize: lyric ? parseFloat(getComputedStyle(lyric).fontSize) : 0,
      chordSize: chord ? parseFloat(getComputedStyle(chord).fontSize) : 0,
      hl: getComputedStyle(chord).backgroundColor,
      light: play.classList.contains("wo-light"),
      sheet: document.getElementById("wo-play-body").textContent.replace(/\uFE0E/g, "").replace(/\s+/g, " "),
      kern: kern
    };
  });
}

test("play sheets keep chords off the lyrics at every viewport", async function ({ page }) {
  await boot(page);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/index.html?sheet=reset#/worship/library");
    await page.evaluate(function () {
      localStorage.removeItem("bethany-worship-play-hl");
      localStorage.removeItem("bethany-worship-play-theme");
    });
    await openDense(page);
    const plain = await collisions(page);
    expect(plain.count, w + "x" + h + " " + JSON.stringify(plain.bad) + " " + JSON.stringify(plain.tight)).toBe(0);
    expect(plain.light).toBe(true);
    expect(plain.chordSize).toBeGreaterThanOrEqual(plain.lyricSize * 0.9);
    expect(plain.hl).toBe("rgba(0, 0, 0, 0)");
    expect(plain.sheet).toContain("evening");
    expect(plain.sheet).not.toContain("As I follow");
    expect(plain.sheet).not.toMatch(/n\s+ing/);
    expect(plain.kern).toBeLessThan(1.5);
    const wordGap = await page.evaluate(function () {
      var fs = parseFloat(getComputedStyle(document.getElementById("wo-play")).getPropertyValue("--wo-fs")) || 16;
      var lyrics = Array.from(document.querySelectorAll("#wo-play-body .wseg > span:last-child"));
      var holy = lyrics.filter(function (el) { return el.textContent.replace(/\s/g, "") === "holy"; })[0];
      var name = lyrics.filter(function (el) { return /^name/.test(el.textContent.trim()); })[0];
      var gap = name.getBoundingClientRect().left - holy.getBoundingClientRect().right;
      return { gap: gap, limit: fs * 1.4 };
    });
    expect(wordGap.gap).toBeGreaterThan(0);
    expect(wordGap.gap).toBeLessThan(wordGap.limit);
    await expect(page.locator("#wo-play .wsec").filter({ hasText: "VERSE 1" }).first()).toBeVisible();
    await expect(page.locator("#wo-play .wsec-role")).toHaveCount(0);
    await page.screenshot({ path: ART + "/light-off-" + w + "x" + h + ".png", fullPage: false });
    await page.getByRole("button", { name: "Highlight" }).click();
    await page.waitForTimeout(200);
    const on = await collisions(page);
    expect(on.count, "hl " + w + "x" + h + " " + JSON.stringify(on.bad)).toBe(0);
    expect(on.hl).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: ART + "/light-on-" + w + "x" + h + ".png" });
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.waitForTimeout(150);
    await expect(page.locator("#wo-play")).not.toHaveClass(/wo-light/);
    const dark = await collisions(page);
    expect(dark.count, "dark " + w + "x" + h + " " + JSON.stringify(dark.bad)).toBe(0);
    await page.screenshot({ path: ART + "/dark-on-" + w + "x" + h + ".png" });
    await page.getByRole("button", { name: "Highlight" }).click();
    await page.waitForTimeout(150);
    const darkOff = await collisions(page);
    expect(darkOff.count, "dark off " + w + "x" + h).toBe(0);
    expect(darkOff.hl).toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: ART + "/dark-off-" + w + "x" + h + ".png" });
    await page.evaluate(function () { woExitPlay(); });
  }
  await page.evaluate(function () {
    localStorage.setItem("bethany-worship-play-theme", "dark");
    localStorage.setItem("bethany-worship-play-hl", "1");
  });
  await page.reload();
  await openDense(page);
  await expect(page.locator("#wo-play")).not.toHaveClass(/wo-light/);
  await expect(page.locator("#wo-play")).toHaveClass(/wo-hl/);
  await page.getByRole("button", { name: "Numbers" }).click();
  await page.waitForTimeout(400);
  await expect(page.locator("#wo-play .chord").first()).toHaveText(/^[1-7]/);
  const numbered = await collisions(page);
    expect(numbered.bad).toEqual([]);
  await page.getByRole("button", { name: "Lyrics only" }).click();
  await expect.poll(async function () {
    return page.locator("#wo-play .wch").first().evaluate(function (el) { return getComputedStyle(el).display; });
  }).toBe("none");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByRole("button", { name: "Smaller text" }).click();
});

test("setlist actions have room and the leader note is gone", async function ({ page }) {
  await boot(page);
  for (const [w, h] of [[390, 844], [768, 1024], [820, 1180]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/index.html?sets=1#/worship/setlists");
    await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Leader note");
    await expect(page.locator("#wo-leader")).toHaveCount(0);
    const boxes = await page.locator("#wo-sets-list .wtools .wmini").evaluateAll(function (nodes) {
      return nodes.map(function (el) {
        var r = el.getBoundingClientRect();
        return { t: el.textContent.trim(), x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height };
      });
    });
    expect(boxes.map(function (b) { return b.t; })).toEqual(["Open", "Play", "Share", "Delete"]);
    for (var i = 0; i < boxes.length; i++) {
      expect(boxes[i].w).toBeGreaterThan(44);
      expect(boxes[i].h).toBeGreaterThanOrEqual(44);
      for (var j = i + 1; j < boxes.length; j++) {
        var x = Math.min(boxes[i].r, boxes[j].r) - Math.max(boxes[i].x, boxes[j].x);
        var y = Math.min(boxes[i].b, boxes[j].b) - Math.max(boxes[i].y, boxes[j].y);
        expect(x > 1 && y > 1, boxes[i].t + " overlaps " + boxes[j].t).toBe(false);
      }
    }
    await page.screenshot({ path: ART + "/setlist-" + w + "x" + h + ".png", fullPage: true });
  }
});
