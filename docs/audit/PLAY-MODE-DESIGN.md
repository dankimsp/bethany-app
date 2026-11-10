# Play mode design for approval

This is a proposal. It does not change the app. Daniel asked for column choice, key changes during play, a clearer way into this Sunday’s setlist, and a slide that is instant or gone.

## What “the lyrics on” means

Read it as columns of the lyric sheet, with the lyrics visible. The song page already has Chords and Lyrics. Play mode already has Lyrics only, which hides the chords. This proposal does not add a second lyrics feature. The column control applies in both views: chords over lyrics, and lyrics only.

If Daniel instead wanted lyrics forced on whenever columns are used, that is a one-line behavior change on the same control. It should not become a new mode.

## Recommended design

Smallest change that matches the measurements.

1. **Columns.** A 1 / 2 / 3 control in the play heading.
   - Under 700px wide, only 1 is available. Two columns makes the lyric line too narrow to stay on one row.
   - From 700px to 1099px, 1 or 2.
   - At 1100px and wider, 1, 2, or 3.
   - Until the player picks a number, keep today’s automatic fit.
   - After they pick, keep that number. The sheet may scroll vertically. Do not refit over their choice.
   - If a line would run past the column, drop one column instead of clipping a chord. Four columns are not offered.
2. **Key.** Minus and plus next to the existing “Key: G” line. Use the current transpose (`woTranspose` keeps the quality string, so sus, 7, maj7, and slash bass stay). Numbers mode keeps using `woNashville`, so degrees follow the new key. Same sharp/flat spelling rules as the song page.
   - Changing the key updates the song in the open setlist the same way the editor’s key buttons do today. That path already saves locally and schedules the existing sync. It does not add a new publish button. Say that in the control’s behavior so a live service is not a surprise.
3. **Label.** The library button and the Worship Team tool hint both say “This Sunday.” Change the visible English label to **This Sunday’s Setlist**. Korean: **이번 주일 셋리스트**. The button still jumps to the setlist for the coming Sunday.
4. **Prev / Next, no slide.** Remove the horizontal swipe and the invisible left/right edge bands (each is 18% of the screen). Keep the Prev and Next buttons.
   - Reason: there is no slide animation. A swipe waits for the finger to lift, then runs the same refit as Next. On a 768×1024 Chromium touch session, Next’s click-to-next-paint was median 120ms and p95 184ms (n=20) for I Surrender All, with frame gaps up to 150ms. That misses the 150ms target and is not instant. Daniel said to remove the slide if it cannot be smooth.
   - Make Prev and Next feel immediate by rebuilding the chart at the font size and column count already on screen. Do not binary-search the font on every press. Do not run that search when Highlight is toggled (it calls the fitter today).
5. **Leave the rest alone.** The main app stays light. Play mode keeps its own Light / Dark. Chord sheets stay chord-over-lyric, not a new layout. The Leadership card stays removed.

## Three ways to build it

| Approach | What changes | Tradeoff |
| --- | --- | --- |
| A. Recommended | Fix the scroll lock. Stop cancelling drags on song rows. Add the column and key controls. Rename the Sunday button. Delete swipe and the edge bands. Skip the font search on Prev, Next, Highlight, and key changes. | Smallest path that can hit the timing targets. Players lose the swipe. Buttons stay. |
| B. Keep a real slide | Prebuild the next song off screen and move it with a transform. Only keep it if a later measurement shows p95 under 150ms and vertical drags still scroll. | More code. The current fitter makes this miss the target. Easy to bring the clunky gesture back. |
| C. New chart renderer | Draw the sheet in a canvas or virtual list so column and key changes are cheap. | Large, and it puts the printed chord-sheet look at risk. Out of scope. |

## Targets for the implementation, not claims about today

- Ordinary controls, such as language and the song-page key buttons: p95 under 100ms from the click to the next paint.
- Next or previous song, chart already loaded: p95 under 150ms.
- A vertical drag in play mode scrolls the sheet and does not change songs.
- No gesture may lock vertical scrolling.

Today’s Next button on the tablet misses the 150ms bar. The song-page key button already meets the 100ms bar (p95 24ms, n=8), which is why the play-mode key control should reuse that transpose and skip the fitter.
