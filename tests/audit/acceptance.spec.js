/**
 * Acceptance checks for the usability audit.
 * These describe the behavior Daniel asked for. They fail on the current app
 * on purpose. Do not weaken them to make the suite green; the product change
 * waits on design approval.
 *
 * Touch input is Chromium CDP Input.dispatchTouchEvent, not a mouse wheel.
 */
import { test, expect } from "@playwright/test";

async function boot(page) {
  await page.addInitScript(() => {
    window.BETHANY_MOCK_AUTH = {
      uid: "uid-audit",
      email: "audit.member@bethanychurch.test",
      displayName: "Audit Member",
      providers: ["google.com"]
    };
    localStorage.setItem("bethany-profile", JSON.stringify({
      name: "Audit Member",
      email: "audit.member@bethanychurch.test",
      provider: "google.com",
      lang: "en",
      teams: ["worship", "nursery"]
    }));
    localStorage.setItem("bethany-teams", JSON.stringify(["worship", "nursery"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
    localStorage.removeItem("bethany-worship-sync");
  });
  await page.route("**/*script.google.com/**", (route) => route.abort());
  await page.route("**/sw.js*", (route) => route.abort());
}

async function touchScroll(page, x, y, distance) {
  const client = await page.context().newCDPSession(page);
  const steps = 8;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
  for (let i = 1; i <= steps; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - distance * i / steps, id: 0 }]
    });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
}

test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

test("tablet pages still touch-scroll after songs load", async ({ page }) => {
  await boot(page);
  await page.goto("/index.html#/events");
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => {
    const last = document.querySelector("#special-list .ev-img:last-child, #s-events .ev-img:last-child");
    const rect = last ? last.getBoundingClientRect() : { bottom: 0 };
    return {
      split: document.body.classList.contains("wo-split"),
      scrollY: window.scrollY,
      bottom: rect.bottom,
      vh: window.innerHeight
    };
  });
  expect(before.split).toBe(false);
  expect(before.bottom).toBeGreaterThan(before.vh + 40);
  await touchScroll(page, 420, 760, 480);
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBeGreaterThan(40);
});

test("library entry says this Sunday's setlist and play mode can change columns and key", async ({ page }) => {
  await boot(page);
  await page.goto("/index.html#/worship/library");
  await expect(page.locator("#wo-this-sunday")).toHaveText(/This Sunday.s Setlist/i);
  await page.goto("/index.html#/worship/song/amazing-grace");
  await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#wo-play")).toBeVisible();
  await expect(page.locator("#wo-play").getByRole("button", { name: "1 column" })).toBeVisible();
  await expect(page.locator("#wo-play").getByRole("button", { name: "2 columns" })).toBeVisible();
  await expect(page.locator("#wo-col-3")).toBeHidden();
  await expect(page.locator("#wo-play").getByRole("button", { name: "Lower key" })).toBeVisible();
  await expect(page.locator("#wo-play").getByRole("button", { name: "Raise key" })).toBeVisible();
  await expect(page.locator(".wo-edge")).toHaveCount(0);
});
