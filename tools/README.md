# Encrypt the Serve links

The app stores the Serve buttons as AES-GCM ciphertext in `serve-links.json`. The password never goes in the repo. A key is derived with PBKDF2-SHA-256 (600,000 iterations) and a random salt.

1. Outside the repo, make a JSON file like this (use the real links, not these examples):

```json
[
  {"title": "Nursery Sign-Up", "href": "https://example.com/nursery", "note": "Sign up to help in the nursery on Sundays"},
  {"title": "Worship Team Schedule", "href": "https://example.com/worship", "note": "See who's on and mark your availability"}
]
```

2. From the repo root, set the password and run the script:

```sh
export SERVE_PASSWORD='the team password'
node tools/encrypt-serve-links.mjs /path/to/that-file.json
```

3. Commit the new `serve-links.json` and push to `main`. People who checked "Remember on this device" will need to unlock again.

Do not commit the plaintext JSON file. `serve-links.plain.json` is gitignored if it is left in the repo root.

# Worship charts

Worship charts are public in this build. `songs.json` is plain JSON built from the ChordPro files in `songs/`. Serve still has its own password.

Optional directives on each song:

```
{speed: slow}
{tempo: 76}
{themes: Grace, Salvation}
```

`speed` is `slow`, `medium`, or `fast`. If it is omitted, a `{tempo}` under 80 is slow, 80–110 is medium, and over 110 is fast. A song with neither is listed only when the Speed filter is All. Themes are a comma-separated list. The Add song page previews both fields.

1. Put ChordPro files in `songs/` (one song per `.cho` file). The in-app **Add song** page can check a paste and download a `.cho` file. It does not upload anything. Drop that file into `songs/`.
2. From the repo root:

```sh
node tools/encrypt-songs.mjs
```

3. Commit `songs.json` and the `.cho` files, then push to `main`.

A shared setlist link looks like `#/worship/set/...`. Opening it saves a copy of that setlist on the device. The link includes each song's key, note, and the leader note.

# Live setlist

Publish live sends the open setlist to a Google Sheet. The web app URL is `LIVE_SETLIST_ENDPOINT` in `index.html`. It is empty until the church deploys the script, and the app hides publishing and does not poll while it is empty.

1. Create a Google Sheet for live setlists.
2. Extensions > Apps Script. Paste `tools/live-setlist-apps-script.gs` and save.
3. In the script editor, run `hashLeaderPassphrase` once after setting the passphrase in that function, copy the log value, then remove the passphrase from the function. Do not commit the passphrase.
4. Project Settings > Script properties. Add `LEADER_PASS_HASH` with that hash.
5. Deploy > New deployment > Web app. Execute as Me. Who has access: Anyone. Copy the web app URL into `LIVE_SETLIST_ENDPOINT`.

The sheet's first tab gets one row per publish: time, setlist id, change summary, leader note, and the songs JSON. Viewers of that setlist poll every 30 seconds and show `Updated HH:MM: <change>`. Only a matching leader passphrase can publish. There are no push notifications.
