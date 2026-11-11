import { test, expect } from "@playwright/test";

const EVENTS = [
  "joint-worship-20261108",
  "thanksgiving-sunday-20261122",
  "em-christmas-party-20261217",
  "joint-christmas-20261225",
  "new-years-20261231",
  "em-thanksgiving-lunch-signup"
];

function countable(url) {
  var path = "";
  try { path = new URL(url, "http://127.0.0.1").pathname.toLowerCase(); } catch (e) { return ""; }
  if (!path || path.indexOf("texture-rings") >= 0 || path.indexOf("logo-bethany") >= 0 || path.indexOf("/icon-") >= 0) return "";
  if (/\.(webp|jpe?g|png)$/.test(path) || /illus-[^/]+\.svg$/.test(path)) return path.split("/").pop();
  return "";
}

async function visiblePhotos(page) {
  const urls = await page.evaluate(function () {
    function shown(el) {
      if (!el || !el.getClientRects().length) return false;
      var cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      return true;
    }
    var found = [];
    document.querySelectorAll("img[src]").forEach(function (img) {
      if (shown(img)) found.push(img.currentSrc || img.src);
    });
    document.querySelectorAll("body *").forEach(function (el) {
      if (!shown(el)) return;
      var bg = getComputedStyle(el).backgroundImage || "";
      if (bg.indexOf("url(") < 0) return;
      var matches = bg.match(/url\((?:"|')?[^"')]+(?:"|')?\)/g) || [];
      matches.forEach(function (part) {
        found.push(part.replace(/^url\((?:"|')?/, "").replace(/(?:"|')?\)$/, ""));
      });
    });
    return found;
  });
  return urls.map(countable).filter(Boolean);
}

async function openApp(browser, init) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    baseURL: "http://127.0.0.1:8765"
  });
  await context.addInitScript(init);
  await context.route("**/*script.google.com/**", function (route) {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback") || "";
    const body = JSON.stringify({ ok: true, status: 200, songs: [], done: true, roster: [] });
    const wrapped = /^wo(Api|Live)_[A-Za-z0-9]+$/.test(callback);
    return route.fulfill({
      status: 200,
      contentType: wrapped ? "application/javascript" : "application/json",
      body: wrapped ? callback + "(" + body + ")" : body
    });
  });
  await context.route("**/sw.js*", function (route) { return route.abort(); });
  const page = await context.newPage();
  return { context: context, page: page };
}

test("the same photo appears at most twice across the app", async function ({ browser }) {
  const counts = {};
  const where = {};
  async function visit(page, hash) {
    await page.goto("/" + hash);
    await page.locator(".screen:not([hidden])").first().waitFor({ state: "visible" });
    await page.waitForTimeout(150);
    const names = await visiblePhotos(page);
    names.forEach(function (name) {
      counts[name] = (counts[name] || 0) + 1;
      where[name] = where[name] || [];
      where[name].push(hash);
    });
  }

  const member = await openApp(browser, function () {
    window.BETHANY_MOCK_AUTH = { uid: "uid-daniel", email: "daniel.kim@bethanychurch.test", displayName: "Daniel Kim", provider: "google.com", providers: ["google.com"] };
    localStorage.setItem("bethany-profile", JSON.stringify({ name: "Daniel Kim", email: "daniel.kim@bethanychurch.test", provider: "google.com", lang: "en", teams: ["worship", "nursery"] }));
    localStorage.setItem("bethany-teams", JSON.stringify(["worship", "nursery"]));
    localStorage.setItem("bethany-lang", "en");
    localStorage.removeItem("bethany-need-name");
  });
  const memberRoutes = ["#/home", "#/events"].concat(EVENTS.map(function (id) { return "#/events/" + id; })).concat([
    "#/ministries", "#/ministry/worship", "#/ministry/nursery", "#/food-kitchen",
    "#/give", "#/more", "#/visit", "#/worship/library", "#/worship/setlists"
  ]);
  for (const hash of memberRoutes) await visit(member.page, hash);
  await member.context.close();

  const signedOut = await openApp(browser, function () {
    window.BETHANY_MOCK_AUTH = null;
    localStorage.removeItem("bethany-profile");
    localStorage.removeItem("bethany-need-name");
  });
  await visit(signedOut.page, "#/signin");
  await visit(signedOut.page, "#/create");
  await signedOut.context.close();

  const naming = await openApp(browser, function () {
    window.BETHANY_MOCK_AUTH = { uid: "uid-new", email: "new@bethanychurch.test", displayName: "", provider: "password", providers: ["password"] };
    localStorage.setItem("bethany-need-name", "1");
    localStorage.setItem("bethany-lang", "en");
  });
  await visit(naming.page, "#/name");
  await naming.context.close();

  const over = Object.keys(counts).filter(function (name) { return counts[name] > 2; }).map(function (name) {
    return name + " x" + counts[name] + " on " + where[name].join(", ");
  });
  expect(over, JSON.stringify(where, null, 2)).toEqual([]);
  expect(counts["fellowship-group.webp"] || 0).toBe(0);
});
