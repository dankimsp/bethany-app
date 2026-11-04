import { test, expect } from "@playwright/test";

function roster() {
  const parts = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const start = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + ((7 - dow) % 7)));
  const sunday = start.toISOString().slice(0, 10);
  return [{ sunday: sunday, goal: 2, count: 2, people: [{ name: "Daniel K.", isMe: true }, { name: "Grace L.", isMe: false }] }];
}

test("cold #/ calls getNurseryRoster instead of returning with the card hidden", async function ({ page }) {
  const calls = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(function () {
    window.BETHANY_MOCK_AUTH = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", displayName: "Daniel Kim", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", provider: "google.com", lang: "en", teams: ["nursery"] }));
    localStorage.setItem("bethany-teams", JSON.stringify(["nursery"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.removeItem("bethany-nursery-roster");
  });
  await page.route("**/*script.google.com/**", async function (route) {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    const url = new URL(route.request().url());
    const action = body.action || url.searchParams.get("action") || "getSongs";
    calls.push(action);
    let payload = { ok: true, status: 200, songs: [], done: true, profile: { uid: "uid-daniel", name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", teams: ["nursery"] } };
    if (action === "getNurseryRoster") payload.roster = roster();
    if (action === "getMyServing") payload = { ok: true, status: 200, nursery: null, worship: null };
    const callback = url.searchParams.get("callback") || "";
    const json = JSON.stringify(payload);
    const wrapped = /^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback);
    await route.fulfill({ status: 200, contentType: wrapped ? "application/javascript" : "application/json", body: wrapped ? callback + "(" + json + ")" : json });
  });

  await page.goto("/index.html#/");
  await expect.poll(function () { return calls.filter(function (a) { return a === "getNurseryRoster"; }).length; }).toBeGreaterThan(0);
  expect(calls).not.toEqual(["getSongs"]);
  await expect(page.locator("#home-serving")).toBeVisible();
  await expect(page.locator("#home-serving")).toContainText("You're serving");
  const clear = await page.evaluate(function () {
    var card = document.querySelector("#home-serving").getBoundingClientRect();
    var nav = document.querySelector(".nav").getBoundingClientRect();
    return card.bottom <= nav.top;
  });
  expect(clear).toBe(true);

  const seen = calls.filter(function (a) { return a === "getNurseryRoster"; }).length;
  await page.reload();
  await expect.poll(function () { return calls.filter(function (a) { return a === "getNurseryRoster"; }).length; }).toBeGreaterThan(seen);
  await expect(page.locator("#home-serving")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 667 });
  const clearShort = await page.evaluate(function () {
    var card = document.querySelector("#home-serving").getBoundingClientRect();
    var nav = document.querySelector(".nav").getBoundingClientRect();
    return card.bottom <= nav.top && card.height > 40;
  });
  expect(clearShort).toBe(true);
  await page.screenshot({ path: "/opt/cursor/artifacts/responsive-qa/home-card-vs-nav-375.png" });
});
