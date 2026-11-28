# Q66 · V2-SQ-I-1: the review, quote and customer screens on V2 get the designed look, and an empty draft gets a plain message

**Tier:** T2 (screens only; no money logic, route or table changes). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ-E's PR (Q64), at its head when you start; record the sha. It brings SQ1 #1002's designed capture. If SQ-E isn't open yet, use SQ-D #1019 and rebase onto SQ-E when it opens. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-i1.json`. **Migration:** none. **Plan:** `/mnt/project-files/jobguard-v2/spoken-quote-ultimate-plan.md` row SQ-I ("needs its own packet split"), and Q62's report `/mnt/project-files/jobguard-v2/demo-journeys-vs-v2.md`, "five most useful Missing steps" items 1 to 3. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 05:55 UK.

## What it is
Q62 found that no demo journey is fully on V2. The designed capture comes with SQ1 #1002. The **designed review** (`DUI-1a`), the **designed quote editor and send** (`DUI-1b`), the **designed customer and site** card, and the **plain empty-draft message** (`TOMMY-DEMO`) exist only on Tommy's demo, #918. This piece copies their look onto the V2 versions of those screens, which already carry SQ2, SQ-D and SQ-E's behaviour. The journey then stops looking like v1 in a new frame.

## Planner reading (please confirm or correct)
1. **Look only, copied rather than merged.** Copy the `designed` prop pattern and the CSS from #918 (`claude/project-thread-qytlkj` @ 32decb2c1, read only). The prop switches classes (`btn`, `btn primary`, `card card-body`, `card card-body form`) and wraps sections in designed cards. Never merge #918 or cherry-pick its commits. Leave #918 alone.
2. **No behaviour changes.** Every label, `aria-label`, test id, button order and money display stays as SQ-E leaves it. With `designed=false`, the existing specs pass unchanged. Where #918's copy differs from V2's, V2's wins, except the empty-draft message (reading 3).
3. **Empty "Make my draft".** When the capture route answers `INVALID_CAPTURE` because the work details are empty, show #918's line: "We could not make the draft: add the work details first. Your original text is still here; change it or try again." (#918 `jobguard-app.tsx` line 134.) Every other error keeps today's text.
4. **The V2 designed routes turn it on.** Only the `(designed)` V2 pages pass `designed`. Main's v1 pages don't change.

## Dry-check (rule 23)
- #918 @ 32decb2c1 (read only):
  - `apps/web/app/ui/review-proposal.tsx` (9 `designed` uses);
  - `apps/web/app/ui/quote-editor.tsx` (24 uses; the `designed` prop on `QuoteEditor` at line 31, and the class constants at lines 310 to 313);
  - `apps/web/app/ui/job-parties.tsx` (6 uses; `JobParties({ jobId, pilotFetch, designed })` at line 30);
  - `apps/web/app/(designed)/design-fit.css` (424 lines; the `.designed-review` and `.designed-parties` rules sit next to `.designed-capture` at lines 28 to 33);
  - `apps/web/app/ui/jobguard-app.tsx` line 134, the empty-draft message.
- SQ1 #1002 (`claude/project-thread-trp08u-sqmic`): `design-fit.css` lines 26 to 28 already hold `.designed-capture`. Extend that file; don't replace it.
- `v2/main` @ 77ed320e7: `review-proposal.tsx`, `quote-editor.tsx` and `job-parties.tsx` have no `designed` prop. `jobguard-app.tsx` shows the raw code for an empty capture.
- On SQ-E's head: the room-grouped review and quote, which this piece styles.

## Build
1. Add a `designed?: boolean` prop to `ReviewProposal`, `QuoteEditor` and `JobParties`, following #918's pattern, and pass it down to `JobVariations` only where #918 does.
2. Copy the needed `design-fit.css` rules: `.designed-review`, `.designed-quote`, `.designed-parties`, and the shared `.btn` focus and disabled states. Take only the rules these three screens use. Write the list in the PR.
3. Pass `designed` from the V2 designed job pages that mount these components.
4. Add the empty-draft message in `WalkIt`. The pure helper `captureErrorMessage(code, emptyInput)` is unit-tested.
5. Lane `config/lanes/v2-sq-i1.json`. Record each mount on main-owned files (`review-proposal.tsx`, `quote-editor.tsx`, `job-parties.tsx`, `jobguard-app.tsx`) and on SQ1's `design-fit.css`.

## Tests
- **Unit:** `captureErrorMessage`. Each component renders with `designed=true` and `false` through `renderToStaticMarkup`. The designed version carries the classes, and the plain version matches today's markup.
- **e2e:** port #918's `DUI-1a.spec.ts` and `DUI-1b.spec.ts` as `V2-DUI-1a.spec.ts` and `V2-DUI-1b.spec.ts` against the V2 routes, at 1280 and 360. Use the rule 22 sign-in, and no injected adapter for any step claimed as real. Use typed input; Q61 and Q65 cover voice. They check:
  - designed classes are present;
  - no horizontal scroll at 360;
  - buttons at least 44 px;
  - the review, quote and customer-and-site steps complete as SQ-E leaves them.

  Also add the `TOMMY-DEMO` empty-draft step: an empty "Make my draft" shows the plain message and keeps any text already typed. Put screenshots in the PR.
- The existing review, quote and spoken-quote specs pass unchanged.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- Acceptance, start and proof in designed controls (Q62 item 4) and money after the final check (item 5) come later, as SQ-I-2 and SQ-I-3.

## Done when
- On V2, the review, quote and customer-and-site screens look like the designed demo at 1280 and 360, with SQ-E's rooms. An empty draft says "add the work details first". Nothing about money or behaviour changes.
- CI1 is green, and the Codex check is clean or answered.
