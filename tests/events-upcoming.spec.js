import { test, expect } from "@playwright/test";
import fs from "fs";

const ART = "/opt/cursor/artifacts/events-qa";
fs.mkdirSync(ART, { recursive: true });

const SIGNUP = "https://docs.google.com/spreadsheets/d/17vkzX-JvV0vPn_IsCQhingzVtwma-oo3aOrSyBWUKLQ/edit?usp=sharing";

const EN = [
  "Joint KM & EM Worship",
  "Thanksgiving Sunday Feast — Bethany Church Community Only",
  "EM Christmas Party — EM",
  "Joint KM & EM Christmas Day Service — Open to the Community",
  "KM & EM New Year\u2019s Eve Service",
  "Thanksgiving EM Lunch Signup — EM Only"
];

const KO = [
  "KM·EM 연합예배",
  "추수감사주일 감사 잔치 — 베다니 교회 공동체 대상",
  "EM 성탄 파티",
  "KM·EM 성탄절 연합예배 — 지역사회 누구나 환영",
  "KM·EM 송구영신예배",
  "EM 추수감사절 점심 신청 — EM 성도 대상"
];

async function boot(page, lang) {
  await page.addInitScript(function (code) {
    window.BETHANY_MOCK_AUTH = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", displayName: "Daniel Kim", provider: "google.com", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", provider: "google.com", lang: code, teams: [] }));
    localStorage.setItem("bethany-teams", JSON.stringify([]));
    localStorage.setItem("bethany-lang", code);
    localStorage.removeItem("bethany-need-name");
  }, lang);
  await page.context().route("**/*script.google.com/**", function (route) {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback") || "";
    const body = JSON.stringify({ ok: true, status: 200, songs: [], done: true });
    const wrapped = /^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback);
    return route.fulfill({
      status: 200,
      contentType: wrapped ? "application/javascript" : "application/json",
      body: wrapped ? callback + "(" + body + ")" : body
    });
  });
  await page.context().route("**/spreadsheets/**", function (route) {
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>signup</title>" });
  });
}

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", function (err) { errors.push(String(err && err.stack || err)); });
  page.on("console", function (msg) {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function noOverflow(page) {
  const box = await page.evaluate(function () {
    return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
  });
  expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
}

test("six upcoming events render in order with TBD labels", async function ({ page }) {
  const errors = watchErrors(page);
  await boot(page, "en");
  await page.clock.install({ time: new Date("2026-11-08T20:30:00Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/events");
  await expect(page.locator("#s-events")).toBeVisible();
  const titles = page.locator("#special-list article h3");
  await expect(titles).toHaveText(EN);
  const list = page.locator("#special-list");
  await expect(list).toContainText("11:00 AM");
  await expect(list).toContainText("Time TBD");
  await expect(list).toContainText("Date TBD");
  await expect(list).not.toContainText("NaN");
  await expect(list).not.toContainText("Invalid Date");
  const lunch = page.locator("#special-list article", { hasText: "Thanksgiving EM Lunch" });
  await expect(lunch.locator(".date")).toContainText("TBD");
  await expect(lunch.locator("a.ev-link")).toHaveAttribute("href", SIGNUP);
  await expect(lunch.locator("a.ev-link")).toHaveAttribute("target", "_blank");
  await expect(lunch.locator("a.ev-link")).toHaveAttribute("rel", /noopener/);
  await expect(lunch.getByRole("button", { name: "Add to calendar" })).toHaveCount(0);
  await expect(page.locator("#special-list article", { hasText: "Joint KM & EM Worship" }).getByRole("button", { name: "Add to calendar" })).toBeVisible();
  await expect(page.locator("#special-list article", { hasText: "EM Christmas Party" }).getByRole("button", { name: "Add to calendar" })).toHaveCount(0);
  await expect(page.locator("#special-list .tbd-head")).toHaveText("Date TBD");
  const order = await page.locator("#special-list > *").evaluateAll(function (nodes) {
    return nodes.map(function (node) { return node.className; });
  });
  expect(order.indexOf("tbd-head")).toBe(order.length - 2);
  await noOverflow(page);
  await page.screenshot({ path: ART + "/events-en-390.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("calendar file is timed only when date and time are both known", async function ({ page }) {
  await boot(page, "en");
  await page.clock.install({ time: new Date("2026-11-08T19:00:00Z") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/events/joint-worship-20261108");
  await expect(page.locator("#event-title")).toHaveText("Joint KM & EM Worship");
  await expect(page.locator("#event-time")).toHaveText("11:00 AM");
  await expect(page.locator("#event-google")).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(page.locator("#event-google")).toHaveAttribute("href", /20261108T110000/);
  await expect(page.locator("#event-ics")).toBeVisible();
  await expect(page.locator("#event-welcome")).toBeHidden();
  const ics = await page.evaluate(async function () {
    window.__blobs = [];
    var orig = URL.createObjectURL;
    URL.createObjectURL = function (blob) { window.__blobs.push(blob); return orig.call(URL, blob); };
    var joint = BETHANY_EVENTS.filter(function (ev) { return ev.id === "joint-worship-20261108"; })[0];
    var lunch = BETHANY_EVENTS.filter(function (ev) { return ev.id === "em-thanksgiving-lunch-signup"; })[0];
    var party = BETHANY_EVENTS.filter(function (ev) { return ev.id === "em-christmas-party-20261217"; })[0];
    icsFor(joint);
    var jointBody = await window.__blobs[0].text();
    var before = window.__blobs.length;
    icsFor(lunch);
    icsFor(party);
    return {
      joint: jointBody,
      extra: window.__blobs.length - before,
      lunchUrl: googleCalUrl(lunch),
      partyUrl: googleCalUrl(party),
      jointUrl: googleCalUrl(joint)
    };
  });
  expect(ics.joint).toContain("DTSTART;TZID=America/Los_Angeles:20261108T110000");
  expect(ics.joint).not.toContain("NaN");
  expect(ics.extra).toBe(0);
  expect(ics.lunchUrl).toBe("");
  expect(ics.partyUrl).toBe("");
  expect(ics.jointUrl).toContain("20261108T110000");
  await page.goto("/#/events/em-thanksgiving-lunch-signup");
  await expect(page.locator("#event-when")).toHaveText("Date TBD");
  await expect(page.locator("#event-time")).toHaveText("Time TBD");
  await expect(page.locator("#event-google")).toBeHidden();
  await expect(page.locator("#event-ics")).toBeHidden();
  await expect(page.locator("#event-cal-label")).toBeHidden();
  const link = page.locator("#event-note a.ev-link");
  await expect(link).toHaveAttribute("href", SIGNUP);
  await expect(link).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(SIGNUP);
  await popup.close();
  await page.goto("/#/events/joint-christmas-20261225");
  await expect(page.locator("#event-time")).toHaveText("Time TBD");
  await expect(page.locator("#event-google")).toBeHidden();
  await expect(page.locator("#event-welcome")).toBeVisible();
  await page.screenshot({ path: ART + "/event-christmas-en-1280.png", fullPage: true });
});

test("Nov 8 stays on the service day and leaves the next Pacific day", async function ({ page }) {
  await boot(page, "en");
  await page.clock.install({ time: new Date("2026-11-08T23:30:00Z") });
  await page.goto("/#/events");
  await expect(page.locator("#special-list")).toContainText("Joint KM & EM Worship");
  await page.clock.setFixedTime(new Date("2026-11-09T08:30:00Z"));
  await page.reload();
  await expect(page.locator("#s-events")).toBeVisible();
  await expect(page.locator("#special-list")).not.toContainText("Joint KM & EM Worship");
  await expect(page.locator("#special-list article h3")).toHaveText(EN.slice(1));
  await expect(page.locator("#special-list")).toContainText("Thanksgiving EM Lunch");
});

test("Korean events list matches the English order", async function ({ page }) {
  const errors = watchErrors(page);
  await boot(page, "ko");
  await page.clock.install({ time: new Date("2026-11-08T20:30:00Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/events");
  await expect(page.locator("#special-list article h3")).toHaveText(KO);
  await expect(page.locator("#special-list")).toContainText("오전 11:00");
  await expect(page.locator("#special-list")).toContainText("시간 미정");
  await expect(page.locator("#special-list .tbd-head")).toHaveText("날짜 미정");
  await expect(page.locator("#special-list article", { hasText: "점심 신청" }).locator(".date")).toContainText("미정");
  await expect(page.locator("#special-list")).not.toContainText("NaN");
  const lunch = page.locator("#special-list article", { hasText: "점심 신청" });
  await expect(lunch.locator("a.ev-link")).toHaveAttribute("href", SIGNUP);
  await expect(lunch.getByRole("button", { name: "캘린더에 추가" })).toHaveCount(0);
  await expect(page.locator("#special-list article", { hasText: "연합예배" }).first().getByRole("button", { name: "캘린더에 추가" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: ART + "/events-ko-390.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: ART + "/events-ko-1280.png", fullPage: true });
  await page.goto("/#/events/em-thanksgiving-lunch-signup");
  await expect(page.locator("#event-when")).toHaveText("날짜 미정");
  await expect(page.locator("#event-time")).toHaveText("시간 미정");
  await expect(page.locator("#event-note a.ev-link")).toHaveAttribute("href", SIGNUP);
  expect(errors).toEqual([]);
});

test("English desktop events list", async function ({ page }) {
  const errors = watchErrors(page);
  await boot(page, "en");
  await page.clock.install({ time: new Date("2026-11-08T20:30:00Z") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/events");
  await expect(page.locator("#special-list article h3")).toHaveText(EN);
  await noOverflow(page);
  await page.setViewportSize({ width: 1280, height: 2200 });
  await page.screenshot({ path: ART + "/events-en-1280.png", fullPage: true });
  expect(errors).toEqual([]);
});
