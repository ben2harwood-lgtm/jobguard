# TOMMY-FINAL-CHECK-READER-20261119

## Scope and authority

- Base: `896a701157ef71c81905da93bca4299d105c775a`.
- Branch: `codex/sandbox/tommy-final-check-reader-20261119`.
- Task: replace the aggregate ten-second deadline for two sequential final-check reads with bounded ten-second budgets per phase.
- Product scope: `FinalCheckReveal` and its focused tests only. No server, database, permission, deployed-state or background-worker change.
- Contracts: `AGENTS.md` §§5.13–5.14; `BUILD_PLAN.md` §10.2.7 and SV-5.
- Preserve the authorised unlocked projection without reading disputes; do not commit a locked reveal until its sequential disputes read has passed the existing access checks.
- Preserve job/epoch/lifetime guards, coalesced reads, non-aborting transport, bounded pending polling and unknown POST-outcome handling.
- RED independent review against the final head remains required. This builder does not approve or merge its own work.

## Problem and resulting behaviour

The reader previously applied one ten-second deadline to the final-check response and the subsequent disputes response together. Two successful seven-second reads therefore discarded the authorised saved result and left the screen unavailable.

Each phase now has its own ten-second timer, covering fetch and body parsing. The disputes request starts only after a validated, current-job locked projection. The locked result is still committed atomically after both phases; an unlocked projection does not request disputes. A locked refresh has at most two phase budgets, while an unlocked refresh has one. Late first-phase results also recheck the job and request epoch before starting any diagnostic read.

The patch changes no API routes, command admission, worker execution, database state, agreement authority or fee behaviour. A saved pending final check remains pending; this fix does not assert that its worker completed.

## Executed validation — 19 November 2026

Commands ran in the isolated worktree `/workspace/scratch/e06a45857489/jobguard-final-check-reader`, using the session's pinned pnpm toolchain. Logs are in `/workspace/scratch/e06a45857489/recovery-failure/`.

| Command | Observed result | Log |
|---|---|---|
| `pnpm install --offline --frozen-lockfile` | Exit 0; lockfile unchanged | `final-check-reader-install.log` |
| `pnpm turbo run build --filter=@jobguard/web^...` | Exit 0; unchanged dependencies built | `final-check-reader-dependency-build.log` |
| `pnpm --filter @jobguard/web exec vitest run app/ui/final-check-reveal.test.tsx --maxWorkers=1 --reporter=verbose -t 'accepts two sequential seven-second reads'` against unchanged product code | **Expected RED:** 1 failed, 48 filtered/skipped; UI stopped waiting at the aggregate ten-second deadline | `final-check-reader-red.log` |
| `pnpm --filter @jobguard/web exec vitest run app/ui/final-check-reveal.test.tsx app/ui/final-check-reveal-view.test.ts app/ui/historical-evidence.test.tsx --maxWorkers=1 --reporter=verbose` after the fix | **62 passed in 3 files**, exit 0 | `final-check-reader-focused.log` |
| `pnpm --filter @jobguard/web typecheck` | Exit 0 | `final-check-reader-typecheck.log` |
| `LANE_BASE_REF=896a701157ef71c81905da93bca4299d105c775a pnpm lint:lanes` | Passed; only the two authorised product/test files and own lane/receipt | `final-check-reader-lane.log` |
| `git diff --check` | Exit 0 | No output |

Eight added fake-timer cases cover:

- Two sequential seven-second responses succeed without exposing a partial result.
- A slow unlocked read never requests disputes.
- A first-phase timeout discards a late locked response without starting diagnostics.
- The disputes response body has its own bounded deadline; a late body cannot replace a newer saved read or show an old dispute count.
- Delayed disputes 401 and 403 responses still remove a previously authorised finding.
- Navigation and unmount during the disputes phase discard its late response, clean timers and preserve non-aborting transport.

All earlier focused regressions remain passing, including the polling cap, coalesced refreshes, malformed estimates, lost POST replies, access refusal and stale job results. Tests use controlled fetches and fake timers; they are component tests, not hosted network or worker evidence.

## Remaining review and runtime limits

- Independent RED review against the final candidate head and required CI remain outstanding; this receipt is builder evidence, not acceptance.
- Hosted direct reads returned a saved pending lock while the existing UI showed unavailable. Navigation wall times motivated the test but are not claimed as exact server-network timings.
- A repeated hosted pending result at 13:22:14 UTC leaves worker completion unverified and separate from this reader correction.
- The successful baseline attempt 3 ran unchanged main, not this candidate. Its 162 fresh desktop passes do not validate the patch or explain the original recovery overlap failure.
- No browser, database, full repository suite, full web production build, deployment or hosted mutation was run for this candidate. The session's local browser/PostgreSQL restrictions were not bypassed.
