# Bethany Apps Script

Paste `apps-script/bethany-app.gs` into the existing Bethany Worship Apps Script project (it is the same file as `tools/worship-backend.gs`). Deploy as a new version of the current web app so the `/exec` URL stays the same. Execute as the owner, access Anyone.

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
4. Deploy → Manage deployments → pencil → New version → Deploy.
5. Do not change who it runs as or who can access it.

The first profile or sign-up creates a Members sheet and adds a `uid` column on Signups in the existing Bethany Worship spreadsheet.
