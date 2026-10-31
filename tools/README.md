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

1. Put ChordPro files in `songs/` (one song per `.cho` file). The in-app **Add song** page can check a paste and download a `.cho` file. It does not upload anything. Drop that file into `songs/`.
2. From the repo root:

```sh
node tools/encrypt-songs.mjs
```

3. Commit `songs.json` and the `.cho` files, then push to `main`.

A shared setlist link looks like `#worship/set/...`. Opening it saves a copy of that setlist on the device.
