# Worship backend setup

Private ChordPro charts stay in Daniel’s Google Drive. This repo only ships public-domain songs. One Apps Script web app, deployed from **danielcyk123@gmail.com**, reads the Drive folders, publishes the live setlist, and emails song requests.

The web app runs as Daniel and is open to anyone who has the team password. The password and its hash never go in this repo.

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

## 3. Hash the team password and the leader passphrase

`hashPassword` is the only place a secret is typed, and only in the script editor. Do this twice: once for the team password, once for the leader passphrase.

1. Open `hashPassword`. Put the secret between the quotes: `var password = "type it here";`
2. Select `hashPassword` and click **Run**.
3. View > Execution log. Copy the hex line. That is a SHA-256 hash.
4. Set the quotes back to empty (`var password = "";`) and save. Do not leave the secret in the file.
5. Project Settings (gear) > Script properties > Add script property.
   - Team password hash → property `TEAM_HASH`
   - Leader passphrase hash → property `LEADER_HASH`

`TEAM_HASH` is the team token. The app hashes the typed password and sends only that hash. `LEADER_HASH` is checked only when someone publishes a setlist. The app sends the leader passphrase, and the script hashes it before comparing.

Do not commit either hash, and do not paste either secret into `index.html`.

Optional: add `REQUEST_EMAIL` if requests should go somewhere other than danielcyk123@gmail.com.

## 4. Deploy the web app

1. Deploy > New deployment > type **Web app**.
2. Execute as: **Me** (danielcyk123@gmail.com).
3. Who has access: **Anyone**.
4. Deploy. Approve Drive, Sheets, and Gmail when Google asks.
5. Copy the web app URL. It ends in `/exec`.

The first published setlist or song request creates a spreadsheet named **Bethany Worship** in Daniel’s Drive. It has two sheets, **Live Setlists** and **Song Requests**. To copy the spreadsheet URL, run `showSpreadsheet` and read the log.

Song requests append a row (`time`, `title`, `artist`, `name`) and email danielcyk123@gmail.com with the subject `Song request: <title> by <artist>`. The message includes the requester’s name. Publishing a setlist requires the leader passphrase. Every action, including reading songs and the live setlist, requires the team token.

Drive listings are cached for about 10 minutes. Each response includes an `etag` / `version`. The app sends the etag it already has and skips the song bodies when nothing changed.

A Google Apps Script web app cannot set the HTTP status code, so a rejected team token is HTTP 200 with a JSON body of `"status": 401`. The app treats that, and a real HTTP 401, as a wrong team password. Other errors are not shown as a wrong password.

## 5. Point the app at the web app

In `index.html`, set the one config constant:

```js
const WORSHIP_BACKEND_URL = 'https://script.google.com/macros/s/…/exec';
```

Leave it as `''` until the deployment above exists. An empty value keeps today’s Worship section: public-domain songs only, the ChordPro paste page, and the older `LIVE_SETLIST_ENDPOINT` if that is set.

After the URL is set:

- Worship asks once for the team password. **Remember on this device** stores the SHA-256 hash in the browser, not the password.
- A rejected token (HTTP 401, or `"status": 401` from this script) clears that saved hash and shows “That password isn’t right.” A network failure or a server error does not.
- Songs from Drive are merged with the bundled public-domain songs and saved in IndexedDB (localStorage if IndexedDB is unavailable) so the library still opens offline.
- **Add song** asks for title, artist, and name, and posts a song request.
- **Publish live** on a setlist uses this same URL and still asks for the leader passphrase.
