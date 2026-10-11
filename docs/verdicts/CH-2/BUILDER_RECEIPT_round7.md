# CH-2 round 7 — builder receipt (repair of the Sol check on 0617f69)

**Task:** CH-2 (PR #97), branch `codex/sandbox/ch-2`
**Repair builder:** Claude Sonnet 5.5
**Repaired from:** `0617f69d649e744bb0fd339d6e08b60fc3688497`
**Input:** GPT-6.1 Sol high check `ch-2-solcheck-20261004T190705.md` (VERDICT: REPAIR, five P2, no P1)
**Status:** repaired and tested locally. **Not independently verified, not accepted.** No verdict is claimed. A fresh Sol check and a
fresh Claude Opus review check the new head; acceptance is a separate actor.

## Scope, as settled by the integrator against the card's Done-when (recorded verbatim)

- IN SCOPE, fix now (all five): P2-1 (proof replay bypasses current membership checks; C5 and Done-when "replaying it again returns the first result"), P2-2 (the proof application violates the first-result replay contract), P2-3 (existing command IDs can be stolen after upgrade; CH-2's own 0050 identity table), P2-4 (legacy discrepancy replay uses a transaction-start cutoff; Done-when replay line for Things-to-check evaluation), P2-5 (Done-when explicitly requires "The M0-8 command-layer lock-order test is extended to the guarded commands and shows no business lock after the audit append", executed against real PostgreSQL, not source text).
- Nothing is out of scope. Migration 0050 has not been applied anywhere, so it may still be edited.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order, so this task keeps migration number 0050.

## Merge with main first

`origin/main` had one new commit, `ebfeaae` (TEST-STAB-2 #105: a wait in `UIWIRE-1.spec.ts`, plus its verdict files). Merged without rebase or force (`7a6686d`).
- `config/agent-lane-assignments.json` conflicted (one JSON line, both sides edited lanes). Resolved with `lane-union.py` mid-merge as a union of lane entries; the result differs from `origin/main` in the `ch-2` lane only (checked by comparing every lane).
- `UIWIRE-1.spec.ts` and the TEST-STAB-2 files merged cleanly. Main added no migration, so no migration-count assertion changed (`demo-bootstrap`, `UIWIRE-12` and the `tenancy` catalog still count main's migrations plus this branch's 0050). No code conflict; `apps/api/openapi.json` was not touched (no route or schema changed).

## Findings, each with its failing-first test and its fix

Every test below was written before its fix and run against the unchanged code (red). The three suites that needed PostgreSQL ran together
(`red-db.log`: 37 failed, 67 passed, 7 skipped); the web boundary ran separately.

| Finding | Failing-first test | Why it failed | Fix |
|---|---|---|---|
| P2-1 proof replay bypasses current membership checks | `packages/db/test/proof-replay.integration.test.ts:32-73` (revoked member's replay; expired member's replay; revoked or expired first run; a revoked member's changed-payload replay; invalidation by an expired member) | the replay resolved with the first result for a member revoked since (`promise resolved … instead of rejecting`); an expired member was never refused anywhere; a changed-payload replay hit `COMMAND_CONFLICT` instead of `FORBIDDEN` | `packages/db/src/proof-repository.ts:9` new `requireActiveActor` (active AND unexpired), called at `:14` in the first transaction BEFORE the identity and receipt replay, again at `:21` in the second transaction (the old check ignored expiry), and in `invalidate` (`:25`) |
| P2-2 proof application violates the first-result replay contract | `apps/web/e2e/CH-2.spec.ts:136` (all three live-only actions replayed through the web route after finalisation, completion and an invalidation that opens a newer Decision; a changed request of each is refused); `packages/db/test/proof-application-records.integration.test.ts:31-83`; `packages/db/test/proof-replay.integration.test.ts:75` (server-derived Decision) | e2e, both projects: the replay of `select_generated` returned today's projection (`upload.state` `verified`, `evidenceId` set) instead of the first (`pending`, `evidenceId` null); the records suite had no module; `deriveDecision` was an unrecognised key | `apps/api/src/proof/proof.application.ts:11-15` records the first response of `select_generated`, `finalize` and `complete` and replays it as recorded (after the membership check), with a changed request, job or action refused (`CONFLICT`); completion no longer rebuilds the request from today's Decision (`:16`, `deriveDecision: true`); `packages/db/src/proof-application-repository.ts:19-49` (`ProofApplicationRecords`); `packages/db/src/proof-repository.ts:4,13,23` (the derived Decision is recorded in the first result; requests that do not ask for derivation hash exactly as before, so receipts written earlier still replay); `packages/db/migrations/0050_watchdog_live.sql:102,117-130` (`app.proof_application_response`: append-only, FORCE RLS, owned by `jobguard_migration`, bound by composite foreign key to the command's claimed identity, hence its job and kind; plus the identity table's composite unique key it references) |
| P2-3 existing command IDs can be stolen after upgrade | `packages/db/test/watchdog-legacy-identities.integration.test.ts:41-100` (the previous schema reproduced by running each real command and removing only the two bookkeeping tables 0050 added; every other kind is tried on the id BEFORE the original's first replay; collisions) | `promise resolved … instead of rejecting`: another kind claimed the id and performed a new effect (13 commands, plus the collision case) | `packages/db/src/watchdog.ts:46-77` every claim also consults the stores that held command ids before 0050 (`LEGACY_COMMAND_OWNERS`); an id is claimable only by its own kind on its own job, and an id persisted by two kinds or jobs is refused to all; `packages/db/MIGRATIONS.md` documents the stores, the collision policy and a pre-deploy collision query that the suite runs |
| P2-4 legacy discrepancy replay uses a transaction-start cutoff | `packages/db/test/things-replay.integration.test.ts:145` (a real overlap: a confirmation's transaction begins first and is held before it writes its fact, an evaluation begins later and commits, the confirmation then commits with a later audit position; the evaluation's bookkeeping is removed so it replays as a pre-0050 row) | `expected [ …(4) ] to not include '301ccc70-…'`: the replay included a fact the original response could not see | `packages/db/src/discrepancy-repository.ts:17-23` fact visibility follows audit order: a fact belongs to the response when the audit event that confirmed it (matched by document and payload hash) precedes the evaluation's; `created_at` is no longer used |
| P2-5 lock-order coverage missing | `packages/db/test/watchdog-lock-order.integration.test.ts` (observer self-tests `:41-69`; the 17 registry-driven cases `:76-98`; both proof transactions `:100`); `packages/db/test/commands.integration.test.ts:80` (the M0-8 test itself, now observed); observer in `packages/db/test/lock-observer.ts` | see below: the code already conformed, so the proof that the suite can fail is by injection | test coverage only: no product change was needed for the lock order |

### P2-5 in detail

The observer wraps the pool a repository was built with. After every statement of every transaction it asks a separate superuser connection what that backend holds: advisory and table locks from `pg_locks`, and row locks by probing each locked table with `SELECT … FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE SKIP LOCKED` (only core PostgreSQL features, so it works on the CI binary). Rows a transaction inserted itself are invisible to other sessions and cannot be contended.

For each of the 17 guarded commands (generated from the registry through the real repositories as the real runtime role) it records the first run, an exact replay and a changed-payload refusal, and asserts: (1) the first business lock a transaction takes is the share lock on the job row, taken by `require_watchdog_live`; (2) once it holds the tenant's audit head row it takes no contending lock afterwards (no row lock on a row that anything can lock for update, no advisory lock, no table lock above ROW EXCLUSIVE); (3) a command that appended audit events was actually seen holding the audit head (so the rule cannot pass vacuously); (4) proof completion's two transactions are both observed. The commands pass on the existing code: nothing contending is taken after the audit append, for any of the 17.

What a command does take after the audit append is only KEY SHARE on rows that foreign-key checks reference (for example `control_plane.tenant`, taken by the audit insert itself, and the match, order, fact and document rows a finding row references). The suite lists them and tolerates them only on append-only tables (the suite reads it from the catalog: the runtime role has no UPDATE grant on the table, and no SECURITY DEFINER routine body updates it, deletes from it or, in a body that locks FOR UPDATE, reads from it), because `SELECT … FOR UPDATE` needs the UPDATE privilege, so nothing can hold a conflicting lock on such a row and no lock-order cycle can form through it. A row of any mutable table, or any stronger lock, is counted as a violation.

Honest note on the red run: the first run of this suite failed 16 tests (14 of the 17 commands, the proof-completion case and the clean self-test). That was my observer's mistake, not the code's: its mutable-table detection matched the bare word "tenant" inside unrelated function bodies and so counted `control_plane.tenant` as mutable. I fixed the detection (a table counts only when a statement names it after UPDATE / DELETE FROM, or after FROM / JOIN in a body that locks FOR UPDATE) and the suite then passed on unchanged product code, so the red proof for P2-5 is by injection, run in one heavy slot and reverted by `git checkout` (the three files had no other uncommitted changes; `git diff --stat` after the revert was empty):
- an advisory lock after the audit append in `supplier-document-repository.ts` `confirm` — fails `#confirm`;
- an advisory lock before the live guard in `inbox-relevance-repository.ts` `dismiss` — fails `#dismiss` ("the first business lock must be the job row's share lock; it was taken by: SELECT pg_advisory_xact_lock(8)");
- a row lock on a pre-existing, mutable `command_receipt` row after the dispatcher's audit append in `commands.ts` — fails `#place` and the M0-8 observed test.
Four failed, 26 passed in that run. The synthetic self-tests inside the suite show the same four kinds of violation being detected on purpose.

## Other things found and fixed on the way

- The new legacy matrix showed that a `supplier_match.create` written before results were stored replayed the CURRENT match, not the first (the same class as P2-4, in a place the five findings did not name). `packages/db/src/supplier-match-repository.ts:23-31`: such a creation replays as the match stood at its revision, validated against the request hash its audit event recorded (a changed request or another job conflicts). The legacy owner query tells a creation from a correction by the audit event type (`supplier_match.confirmed` / `supplier_match.corrected`), not by revision number, because a creation's revision is `expectedRevision + 1`, which the client chooses.
- The new composite unique key on the identity table made a racing duplicate claim surface that index's violation (SQLSTATE 23505) instead of conflicting: `ON CONFLICT (tenant_id,command_id)` arbitrates only its own index (it failed `place: parallel duplicates` once in the second full run). The insert now names no conflict target (`packages/db/src/watchdog.ts:77`); the contract suite then passed three times in a row and in the full run.

## Class check (not changed, with the reason)

Commands that take an actor: `purchase_order.place` goes through the dispatcher, which checks active, unexpired membership and the owner role before any replay path (M0-8 coverage unchanged); `inbox.seed` and `inbox.dismiss` take a membership id only to choose whose preference budget the view shows, and confer no authority, so they were not changed; the other 11 commands carry no actor. For `proof.complete` the applicable permission today is an active, unexpired membership of the tenant (no role matrix exists for it); I did not invent one.

## Commits

| SHA | Subject |
|---|---|
| 7a6686d | merge: bring origin/main (TEST-STAB-2 #105) into codex/sandbox/ch-2 |
| bfbbd18 | test(db): lock order observed in PostgreSQL for all 17 commands; proof replay, legacy ids and overlapping-transaction coverage |
| 16c311e | fix(db,api): proof replays re-check membership and return the response they first gave |
| 5ad8fed | fix(db): previous-schema command ids are reserved for the command that persisted them |
| 86e5e6c | fix(db): legacy evaluation replay reconstructs fact visibility from audit order, not transaction start time |
| (this commit) | docs(verdicts): CH-2 round-7 receipt |

The replay-contract cases moved into a shared harness (`packages/db/test/watchdog-command-harness.ts`) that four suites now share (replay contract, lock order, legacy ids, proof); the contract suite's assertions are unchanged (53 tests, same as before). Exact paths for the new files were added to the CH-2 lane only (`config/agent-lane-assignments.json`).

## Commands run (macOS arm64, Node 24, pnpm 10.28.1; database and browser commands wrapped in `heavy-slot ch-2`)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date, no dependency change |
| red run, tests only on unchanged code: `vitest run` the six new or changed DB suites | 1 | 37 failed, 67 passed, 7 skipped (the records suite had no module) |
| red run, web boundary: `playwright test CH-2.spec.ts -g "proof commands replay"` with the old `proof.application.ts` stashed and rebuilt | 1 | 2 failed (mobile-360, desktop): replay returned today's projection |
| injection run (see P2-5) | 1 | 4 failed, 26 passed, then reverted |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks plus the custom lints |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-2` passed |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm test` | 0 | node tools 39; core 446; config 2; storage 4; ai 72; web 63; api 133; db 345 in 47 files |
| `pnpm test:db` | 0 | 47 files, 345 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `pnpm openapi:check` | 0 | generated file matches |
| contract suite alone, three times in a row (after the conflict-target fix) | 0 ×3 | 53 tests each |
| e2e, the whole suite, both projects: `CI=1 playwright test --project=mobile-360 --project=desktop` | 0 | 174 passed (2 of them are the new proof-boundary test) |
| e2e `CH-2.spec.ts` alone, green after the fix | 0 | 8 passed |
| `git diff --check` | 0 | clean |

The e2e runs used an UNCOMMITTED local config (`apps/web/playwright.local.config.ts`, kept outside the repository tree when not in use and never added to a commit) that only sets `executablePath` to the installed `chromium_headless_shell-1234`, because the pinned Chromium 1193 headless shell is not installed on this Mac; projects, viewports, web server (`next start` on the production build, `CI=1`) and global setup are the repository's. GitHub CI is the pinned-browser proof.

## Not run, and residual

- `gitleaks` and `dependency-review` are CI-only jobs. `pnpm eval` has no wrapper beyond the `@jobguard/ai` tests, which ran inside `pnpm test`; no prompt, model, schema or extraction policy changed.
- **Residual, by design:** if a process dies between the proof command's commit and the insert of its response record, the next replay answers with the projection at that moment and records it; no earlier response had been delivered. The record has no live-job insert guard (it is the replay record of a command that already succeeded, not a watchdog input), so a job that has just left live can still give its first answer back.
- The claim-time consult adds up to twelve indexed lookups per claim (the purchase-order placement table has no index on its command id; it holds one row per draft).
- A fact revision with no matching audit event (no code path writes one) is left out of an as-of replay.
- The conflicts the owner-role suite proves (0050 applied as `jobguard_migration` to a previous-schema database) are unchanged; the pre-deploy collision query is run by the legacy-ids suite against a known collision, not by the owner suite.

Nothing here releases a hold, provider, spend, deploy or decision. Not independently verified, not accepted.
