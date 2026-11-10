# Bethany app usability audit

Investigation only. No product code was changed. Local setlists lived in `localStorage`. Requests to Google Apps Script and Firebase were aborted, so nothing was published, no feedback was sent, and no payment or team code was submitted.

Date of the run: 10 Nov 2026. Machine: a Linux cloud VM, headless. Not Daniel’s iPad.

## How input was measured

Touch drags and taps in Chromium used the Chrome DevTools protocol `Input.dispatchTouchEvent` with `hasTouch: true`. That is a real touch sequence, not a mouse wheel. The same gesture scrolls a plain tall page (scrollY moved by about 850px).

Playwright’s WebKit build delivers `touchstart` and `touchmove` to the page, but on a plain tall page scrollY stayed 0, later moves stayed cancelable, and `touchend` never arrived. WebKit rows in `scroll.json` are evidence about CSS, not evidence of an iPad finger. No physical iPad or iPhone was used.

Button latency is the Event Timing duration of the `click` entry: from the browser’s input timestamp to the next paint after the handler and the animation frame. Units are milliseconds. The p95 uses nearest rank, index `ceil(0.95 × n) − 1`. Handler time is only the wrapped function. Those two numbers are reported separately because the handler often returns in under 15ms while the paint waits on layout.

A second timer, pointer-down to a double animation frame, did not record samples. It is not used below.

Acceptance targets in the design note are goals for a later change. They are not a description of this build.

## Findings, in the order Daniel will feel them

### 1. High. From 768px wide, most pages cannot scroll

After `songs.json` loads, `woLoadSongs` calls `woShow("lib")` whenever the route is not already a worship route (`worship.js`, the `if (!wo.songsRouted) woShow("lib")` line). On a viewport at least 768px wide, `woShow("lib")` adds `wo-split` to `body`. The 768px media query then sets `body` and `.app` to `height: 100dvh` and `overflow: hidden`.

The events page was touched in Chromium. `window.scrollY` after a 460px upward drag:

| Viewport | wo-split | scrollY change | Content below the fold |
| --- | --- | --- | --- |
| 320×568 | no | +736 | 2379px |
| 390×844 | no | +745 | 1893px |
| 767×1024 | no | +737 | 1690px |
| 768×1024 | yes | 0 | 1078px |
| 769×1024 | yes | 0 | 1078px |
| 820×1180, 1024×768, 1180×820, 1280×800, 1440×900 | yes | 0 | 844–1269px |

Home at 768×1024 had 224px below the fold and did not move. More had 354px and did not move. The same lock is in the live file at `https://app.bethanychurchwa.org/` (read with GET only).

Widening a phone-sized window to 820px did not add the lock, because `woShow` is not called again. Narrowing a 1440px window to 390px left the class on `body`, but the media query stopped applying and the page scrolled (+732). An iPad that loads the app at tablet width gets the lock on every page immediately. The user does not have to open worship first.

Screenshot: `/opt/cursor/artifacts/bethany-usability-audit/screenshots/chromium-768x1024-events.png` (the Date TBD card is cut at the bottom). Phone, after a successful drag: `chromium-390x844-events.png`.

### 2. High. Dragging a song row on a phone does not scroll the library

On a 390×844 Chromium page, a drag that started under the Library heading moved `scrollY` from 27 to 707. The same kind of drag starting on a song title stayed at 707 and did not open the song. Those title buttons call `preventDefault` on `pointerdown` (`worship.js`, inside `woRenderLib`). On the tablet split pane, a drag that started on a row did scroll `#wo-lib` (scrollTop 0 to 393 at 768×1024), so this is not the same bug as the page lock.

Setlists on the phone scrolled when the drag started on open page surface (scrollY 0 to 958). An earlier “setlist cannot scroll” sample had started on a button.

### 3. High. Play mode feels late because every song change refits the chart

`woRenderPlay` rebuilds the sheet and `woFitPlay` binary-searches font sizes. Each try calls `woLinesFit` / `woSpaceChords`, which read layout for every chord pair. Highlight calls `woFitPlay` even though it only toggles a class. Theme does not.

Chromium, headless, touch tap, I Surrender All unless noted. Click to next paint.

| Control | Viewport | n | Median | p95 | Max | Handler median | Layout reads, median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Next | 768×1024 | 20 | 120 | 184 | 192 | 5.6 | 26044 |
| Prev | 768×1024 | 8 | 112 | 184 | 184 | 6.4 | 26044 |
| Highlight | 768×1024 | 6 | 104 | 192 | 192 | 5 | 26044 |
| Fit | 768×1024 | 4 | 152 | 184 | 184 | 144 | 38989 |
| Lyrics only | 768×1024 | 6 | 56 | 80 | 80 | 3 | 442 |
| Numbers | 768×1024 | 6 | 64 | 72 | 72 | 3.8 | 21081 |
| Larger text | 768×1024 | 4 | 56 | 56 | 56 | 38 | 9834 |
| Theme, steady samples | 768×1024 | 4 of 6 | 24 |  | 24 | 0 | 0 |
| Next | 390×844 | 8 | 64 | 104 | 104 | 6.6 | 11881 |
| Next | 1024×768 | 8 | 128 | 264 | 264 | 6.4 | 35403 |
| Next | 1440×900 | 8 | 144 | 272 | 272 | 8.1 | 46107 |
| Enter play, cold | 1440×900 | 1 | 280 |  | 280 | 11.6 | 135919 |
| Home language | 768×1024 | 8 | 32 | 48 | 48 | 0 | 0 |
| Song-page key plus | 768×1024 | 8 | 24 | 24 | 24 | 0 | 0 |

The long gap is paint, not the click handler, and not the network. Songs were already in `songs.json`. The longest frame gap on tablet Next was 150ms. At 1440×900 the cold open’s longest frame gap was 250ms. A 60Hz frame is about 16.7ms.

Theme’s p95 of 192ms is two samples that still overlapped Highlight’s refit. The other four theme taps were 24ms. Theme itself is fast.

Against the proposed targets: Next misses 150ms at 768, 1024×768, and 1440. It meets it at 390 (p95 104). Language and the song-page key meet 100ms. Highlight and Fit do not.

### 4. High. The setlist “slide” is an invisible edge plus a late song change

There is no sliding animation. Two transparent buttons cover the left and right 18% of play mode and call `woPlayStep`. A horizontal swipe on touchend calls the same function after a 48px threshold.

Measured in Chromium at 768×1024, play font forced to 42px so the sheet overflowed:

- A drag in the center of the sheet moved `#wo-play-body` scrollTop by 576.
- A drag in the left 18% moved it by 0 to 6px.
- A tap at x=740 (right edge) changed Amazing Grace, index 0, to Holy, Holy, Holy, index 1. A tap on the left edge changed it back.

The automated swipe-latency sample was taken at the last song of a 24-song list, so the song did not change. That sample is not a timing result. The commit cost of a successful swipe is the Next row above, after the finger lifts. That is the clunky slide. The recommendation is to remove the swipe and the edge bands and keep Prev and Next, then stop refitting on those presses. See `docs/audit/PLAY-MODE-DESIGN.md`.

A mostly vertical drag with 36px of sideways drift, also on the last song, scrolled the sheet by 342px and left the index alone. The 48px threshold would ignore a 36px drift anyway. This does not prove a fast sideways flick is safe.

### 5. Medium. Play mode cannot choose columns or key, and the Sunday button is vague

Confirmed in the running app at 820×1180:

- The library button text is `This Sunday`. Activating it goes to `#/worship/setlists`.
- The song page can raise the key (G to A♭, first chord followed) and switch to numbers (`1`) and lyrics (`display: none` on the chord line).
- Play mode’s buttons were Exit, Prev, Next, Numbers, Lyrics only, A−, A+, Fit, Songs, the two edge labels, Highlight, and Light. There is no column control and no key stepper. The key line is text only: `Key: G`.

Single-song play hides Prev and Next, because `woPlayNav` does that when the list has one song. Setlist play shows them. Screenshot of one-song play at 320×568: `chromium-320x568-play.png`. The controls sat in two rows and the sheet was on screen. This pass did not record a geometry matrix at 320.

## What else was exercised

Mock worship-and-nursery member, unless noted. Chromium. Writes that would reach Apps Script were not submitted.

| Surface | 390×844 | 820×1180 | 1280×800 |
| --- | --- | --- | --- |
| Sign in, create account | signed-out pass |  |  |
| Name step |  | shown when a name is required |  |
| Home, events, event detail, ministries | opened | opened | opened, scroll locked |
| Worship, nursery, food kitchen ministry pages | opened | opened | opened |
| KM food and snack sign-up forms | opened, not submitted | opened | opened |
| Give, visit, notifications, account, more | opened | opened | opened |
| Team code gate | guest is sent to the code form; empty submit stays local and shows “That code isn't right.” |  |  |
| Worship library, filters, Korean list, This Sunday |  | filters open, search “grace” leaves 1 song, Korean list has 3, Sunday opens setlists | opened |
| Song sheet and setlist editor | opened | key, numbers, lyrics, menu, play | opened |
| Add-song form | opened, not submitted | opened | opened |
| Feedback | empty Send stays disabled; sheet closes |  |  |
| Availability | picker (“Which one are you?”) only |  |  |
| Play mode | timed | controls inventoried | timed at 1440×900 |

External links were read and not followed: Watch on YouTube, sermons on bethanychurchwa.org, Tithe.ly, Venmo, `tel:+12065517321`, and the Google Maps directions URL. No message was sent and no payment was started.

Console noise on those passes was `Failed to load resource` from the aborted Apps Script and Firebase URLs. No separate uncaught page exception was recorded.

Not covered, on purpose or because the tool could not do it:

- A physical iPad or iPhone, and native WebKit scrolling.
- Google sign-in, a real team code, saving availability, sending feedback, publishing a setlist, or requesting a song.
- The availability grid after a person is chosen.
- A full Korean pass of every screen.
- Loading YouTube, Tithe.ly, or the public church site beyond the href.

The main app has no dark theme. Play mode still has its own Light control. There is no Leadership card in the current HTML.

## Tests

Existing Playwright suite, excluding the new audit file: **33 passed, 1 failed** (about 1 minute, Chrome channel).

The failure is preexisting. `tests/v3.spec.mjs` “member phone screens” switches `localStorage` to the nursery team and opens `#/ministry/nursery`. The heading says Nursery. `#my-tools` stays hidden and empty. The test’s Apps Script mock returns `ok: false`. This audit did not change app code. It is not the Sunday-clock failure.

Date-sensitive tests that passed on Tuesday 10 Nov 2026 include the events list with the clock pinned to 8 Nov 2026, and the nursery “next Sunday is later” card. The known Sunday-only clock bug was not observed on this weekday run. Do not treat that as a fix.

New file `tests/audit/acceptance.spec.js` encodes the behavior Daniel asked for. **Both tests fail on the current app**, which is what they are for:

- Tablet events still has `wo-split` after songs load, so the scroll expectation fails.
- `#wo-this-sunday` is still “This Sunday”, so the label expectation fails before the column and key checks.

Do not weaken those tests to make the suite green. The product change waits on this design.

Re-run the audit with `npm install`, `npx playwright install chromium webkit`, then `npm run audit`.

## Files

- This note: `docs/audit/USABILITY-AUDIT.md`
- Design: `docs/audit/PLAY-MODE-DESIGN.md`
- Numbers: `docs/audit/results/latency.json`, `latency.csv`, `scroll.json`, `scroll.csv`, `functional.json`, `summary.json`, `scroll-supplement.json`
- Same JSON plus screenshots: `/opt/cursor/artifacts/bethany-usability-audit/`
- Harness: `tools/usability-audit.mjs`
