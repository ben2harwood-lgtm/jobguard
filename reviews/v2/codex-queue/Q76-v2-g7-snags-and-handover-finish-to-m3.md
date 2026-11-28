# Q76 · V2-G7: Snags, Handover and "Your handover pack" finished to the M3 mock-ups, and usable on a phone

**Tier:** T2 (screens only; no route, table, money or server-check change). **Builder:** Opus 5.5 thread. **Checker:** Codex, through the desktop-review route while GitHub Codex is out of quota. **Base:** G9 `claude/project-thread-trp08u-g9` @ 4d91590f1 (it carries G1 to G4, G8 and G9, so the Handover screen already has the review request and aftercare cards). Record the sha. **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-g7.json`. **Migration:** none. **Plan:** roadmap row G6 (piece G7). **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 11:20 UK.

## What it is
G1 to G3 built the three screens from the M3 mock, so most of G7 is done. The planner's dry-check found only a short list of gaps against M3 (#1062, `apps/web/app/(designed)/v2-mock-pages-3/pages-mock.tsx`, read only). This packet closes them and proves the screens at 360 and 1280. It is the last screen piece before the H1 full browser run.

## Gaps found (on G9 @ 4d91590f1)
1. **Tap targets.** M3 gives every button, select and checkbox at least 44 px (`minHeight: 44`, checkboxes 44 by 44). In `ui/v2-snag-register.tsx` and `ui/v2-handover.tsx` the selects, inputs and "Reopen" or "Clear agreed" buttons have no size, and `design.css` sets no 44 px floor for `.btn` or `select` in `.jgd`. Fix this on these three screens only: a class in these components, not a global CSS change.
2. **Empty and problem copy.** M3's text, from `fixture.ts` line 29 and `Content()`:
   - Snags empty: "No snags recorded yet" / "Add a snag with an owner, due date and photo when you find one." The real screen says "No snags" / "No snags yet. Record one when you walk the job."
   - Handover empty and problem already match M3 (`handoverEmpty`, `handoverProblem` in `v2-handover-label.tsx`). No change.
   - Snags problem: M3 says nothing new was recorded or sent. The real text is "Snags could not load. Sign in to the right practice firm and try again." Add "Nothing new was recorded or sent."
   Change only `v2-snag-register-label.ts` (move the problem text there), and update its unit tests to the new words.
3. **Snag fixed and checked tags** already match M3 (`fixedTag`, `checkedTag`, amber until done). No change.
4. **Customer pack, newer version.** M3 shows the newer-version note as an alert above the pack. The real page (`handover/[token]/view.tsx`) shows `newerReadOnly` in the Receipt card. Keep the real behaviour: the customer can't open the newer version from here, because each version has its own link. M3's "Open newer version" button is mock-only. Only make sure `newerAvailable` is shown with `role="alert"` at the top. Say so in the PR.
5. **No horizontal scroll at 360** on all three screens, including long snag titles and long typed names (`overflowWrap: "anywhere"`, as M3 does).

## Out of scope
- Snag photo thumbnails. M3 shows a picture, but the real screen shows a count. A thumbnail needs a photo read route, which is an upload and security change. Log it as LATER.
- Any change to commands, routes, labels the server returns, or the review request and aftercare cards.

## Tests
- A browser spec `e2e/v2-g7.spec.mts` on the V2 launcher, at 360 and 1280. It opens Snags (empty, then with one snag fixed and checked), Handover (no draft, then a saved version) and the customer's pack (current, then an older link once a newer version is released). For each it asserts:
  - every visible button, select, input and checkbox is at least 44 by 44 px;
  - `document.documentElement.scrollWidth <= innerWidth`;
  - no amount (`£` or "pence") appears on the customer's pack.
- Screenshots of each state at both widths go in `/mnt/project-files/jobguard-v2/screens/g7/` (scale 2).
- The existing G1 to G4, G8 and G9 unit and seed tests pass unchanged, apart from the label wording in gap 2.
- **Rule 29/30:** no route or table added.

## Done when
- The three screens match M3's states (empty, example, problem, newer version) apart from the two logged differences: no thumbnails, and no "Open newer version" button.
- Every control is at least 44 px, and nothing scrolls sideways at 360.
- CI1 is green, and the desktop Codex verdict names the head and is clean or answered.
