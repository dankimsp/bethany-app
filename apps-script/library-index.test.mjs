import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SCRIPT = fs.readFileSync(new URL("./bethany-app.gs", import.meta.url), "utf8");
const INDEX_ID = "index-file";

function makeCache() {
  const store = new Map();
  const api = {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.exp <= Date.now()) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    put(key, value, seconds) {
      const text = String(value);
      if (text.length > 100000) throw new Error("cache value exceeds 100000 chars");
      if (Buffer.byteLength(text) > 100000) throw new Error("cache value exceeds 100KB");
      store.set(key, { value: text, exp: Date.now() + (seconds || 1) * 1000 });
    },
    getAll(keys) {
      const out = {};
      keys.forEach(function (key) {
        const value = api.get(key);
        if (value != null) out[key] = value;
      });
      return out;
    },
    remove(key) { store.delete(key); }
  };
  return { getScriptCache: () => api, store, api };
}

function makeProps(initial) {
  const data = Object.assign({}, initial);
  return {
    getScriptProperties() {
      return {
        getProperty(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setProperty(key, value) { data[key] = String(value); },
        setProperties(values) { Object.keys(values).forEach(function (key) { data[key] = String(values[key]); }); },
        deleteProperty(key) { delete data[key]; }
      };
    },
    data
  };
}

function makeScriptApp() {
  const triggers = [];
  return {
    getProjectTriggers() { return triggers.slice(); },
    deleteTrigger(trigger) {
      const index = triggers.indexOf(trigger);
      if (index >= 0) triggers.splice(index, 1);
    },
    newTrigger(name) {
      const builder = {
        timeBased() { return builder; },
        everyMinutes(minutes) { builder.minutes = minutes; return builder; },
        create() {
          const trigger = {
            minutes: builder.minutes,
            getHandlerFunction() { return name; }
          };
          triggers.push(trigger);
          return trigger;
        }
      };
      return builder;
    },
    triggers
  };
}

function fileRecord(id, name, cho, updated) {
  const bytes = Buffer.byteLength(cho);
  return {
    id,
    name,
    cho,
    updated: updated || 1700000000000,
    bytes,
    getId() { return id; },
    getName() { return name; },
    isTrashed() { return false; },
    getLastUpdated() { return { getTime: () => this.updated }; },
    getSize() { return Buffer.byteLength(this.cho); },
    getBlob() { return { getDataAsString: () => this.cho }; }
  };
}

function iterator(items) {
  let i = 0;
  return {
    hasNext() { return i < items.length; },
    next() { return items[i++]; }
  };
}

function load(options) {
  const stats = { indexReads: 0, folderReads: 0, fileReads: 0 };
  const cache = makeCache();
  const props = makeProps(Object.assign({
    EN_FOLDER_ID: "folder-en",
    KO_FOLDER_ID: "folder-ko",
    INDEX_FILE_ID: INDEX_ID
  }, options.props || {}));
  const scriptApp = makeScriptApp();
  let indexText = options.indexText || "{}";
  const songs = options.songs || [];
  const byId = {};
  songs.forEach(function (song) { byId[song.id] = song; });
  const indexFile = {
    getId() { return INDEX_ID; },
    getName() { return "bethany-worship-index.json"; },
    setContent(text) { indexText = String(text); },
    getBlob() {
      return {
        getDataAsString() {
          stats.indexReads++;
          return indexText;
        }
      };
    }
  };
  const folders = {
    "folder-en": { files: songs.filter(function (song) { return song.language !== "ko"; }), subs: [] },
    "folder-ko": { files: songs.filter(function (song) { return song.language === "ko"; }), subs: [] }
  };
  const drive = {
    getFileById(id) {
      if (id === INDEX_ID) return indexFile;
      const song = byId[id];
      if (!song) throw new Error("missing file " + id);
      stats.fileReads++;
      return song;
    },
    getFilesByName() { return iterator([]); },
    getFolderById(id) {
      stats.folderReads++;
      const folder = folders[id];
      if (!folder) throw new Error("missing folder " + id);
      return {
        getFiles() { return iterator(folder.files); },
        getFolders() { return iterator(folder.subs); }
      };
    },
    createFile() { throw new Error("unexpected createFile"); }
  };
  const context = {
    CacheService: cache,
    PropertiesService: props,
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return options.locked !== false; },
          releaseLock() {}
        };
      }
    },
    DriveApp: drive,
    ScriptApp: scriptApp,
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA-256" },
      Charset: { UTF_8: "UTF-8" },
      computeDigest(_alg, text) {
        return Array.from(createHash("sha256").update(String(text), "utf8").digest());
      },
      formatDate() { return "2026-11-17T00:00:00-08:00"; },
      sleep() {}
    },
    Logger: { log() {} },
    MimeType: { PLAIN_TEXT: "text/plain" },
    ContentService: {},
    UrlFetchApp: {},
    MailApp: {},
    SpreadsheetApp: {}
  };
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: "bethany-app.gs" });
  return { context, stats, cache, props, scriptApp, indexFile, readIndex: () => indexText, songs: byId };
}

function cho(title) {
  return "{title: " + title + "}\n{key: C}\n[C]Hello\n";
}

test("chunkUtf8_ splits under the cache limit and joins back, including Korean", function () {
  const env = load({ songs: [] });
  const text = "가".repeat(40000) + "A".repeat(120000);
  const chunks = env.context.chunkUtf8_(text, 90000);
  assert.ok(chunks.length >= 2);
  chunks.forEach(function (chunk) {
    assert.ok(chunk.length <= 90000);
    assert.ok(Buffer.byteLength(chunk) <= 90000);
  });
  assert.equal(chunks.join(""), text);
});

test("a warm cache serves every pack page without reading the Drive index again", function () {
  const songs = [];
  for (let i = 0; i < 45; i++) songs.push(fileRecord("song-" + i, "Song " + i + ".cho", cho("Song " + i), 1700000000000 + i));
  const env = load({ songs });
  const built = env.context.refreshWorshipIndex();
  assert.equal(built && built.ready, undefined);
  const stamp = env.props.data.INDEX_ETAG;
  assert.ok(stamp);
  const afterBuild = env.stats.indexReads;
  const first = env.context.songs_({ action: "getSongs", pack: "1" });
  assert.equal(first.ok, true);
  assert.equal(first.more, false);
  assert.equal(first.api, 2);
  assert.equal(first.songs.length, 45);
  const readsAfterFirst = env.stats.indexReads;
  assert.equal(readsAfterFirst, afterBuild);
  const second = env.context.songs_({ action: "getSongs", pack: "1" });
  assert.equal(second.songs.length, 45);
  assert.equal(env.stats.indexReads, readsAfterFirst);
  assert.equal(env.stats.folderReads, 2);
  const unchanged = env.context.songs_({ action: "getSongs", pack: "1", etag: stamp });
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.api, 2);
  assert.equal(env.stats.indexReads, readsAfterFirst);
  assert.equal(env.stats.folderReads, 2);
});

test("a cache miss falls back to the Drive index file once, then stays off Drive", function () {
  const song = fileRecord("only", "Only.cho", cho("Only Song"));
  const env = load({ songs: [song] });
  env.context.buildIndex();
  const saved = env.readIndex();
  env.cache.store.clear();
  const reads = env.stats.indexReads;
  const page = env.context.songs_({ pack: "1" });
  assert.equal(page.songs.length, 1);
  assert.equal(page.songs[0].cho, song.cho);
  assert.equal(env.stats.indexReads, reads + 1);
  const again = env.context.songs_({ pack: "1" });
  assert.equal(again.songs.length, 1);
  assert.equal(env.stats.indexReads, reads + 1);
  assert.ok(env.cache.api.get("idx:manifest"));
  assert.equal(saved.includes("Only.cho"), true);
});

test("cached chunks stay under 100KB for an index larger than one cache item", function () {
  const songs = [];
  for (let i = 0; i < 3; i++) {
    songs.push(fileRecord("big-" + i, "Big " + i + ".cho", "가".repeat(20000) + "X".repeat(20000), 1800000000000 + i));
  }
  const env = load({ songs });
  env.context.buildIndex();
  env.cache.store.clear();
  env.context.songs_({ pack: "1" });
  const manifest = JSON.parse(env.cache.api.get("idx:manifest"));
  assert.ok(manifest.chunks >= 2);
  for (let i = 0; i < manifest.chunks; i++) {
    const chunk = env.cache.api.get(manifest.prefix + i);
    assert.ok(chunk);
    assert.ok(Buffer.byteLength(chunk) <= 90000);
  }
});

test("requests do not scan Drive folders; the trigger publishes a new stamp when a chart changes", function () {
  const song = fileRecord("chart", "Chart.cho", cho("First Title"), 1700000000000);
  const env = load({ songs: [song] });
  env.context.buildIndex();
  const original = env.props.data.INDEX_ETAG;
  const foldersBefore = env.stats.folderReads;
  song.updated = 1700000005000;
  song.cho = cho("Edited Title");
  const stale = JSON.parse(env.readIndex());
  stale.listedAt = Date.now() - 700000;
  env.indexFile.setContent(JSON.stringify(stale));
  env.cache.store.clear();
  const answer = env.context.songs_({ etag: original, pack: "1" });
  assert.equal(answer.unchanged, true);
  assert.equal(env.stats.folderReads, foldersBefore);
  env.context.refreshWorshipIndex();
  assert.ok(env.stats.folderReads > foldersBefore);
  assert.notEqual(env.props.data.INDEX_ETAG, original);
  assert.equal(env.props.data.INDEX_READY, "1");
  const fresh = env.context.songs_({ etag: original, pack: "1" });
  assert.notEqual(fresh.unchanged, true);
  assert.equal(fresh.songs.length, 1);
  assert.equal(fresh.songs[0].cho.includes("Edited Title"), true);
  assert.equal(fresh.etag, env.props.data.INDEX_ETAG);
});

test("an unfinished rebuild keeps the previous stamp so devices are not told the old library is gone", function () {
  const song = fileRecord("kept", "Kept.cho", cho("Kept"), 1700000000000);
  const extra = fileRecord("new", "New.cho", cho("New"), 1700000000000);
  const env = load({ songs: [song] });
  env.context.buildIndex();
  const original = env.props.data.INDEX_ETAG;
  env.songs[extra.id] = extra;
  env.context.DriveApp.getFolderById = function (id) {
    const files = id === "folder-en" ? [song, extra] : [];
    return {
      getFiles() { return iterator(files); },
      getFolders() { return iterator([]); }
    };
  };
  const saved = JSON.parse(env.readIndex());
  saved.listedAt = Date.now() - 700000;
  env.indexFile.setContent(JSON.stringify(saved));
  const step = env.context.indexBuildStep_({ maxReads: 0, budgetMs: 20000 });
  assert.equal(step.ready, false);
  assert.equal(env.props.data.INDEX_ETAG, original);
  assert.equal(env.props.data.INDEX_READY, "1");
  const unchanged = env.context.songs_({ etag: original });
  assert.equal(unchanged.unchanged, true);
});

test("pack=1 returns the library in one page under the cap, and without pack keeps the old 40-song pages", function () {
  const songs = [];
  for (let i = 0; i < 50; i++) songs.push(fileRecord("p-" + i, "P " + i + ".cho", cho("Page " + i)));
  const env = load({ songs });
  env.context.buildIndex();
  const packed = env.context.songs_({ pack: "1" });
  assert.equal(packed.more, false);
  assert.equal(packed.songs.length, 50);
  const old = env.context.songs_({});
  assert.equal(old.api, 2);
  assert.equal(old.more, true);
  assert.ok(old.songs.length <= 40);
  assert.ok(old.cursor);
  const next = env.context.songs_({ cursor: old.cursor });
  const ids = {};
  old.songs.concat(next.songs).forEach(function (song) { ids[song.id] = true; });
  assert.equal(Object.keys(ids).length, old.songs.length + next.songs.length);
  assert.equal(next.more, false);
  assert.equal(Object.keys(ids).length, 50);
});

test("pack=1 splits a library that is larger than one response into a few cursor pages", function () {
  const songs = [];
  for (let i = 0; i < 3; i++) songs.push(fileRecord("huge-" + i, "Huge " + i + ".cho", "Y".repeat(300000), 1700000000000 + i));
  const env = load({ songs });
  env.context.buildIndex();
  const pages = [];
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const page = env.context.songs_(cursor ? { pack: "1", cursor } : { pack: "1" });
    pages.push(page);
    if (!page.more) break;
    cursor = page.cursor;
  }
  assert.equal(pages.length, 2);
  assert.equal(pages[0].songs.length, 2);
  assert.equal(pages[1].songs.length, 1);
  const ids = [];
  pages.forEach(function (page) { page.songs.forEach(function (song) { ids.push(song.id); }); });
  assert.deepEqual(ids.sort(), ["drive-huge-0", "drive-huge-1", "drive-huge-2"]);
});

test("installTriggers installs one 10-minute trigger and can remove it", function () {
  const env = load({ songs: [] });
  env.scriptApp.triggers.push({
    getHandlerFunction() { return "someOtherJob"; }
  });
  env.context.installTriggers();
  env.context.installTriggers();
  const names = env.scriptApp.triggers.map(function (trigger) { return trigger.getHandlerFunction(); });
  assert.deepEqual(names.sort(), ["refreshWorshipIndex", "someOtherJob"]);
  const installed = env.scriptApp.triggers.find(function (trigger) { return trigger.getHandlerFunction() === "refreshWorshipIndex"; });
  assert.equal(installed.minutes, 10);
  env.context.uninstallTriggers();
  assert.deepEqual(env.scriptApp.triggers.map(function (trigger) { return trigger.getHandlerFunction(); }), ["someOtherJob"]);
});
