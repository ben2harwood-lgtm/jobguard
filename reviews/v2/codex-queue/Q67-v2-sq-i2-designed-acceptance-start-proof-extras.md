# Q67 · V2-SQ-I-2: acceptance, start, proof and extras on V2 get the designed look, outside the legacy block

**Tier:** T2 (screens only; no money logic, route or table changes). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ-I-1 #1043 `claude/project-thread-trp08u-sqi1` @ 2d1c91d34. Record the head you start from. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-i2.json`. **Migration:** none. **Plan:** Q62's report `/mnt/project-files/jobguard-v2/demo-journeys-vs-v2.md`, "five most useful Missing steps" item 4 (`DUI-2`), and Q66's known limits. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 06:30 UK.

## What it is
After SQ-I-1, the review, quote and customer-and-site cards on V2 look like Tommy's designed demo. The next screens a builder uses, recording practice acceptance, starting the job, recording proof and approving an extra, still sit inside the `jgd-legacy` block in v1's look. This piece copies #918's designed look onto them, as SQ-I-1 did for the first three.

## Planner reading (please confirm or correct)
1. **Look only, copied rather than merged.** Same rule as Q66. Copy the `designed` prop pattern and CSS from #918 (`claude/project-thread-qytlkj` @ 32decb2c1, read only). Never merge #918 or #896 or cherry-pick their commits, and leave both alone.
2. **The four places**:
   - the acceptance card, the start control and the activation panel inside `quote-editor.tsx`, which already has `designed` from SQ-I-1;
   - `JobWorkState` (`job-work-state.tsx`, #918 line 12);
   - `JobVariations` (`job-variations.tsx`, #918 lines 87 to 89);
   - `ProofStage` (`proof-stage.tsx`, #918 line 8).
   In `WorkspaceShell` each one moves out of `legacy(...)` only when `designed` is on, as SQ-I-1 did for `JobParties`.
3. **No behaviour changes.** Every label, `aria-label`, test id, button order, disabled rule and money figure stays as the base leaves it. With `designed=false`, the markup is unchanged and the existing specs pass unchanged. Where #918's copy differs from V2's, V2 wins.
4. **V2-only screens.** F2's proof photo (#991) and F6's agreement links (#923) aren't on this base. Style only what is on the base, and write the others in the PR as later. Don't pull in their branches.

## Dry-check (rule 23)
- #918 @ 32decb2c1 (read only):
  - `job-work-state.tsx` has 13 `designed` uses (the prop at line 12, the classes at lines 73 to 79);
  - `job-variations.tsx` has 7 (lines 9 and 87 to 89);
  - `proof-stage.tsx` has 1 line with the prop and `btn` classes (line 8);
  - `e2e/DUI-2.spec.ts`: `checkDesigned()` checks no `jgd-legacy` ancestor, the `btn` class, 44 px, and no horizontal scroll.
- SQ-I-1 @ 2d1c91d34:
  - `workspace-shell.tsx` lines 34 to 38 (the `designed` prop, the `legacy()` and `legacyWorkspace()` wrappers) and line 119 (`<JobParties designed …>`);
  - `quote-editor.tsx`'s `quoteFields`, where the acceptance card is `section.acceptance-card` with "Record practice acceptance", "Record customer decline" and "Supersede quote", and the accepted-terms card holds `startControl` and `activationPanel`;
  - `design-fit.css`, which gains 78 lines in SQ-I-1. Extend it; don't replace it.
- `v2/main` @ 77ed320e7: none of the four has a `designed` prop.

## Build
1. Add `designed?: boolean` to `JobWorkState`, `JobVariations` and `ProofStage`, following #918. Pass it from `WorkspaceShell` only.
2. In `quote-editor.tsx`, switch the acceptance card's, start control's and activation panel's buttons to `btn` / `btn primary` when `designed` is on.
3. Copy only the CSS these use: `.designed-site-work`, `.designed-variations`, `.designed-proof`, `.work-actions`, and the acceptance-card rules. List them in the PR.
4. Lane `config/lanes/v2-sq-i2.json`. Record each mount on main-owned files (`job-work-state.tsx`, `job-variations.tsx`, `proof-stage.tsx`, `quote-editor.tsx`, `workspace-shell.tsx`) and on `design-fit.css`.

## Tests
- **Unit:** each of the three components renders through `renderToStaticMarkup` with `designed=true` and `false`. The designed version has the classes; the plain version matches today's markup.
- **e2e:** `V2-DUI-2.spec.ts`, ported from #918's `DUI-2.spec.ts` against the V2 designed routes, at 1280 and 360. Use the rule 22 sign-in, typed input, and no injected adapter for any step claimed as real. Every control in the journey passes `checkDesigned()`: accept, start, record proof, approve an exact extra. Put screenshots in the PR.
- The existing quote, acceptance-recovery, variations and work-state specs pass unchanged, as does SQ-I-1's `V2-DUI-1a` and `1b`.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- F2 proof photo and F6 agreement links get their designed look when they land on this stack.
- Money after the final check (Q62 item 5) is SQ-I-3.

## Done when
- On V2, recording acceptance, starting, recording proof and approving an extra use designed controls outside the legacy block at 1280 and 360. Nothing about money or behaviour changes.
- CI1 is green, and the Codex check is clean or answered.
