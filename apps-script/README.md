# Bethany Apps Script

Paste `apps-script/bethany-app.gs` into the existing Bethany Worship Apps Script project. Deploy as a new version of the current web app so the `/exec` URL stays the same. Execute as the owner, access Anyone. `tools/worship-backend.gs` is an older copy; do not paste that over the live script.

## Song library

Requests do not rescan Drive. They read a version stamp and a chunked copy of the built index from Apps Script's cache (each piece is under 100KB, kept for up to 6 hours). If the cache is empty, they read the Drive file `bethany-worship-index.json` once and fill the cache. A client that already has that version gets `unchanged` without opening the file.

`refreshWorshipIndex` rebuilds the index: it lists the English and Korean folders, opens charts whose size or modified time changed, writes the Drive file, refreshes the cache, and updates the version stamp. Until that runs, phones keep the last built library.

Clients send `pack=1`. This script then returns the library in one response, or in a few large pages if it grows past about 800KB. A client that does not send `pack=1` still gets the old 40-song pages. An already-deployed script ignores `pack` and keeps paging 40 songs; the app follows either shape.

### Install the trigger (once)

1. Deploy the new script version first (steps below).
2. In the editor, select `installTriggers` and click **Run**. Approve the trigger permission when Google asks.
3. Select `buildIndex` and click **Run**. Wait until the log says `Index complete.` If it pauses or makes no progress, run it again.
4. Open **Triggers** (clock icon) and confirm `refreshWorshipIndex` is set to run every 10 minutes.

`installTriggers` is safe to run again. It replaces only that trigger. `uninstallTriggers` removes it. Run `uninstallTriggers` before you deploy an older script that does not contain `refreshWorshipIndex`. If you already deployed that older script, delete `refreshWorshipIndex` from the Triggers panel so it does not fail every 10 minutes.

## Script properties

Set these in Project Settings → Script properties. Do not put the values in the repo.

| Property | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Yes, for signed-in actions | The same public Firebase web `apiKey` as `BETHANY_FIREBASE.apiKey`. Used to verify each `idToken` with Identity Toolkit `accounts:lookup`. The uid is cached for 10 minutes. |
| `AUTH_GRACE` | No | Set to `1` only for a short rollout window. While it is `1`, calls without a token are accepted for actions that will require sign-in. Leave it unset (or anything other than `1`) so a missing token returns 401. Turn it off after the signed-in app is live. |
| `TEAM_CODE_WORSHIP` | Yes, for the Worship code | The team code, or its SHA-256 hex. Never commit it. |
| `TEAM_CODE_NURSERY` | Yes, for the Nursery code | The team code, or its SHA-256 hex. Never commit it. |
| `EN_FOLDER_ID` | Already set | English Drive folder. |
| `KO_FOLDER_ID` | Already set | Korean Drive folder. |
| `SPREADSHEET_ID` | Automatic | Saved the first time the script opens its spreadsheet. |

`TEAM_HASH` and `LEADER_HASH` stay unset. Songs, setlist reads, and song requests do not require a Firebase token. Every other action does, unless `AUTH_GRACE=1`.

## Deploy

1. Open the Apps Script project that already serves the worship `/exec` URL.
2. Replace the script with `apps-script/bethany-app.gs`.
3. Add `FIREBASE_API_KEY` (the Firebase web apiKey). Add `AUTH_GRACE`=`1` only if you need the old app to keep working for a day while this version rolls out.
4. Deploy → Manage deployments → pencil → **New version** → Deploy. Leave "Execute as" and "Who has access" unchanged so the URL stays the same.
5. Run `installTriggers`, then `buildIndex`, as above.

To roll back the script, run `uninstallTriggers` while this version is still in the editor. Then Deploy → Manage deployments → pencil → choose the previous version → Deploy. The URL stays the same. Phones keep whatever library they already saved until the next successful fetch.

The first profile or sign-up creates a Members sheet and adds a `uid` column on Signups in the existing Bethany Worship spreadsheet.
