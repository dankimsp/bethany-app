import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import net from "net";

const PORT = 4174;
const ART = "/opt/cursor/artifacts/bethany-review-v39";
const measured = [];
let server;

function portOpen(port) {
  return new Promise(function (resolve) {
    var socket = net.connect(port, "127.0.0.1", function () { socket.end(); resolve(true); });
    socket.on("error", function () { resolve(false); });
  });
}

test.beforeAll(async function () {
  fs.mkdirSync(ART, { recursive: true });
  server = spawn("python3", ["preview/serve.py", String(PORT)], { cwd: process.cwd(), stdio: "ignore" });
  for (var i = 0; i < 40; i++) {
    if (await portOpen(PORT)) return;
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  throw new Error("preview server did not start");
});

test.afterAll(function () {
  if (server) server.kill();
  fs.writeFileSync(ART + "/preview-geometry.json", JSON.stringify(measured, null, 2));
});

async function geometry(page) {
  return page.evaluate(function () {
    var bar = document.getElementById("preview-bar").getBoundingClientRect();
    var body = document.getElementById("wo-play-body").getBoundingClientRect();
    var blocks = document.querySelectorAll("#wo-play-body .wblock");
    var last = blocks[blocks.length - 1].getBoundingClientRect();
    var label = (blocks[blocks.length - 1].querySelector(".wsec") || {}).textContent || "";
    return {
      harness: document.getElementById("preview-bar").dataset.harness,
      cue: document.getElementById("preview-cue").textContent,
      tag: label.trim(),
      tagTop: Math.round(last.top),
      tagBottom: Math.round(last.bottom),
      bodyBottom: Math.round(body.bottom),
      barTop: Math.round(bar.top),
      barHeight: Math.round(bar.height),
      covered: last.bottom > bar.top + 1
    };
  });
}

async function openFit(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("http://127.0.0.1:" + PORT + "/?cue=" + w + "x" + h + "#/worship/song/amazing-grace", { waitUntil: "domcontentloaded" });
  await page.evaluate(function () { localStorage.removeItem("bethany-worship-play-size"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#wo-song").getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.waitForTimeout(300);
}

test("phone nav stays tappable under the collapsed preview cue", async function ({ page }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:" + PORT + "/?nav=1#/home", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#preview-cue")).toHaveText("Preview, example data");
  const hit = await page.evaluate(function () {
    var link = document.querySelector('a[data-nav="events"]');
    var rect = link.getBoundingClientRect();
    var el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    var nav = el && el.closest ? el.closest("a[data-nav]") : null;
    return nav ? nav.getAttribute("data-nav") : "";
  });
  expect(hit).toBe("events");
  await page.locator('a[data-nav="events"]').click();
  await expect(page).toHaveURL(/#\/events/);
  expect(await page.evaluate(function () { return localStorage.getItem("bethany-preview-role"); })).toBe("worship");
  await page.locator("#preview-cue").click();
  await expect(page.getByRole("button", { name: "Example worship member" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Not on the worship team" })).toBeVisible();
});

test("preview cue leaves the tag visible at phone and 768", async function ({ page }) {
  for (const size of [{ w: 390, h: 844, name: "390x844" }, { w: 768, h: 1024, name: "768x1024" }]) {
    await openFit(page, size.w, size.h);
    await expect(page.locator("#preview-cue")).toHaveText("Preview, example data");
    await expect(page.locator("#preview-bar")).toHaveAttribute("data-harness", "v39");
    await expect(page.getByRole("button", { name: "Example worship member" })).toBeHidden();
    const fit = await geometry(page);
    measured.push(Object.assign({ size: size.name, mode: "fit" }, fit));
    expect(fit.tag, JSON.stringify(fit)).toBe("Tag");
    expect(fit.covered, size.name + " fit " + JSON.stringify(fit)).toBe(false);
    expect(fit.tagBottom, size.name).toBeLessThanOrEqual(fit.bodyBottom + 1);
    expect(fit.bodyBottom, size.name).toBeLessThanOrEqual(fit.barTop + 1);
    await page.screenshot({ path: ART + "/package-fit-" + size.name + ".png" });
    await page.getByRole("button", { name: "Larger text" }).click();
    await page.getByRole("button", { name: "Larger text" }).click();
    await page.waitForTimeout(150);
    await page.locator("#wo-play-body").evaluate(function (el) { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    const larger = await geometry(page);
    measured.push(Object.assign({ size: size.name, mode: "larger" }, larger));
    expect(larger.covered, size.name + " larger " + JSON.stringify(larger)).toBe(false);
    expect(larger.tagBottom).toBeLessThanOrEqual(larger.bodyBottom + 1);
    expect(larger.bodyBottom).toBeLessThanOrEqual(larger.barTop + 1);
    await page.screenshot({ path: ART + "/package-fit-" + size.name + "-larger.png" });
    await page.locator("#preview-cue").click();
    await expect(page.getByRole("button", { name: "Example worship member" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not on the worship team" })).toBeVisible();
    const open = await geometry(page);
    measured.push(Object.assign({ size: size.name, mode: "switch-open" }, open));
    expect(open.covered, size.name + " switch " + JSON.stringify(open)).toBe(false);
    await page.getByRole("button", { name: "Exit" }).click();
  }
});
