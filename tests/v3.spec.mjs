import { test, expect } from "@playwright/test";

async function mockSignedIn(page, user) {
  await page.addInitScript((u) => {
    window.BETHANY_MOCK_AUTH = u;
    var profile = { uid: u.uid, email: u.email, name: u.displayName || "", provider: u.provider, teams: u.teams || [], rosterId: "", newsletter: true, churchComms: true, reminders: true, lang: "en" };
    localStorage.setItem("bethany-profile", JSON.stringify(profile));
    localStorage.setItem("bethany-teams", JSON.stringify(profile.teams));
    if (!u.displayName) localStorage.setItem("bethany-need-name", "1");
  }, user);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*script.google.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "soon" }) }));
});

test("sign-in welcome, create, and name", async ({ page }) => {
  await page.addInitScript(() => { window.BETHANY_MOCK_AUTH = null; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/signin");
  await expect(page.locator("#s-signin h1")).toContainText("Bethany Church");
  await expect(page.locator(".nav")).toBeHidden();
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/signin-welcome.png" });
  await page.locator("a[href='#/create']").click();
  await expect(page.locator("#s-create")).toBeVisible();
  await expect(page.locator("#create-form")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/signin-create.png" });
});

test("name step", async ({ page }) => {
  await page.addInitScript(() => {
    window.BETHANY_MOCK_AUTH = { uid: "u-new", email: "grace@example.com", displayName: "", provider: "password", teams: [] };
    localStorage.setItem("bethany-need-name", "1");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/name");
  await expect(page.locator("#s-name")).toBeVisible();
  await page.locator("#name-first").fill("Grace");
  await page.locator("#name-last").fill("Lee");
  await expect(page.locator("#name-preview")).toHaveText("Grace Lee");
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/signin-name.png" });
});

test("member phone screens", async ({ page }) => {
  await mockSignedIn(page, { uid: "u1", email: "grace.lee@example.com", displayName: "Grace Lee", provider: "google.com", teams: ["worship"] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/home");
  await expect(page.locator("#home-hero")).toBeVisible();
  await expect(page.locator("#home-hero")).not.toContainText("in 2 days");
  await expect(page.locator("#greet")).toContainText("Grace");
  await expect(page.locator("#home-ministry")).toContainText("Worship Team");
  await expect(page.locator("#home-ministry")).toContainText("Chord sheets");
  await expect(page.locator("#home-ministry .min-row")).toHaveCount(3);
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/home-phone.png" });
  await page.goto("/#/ministries");
  await expect(page.locator("#ministry-list")).toContainText("Worship");
  await expect(page.locator("#ministry-list")).toContainText("Nursery");
  await expect(page.locator("#ministry-list")).toContainText("Food Kitchen");
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/ministries-phone.png" });
  await page.evaluate(() => {
    localStorage.setItem("bethany-teams", JSON.stringify(["nursery"]));
    var p = JSON.parse(localStorage.getItem("bethany-profile") || "{}");
    p.teams = ["nursery"];
    localStorage.setItem("bethany-profile", JSON.stringify(p));
  });
  await page.goto("/#/ministry/nursery");
  await expect(page.locator("#ministry-head")).toContainText("Nursery");
  await expect(page.locator("#my-tools")).toContainText("Nursery");
  await expect(page.locator("#my-tools")).not.toContainText("Chord sheets");
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/nursery.png" });
  await page.goto("/#/events/thanks-2026");
  await expect(page.locator("#event-title")).toContainText("Thanksgiving");
  await expect(page.locator("#event-google")).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(page.locator("#event-ics")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/event-detail.png" });
  await page.evaluate(() => { localStorage.setItem("bethany-teams", JSON.stringify(["worship"])); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/worship/library");
  await page.locator("#wo-list .wopen").first().click();
  await page.getByRole("button", { name: /^Play/ }).click();
  const clipped = await page.evaluate(() => {
    var bar = document.getElementById("wo-play-bar").getBoundingClientRect();
    var exit = document.getElementById("wo-play-exit").getBoundingClientRect();
    var tools = document.getElementById("wo-play-tools").getBoundingClientRect();
    var exitOk = exit.left >= bar.left - 1 && exit.right <= bar.right + 1 && exit.width > 20;
    var buttons = [].map.call(document.querySelectorAll("#wo-play-tools .wmini"), function (b) {
      var r = b.getBoundingClientRect();
      return { t: b.textContent, w: r.width, cut: r.width > 0 && r.right > tools.right + 2 && r.left < tools.right - 8 };
    });
    return { exitOk: exitOk, buttons: buttons };
  });
  if (!clipped.exitOk) throw new Error("Exit clipped " + JSON.stringify(clipped));
  await page.goto("/#/more");
  await expect(page.locator("#acct-email")).toHaveText("grace.lee@example.com");
  await expect(page.locator("#pref-news")).toHaveClass(/on/);
  await expect(page.locator("#pref-church")).toHaveClass(/on/);
  await expect(page.locator("#pref-remind")).toHaveClass(/on/);
  await expect(page.locator("#acct-teams")).toContainText("Join with a code");
  await expect(page.locator("#s-more")).not.toContainText("Serve links");
  const langBox = await page.locator("#acct-en").boundingBox();
  const langLabel = await page.locator("#s-more .lang-row .tt").boundingBox();
  expect(langBox.y).toBeGreaterThan(langLabel.y + langLabel.height - 4);
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/more-account.png" });
  await page.locator("#sign-out").scrollIntoViewIfNeeded();
  const gap = await page.evaluate(() => {
    var nav = document.querySelector(".nav").getBoundingClientRect();
    var btn = document.getElementById("sign-out").getBoundingClientRect();
    return nav.top - btn.bottom;
  });
  expect(gap).toBeGreaterThan(8);
});

test("tablet home, library, and play", async ({ page }) => {
  await mockSignedIn(page, { uid: "u1", email: "grace.lee@example.com", displayName: "Grace Lee", provider: "google.com", teams: ["worship"] });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/#/home");
  await expect(page.locator(".nav")).toBeVisible();
  const navBox = await page.locator(".nav").boundingBox();
  expect(navBox.height).toBeGreaterThan(navBox.width);
  const mark = await page.locator(".nav .mark img").boundingBox();
  expect(mark.width).toBeGreaterThan(36);
  expect(mark.height).toBeGreaterThan(36);
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/tablet-home-portrait.png" });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/tablet-home-landscape.png" });
  await page.goto("/#/worship/library");
  await page.evaluate(() => { var n = document.getElementById("wo-private-msg"); if (n) n.hidden = true; });
  await expect(page.locator("#wo-lib")).toBeVisible();
  await expect(page.locator("#wo-song")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/tablet-library.png" });
  await page.locator("#wo-list .wopen").first().click();
  await page.getByRole("button", { name: /^Play/ }).click();
  await expect(page.locator("#wo-play-exit")).toBeVisible();
  const cols = await page.locator("#wo-play-body").evaluate((el) => getComputedStyle(el).getPropertyValue("--wo-cols") || el.style.getPropertyValue("--wo-cols"));
  expect(Number(cols)).toBeGreaterThan(1);
  await page.screenshot({ path: "/opt/cursor/artifacts/v3/tablet-play.png" });
});
