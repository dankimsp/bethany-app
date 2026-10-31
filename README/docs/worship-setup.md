# Worship backend setup

Private ChordPro charts stay in Daniel’s Google Drive. This repo only ships public-domain songs. One Apps Script web app, deployed from **danielcyk123@gmail.com**, reads the Drive folders, publishes the live setlist, and emails song requests.

The web app runs as Daniel. Songs and publishing are open. Do not set `TEAM_HASH` or `LEADER_HASH`. If those properties are already there, delete them and redeploy.

## 1. Create the script

1. Sign in to [script.google.com](https://script.google.com) as danielcyk123@gmail.com.
2. New project. Name it **Bethany Worship**.
3. Replace the contents of `Code.gs` with `tools/worship-backend.gs` from this repo. Save.

## 2. Save the Drive folder IDs

In the script editor, select `saveFolderIds` and click **Run**. Approve the Drive permission.

That writes these Script Properties:

| Property | Value |
| --- | --- |
| `EN_FOLDER_ID` | `1zQlSfNr0kJK8YSqsFobT8A_A-lwNkwvb` |
| `KO_FOLDER_ID` | `1YiqsYVRI4UaPCPEVP-YQM0j9b4t-U6bA` |

Both folders need to be in that Google account, or shared with it. The script reads every `.cho` file in the folder and in subfolders up to four levels down. English files are the English library. Korean files are the Korean library.

## 3. Remove the old password properties

Worship no longer asks for a team password or a leader passphrase.

1. Project Settings (gear) > Script properties.
2. Delete `TEAM_HASH` and `LEADER_HASH` if they exist.
3. Deploy > Manage deployments > pencil > Version: **New version** > Deploy. Use the same web app URL.

Until that new version is deployed, the previous script still rejects calls. The app then says the library is not open yet and keeps showing the public-domain songs.

Leave both properties unset. The script skips each check when its property is missing. `hashPassword` is optional and only for turning a check back on. Do not leave a secret in the file.

Optional: add `REQUEST_EMAIL` if requests should go somewhere other than danielcyk123@gmail.com.

## 4. Deploy the web app

1. Deploy > New deployment > type **Web app**.
2. Execute as: **Me** (danielcyk123@gmail.com).
3. Who has access: **Anyone**.
4. Deploy. Approve Drive, Sheets, and Gmail when Google asks.
5. Copy the web app URL. It ends in `/exec`.

The first published setlist or song request creates a spreadsheet named **Bethany Worship** in Daniel’s Drive. It has two sheets, **Live Setlists** and **Song Requests**. To copy the spreadsheet URL, run `showSpreadsheet` and read the log.

Song requests append a row (`time`, `title`, `artist`, `name`) and email danielcyk123@gmail.com. The subject starts with `[Song Request]`. Publishing a setlist does not ask for a passphrase.

Drive listings are cached for about 10 minutes. Each response includes an `etag` / `version`. The app sends the etag it already has and skips the song bodies when nothing changed.

## 5. Point the app at the web app

In `index.html`, set the one config constant:

```js
const WORSHIP_BACKEND_URL = 'https://script.google.com/macros/s/…/exec';
```

Leave it as `''` until the deployment above exists. An empty value keeps today’s Worship section on the public-domain songs, and Add song says requests aren't connected yet. The older `LIVE_SETLIST_ENDPOINT` still works if it is set.

After the URL is set:

- Songs from Drive load on their own and merge with the bundled public-domain songs. They are saved in IndexedDB (localStorage if IndexedDB is unavailable) so the library still opens offline.
- **Add song** asks for a song title and an artist name, then posts a song request. The email subject starts with `[Song Request]`.
- **Publish live** on a setlist uses this same URL and does not ask for a passphrase.
