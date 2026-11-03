import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/nursery-signup";
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

async function boot(page, opts) {
  const localTeams = opts.local || [];
  const days = sundays(8);
  const state = { teams: (opts.server || []).slice(), rows: [] };
  if (opts.seed) state.rows.push({ sunday: days[0], status: "active" });
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
    localStorage.removeItem("bethany-nursery-roster");
  }, localTeams);
  await page.route("**/*script.google.com/**", async function (route) {
    const req = route.request();
    let body = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch (e) {}
    const url = new URL(req.url());
    url.searchParams.forEach(function (value, key) { if (body[key] == null) body[key] = value; });
    const action = String(body.action || "getSongs");
    const authed = body.idToken === "mock-token";
    const open = { listSongs: 1, getSongs: 1, get: 1, request: 1, feedback: 1 };
    let payload = { ok: false, status: 400, error: "action" };
    function roster() {
      return days.map(function (sunday) {
        const people = state.rows.filter(function (row) { return row.sunday === sunday && row.status === "active"; }).map(function () { return { name: "Daniel K.", isMe: true }; });
        return { sunday: sunday, goal: 2, count: people.length, people: people };
      });
    }
    if (!open[action] && !authed) payload = { ok: false, status: 401, error: "auth" };
    else if (action === "getProfile" || action === "saveProfile") {
      payload = { ok: true, status: 200, profile: { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", name: "Daniel Kim", teams: state.teams.slice(), newsletter: true, churchComms: true, reminders: true, lang: "en" } };
    } else if (action === "getNurseryRoster" || action === "addNurseryDates" || action === "cancelNurseryDate") {
      if (state.teams.indexOf("nursery") < 0) payload = { ok: false, status: 403, error: "team" };
      else if (action === "addNurseryDates") {
        let raw = body.sundays;
        if (typeof raw === "string") {
          try { raw = JSON.parse(raw); } catch (e) { raw = String(raw).split(","); }
        }
        if (!Array.isArray(raw) || !raw.length) payload = { ok: false, status: 400, error: "fields" };
        else {
          const failed = [];
          let added = 0;
          raw.forEach(function (item) {
            if (days.indexOf(item) < 0) { failed.push(item); return; }
            if (!state.rows.some(function (row) { return row.sunday === item && row.status === "active"; })) {
              state.rows.push({ sunday: item, status: "active" });
              added++;
            }
          });
          payload = { ok: true, status: 200, added: added, failed: failed, roster: roster() };
        }
      } else if (action === "cancelNurseryDate") {
        state.rows.forEach(function (row) { if (row.sunday === body.sunday) row.status = "cancelled"; });
        payload = { ok: true, status: 200, roster: roster() };
      } else payload = { ok: true, status: 200, roster: roster() };
    } else if (action === "getMyServing") {
      const mine = state.teams.indexOf("nursery") < 0 ? [] : roster().filter(function (day) { return day.people.some(function (p) { return p.isMe; }); });
      payload = {
        ok: true,
        status: 200,
        nursery: state.teams.indexOf("nursery") < 0 ? null : {
          next: mine[0] ? { sunday: mine[0].sunday, with: [] } : null,
          upcoming: mine.map(function (day) { return { sunday: day.sunday, with: [] }; })
        },
        worship: null
      };
    } else if (action === "verifyTeamCode") {
      if (body.team === "nursery" && body.code) {
        if (state.teams.indexOf("nursery") < 0) state.teams.push("nursery");
        payload = { ok: true, status: 200, team: "nursery" };
      } else payload = { ok: false, status: 401, error: "code" };
    } else if (action === "getSignups") payload = { ok: true, status: 200, kind: body.kind || "", signups: [] };
    else if (action === "addSignup") payload = body.kind === "nursery" ? { ok: false, status: 400, error: "roster" } : { ok: true, status: 200, signups: [] };
    else if (action === "getSongs" || action === "listSongs") payload = { ok: true, status: 200, songs: [], done: true };
    const callback = url.searchParams.get("callback") || "";
    const json = JSON.stringify(payload);
    const wrapped = /^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback);
    await route.fulfill({
      status: 200,
      contentType: wrapped ? "application/javascript" : "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: wrapped ? callback + "(" + json + ")" : json
    });
  });
  return state;
}

test("stale local nursery membership is sent to the team code, then signup works", async function ({ page }) {
  const errors = [];
  page.on("pageerror", function (err) { errors.push(err.message); });
  await boot(page, { local: ["nursery"], server: [] });
  await page.goto("/index.html?fix=1#/ministry/nursery");
  await expect(page).toHaveURL(/team-code\?team=nursery/);
  await expect(page.locator("#s-team-code")).toBeVisible();
  await expect(page.getByText("Couldn't load the roster")).toHaveCount(0);
  await page.screenshot({ path: ART + "/after-team-code.png" });

  await page.locator("#team-code-input").fill("fixture");
  await page.locator("#team-form button[type=submit]").click();
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  await expect(page.getByText("You're on 0 Sundays")).toBeVisible();
  await page.locator("#nursery-pick").click();
  const chips = page.locator("#pick-grid .sun-chip:not([disabled])");
  await chips.nth(0).click();
  await chips.nth(1).click();
  await expect(page.locator("#pick-go")).toHaveText("Confirm 2 Sundays");
  await page.locator("#pick-go").click();
  await expect(page.getByText("You're on 2 Sundays")).toBeVisible();
  await expect(page.locator("#roster-list")).toContainText("You");
  await page.screenshot({ path: ART + "/after-roster.png" });
  expect(errors).toEqual([]);
});

test("nursery paths for a member the server already knows", async function ({ page }) {
  const errors = [];
  page.on("pageerror", function (err) { errors.push(err.message); });
  await boot(page, { local: ["nursery"], server: ["nursery"], seed: true });
  await page.goto("/index.html?paths=1#/ministries");
  await page.locator("#ministry-list button", { hasText: "Nursery" }).click();
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  await expect(page.locator("#nursery-pick")).toBeVisible();

  await page.goto("/index.html?paths=2#/signup?kind=nursery");
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  await expect(page.locator("#s-signup")).toBeHidden();

  await page.goto("/index.html?paths=3#/team-code?team=nursery");
  await expect(page.locator("#s-team-code")).toBeVisible();
  await expect(page.locator("#team-code-input")).toBeVisible();

  await page.goto("/index.html?paths=4#/home");
  await expect(page.locator("#home-serving")).toContainText("You're serving this Sunday");
  await page.locator("#home-roster").click();
  await expect(page).toHaveURL(/#\/ministry\/nursery/);

  await page.goto("/index.html?paths=5#/more");
  await expect(page.locator("#more-serving")).toContainText("Nursery");
  await page.locator("#more-serving a").first().click();
  await expect(page).toHaveURL(/#\/ministry\/nursery/);
  expect(errors).toEqual([]);
});

test("service worker precache includes the nursery script", async function ({ page }) {
  await page.goto("/sw.js");
  const text = await page.locator("body").innerText();
  expect(text).toContain('var CACHE = "bethany-worship-v33"');
  expect(text).toContain('"js/more.js"');
  const more = await page.request.get("/js/more.js?v=33");
  expect(more.status()).toBe(200);
  expect(more.headers()["content-type"] || "").toContain("javascript");
});
