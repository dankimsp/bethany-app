# Worship backend setup

Private ChordPro charts stay in Daniel’s Google Drive. This repo only ships public-domain songs. One Apps Script web app, deployed from **danielcyk123@gmail.com**, reads the Drive folders, publishes the live setlist, and emails song requests.

The web app runs as Daniel. Songs and publishing are open. Do not set `TEAM_HASH` or `LEADER_HASH`. If those properties are already there, delete them and redeploy.

## 1. Create the script

1. Sign in to [script.google.com](https://script.google.com) as danielcyk123@gmail.com.
2. New project. Name it **Bethany Worship**.
3. Replace the contents of `Code.gs` with `apps-script/bethany-app.gs` from this repo. Save. Do not paste `tools/worship-backend.gs`; that copy is older.

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

Song requests append a row (`time`, `title`, `artist`, `name`) and email danielcyk123@gmail.com. The subject starts with `[Song Request]`. Publishing a setlist does not ask for a passphrase or a change note. The app saves setlist edits on its own.

Song charts are stored in a Drive file named `bethany-worship-index.json`. A visit serves that built index from cache and does not open the song folders. `refreshWorshipIndex` rescans the folders every 10 minutes, reads charts that changed, and updates the version stamp. When nothing has changed, the app sends the `etag` it already has and the script answers from that stamp.

The app asks for the library in one large response (`pack=1`). This script still answers the older 40-song pages when `pack` is absent, and an older deployed script ignores `pack`. Either way the app follows `more` and `cursor` until the list is complete.

## 4b. Build the song index

After you paste a new `Code.gs` and deploy it:

1. In the script editor, choose the function `installTriggers` and click **Run**. Approve the trigger permission when Google asks. This installs `refreshWorshipIndex` every 10 minutes. Running it again replaces only that trigger.
2. Choose `buildIndex` and click **Run**. Approve Drive if Google asks.
3. Open **Execution log**. Wait until it says `Index complete.` It logs `Indexed n / total` as it goes.
4. If it says it paused or made no further progress, run `buildIndex` again. It continues from the charts it already stored.
5. Open **Triggers** and confirm `refreshWorshipIndex` runs every 10 minutes.

You can run `buildIndex` any time. Charts that have not changed are not opened again. Visits do not finish a half-built index; run `buildIndex` until the log says it is complete.

## 4c. Update an existing deployment

1. Open the existing **Bethany Worship** script at [script.google.com](https://script.google.com) while signed in as danielcyk123@gmail.com.
2. Replace `Code.gs` with `apps-script/bethany-app.gs` from this repo. Save.
3. Deploy > Manage deployments > pencil on the current web app > Version: **New version** > Deploy. Keep the same `/exec` URL. Do not change who it runs as or who can access it.
4. If Google asks, allow Drive. Allow Sheets and Gmail if it asks for those too.
5. Run `installTriggers` once, then `buildIndex`, as above.
6. Do not type a password into the file. Leave `TEAM_HASH` and `LEADER_HASH` deleted. Leave `EN_FOLDER_ID`, `KO_FOLDER_ID`, and `REQUEST_EMAIL` as they are.

To roll the script back, run `uninstallTriggers` while this version is still open. Then Deploy > Manage deployments > pencil > choose the previous version > Deploy. If the trigger is still installed on a script that has no `refreshWorshipIndex`, delete that trigger in the Triggers panel.

## 5. Point the app at the web app

In `index.html`, set the one config constant:

```js
const WORSHIP_BACKEND_URL = 'https://script.google.com/macros/s/…/exec';
```

Leave it as `''` until the deployment above exists. An empty value keeps today’s Worship section on the public-domain songs, and Add song says requests aren't connected yet. The older `LIVE_SETLIST_ENDPOINT` still works if it is set.

After the URL is set:

- Songs from Drive load on their own and merge with the bundled public-domain songs. They are saved in IndexedDB (localStorage if IndexedDB is unavailable) so the library still opens offline.
- **Add song** asks for a song title and an artist name, then posts a song request. The email subject starts with `[Song Request]`.
- Setlist edits save on this device immediately and publish to the live sheet about a second and a half later. There is no publish button and no change note. A small status says Saving…, Saved, or Offline, will sync.
