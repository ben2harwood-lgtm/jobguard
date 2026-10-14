# MIGFIX-7 builder receipt

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/migfix-7` from origin/main `0349f906`. Migration number 0158 (given; main has 0150/0151/0153/0154, 0152 and 0155 are open PRs). Not independently verified, not accepted.

## What was built
- `0158_shadow_disclosure_completion.sql`: (1) `record_shadow_disclosure` locks the survivor-plus-duplicates group and propagates monotonic disclosure and permanent exclusions to every member; (2) trigger `shadow_group_disclosure` so a duplicate coalesced later into a disclosed survivor inherits it; (3) `complete_shadow_firing_post_lock`, a separate routine completing a mandatory firing for a signal persisted before the lock (before_lock=false, real server time, group no-fee exclusion `evidence_after_lock`, 1/1/1 Decision/firing/disclosure plus one finding). `surface_shadow_signal_early` untouched, still refuses a locked job.
- Race handling: disclosure takes the detection advisory key (`shadow-detection:<tenant>:<job>`, the repository's own key) then the job row, so disclosure and coalescing are wholly ordered; lock order key, job, group signals by id, inserts, audit head last.
- Ben, 14 Oct, decision 8 (late safety signal shown at once, no fee) applied: post-lock disclosures are fee-ineligible, labelled `evidence_after_lock` (an existing allowed reason), never `disclosed_before_lock`.

## STOPPED parts (need a ruling; nothing changed in any merged test or pin)
1. **EXECUTE on the completion routine to `jobguard_shadow` is NOT granted.** It would change `packages/db/test/shadow-catalog.integration.test.ts` line 77 (`explicit.jobguard_shadow` is exactly `["record_shadow_disclosure","surface_shadow_signal_early"]`; after: add `"complete_shadow_firing_post_lock"`) and the LP-0 inventory `docs/contracts/lp-0-effective-privileges-v1.json` (new routine/ACL entries, like every new routine). The intended one-line grant: `GRANT EXECUTE ON FUNCTION app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb) TO jobguard_shadow;`.
2. **Detection worker/repository NOT changed.** Without the grant the repository cannot call the routine, so `packages/db/src/shadow-detection-repository.ts` and `shadow-observation-reader.ts` are untouched (the already-merged same-transaction repair still rolls a batch back if the lock wins). Once the grant is approved the intended change is a SAVEPOINT around the `surface_shadow_signal_early` call in `surface()` (line ~74), falling back to the completion routine on SQLSTATE 55000 "early surface requires an unlocked job". `apps/api/src/shadow-detection-worker.ts` does not exist on main (the worker is `shadow-detection.worker.ts`); `apps/api/src/shadow-detection-lock-race.test.ts` is untouched.
3. **Fee treatment** is Ben's decision 8 (no fee). The new-reason option (`disclosed_after_lock`) would change the pinned list in `packages/core/src/shadow-domain/types.ts` and its tests, so the existing `evidence_after_lock` reason is used. Flagged for the checker.
4. Not built (SV5PRE/#189 not on main): nothing in this piece needed it.

## Known limit
A duplicate that is itself already disclosed (`surfaced_early`) can no longer be coalesced by the repository's UPDATE (its state filter), so such a pair stays two surviving signals and detection reports DETECTION_REPLAY_CONFLICT as before. Unchanged behaviour, not in scope.

## Commands (worktree `.worktrees/migfix-7`, all via `~/.local/bin/heavy-slot migfix-7`, `--maxWorkers=2`, at most 3 files)
| Command | Exit | Result |
|---|---|---|
| `vitest run test/migfix-7.integration.test.ts` with 0158 unregistered (baseline, failing-first) | 1 | 6 failed (disclosure assertions false/empty; completion: function does not exist) |
| same, with 0158 registered | 0 | 6 passed |
| `vitest run test/migfix-7-upgrade.integration.test.ts` | 0 | 1 passed |
| `vitest run test/shadow-persistence.integration.test.ts test/shadow-catalog.integration.test.ts test/shadow-detection.integration.test.ts` | 1 first run (ai dist unbuilt, environment) | 28 passed, 3 failed from missing `packages/ai/dist`; after `pnpm --filter @jobguard/ai build`, shadow-detection alone: 17 passed, exit 0 (persistence and catalog files passed in the first run) |
| `pnpm --filter @jobguard/core build`, `pnpm --filter @jobguard/ai build` | 0 | needed so tests resolve packages |
| `npx tsc --noEmit -p packages/db/tsconfig.json` | 0 | clean |

## Not run
Full `pnpm test`, `pnpm lint`, `pnpm build` (turbo), `pnpm test:db`, `test:migrations`, browser journeys, OpenAPI, `lp-0-grant-freeze` (the new routines add inventory entries; the LP-0 JSON was not regenerated and appears already stale on main, e.g. no 0154 helper), apps/api unit tests. Not pushed to a PR; no CI watched.

## New GRANTs
None. (`REVOKE ALL ... FROM PUBLIC, jobguard_runtime, jobguard_shadow, jobguard_shadow_emergency_access, jobguard_infrastructure` on both new routines; `record_shadow_disclosure` ACL restated identical.) Test-only: the integration test creates login `m7_probe` and grants it EXECUTE on the completion routine inside its own disposable database.

Standard F: no new write grant to `jobguard_runtime`; both new routines are SECURITY DEFINER with `search_path=pg_catalog,app`, re-check tenant context, and take no input that names a privileged role.

Not independently verified, not accepted.
