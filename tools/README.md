# Worship charts

Worship charts in this repo are public. `songs.json` is plain JSON built from the ChordPro files in `songs/`. Private charts stay in Drive. The member app no longer has a Serve-links unlock. Do not commit passwords, team codes, or hashes.

Optional directives on each song:

```
{language: en}
{key: G}
{time: 3/4}
{speed: slow}
{tempo: 76}
{moment: Response}
{season: Christmas}
{range: medium}
{difficulty: easy}
{scripture: Ephesians 2:8}
{themes: Grace, Salvation}
```

`language` is `en` or `ko`. It defaults to English. The Library switch shows one language at a time. A setlist can mix both.

`speed` is `slow`, `medium`, or `fast`. If it is omitted, a `{tempo}` under 80 is slow, 80–110 is medium, and over 110 is fast. A song with neither is listed only when the Speed filter is All. Themes are a comma-separated list. The same list form is used for `time`, `moment` (Opener, Response, Communion, Offering, Closing), `season`, `range` (low, medium, high), and `difficulty` (easy, medium, hard). `scripture` is a single reference. The song page shows these as chips. The Filters panel matches moment, season, range, time, and difficulty as chips (any selected value in that group) and scripture as text. Every active group must match.

Chords can be letters (`[G]`, `[D/F#]`) or Nashville numbers (`[1]`, `[6m]`, `[5/7]`, `[b7]`, `[3(7)]`, `[4maj7]`, `[5sus4]`). A number chord is stored as written. Numbers mode shows that text. Letters mode spells it in the current key, and transpose changes that key. Letter chords still transpose, and Numbers mode turns them into degrees of the current key.

1. Put ChordPro files in `songs/` (one song per `.cho` file). The in-app **Add song** page only sends a title and artist request. Drop chart files into `songs/` yourself.
2. From the repo root:

```sh
node tools/encrypt-songs.mjs
```

3. Commit `songs.json` and the `.cho` files, then push to `main`.

A shared setlist link looks like `#/worship/set/...`. Opening it saves a copy of that setlist on the device. The link includes each song's key, note, and the leader note.

# Worship backend

Private charts, live setlists, and song requests share one Apps Script web app. Follow `README/docs/worship-setup.md`. Leave `WORSHIP_BACKEND_URL` in `index.html` empty until that web app is deployed. The library then keeps using only the public-domain songs in this repo.

# Live setlist

When `WORSHIP_BACKEND_URL` is set, setlist edits publish themselves to that web app after a short pause, and an open setlist refreshes every 30 seconds. A change note is not required. When that URL is empty, the same autosave uses `LIVE_SETLIST_ENDPOINT` in `index.html` if it is set. If both are empty, edits stay on the device.

1. Create a Google Sheet for live setlists.
2. Extensions > Apps Script. Paste `tools/live-setlist-apps-script.gs` and save.
3. In the script editor, run `hashLeaderPassphrase` once after setting the passphrase in that function, copy the log value, then remove the passphrase from the function. Do not commit the passphrase.
4. Project Settings > Script properties. Add `LEADER_PASS_HASH` with that hash.
5. Deploy > New deployment > Web app. Execute as Me. Who has access: Anyone. Copy the web app URL into `LIVE_SETLIST_ENDPOINT`.

The sheet's first tab gets one row per publish: time, setlist id, change summary, leader note, and the songs JSON. Viewers of that setlist poll every 30 seconds and show `Updated HH:MM: <change>`. Only a matching leader passphrase can publish. There are no push notifications.
