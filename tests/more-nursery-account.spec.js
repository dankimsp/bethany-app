import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/more-nursery-account";
fs.mkdirSync(ART, { recursive: true });

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

function rosterFor(scene) {
  const days = sundays(8);
  return days.map(function (sunday, i) {
    if (scene === "serving" && i === 0) {
      return { sunday: sunday, goal: 2, count: 4, people: [
        { name: "Daniel K.", isMe: true },
        { name: "Grace L.", isMe: false },
        { name: "Joseph K.", isMe: false },
        { name: "Hannah P.", isMe: false }
      ] };
    }
    if (scene === "serving" && i === 1) {
      return { sunday: sunday, goal: 2, count: 1, people: [{ name: "Peter Y.", isMe: false }] };
    }
    if (scene === "serving" && i === 2) {
      return { sunday: sunday, goal: 2, count: 2, people: [
        { name: "Daniel K.", isMe: true },
        { name: "Sarah P.", isMe: false }
      ] };
    }
    if (scene === "next" && i === 0) {
      return { sunday: sunday, goal: 2, count: 2, people: [
        { name: "Grace L.", isMe: false },
        { name: "Joseph K.", isMe: false }
      ] };
    }
    if (scene === "next" && i === 2) {
      return { sunday: sunday, goal: 2, count: 1, people: [{ name: "Daniel K.", isMe: true }] };
    }
    return { sunday: sunday, goal: 2, count: 0, people: [] };
  });
}

async function boot(page, scene) {
  await page.addInitScript(function () {
    window.BETHANY_MOCK_AUTH = {
      uid: "uid-daniel",
      email: "daniel.kim@bethanychurch.test",
      displayName: "Daniel Kim",
      providers: ["google.com"]
    };
    var profile = {
      name: "Daniel Kim",
      email: "daniel.kim@bethanychurch.test",
      provider: "google.com",
      lang: "en",
      teams: ["nursery", "worship"],
      newsletter: true,
      churchComms: true,
      reminders: false
    };
    localStorage.setItem("bethany-profile", JSON.stringify(profile));
    localStorage.setItem("bethany-teams", JSON.stringify(["nursery", "worship"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
  });
  await page.route("**/*script.google.com/**", async function (route) {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
      return;
    }
    var body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    var urlAction = "";
    try { urlAction = new URL(route.request().url()).searchParams.get("action") || ""; } catch (e) {}
    var action = body.action || urlAction;
    var days = rosterFor(scene);
    var payload = { ok: true, status: 200 };
    if (action === "getProfile") {
      payload.profile = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", name: "Daniel Kim", teams: ["nursery", "worship"], newsletter: true, churchComms: true, reminders: false, lang: "en" };
    } else if (action === "getMyServing") {
      var mine = days.filter(function (d) { return d.people.some(function (p) { return p.isMe; }); });
      payload.nursery = {
        next: mine[0] ? { sunday: mine[0].sunday, with: mine[0].people.filter(function (p) { return !p.isMe; }).map(function (p) { return p.name; }) } : null,
        upcoming: mine.map(function (d) { return { sunday: d.sunday, with: d.people.filter(function (p) { return !p.isMe; }).map(function (p) { return p.name; }) }; })
      };
      payload.worship = { markedCount: 3 };
    } else if (action === "getNurseryRoster") {
      payload.roster = days;
    } else if (action === "addNurseryDates") {
      expect(body.idToken).toBe("mock-token");
      expect(Array.isArray(body.sundays)).toBeTruthy();
      payload.added = body.sundays.length;
      payload.failed = [];
      payload.roster = days;
    } else if (action === "cancelNurseryDate") {
      expect(body.idToken).toBe("mock-token");
      payload.roster = days;
    } else if (action === "saveProfile") {
      payload.profile = body;
    } else if (action === "getSongs" || action === "listSongs") {
      payload.songs = [];
      payload.done = true;
    }
    var callback = "";
    try { callback = new URL(route.request().url()).searchParams.get("callback") || ""; } catch (e) {}
    var json = JSON.stringify(payload);
    await route.fulfill({
      status: 200,
      contentType: callback ? "application/javascript" : "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: callback ? callback + "(" + json + ")" : json
    });
  });
  await page.route("**/sw.js*", function (route) { return route.abort(); });
}

test("more, account, and nursery roster", async function ({ page }) {
  page.setDefaultTimeout(8000);
  await boot(page, "serving");
  await page.goto("/index.html?scene=serving#/more");
  await expect(page.locator("#acct-email")).toHaveText("daniel.kim@bethanychurch.test");
  await expect(page.locator("#about-version")).toHaveText("Version 41");
  await expect(page.getByText("Prayer request")).toHaveCount(0);
  await expect(page.locator("#more-serving")).toContainText("Nursery · with Sarah P.");
  await expect(page.locator("#more-serving")).toContainText("Nursery · with Grace L., Joseph K., Hannah P.");
  await expect(page.locator("#more-serving")).toContainText("Worship availability");
  await page.screenshot({ path: ART + "/more-top-390.png" });
  await page.locator("#about-row").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ART + "/more-scrolled-390.png" });
  await page.locator("#notif-row").click();
  await expect(page.locator("#sheet-notif")).toBeVisible();
  await page.screenshot({ path: ART + "/notifications-390.png" });
  await page.locator("#sheet-notif [data-close='sheet-notif']").last().click();
  await page.locator("#feedback-link").click();
  await expect(page.locator("#fb-sheet")).toBeVisible();
  await expect(page.locator("#fb-title")).toHaveText("Send feedback");
  await page.locator("#fb-close").click();

  await page.locator("#account-row").click();
  await expect(page.locator("#account-email")).toHaveText("daniel.kim@bethanychurch.test");
  await expect(page.getByText("Not set up")).toBeVisible();
  await expect(page.locator(".nav")).toBeHidden();
  await page.screenshot({ path: ART + "/account-google-390.png" });
  await page.locator("#add-password").click();
  await expect(page.locator("#sheet-setpw")).toBeVisible();
  await expect(page.locator("#setpw-email")).toHaveText("daniel.kim@bethanychurch.test");
  await expect(page.locator("#sheet-setpw")).toContainText("At least 8 characters");
  await page.screenshot({ path: ART + "/set-password-390.png" });
  await page.locator("#sheet-setpw [data-i18n='sheetCancel']").click();
  await page.evaluate(function () {
    var user = window.bethanyUser();
    user.providers = ["google.com", "password"];
    window.paintAccountPage();
  });
  await expect(page.locator("#account-extra")).toContainText("Change password");
  await expect(page.locator("#account-methods")).toContainText("daniel.kim@bethanychurch.test");
  await page.screenshot({ path: ART + "/account-password-390.png" });

  await page.goto("/index.html?scene=serving#/ministry/nursery");
  await expect(page.getByText("You're on 2 Sundays")).toBeVisible();
  await expect(page.locator("#roster-list")).toContainText("Grace L.");
  await page.screenshot({ path: ART + "/nursery-roster-390.png" });
  await page.locator("#nursery-pick").click();
  await expect(page.locator("#sheet-pick")).toBeVisible();
  await page.locator("#pick-grid .sun-chip:not(.mine)").first().click();
  await expect(page.locator("#pick-go")).toHaveText("Confirm 1 Sunday");
  await page.screenshot({ path: ART + "/nursery-pick-390.png" });
  await page.locator("#sheet-pick .fb-scrim").dispatchEvent("click");
  await page.locator("[data-cant]").first().click();
  await expect(page.locator("#cancel-title")).toContainText("Can't make");
  await page.screenshot({ path: ART + "/nursery-cancel-390.png" });
  await page.locator("#cancel-yes").click();
  await expect(page.locator("#app-toast")).toContainText("Undo");
  await page.screenshot({ path: ART + "/nursery-undo-390.png" });
  await page.evaluate(function () { document.getElementById("app-toast").hidden = true; });

  await page.goto("/index.html?scene=serving#/home");
  await expect(page.locator("#home-serving")).toContainText("You're serving this Sunday");
  await expect(page.locator("#home-serving")).toContainText("10:00 AM");
  await page.screenshot({ path: ART + "/home-serving-390.png" });
});

test("home card when the next nursery Sunday is later", async function ({ page }) {
  await boot(page, "next");
  await page.goto("/index.html?scene=next#/home");
  await expect(page.locator("#home-serving")).toContainText("Your next nursery Sunday");
  await expect(page.locator("#home-serving")).toContainText("This Sunday:");
  await expect(page.locator("#home-serving")).not.toContainText("Pick Sundays");
  await expect(page.locator("#home-serving")).not.toContainText("Sunday, November");
  await page.screenshot({ path: ART + "/home-next-390.png" });
});
