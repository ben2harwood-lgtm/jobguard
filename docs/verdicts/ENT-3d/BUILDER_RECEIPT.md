Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026

# ENT-3d builder receipt — verified photo and server-written resident confirmation on `LogSiteExtra` v3 (server only)

Builder receipt only — not independently verified, not accepted. Check lane RED: fresh Opus review and a Codex Sol check come later.
Base `4db73817ab7b3be4993fe8b01279ac0e1b8cf836` (origin/main, ENT-3a merged c84c6b3). Branch `codex/sandbox/ent-3d`. Code commit `f5c8ddb8dfb5a342a04c154de0c2ee847ac61b53`; this receipt is the commit after it (final head sha is in the dispatcher message; it cannot be written into the file it commits). No intended-commit-message path was given, so none was written.

## Statement

No table, column, trigger, constraint, policy or table grant added; no existing row changed; no merged or ENT-3a test edited. No route and no registry row added: no runtime check is switched off.
Standard F: pre-existing direct write grants on the evidence tables are used, none added. FIX (least-privilege track): replace the application login's direct write grants on the evidence tables with a checked routine.

## Files changed (19 in the commit, all in the lane; `git diff --name-only` agrees with `pnpm lint:lanes`)

New: `docs/contracts/site-extra-evidence-v1.md`, `packages/core/src/site-extra-evidence.ts` and `.test.ts`, `packages/db/migrations/0141_site_extra_evidence.sql`, `packages/db/test/site-extra-evidence-fixtures.ts`, `site-extra-evidence.integration.test.ts`, `site-extra-evidence-routines.integration.test.ts`, `apps/api/src/contractor/site-extra-evidence.application.test.ts`, `apps/web/app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts`.
Existing (lines added / removed vs base): `config/agent-lane-assignments.json` +1/-0 (the `ent-3d` line after `ent-3a`, the order's line with `0141` and "Built on main after ENT-3a merged (c84c6b3)"); `packages/core/src/index.ts` +1/-0 (one export); `packages/core/src/site-extra.ts` +2/-2 (the two codes appended to the closed list and to the status map, as 422; both lines are single long lines so they show as changed); `packages/db/src/migrate.ts` +1/-0 (0141 registered last, after 0138); `packages/db/MIGRATIONS.md` +7/-0; `packages/db/src/site-extra-repository.ts` +90/-10; `apps/api/src/contractor/site-extra.application.ts` +12/-2; `.../site-extra.controller.ts` +3/-2; `apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts` +4/-3; `apps/api/openapi.json` +115/-31 (only path `/contractor/jobs/{id}/site-extras` changed; checked by comparing the parsed JSON: same path list, one path differs, every non-path part identical).

SHA-256 equal to base (checked with `git show base:path` against the working tree): `evidence.ts` 2f977453…9970, `watchdog.ts` b6212a70…4bf, `context-boundary.test.ts` d082694d…772f, `watchdog-registry.test.ts` 09eece54…e0, `extra-repository.ts`, `extra-persistence.ts`, `audit.ts`, `tenant-context.ts`, ENT-3a's `site-extra.http.test.ts`, `site-extra.application.test.ts`, core `site-extra.test.ts`, `site-extra.integration.test.ts`, `site-extra-authority.integration.test.ts`, `site-extra-fixtures.ts`, the web `route.test.ts`, merged `extra-fixtures.ts`, `tenancy.integration.test.ts`, `command-replay-contract.integration.test.ts`, `watchdog-command-harness.ts`, and migration `0135`: all 20 identical. `resolveContext` text SHA-256 before and after: `54e01fa61b388ed14b2f6b7bbb1f5016686fe90761744a9ca0834bddb058b873` (identical). The context still comes only from the existing `log` path calling `this.resolveContext`.

## The five routines and grants as built (migration 0141)

All SECURITY INVOKER, `SET search_path=pg_catalog`, owner `jobguard_migration`, `REVOKE ALL … FROM PUBLIC, jobguard_infrastructure`, then one explicit `GRANT EXECUTE … TO jobguard_runtime` naming the five signatures. New GRANTs (one line each; none on a table, so standard F is met):
1. GRANT EXECUTE `app.ent3d_content_sha256(uuid,text,text,text)` TO jobguard_runtime.
2. GRANT EXECUTE `app.ent3d_confirmation_document(uuid,uuid,uuid,text)` TO jobguard_runtime.
3. GRANT EXECUTE `app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid)` TO jobguard_runtime.
4. GRANT EXECUTE `app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text)` TO jobguard_runtime (the only writer of a confirmation object; carries its own `ent3a_extra_authority` check).
5. GRANT EXECUTE `app.ent3d_require_site_extra_evidence(uuid,uuid)` TO jobguard_runtime.
Signatures, result types and volatility are asserted by [E24]. The seam `siteExtraAuthoritySeam` keeps its name and runs `requireLiveJob`, then ENT-3a's guard, then `SELECT app.ent3d_require_site_extra_evidence($1,$2)` (nothing else).

## Worked examples, formats

See `docs/contracts/site-extra-evidence-v1.md` (content hash example `e33c42e8…1fc3`; 355-byte document, SHA-256 `39e6221b…2c3`). Both formats are byte for byte the same in core and SQL: [E20] compares the routines with the core functions for seven inputs (multi-byte text included); [E1] and [E2] hold the expected values written out.

## Acceptance map (BUILT = test exists and passes)

Unit core `packages/core/src/site-extra-evidence.test.ts`: E1 E2 E3 E4 BUILT (77 tests).
API `apps/api/src/contractor/site-extra-evidence.application.test.ts`: E5 (5 tests) and E6 (2 tests) BUILT. Web `.../route.evidence.test.ts`: E5 (40 tests) BUILT.
Database `packages/db/test/site-extra-evidence.integration.test.ts` (line numbers): E7 :32, E8 :54, E9 :66, E10 :73, E11 :81 (with and without a photo), E12 :103, E13 :110, E14 :121, E15 :140, E16 :161, E17 :174, E18 :185, E19 :195. `site-extra-evidence-routines.integration.test.ts`: E20 :32, E21 :47, E22 :60, E23 :101, E24 :110, E25 :140 (upgrade proof, rule 9, identity-matched rows, `row_to_json(t)::text`, names and full types, controls: one-microsecond change fails, retype fails, added nullable column and replaced function pass, a later inserted row passes, at least one pre-existing row per table). Not an executable-test item: nothing HELD from the acceptance list.

### B-prime (build standard F, by name; all in `site-extra-evidence.integration.test.ts`)
(a) `replaying a command id returns the first result, never the job's current state` :213 (the job moves on by invalidating the photo; a NEW command naming it is refused; the replay returns the first result and writes nothing).
(b) `the same command id with a changed payload conflicts` :225 (different photo, hash shown, note, description; also [E15] adds evidence added or removed).
(c) `the same command id on another job conflicts` :233 (with and without a hash shown).
(d) `a successful no-op keeps its identity` :243. The first successful call is not a no-op; the property applies to the replay: the same id and body returns the same extra id, confirmation id and hashes, three times, and writes nothing (routine-level `existing` is in [E22]).
(e) `a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written` :255 (job moved off live as the table owner, as `watchdog.integration.test.ts` does; four body shapes; no extra, upload, evidence, command or audit row).
(f) `an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job` :268 (six roles, real and unknown photo id, four targets; identical status, body, code; nothing written).
No runtime check is switched off: this piece adds no route and no registry row. Coordinator Q3 conditions: versioned deterministic serialisation ([E1], version in the framing); rebuild byte-identical to what the writer produced ([E11] compares SHA-256, length and, via routine 2, the text; [E20]); one case per stored fact that changes the hash ([E1]: job, description, note, photo changed one at a time; and the version string: the stored value equals an independently recomputed hash of the framing that begins with the version line, which differs from the same facts framed under another version line).

## Commands run (all in this worktree; one run at a time; vitest `--maxWorkers=2`; database through `heavy-slot ent-3d`)

Baseline before any change: api `context-boundary.test.ts` + `watchdog-registry.test.ts` + `site-extra.http.test.ts`: exit 0, 3 files, 282 tests (green on base).
Failed-first runs (honest record): core `site-extra-evidence.test.ts`: 77 failed of 77 (module absent). Database `site-extra-evidence.integration.test.ts` (after the migration SQL was drafted and core rebuilt, before any repository change): 19 failed, 1 passed (E10 passes on the old code because v1 already refuses unknown keys). API `site-extra-evidence.application.test.ts`: 6 failed, 2 passed. Web `route.evidence.test.ts`: 3 failed, 37 passed (the key-refusal cases already pass on a v1-only route). The routines database file was written after the migration and first ran with the repository in place; it failed first on three test-writing mistakes of mine (an `undefined` default, an `ORDER BY` alias, a superuser insert tripping the live-job trigger), fixed, then passed. Also honest: the migration SQL was drafted before the database tests, not after.
Final runs, all exit 0:
- `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...` ok (core, db, api).
- core `site-extra-evidence.test.ts` + `site-extra.test.ts`: 2 files, 112 tests.
- api `site-extra-evidence.application.test.ts` + `site-extra.application.test.ts`: 2 files, 49 tests. api `context-boundary.test.ts` + `watchdog-registry.test.ts` + `site-extra.http.test.ts`: 3 files, 282 tests.
- web `route.evidence.test.ts` + `route.test.ts`: 2 files, 70 tests.
- db `site-extra-evidence.integration.test.ts`: 20 tests. db `site-extra-evidence-routines.integration.test.ts`: 6 tests.
- db unedited: `site-extra.integration.test.ts` + `site-extra-authority.integration.test.ts`: 72; `command-replay-contract.integration.test.ts` + `tenancy.integration.test.ts`: 62; `extra-origin` + `extra-links` + `extra-origin-upgrade`: 48; `evidence` + `watchdog` + `fingerprinted-row-shape`: 63; `watchdog-lock-order` + `demo-bootstrap`: 27. PostgreSQL (embedded) did start on this Mac after `node scripts/hydrate-symlinks.js` inside this worktree's embedded-postgres package folder (it only creates dylib symlinks).
- `pnpm typecheck` exit 0 (7 tasks). `LANE_BASE_REF=4db7381… pnpm lint` exit 0. `LANE_BASE_REF=4db7381… pnpm lint:lanes` passed (19 files). `pnpm build` exit 0. `pnpm openapi:check`: first failed as expected (stale), then `pnpm --filter @jobguard/api openapi:generate`, then check exit 0 (no EPERM here).

## NOT RUN

No whole-package or whole-repository suite (dispatcher's). No browser test (none exists; UI parked). Merged files not named in the order and not touched were not run. No Opus or Sol review (not mine).

## Deviations and judgement calls (tell me if any is wrong)

1. Replay before evidence checks: for a v3 body with a photo or a hash, after ENT-3a's pre-check a read of the stored succeeded receipt/origin/variation decides replay first, so a replay is answered from stored facts and never re-judged (needed for B-prime (a)). A mismatch of photo, confirmation or stored content hash is `COMMAND_CONFLICT` (409 `IDEMPOTENCY_CONFLICT`). The order's step list (i) to (vi) does not spell this read out; it is a plain SELECT in the repository.
2. Content hash for a v3 body with neither photo nor hash: the repository stays exactly ENT-3a's; the application computes the hash with the pure core function (no photo). With evidence the repository returns it (database answer, or rebuilt from stored facts on replay).
3. Upgrade proof pre-N data: the governed command needs 0141's guard, so the extras made before N use merged `raiseExtra` without the seam (note-only and photo-linked); the verified photo is through the merged pipeline.
4. A database `JOB_NOT_LIVE` raised inside steps (i)/(ii) is mapped to `WatchdogError("JOB_NOT_LIVE")` (409) rather than 503; everything else untyped is `SITE_EXTRA_UNAVAILABLE`.
5. Core `siteExtraContentSha256V1` / `residentConfirmationDocumentV1` throw `RangeError` on malformed ids or hashes (SQL returns NULL).
6. `controller` documents a 422 response and a one-of body; summary text changed from "note-only".
LATER (UI is parked, one line each): none needed from this piece. FIX-LATER (Q5): re-base merged ENT-4b fixtures that raise extras with an unverified photo, then add a table-level guard in a separate reviewed order.

## HELD (built none of it)

Photo with no note (changes merged `raise-extra.v1`); any capture or upload route (M3-5); a typed name, signature or anything about the resident; quantity and price in the hash (ENT-3c); stored bytes for the document; a table-level guard on every writer; screens (ENT-3e); visits and close-out (ENT-3b); evidence packs or a client approver's view; retention and data-protection assessment for resident data; ENT-5 state rules; `ConfirmPrompt` (ENT-8a); linking (ENT-4c); fees (ENT-7).

## Limits L1 to L7

L1 the checks bind the governed path only. L2 the server cannot know a resident pressed anything ("identity not verified"). L3 the document is committed before the extra; if the second step is refused an unused document can remain (a retry of the same command reuses it). L4 check-then-act: a photo invalidated between the guard read and commit is not caught. L5 (carried from ENT-3a, founder question F2) no signed-in person can reach the success path yet; it is proved through the governed path in the database tests and at service level. L6 the document's bytes are not stored; rebuilt from stored facts, with SHA-256, length and type on the evidence row and the content hash in the recorded audit event. L7 "bound to its revision" is met only as "bound to the content hash, format v1".

## Self-review (strict reviewer's pass against the order)

Checked: every [E] line has a test with its ID that failed first or is a catalogue/negative property (E10 and the web key cases passed already on old code, noted above); both formats identical in core and SQL; no request value reaches the document, its hash, the actor, the command type, the grant or the tenant (the actor is the session object's membership; the command type is the one module constant; the tenant comes from the context; the request supplies only ids and the hash shown, which is compared and never stored as content); routine 4 has no content parameter ([E14c]) and is the only writer (the repository file names it once, [E6]); the seam runs the two guards and nothing else; `evidence.ts`, `watchdog.ts`, the boundary scanner, every merged and ENT-3a test are byte-identical (hashes above); the four [A18] text conditions hold (ENT-3a's [A18] passes unedited, and [E6] repeats them); no `commandType: "` text in any lane source file; no role name written anywhere; every routine fails closed on an absent, empty or malformed tenant setting ([E21] to [E23]); the EXECUTE list is explicit; `PHOTO_NOT_ACCEPTED` is one identical error for ten causes ([E8]); a v1 body is passed to the repository with exactly the same four keys and gets the v1 answer (ENT-3a's application test unedited passes); nothing about a resident anywhere ([E19]); no rule-11 string; no rule-12 test (the one source-text test reads only the properties the order names).
Changed after self-review: the "other job" test originally reused the first command's hash shown for its no-hash variant (test bug, fixed); the MIGRATIONS.md line first said database tests were not run (they were run here; corrected before commit); removed unused imports from the test files.
Not claimed: independent verification, acceptance, or that the last-instant limit L4 is closed.

## Repair round 1 (typecheck)

13 October 2026. Repair of head `282076727e7d84f1f7c1f2ab5f038ef147058347` on `codex/sandbox/ent-3d`, by Codex. Builder repair receipt only; not an independent verdict or acceptance. The issued order was not present at `jg-orders/ENT-3d-issued-v3.txt` in this checkout; this repair follows the dispatcher's explicit one-file repair instructions and changes no other implementation file.

Only `packages/core/src/site-extra-evidence.test.ts` changed, plus this appended receipt. Reuse the existing dependency-free UTF-8 SHA-256 function from `evidence-pack.ts`, as existing core sources and tests do. Every test title, assertion and expected value is unchanged. No dependency, Node types, package manifest, TypeScript configuration, lockfile or other configuration changed.

Old line (1):

```ts
import { createHash } from "node:crypto";
```

New line (1):

```ts
import { sha256 } from "./evidence-pack.js";
```

Old line (34):

```ts
  const frame = (version: string) => `${version}\nS36:${job};S2:ab;S1:c;N;`, digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
```

New line (34):

```ts
  const frame = (version: string) => `${version}\nS36:${job};S2:ab;S1:c;N;`, digest = sha256;
```

The earlier "typecheck green" claim was wrong because the Turbo cache hid the `node:crypto` import's TS2307 failure in core, which has no Node type declarations. The earlier lint/build green claims also did not establish uncached success. This repair's forced executions replace those claims with the results below.

Runtime: Node `v24.17.0`, pnpm `10.28.1`, Turbo `2.10.12`, Vitest `4.1.11`; dependencies already installed. The default pnpm launcher stalled selecting its version, so its preliminary version/typecheck attempts were interrupted (exit 130). No packages were downloaded or installed. A temporary symlink at `/private/tmp/jg-ent-3d-bin/pnpm` selects the existing cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; all completed pnpm commands below used `PATH="/private/tmp/jg-ent-3d-bin:$PATH"`.

Required commands run in the issued order, serially; build ran alone and no build/test overlapped:

| Command | Exit code | Result |
|---|---|---|
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful tasks; 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 successful tasks; 0 cached |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful tasks; 0 cached |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra-evidence.test.ts` | 0 | 1 file, exactly 77 passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered `ent-3d` lane passed against `origin/main` |

The three Turbo checks use `--force`; the fourth primary check invokes Vitest directly, which executes the 77 tests without Turbo caching. Turbo emitted shared-cache write `Operation not permitted` warnings under the sandbox, but all tasks executed and the forced commands exited 0. Next.js emitted workspace-root and existing CSS/autoprefixer warnings; build exited 0.

Additional requested verification:

| Command | Exit code | Result |
|---|---|---|
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | Root purity, lane, money and commercial boundary checks; 7 successful forced package lint tasks, 0 cached |
| `pnpm openapi:check` | 1 | Sandbox refused the `tsx` CLI IPC socket (`listen EPERM`); checker did not execute |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI checker executed without the CLI IPC socket; committed OpenAPI matches |
| `git diff --check` | 0 | No whitespace errors in the test repair |

Database/migration and browser suites were not run: the dispatcher states this sandbox cannot start PostgreSQL or bind localhost, so those suites remain for GitHub CI after the dispatcher pushes. No git write command, commit or push was run. Intended conventional commit subject and body are written to `/private/tmp/jg-msg-ent-3d.txt`. Independent exact-commit review, separate acceptance and CI results remain pending; no release gate is changed.

## Repair round 2

13 October 2026. Tests-only repair of clean head `fe945d2ec993073ee29bdf71126b3013f79031b7` on `codex/sandbox/ent-3d`, PR #170. The dispatcher reported GitHub CI run `38392147416` timing out the [E8] refusal-cause test at Vitest's default 5 seconds. This receipt records builder checks, not independent verification or acceptance.

Changed `packages/db/test/site-extra-evidence.integration.test.ts:66`: the named [E8] `it(...)` now has `60_000` as its third argument. Line 54 adds the one-line explanation: "Loops every refusal cause against a real database, which can exceed the default timeout in CI." The title is now at line 55. No assertion, expected value, cause, ordering, retry, other test or other timeout changed. No product code, migration bytes, lane entry, dependency or configuration changed; this receipt is append-only.

Arithmetic: the `causes` array contains **10 causes**: pending upload, rejected upload, raw object over pending upload, another job, another company, another evidence type, preview, invalidation, unknown id, and a confirmation document used as a photo. The loop performs 10 initial refusals plus 10 same-command retries, with real database fixture setup and the existing before/after, audit and refusal-event checks. A read-only Node/TypeScript AST check counted the 10 array entries and compared against HEAD after removing exactly the new comment and timeout; exit 0 confirmed the entire remaining file is byte-identical.

Other database-loop candidates in this same file, source-inspected only and **unchanged**, all still using the default per-test budget:

| Current line / test | Loop shape |
|---|---|
| 104, [E12] confirmation mismatch | 5 hashes in the loop, plus 1 refusal afterward; each uses the database-backed `refused` helper |
| 141, [E15] replay/conflict | 7 payload changes plus 3 additions, alongside success/replay and database-state checks |
| 162, [E16] tenant isolation | 2 ids × 2 tables = 4 tenant reads; later 1 routine query per accumulated confirmation row |
| 175, [E17] forbidden roles/scope | 6 roles × 2 photo ids + 3 members × 2 photo ids = 18 database-backed refusals |
| 226, changed payload conflicts | 4 changes, each with database-state comparisons |
| 234, another job conflicts | 2 variants, each with database-state comparisons |
| 244, successful no-op | 3 replays, each with database-state comparisons |
| 256, not-live refusal | 4 body shapes, each with database-state, refusal-event and receipt checks |
| 269, unauthorised caller | 6 roles × 2 photo ids × 4 targets = 48 database-backed refusals |

These are structural candidates, not measured timeouts. The [E10] nine-case loop rejects invalid input before database work. ENT-3d's core and application tests have loops over pure checks or mocked repositories, with no analogous real-database round-trip loop.

Runtime: Node `v24.17.0`, pnpm `10.28.1`, Turbo `2.10.12`, Vitest `4.1.11`; existing dependencies only, no install or download. All pnpm commands used `PATH="/private/tmp/jg-ent-3d-bin:$PATH"`, the existing cached-pnpm selector documented in repair round 1. Every Vitest invocation used `--maxWorkers=2` and exactly two files. The build ran alone.

| Command | Exit code | Result |
|---|---|---|
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 successful tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered ENT-3d lane passed |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra-evidence.test.ts src/site-extra.test.ts` | 0 | 2 files, 112 passed |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | Root purity, lane, money and commercial boundary checks; 7 successful package tasks, 0 cached |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra-evidence.application.test.ts src/contractor/site-extra.application.test.ts` | 0 | 2 files, 49 passed; mocked application boundaries |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'` | 0 | 2 files, 70 passed; route unit tests, not browser tests |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful tasks, 0 cached |
| `pnpm openapi:check` | 1 | `tsx` CLI IPC socket denied with `listen EPERM`; checker did not execute |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI checker executed without CLI IPC; committed document matches |
| `git diff --check` | 0 | No whitespace errors |

Turbo reported shared-cache write `Operation not permitted` warnings; forced checks still executed and passed. Next.js reported the existing workspace-root and CSS/autoprefixer warnings; build passed. An ancillary process-inspection command (`ps -axo pid,etime,pcpu,command` piped to `rg`) exited 1 because sandbox permissions deny `ps`; it was not a verification suite.

**Database/migration and browser suites NOT RUN in this sandbox**, including the repaired [E8] test, `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e`: the dispatcher states PostgreSQL cannot start and localhost cannot bind here. GitHub CI runs them after the dispatcher pushes; local unit success does not verify the repaired database test's CI timing. No migration or backwards-compatibility impact, new operational alert or release-gate change. Independent exact-commit verdict, separate acceptance and CI remain pending.

No git write command, commit or push was run. Intended conventional commit subject and body are written to `/private/tmp/jg-msg-ent-3d.txt` for the dispatcher.

## Repair round 3

13 October 2026. Tests-only repair of clean head `20c14d55095747cb09bf21609a608ddd1aaf5dd4` on `codex/sandbox/ent-3d`, PR #170, by Codex. The dispatcher supplied the two proof gaps from `jg-runs/ent-3d-solcheck-20261013T165216.md` (REPAIR) and the earlier Opus L1 note; that fresh report is not present in this checkout. This is a builder run receipt, not an independent verdict or acceptance.

Exactly three repository files changed: the core evidence test, the database evidence integration test and this append-only receipt. No product code, migration byte, lane entry, fixture, dependency or configuration changed. No existing expected value changed, no assertion was dropped or weakened, and nothing was deleted.

### Persisted-facts reconstruction proof

Added one named test at `packages/db/test/site-extra-evidence.integration.test.ts:104`: **[E26] the stored confirmation document rebuilds from persisted facts: bytes, hash and length**. The governed repository command creates an extra with a verified photo and a confirmation. A subsequent SELECT reads back `variation.description`, `variation.capture_text`, the stored job/tenant ids, `extra_origin.evidence_hash`, the linked confirmation object's id, hash and length, and the recorded confirmation audit event. Fixture inputs are used only for setup and selecting the new row; every serializer input and expected value in the proof comes from persisted rows.

The production core content hasher and `residentConfirmationDocumentV1` rebuild UTF-8 bytes from those variation/origin/evidence facts. The production SQL document serializer independently rebuilds bytes from the confirmation event's stored tenant, job, confirmation and content hash. In this one test, the content hashes agree, both byte buffers agree, SHA-256 of the rebuilt buffer agrees with both the stored object hash and recorded document hash, and its byte length agrees with the stored object length. The SELECT must return exactly one row.

**Existing L6 limitation:** `docs/contracts/site-extra-evidence-v1.md` explicitly says confirmation bytes are not persisted as a file; the object pins hash, length and type, and the audit event pins the content hash. Therefore the order's "stored bytes" comparison is implemented as equality with production SQL serialization of the persisted confirmation facts. This does not claim retrieval of a persisted byte blob, which does not exist. Literal persisted-byte retrieval remains unavailable within the tests-only scope; no production or migration change was made to invent one.

Source inspection, not database execution: checked the query's columns/types against migrations `0001_audit.sql`, `0002_evidence.sql`, `0014_variations.sql` and `0053_shared_money_origin.sql`; checked the origin hash source and persisted description/note against `0122_extra_origin_persistence.sql` and the repository's replay SELECT; checked the writer, UTF-8 conversion and reconstruction guard against routines 2, 4 and 5 in `0141_site_extra_evidence.sql`; checked the event's payload keys/type against `SiteExtraRepository.evidenceGate`; checked the core serializer exports. Joins qualify the tenant and job between variation, origin and evidence, and qualify the event by tenant, confirmation subject and exact event type. `convert_to(...,'UTF8')` returns bytea (node-postgres Buffer); stored bigint length is explicitly selected as text and compared with the buffer length's decimal string. Existing test fixtures and lifecycle hooks are reused.

A read-only Node comparison against HEAD removed only E26 and its added imports and confirmed the remaining database file is byte-identical. TypeScript `transpileModule` reported no syntax diagnostics for either changed test file. These are deterministic source checks, not PostgreSQL proof or an independent review; the normal db tsconfig includes `src`, not integration tests.

### Exact old-to-new assertion map

The former grouped [E1] test had five executions of `expect(siteExtraContentSha256V1(input)).not.toBe(digest)` and one distinct-hash count assertion. Its `base`, `digest` and five `changed` inputs are unchanged. Each old assertion occurs in exactly one new named test:

| Old assertion/input | New test and line | Unchanged expectation |
|---|---|---|
| `changed[0]`: only job id ends in `112` | `[E1] changing only the stored job changes the hash`, line 27 | `.not.toBe(digest)` |
| `changed[1]`: only description gains `!` | `[E1] changing only the stored description changes the hash`, line 28 | `.not.toBe(digest)` |
| `changed[2]`: only note gains `!` | `[E1] changing only the stored note changes the hash`, line 29 | `.not.toBe(digest)` |
| `changed[3]`: only photo hash becomes `"ac".repeat(32)` | `[E1] changing only the stored photo changes the hash`, line 31 | `.not.toBe(digest)` |
| `changed[4]`: only photo becomes `null` | Same photo test, line 32 | `.not.toBe(digest)` |
| `new Set(changed.map(siteExtraContentSha256V1)).size` | `[E1] all five single-fact mutations have distinct hashes`, line 34 | `.toBe(changed.length)` (5), exact old assertion retained |

The version-string test is unchanged. A read-only Node comparison against HEAD confirmed every byte outside the split block is unchanged, the original input/base/digest declarations remain, each of the five mutation assertions appears once with the same expectation, and the exact old uniqueness assertion appears once. Splitting one test into these five raises the core file's count from 77 to 81 without adding or removing assertions.

### Commands and outcomes

Node `v24.17.0`, pnpm `10.28.1`; installed dependencies only, no install or download. All pnpm commands used `PATH="/private/tmp/jg-ent-3d-bin:$PATH"`, the existing cached-pnpm selector from round 1. Checks ran serially, build ran alone, and the single Vitest invocation used `--maxWorkers=2` with exactly one file. Typecheck, package lint and build also passed before E26 was added; they were then repeated with `--force` after the final test edits, with the final results below.

| Command | Exit code | Result |
|---|---|---|
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 successful tasks, 0 cached |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful tasks, 0 cached |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra-evidence.test.ts` | 0 | 1 file, 81 tests passed |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | Root purity, lane, money and commercial boundary checks; 7 successful package tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered ENT-3d lane passed |
| `pnpm openapi:check` | 1 | `tsx` CLI IPC socket denied with `listen EPERM`; checker did not execute |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same checker without CLI IPC; committed OpenAPI matches |
| `git diff --check` | 0 | No whitespace errors |

Turbo emitted the existing shared-cache write `Operation not permitted` warnings; forced tasks executed successfully. Next.js emitted the existing workspace-root and CSS/autoprefixer warnings; build passed.

**Database/migration and browser suites NOT RUN in this sandbox**, including E26, `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e`. The dispatcher states PostgreSQL cannot start and localhost cannot bind here; GitHub CI runs those suites after the dispatcher pushes. No database success is inferred from source inspection, syntax transpilation or core tests. No migration, backwards-compatibility impact, new operational alert or release-gate change. Independent exact-commit verdict, separate acceptance and CI remain pending.

No git write command, commit or push was run. The intended conventional commit subject and body are written to `/private/tmp/jg-msg-ent-3d.txt` for the dispatcher.


## Repair round r5 — merged refusal type, 13 October 2026

This round was built by Codex. The first-line Claude attribution and earlier run records above are historical and were retained unchanged. This is a builder run receipt, not an independent verdict or acceptance.

Starting and final existing head: `69ed28242bb53f7351a4d724e2f79063bd18c947`; branch `codex/sandbox/ent-3d`. No git write, commit, push, dependency install or package download was performed. The dispatcher owns the next commit.

### Defect reproduced before editing

`pnpm --filter @jobguard/db exec tsc -p tsconfig.json --noEmit` exited 1 (the underlying compiler exited 2): exactly three TS2345 diagnostics, at `site-extra-repository.ts:217:164`, `:280:56` and `:293:56`. The shared refusal could carry PHOTO_NOT_ACCEPTED or CONFIRMATION_MISMATCH into ENT-3c's narrow SorSiteExtraError constructor. This existing compiler check was the failing regression check; no test, assertion, setup, pinned list or pinned value was edited or added in this repair.

### Repair and scope inspection

Restored `Refusal` and `Authority` to their exact definitions on main at `59b1d08`. Added `SiteExtraRefusal = Refusal | EvidenceRefusal` for ENT-3d's evidence gate, free-text log and evidence refusal audit reasons. ENT-3c continues to use only narrow Refusal. Its entire append-only code block and `packages/core/src/site-extra-pricing.ts` are byte-identical to `59b1d08`; no ENT-3c code path or error type was edited. Restored the single blank line before `## 0141` in the migration index.

Type-only repair: TypeScript transpilation of the repository before and after produces identical JavaScript (SHA-256 `72688c25067d74abdd32c665317d9dcec17d3e52269cc205c6b89e7a4c424969`). ENT-3c's unchanged append-only block SHA-256: `f911c7ea5ef4a36e9e9945d8bc629e5ca611e66c15adf2870e3148fb43a73ed9`. These are read-only inspection results, not permanent byte-pinning tests.

All 457 tracked tests, SQL migrations and selected protected files checked against the starting HEAD were identical. The only tracked edits in this round are the repository type declarations, the migration-index blank line, and this appended receipt. No migration, data change, new operational alert or backwards-compatibility change. New GRANTs: none; standard F adds no application-login write grants in this repair.

Code-only `git diff --stat` against the starting HEAD:

```text
 packages/db/MIGRATIONS.md                | 1 +
 packages/db/src/site-extra-repository.ts | 9 +++++----
 2 files changed, 6 insertions(+), 4 deletions(-)
```

SHA-256 inspection evidence:

| File | Before | After / unchanged |
|---|---|---|
| packages/db/src/site-extra-repository.ts | 204508043b5a6003a48ba3871272abf2965c8560521259ed07ee44b0696491db | 21786923093bf3d6444e62566517486e9ca179b7794f7185fac9864a62a9d99e |
| packages/db/MIGRATIONS.md | 74ca7ce301ba283c103d2e26bd6d506c3d18cb5e033f8a3f42d58d98c19e6e18 | 9960aa5ff9c32d68ae019271c2995b64e32a79d416c379ecc3bd34d1dcdc484f |
| packages/core/src/site-extra-pricing.ts | unchanged | 0f425333e94e0b55da41d380f1e6f71daea11f92ea1c11a6f534c3963bc6da25 |
| apps/api/src/auth/context-boundary.test.ts | unchanged | a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 |
| packages/db/test/site-extra-pricing.integration.test.ts | unchanged | 912d5435264afee4a9403ce353f8c63b368871493bac00d37ccb6b4c5bc42eb6 |
| packages/db/test/site-extra-evidence.integration.test.ts | unchanged | 72e5e8b5db8fb19be6cf02a1dc47f6b23bf0cc7d53a828a07ecd3f8bf0706c26 |
| packages/db/test/site-extra-evidence-routines.integration.test.ts | unchanged | 06580a23bec2a34dbd65fc086ec2139de81611dba2e896e49097a9510a47c728 |
| packages/db/migrations/0141_site_extra_evidence.sql | unchanged | 253a65ba1297767cd30ed839cbbef0c570d0ffde99767f8b2de4b6a4ec85f93f |

### Commands and results for r5

Node `v24.17.0`, cached pinned pnpm `10.28.1`, TypeScript `5.8.3`, Turbo `2.10.12`, Vitest `4.1.11`. Every pnpm command began with `export PATH="$HOME/Library/pnpm/bin:$PATH"`. For working commands a second PATH prepend selected `/private/tmp/jg-ent-3d-r5-bin/pnpm`, a newly created temporary shim executing the already cached `~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No repository tooling or pin changed.

Before each heavy run, `memory_pressure | tail -1` reported 68% free (exit 0), and `df -g /System/Volumes/Data` reported 79 GB available (exit 0). Builds and tests never overlapped. All-package typecheck, lint and build ran exactly once after the repair, each with `--force`, zero cache hits:

| Command | Exit | Result |
|---|---|---|
| pnpm --filter @jobguard/db exec tsc -p tsconfig.json --noEmit (before repair) | 1 | Three TS2345 diagnostics; compiler exit 2 |
| pnpm exec turbo run typecheck --force | 0 | 7/7 package tasks executed, 0 cached |
| LANE_BASE_REF=origin/main pnpm exec turbo run lint --force | 0 | 7/7 package tasks executed, 0 cached |
| LANE_BASE_REF=origin/main node tools/lint.mjs | 0 | Purity (153 files), lane, money and commercial boundaries |
| LANE_BASE_REF=origin/main pnpm lint:lanes | 0 | Registered ENT-3d lane passed |
| pnpm build --concurrency=2 --force | 0 | 7/7 package tasks executed, 0 cached; web generated 30 static pages |
| HEAVY_SLOTS=2 ~/.local/bin/heavy-slot ent-3d-r5-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-extra-evidence.test.ts | 0 | 1 file, 81 tests passed; gate inspection refusals below |
| pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check | 0 | Same OpenAPI checker via the installed loader without CLI IPC; no generated-file edit |
| git diff --check (before checks and after build) | 0 | No whitespace errors |
| Read-only Node checks of main's ENT-3c block/types and 457 protected files | 0 | All comparisons equal |
| Read-only Node transpilation and SHA-256 comparison | 0 | Identical JavaScript; source hashes above |
| git rev-parse HEAD; git diff --stat; git diff --check; git status --short; shasum -a 256 packages/db/src/site-extra-repository.ts packages/db/MIGRATIONS.md docs/verdicts/ENT-3d/BUILDER_RECEIPT.md | 0 | Existing head unchanged; two code/documentation files edited before appending this receipt |

Inspection command inventory (compound inspection shells exited 0 unless otherwise stated; no tests in these reads): `pwd`, `git status --short`, `git rev-parse HEAD`, `cat AGENTS.md`, `rg -n 'ENT-3d|ENT-3c|site.extra|0141' BUILD_PLAN.md packages/db/MIGRATIONS.md`, `cat package.json`, `cat packages/db/package.json`, and `cat ~/.local/share/full-steam/handoffs/jobguard-task.md`.
Further reads: `sed -n '1,420p' packages/db/src/site-extra-repository.ts`; `sed -n '205,330p' packages/db/src/site-extra-repository.ts`; `rg -n 'ENT-3|9.1.4|9.1.8|9.1.9|9.1.11|## 014' BUILD_PLAN.md packages/db/MIGRATIONS.md`; `rg --files` filtered for site-extra, receipt, Vitest and lane paths; `cat ~/.local/bin/heavy-slot`; `which pnpm`; `cat packages/db/vitest.config.ts`; `cat ~/Library/pnpm/bin/pnpm`; `sed -n '1730,1905p' BUILD_PLAN.md`; `cat docs/contracts/site-extra-evidence-v1.md`; `cat docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`; `tail -25 packages/db/MIGRATIONS.md`; `cat turbo.json`; `git show 59b1d08:packages/db/src/site-extra-repository.ts | sed -n '1,90p'`.
Further reads: `rg -n '^## 9|^### 9|^### ENT-3' BUILD_PLAN.md`; `sed -n '1,65p' docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`; `cat pnpm-workspace.yaml`; `ls ~/Library/pnpm/.tools/pnpm`; `sed -n '1,120p' tools/lint.mjs`; `sed -n '1,100p' tools/agent-lane-boundary-lint.mjs`; `rg -n 'openapi:check|scripts' apps/api/package.json`; `cat packages/db/tsconfig.json`; `sed -n '538,706p' BUILD_PLAN.md`; `sed -n '790,821p' BUILD_PLAN.md`; `sed -n '795,820p' BUILD_PLAN.md`; `sed -n '821,835p' BUILD_PLAN.md`; `cat packages/core/src/site-extra-pricing.ts | head -70`; `sed -n '1,90p' packages/core/src/site-extra-pricing.ts`; `sed -n '1,110p' apps/api/src/contractor/site-extra-evidence.application.test.ts`; `cat packages/core/package.json`; `cat docs/contracts/site-extra-v1.md | head -35`; `git diff 59b1d08 HEAD -- packages/db/src/site-extra-repository.ts`; `tail -35 docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`.
Tool discovery reads: `ls -l node_modules/.bin/tsc node_modules/.bin/turbo`; `ls ~/Library/pnpm/.tools/pnpm/11.8.0/bin`; `rg --files --hidden` across existing corepack and pnpm cache directories, filtered for pnpm.cjs, 10.28.1 and rc.json; `head -45 node_modules/.bin/tsc`; `head -45 node_modules/.bin/turbo`; `cat ~/Library/pnpm/.tools/pnpm/11.8.0/bin/pnpm | head -10`. Reads of missing optional `~/.local/bin/pnpm`, `~/.local/share/pnpm/pnpm`, `.npmrc`, `apps/api/vitest.config.ts` reported absent files (exit 1); nothing was installed or changed. `ls -l /opt/homebrew/bin/pnpm ~/.local/share/pnpm/pnpm` and `ls -l ~/Library/pnpm/bin/pnpm ~/.local/bin/pnpm` were discovery reads, not executable fallbacks. `ls -l /private/tmp/jg-msg-ent-3d.txt` exited 0: the dispatcher's specified message path already existed.
The uncached global launcher attempts `pnpm --version`, `npm_config_manage_package_manager_versions=false pnpm --version`, and `pnpm --manage-package-manager-versions=false --version` stalled and were interrupted (exit 130 each). No success claimed for them. Temporary shim creation via Node exited 0; its `pnpm --version` returned 10.28.1 (exit 0). The type and blank-line repair used apply_patch successfully. Receipt append and message writing use Node; the existing message is preserved in a separate temporary file before writing the specifically requested dispatcher path.

### STOP and NOT RUN

Process inspection STOP: `ps -axo pid,ppid,etime,comm | rg 'pnpm|40586'` reported `zsh:1: operation not permitted: ps`. No retry or alternative process-list command was used by the builder.

Unit-test gate STOP: the exact heavy-slot command above reported `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found`, and `pgrep: Cannot get process list`. A stop signal was sent as soon as the output was inspected; by then the command had already completed with exit 0 and 81 tests passed. No further gate run or alternative test route was attempted. API `apps/api/src/contractor/site-extra-evidence.application.test.ts` and web `apps/web/app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts` are NOT RUN in r5 because the shared gate's system/process inspection was refused. The repaired repository has no standalone unit file; its database coverage remains with CI.

Database `packages/db/test/site-extra-evidence.integration.test.ts`, `packages/db/test/site-extra-evidence-routines.integration.test.ts`, the ENT-3c integration suites, `pnpm test:db`, `pnpm test:migrations`, browser `pnpm test:e2e` and the whole-repository `pnpm test` are NOT RUN (dispatch order: this sandbox cannot start PostgreSQL or a browser; CI and the dispatcher run them). No database or browser startup attempted. No clean install run (preinstalled dependencies only).

Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for shared-cache I/O; each forced package task still executed and returned success, and cache writes were not retried. Next.js emitted the existing workspace-root, cache-serialization and CSS/autoprefixer warnings; these did not fail the build.

### Builder scope check and remaining gates

Read-only scope inspection: narrow Refusal and ENT-3c's types restored, ENT-3c methods unchanged, evidence codes still available on ENT-3d's path, emitted repository behavior unchanged, no merged test edits, no pinned-value edits, no new privileges, migrations or screens. This is source inspection plus the executed checks above, not an independent review. No code STOP or policy question is required; the environment refusals and unexecuted suites are recorded above. Exact-new-commit independent review, separate acceptance, and CI remain pending. The dispatcher must bind those to its eventual commit; the only existing head available to this builder remains `69ed28242bb53f7351a4d724e2f79063bd18c947`.

Intended message path: `/private/tmp/jg-msg-ent-3d.txt`, subject `fix(db): isolate site extra evidence refusals from SoR paths`.

Final verification command batch: `git diff --check; git diff --stat; git status --short; git rev-parse HEAD` plus read-only Node assertions of the exact three edited paths, append-only historical receipt, unchanged main ENT-3c block/error file and dispatcher message: exit 0. Snapshot before this final log line: 3 files changed, 89 insertions(+), 4 deletions(-), including 83 receipt lines. Receipt/message Node writer: exit 0. No further source edits or heavy runs.


## Repair round r6 — pre-0141 compatibility, 13 October 2026

Built by Codex for dispatcher 3. The mandated historical first line is preserved verbatim; its attribution does not describe this repair. Branch `codex/sandbox/ent-3d`, existing/final available head `d777aa47c61473f9e64f45ca8fa79ea0249081c9`. No git write command, commit, install or download was run. The dispatcher will commit these working-tree changes and bind CI/reviews to its new head; this receipt is neither an independent verdict nor acceptance.

### Repair and tests-first evidence

ENT-3c's merged upgrade proof populates its preceding schema through the HEAD repository (`site-extra-pricing-upgrade.integration.test.ts:92`). The shared authority seam had acquired an unconditional 0141 call. Added the regression tests before editing repository code. The first unit run reproduced exactly that failure: **1 file, 7 tests, 1 failed / 6 passed, exit 1**; the non-v3 log rejected with `SiteExtraError: SITE_EXTRA_UNAVAILABLE` at the repository's original line 184. The three missing-routine v3 cases and three installed-routine guard cases already passed before the fix. No final unit pass is claimed.

Extracted main's two authority statements into a private base seam. Ordinary logs select it when the evidence gate has no evidence facts, and schedule-of-rates logs use it unconditionally. The exported evidence seam still runs the same three SQL statements, in order, on the evidence path: live guard, ENT-3a authority guard, ENT-3d evidence guard. No routine-existence fallback and no swallowed evidence failure. Missing 0141 on a photo, confirmation or combined request keeps the typed unavailable error.

New unit file `packages/db/test/site-extra-evidence-compatibility.test.ts`: [R6], seven routing cases with adapter doubles, no PostgreSQL claim. Its explicit path was added only to ENT-3d's own lane row.
Added [R6] to ENT-3d's existing `site-extra-evidence.integration.test.ts`: installs only through 0140, proves no `ent3d_` routine exists, ordinary log and replay, schedule-of-rates log and replay, photo/confirmation/both refused as typed unavailable with no receipt, business, evidence or audit change. This is a schema-compatibility regression, not a reshaped migration upgrade proof. Existing ENT-3d assertions and test titles are unchanged. The merged ENT-3c upgrade proof is untouched.

### Executed checks and STOPs

Installed Node `v24.17.0`; existing cached pnpm `10.28.1` selector at `/private/tmp/jg-ent-3d-r5-bin/pnpm` reused. Every pnpm command began with `export PATH="$HOME/Library/pnpm/bin:$PATH"`, followed by `export PATH="/private/tmp/jg-ent-3d-r5-bin:$PATH"`. No launcher replacement, package or pin change.
Before each heavy invocation, `memory_pressure | tail -1` exited 0 and showed 70% free. `df -g /System/Volumes/Data` exited 0 and showed 77 GB before the unit/typecheck, 75 GB before lint, 74 GB before build (all over 45 GB). Runs were serial; build and tests never overlapped.

| Command | Exit | Result |
| --- | --- | --- |
| `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot ent-3d-r6-first pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/site-extra-evidence-compatibility.test.ts` | 1 | First failing run: 1 file, 1 failed / 6 passed; helper inspection refusals below |
| `pnpm exec turbo run typecheck --force` | 0 | 7/7 tasks executed, 0 cached; 26.295 s |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7/7 tasks executed, 0 cached; 21.04 s |
| `node tools/lint.mjs` | 0 | Core purity (153 TypeScript files), lane, money boundary |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Same root checks after forced package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | ENT-3d lane passes; includes new regression file |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 tasks executed, 0 cached; 37.694 s, 30 static pages |
| `pnpm openapi:check` | 1 | STOP: tsx IPC socket startup refused; OpenAPI verification NOT RUN |
| `git diff --check` | 0 | No whitespace errors |

Typecheck, package lint and build ran **once each with --force**, no cache-hit claim. Their logs are `/private/tmp/jg-ent-3d-r6-{typecheck,lint,build}.log`. Turbo emitted shared-cache `WARNING IO error: Operation not permitted (os error 1)`; actual tasks executed successfully. No cache-write retry. Build's existing Next.js warnings did not fail the command.

Test gate STOP at `/Users/benharwood/.local/bin/heavy-slot:11`: the exact unit command above emitted `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found`, and `pgrep: Cannot get process list`. A Ctrl-C was requested immediately after seeing the output; the run had already completed with the first failure. No further gate run and no alternate test route attempted. Final verification of the new unit file is **NOT RUN (shared gate inspection permission refused)**. No production-code or merged-test STOP is needed.

OpenAPI STOP: `pnpm openapi:check` invokes `tsx src/generate-openapi.ts --check` and emitted `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/21541.pipe`, from `node:net:1987` (tsx `cli.mjs:53`). Log `/private/tmp/jg-ent-3d-r6-openapi.log`. No retry or alternate invocation.

NOT RUN: `packages/db/test/site-extra-evidence.integration.test.ts` (including the new 0140 regression), `packages/db/test/site-extra-evidence-routines.integration.test.ts`, `packages/db/test/site-extra-pricing-upgrade.integration.test.ts`, all other database suites, `pnpm test:db`, `pnpm test:migrations`: dispatcher order; cannot start PostgreSQL here, CI/dispatcher owns these runs. No PostgreSQL startup attempted. Browser suites and `pnpm test:e2e` NOT RUN (cannot start a browser here; no UI changes). Whole-repository/package tests and a clean install NOT RUN (scope and installed-dependencies order). Existing core/API/web evidence unit files NOT RUN in r6 after the gate refusal; their source/assertions are unchanged. No model/prompt/schema extraction change, so `pnpm eval` is inapplicable.

### Inspection and edit command inventory

The following read commands were executed in shell batches; successful batches returned 0 and performed no tests. The four batches ending in a missing optional file/glob returned 1, identified below. Commands are listed here in addition to the verification table so the receipt includes the unsuccessful discovery reads.

- `pwd`; `git status --short`; `git rev-parse HEAD`; `cat AGENTS.md`; `rg -n 'ENT-3d|ENT-3c|5\.16|0141' BUILD_PLAN.md`; `cat package.json`; `cat packages/db/package.json`.
- `cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md`; `cat /Users/benharwood/.local/bin/heavy-slot`; memory/disk commands above.
- `sed -n '1,320p' packages/db/src/site-extra-repository.ts`; `sed -n '55,115p' packages/db/test/site-extra-pricing-upgrade.integration.test.ts`.
- `git show origin/main:packages/db/src/site-extra-repository.ts | sed -n '1,270p'`; `rg --files packages/db/test packages/core/src apps/api/src docs/verdicts/ENT-3d | rg 'site-extra|SITE|ENT-3d'`; `rg -n 'ENT-3|resident|photo' BUILD_PLAN.md | head -65`; optional `cat tools/agent-lanes* 2>/dev/null` (no matching file, batch exit 1).
- `rg --files -g AGENTS.md -g '*vitest*'`; `cat docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`; `cat packages/db/test/site-extra-evidence.integration.test.ts`.
- `git diff origin/main -- packages/db/src/site-extra-repository.ts`; `sed -n '1,140p' packages/db/test/site-extra-pricing-upgrade.integration.test.ts`; optional `sed -n '1,100p' packages/db/test/site-extra-evidence-upgrade.integration.test.ts` (absent, batch exit 1).
- `rg --files packages/db/test packages/core/src apps/api/src docs/verdicts/ENT-3d | rg 'site-extra|ENT-3d'`; `rg -n 'siteExtraAuthoritySeam|ExtraTransactionSeam|fact =' packages/db/src/extra-repository.ts packages/db/src/site-extra-repository.ts`; `rg -n 'ENT-3|resident|photo' BUILD_PLAN.md | tail -35`; `rg --files -g AGENTS.md -g '*vitest*' -g '*lane*' | head -40`; `sed -n '1,95p' docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`.
- Optional `sed -n '1,125p' packages/db/test/site-extra-evidence-test-helpers.ts` and `sed -n '1,100p' packages/db/test/site-extra-evidence.test.ts` (both absent, batch exit 1); `cat packages/db/vitest.config.ts` succeeds.
- `rg --files packages/db/test | rg 'site-extra|extra-fixtures'`; `rg -n 'ENT-3d|site-extra-evidence|site-extra-repository' tools/agent-lane*`; `sed -n '1,95p' packages/db/src/extra-repository.ts`; `sed -n '55,105p' packages/db/test/site-extra-pricing-upgrade.integration.test.ts`; `sed -n '1,95p' packages/db/test/site-extra-evidence-fixtures.ts`; `sed -n '1,18p' docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`; `rg -n '\| ENT-3 |9\.1\.4|Operative capture' BUILD_PLAN.md`.
- `sed -n '80,110p' packages/db/test/site-extra-pricing-upgrade.integration.test.ts`; `sed -n '1,80p' packages/db/test/site-extra-pricing-fixtures.ts`; `sed -n '1,75p' packages/db/test/site-extra-fixtures.ts`; `sed -n '240,275p' packages/db/src/site-extra-repository.ts`.
- `sed -n '566,600p' BUILD_PLAN.md`; `sed -n '795,824p' BUILD_PLAN.md`; `cat docs/contracts/site-extra-evidence-v1.md`; `rg -n 'seam|source|readFile|ent3d' apps/api/src/contractor/site-extra-evidence.application.test.ts packages/db/test/site-extra-evidence-routines.integration.test.ts`; `rg -n 'ent-3d' config/agent-lane-assignments.json`; `rg --files -g AGENTS.md`; `node --version`.
- `sed -n '70,110p' apps/api/src/contractor/site-extra-evidence.application.test.ts`; `sed -n '1,36p' packages/db/test/site-extra-evidence.integration.test.ts`; `rg -n 'clusterBefore' packages/db/test/site-extra-pricing-fixtures.ts`; `sed -n '115,165p' packages/db/test/site-extra-pricing-fixtures.ts`; `cat packages/db/tsconfig.json`; optional `cat apps/api/vitest.config.ts` (absent, batch exit 1).
- `cat packages/db/src/watchdog.ts | head -60`; `head -20 apps/api/src/contractor/site-extra-evidence.application.test.ts`; `sed -n '1,90p' packages/db/test/site-extra-pricing.integration.test.ts`; `cat tools/agent-lane-boundary-lint.mjs | head -70`; `sed -n '1,30p' packages/db/test/site-extra-evidence-routines.integration.test.ts`.
- `sed -n '1,60p' packages/db/test/site-extra-pricing.integration.test.ts`; `sed -n '130,150p' packages/db/test/site-extra-evidence-routines.integration.test.ts`; `sed -n '1,30p' packages/db/src/tenant-context.ts`; `rg -n 'GRANT' packages/db/migrations/0141_site_extra_evidence.sql`; `tail -35 docs/verdicts/ENT-3d/BUILDER_RECEIPT.md`.
- `sed -n '135,151p' packages/db/test/site-extra-evidence-routines.integration.test.ts`; `sed -n '1,28p' packages/db/src/tenant-context.ts`; grant search above repeated; `rg -n 'shim|pnpm.cjs|r5|--force' docs/verdicts/ENT-3d/BUILDER_RECEIPT.md | tail -18`; `ls -l /private/tmp/jg-msg-ent-3d.txt /Users/benharwood/Library/pnpm/bin/pnpm`.
- `python3` heredoc: insert only the new unit path into ENT-3d's own lane allow array (assert one match), exit 0; memory/disk checks above; `ls -l /private/tmp/jg-ent-3d-r5-bin/pnpm`, exit 0. Three `apply_patch` operations succeeded: add unit file, add owned integration regression, then fix repository.
- `sed -n '180,192p' packages/db/migrations/0141_site_extra_evidence.sql`; `git diff --stat`; `git diff -- packages/db/src/site-extra-repository.ts`; `git status --short`; `git rev-parse HEAD`; `sha256sum` on the four source/config paths below plus the merged upgrade proof and 0141 migration; batch exit 0.
- `tail -12 /private/tmp/jg-ent-3d-r6-typecheck.log`; `tail -10 /private/tmp/jg-ent-3d-r6-build.log`, each exit 0. Forced check wrappers redirected output to their named log, saved the command status, printed the tail, and returned that status.
- `python3` heredoc: read-only `git show HEAD:<path>` and SHA-256 comparison for the eight unchanged paths below, exit 0.
- `cat /private/tmp/jg-ent-3d-r6-openapi.log`; `nl -ba /Users/benharwood/.local/bin/heavy-slot | head -18`; `git diff --numstat`; `wc -l packages/db/test/site-extra-evidence-compatibility.test.ts` (74 lines), batch exit 0.
- Final `python3` heredoc: assert original receipt prefix equals HEAD, append this r6 receipt, preserve previous intended-message contents in a new `/private/tmp` file, write the authorized intended message. Final read-only verification checks whitespace, stats, status, head, exact five changed paths, append-only receipt, unit line count and receipt hash. Results are printed to the dispatcher; no git writes.

### Privileges, unchanged files and scope

**Standard F: no new GRANT in r6, no table write grant, no migration change.** For completeness, migration 0141's existing five EXECUTE grants (unchanged; one per line):

- `app.ent3d_content_sha256(uuid,text,text,text)` → `jobguard_runtime`, EXECUTE.
- `app.ent3d_confirmation_document(uuid,uuid,uuid,text)` → `jobguard_runtime`, EXECUTE.
- `app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid)` → `jobguard_runtime`, EXECUTE.
- `app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text)` → `jobguard_runtime`, EXECUTE.
- `app.ent3d_require_site_extra_evidence(uuid,uuid)` → `jobguard_runtime`, EXECUTE.

Source/config SHA-256 after repair:

```text
d4d7aef40ec352ee1d76c748799929dd58b8aff7f3c7a5bf852c1c2ac1e1bc47  packages/db/src/site-extra-repository.ts
ff78a242d486508887c958d0d808cab94e6812b3e2502561e100f7766813870c  packages/db/test/site-extra-evidence-compatibility.test.ts
9f9ee253c7d98a548fcdb1d2af2a7767f660fc7fd3cebfe5681f78751cb3f4e1  packages/db/test/site-extra-evidence.integration.test.ts
c18282bb1f1f592f83c31badb099ea1445040076f45da9f66adf88d03c6610cb  config/agent-lane-assignments.json
```

Unchanged from HEAD, verified against git-show bytes (no permanent file-hash test added):

```text
70966c60f796db9fa285b25be851ec2aa1385a39b6f31b1143997735da938341  packages/db/test/site-extra-pricing-upgrade.integration.test.ts
253a65ba1297767cd30ed839cbbef0c570d0ffde99767f8b2de4b6a4ec85f93f  packages/db/migrations/0141_site_extra_evidence.sql
06580a23bec2a34dbd65fc086ec2139de81611dba2e896e49097a9510a47c728  packages/db/test/site-extra-evidence-routines.integration.test.ts
ce3db85c3a7d057cca592b73e89ecce468fe79d0b7c5961aa6368ef75125dbde  packages/db/src/extra-repository.ts
efe6f104c0a9e7ae408ce661b23fcbd181a11eb6dce65624ba61b14a73ff9de9  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
```

`git diff --stat` before this append (untracked unit file is separately 74 added lines):

```text
 config/agent-lane-assignments.json                 |  2 +-
 packages/db/src/site-extra-repository.ts           | 15 ++++++++---
 .../test/site-extra-evidence.integration.test.ts   | 30 ++++++++++++++++++++++
 3 files changed, 42 insertions(+), 5 deletions(-)
```

Exactly five repair paths: repository, owned integration test, new unit file, ENT-3d's own lane row, this receipt. No change to BUILD_PLAN, merged tests, pinned values, routes, boundary lists, fingerprints or schema. Receipt retains its historical prefix byte for byte. Intended message: `/private/tmp/jg-msg-ent-3d.txt`, conventional subject `fix(db): preserve pre-0141 site extra logging`.

### Builder scope check (source-inspected, not a reviewer verdict)

The base seam emits main's original authority SQL; the SoR transaction preserves main's original live/authority/pricing order. Evidence-bearing calls still execute all existing read, writer and transaction guard routines. Missing evidence routines remain unavailable rather than a fallback to ordinary capture. Authority checks precede evidence access; existing audit/refusal, payload conflict and replay handling are untouched. Test doubles do not establish PostgreSQL behavior: the new integration case and the merged failing proof require CI. Rollback/forward fix is a repository-code change only; no data migration, commercial policy change, new alert or release authorization. No code STOP, merged assertion relaxation, or BLOCKING policy question. Remaining gates: final unit execution after the helper refusal is resolved, real database CI, OpenAPI verification in an environment that permits the IPC socket, exact-new-head independent verdict and separate acceptance. Final available head remains `d777aa47c61473f9e64f45ca8fa79ea0249081c9`; the dispatcher owns the new commit.


## Catch-up r7 — 13 October 2026, dispatcher 3

Performed by Codex. The historical first line naming Claude is retained verbatim under the dispatch order; it describes the original build, not this catch-up. Builder evidence only: no independent verdict, acceptance, merge, commit, push, migration execution or release authorization.

Available head remains `5d2c196b2fe2161b97f5733f951472ae0d293a26`; merge parent `6659fb58791ec22588948f005b2bd4f6b299fa48`. The dispatcher owns the eventual merge commit, whose hash does not yet exist. Branch `codex/sandbox/ent-3d`. Intended merge message written to `/private/tmp/jg-msg-ent-3d.txt`, beginning `Merge remote-tracking branch 'origin/main' into codex/sandbox/ent-3d`.

### Each conflicted file

| File | Resolution |
|---|---|
| `BUILD_PLAN.md` | Complete main ENT-3b paragraph retained; complete ENT-3d paragraph follows. ENT-3c paragraph unchanged. |
| `apps/api/openapi.json` | All main paths retained; exact main v1/v2 schemas followed by v3; evidence 422 response retained. Parses without duplicate keys. |
| `apps/api/src/contractor/site-extra.application.ts` | Main v1/v2 parser, visit methods and visit reference retained; separate v3 branch added, returning only its evidence response. Pricing methods unchanged. |
| `apps/api/src/contractor/site-extra.controller.ts` | Main v1/v2 schemas followed by v3; evidence refusal response retained; summary describes all three versions. |
| `apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts` | Main v1/v2 parsing retained with v3 fallback; validated body reaches the same application. |
| `config/agent-lane-assignments.json` | Both main ENT-3b and branch ENT-3d registrations retained; all other registrations preserved; valid JSON without duplicate keys. |
| `packages/core/src/index.ts` | Main site-visit export retained, followed by site-extra-evidence export. |
| `packages/db/MIGRATIONS.md` | Complete descriptions retained in numeric 0139, 0140, 0141 order. |
| `packages/db/src/site-extra-repository.ts` | Main visit refusal reason, precheck, stored visit reference and transaction guard retained alongside evidence gate. Authority/pricing use narrow Refusal; evidence path alone uses SiteExtraRefusal. Non-evidence paths use the base seam and access no 0141 routine. |

The migration runner already lists 0139, 0140, 0141 correctly and was not edited. Both migration descriptions from main and both main ENT-3b/ENT-3c ledger paragraphs were compared as complete text. The OpenAPI comparison proves all other paths and all other top-level fields equal main; the original v1/v2 schemas remain exact. These are static preservation checks, not application or integration test results.

### Checks and refusals

No cache result is claimed. Forced typecheck, lint and build were each invoked once with `--force`; pnpm refused before Turbo or any compiler started. Counts: zero unit tests, zero database tests, zero browser tests executed.

The required helper's exact denied diagnostics were `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found`, and `pgrep: Cannot get process list`. No helper bypass or further unit test attempt was made. The core unit attempt ultimately returned exit 1 at the pnpm launcher.

The launcher refusal was: `Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.` No setting to ignore the refusal was used. The installed wrapper points to pnpm 11, which attempts verification of the repository's pinned 10.28.1. No package install command or successful download occurred; dependencies, pins and lockfile were not edited.

A cleanup attempt to signal only the owned stalled helper group (`os.killpg(11332, signal.SIGTERM)`) returned exit 1 with `PermissionError: [Errno 1] Operation not permitted`. No alternative signal or termination route was attempted. That helper run subsequently exited on its own with the launcher refusal.

OpenAPI CLI returned exit 1 before generation: `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/15733.pipe`. No alternate OpenAPI execution route was tried.

Lane lint returned exit 1 listing main's staged files outside ENT-3d. The lane tool inspects the uncompleted merge index as well as working changes; those files are byte-identical to the initial dispatch state. No lane expansion, lint weakening or git write was used. The dispatcher must repeat it after completing the merge.

The raw conflict-string grep reports only literal historical command strings in merged `docs/verdicts/ENT-3b/r3-command-log.json` at lines 9, 63 and 203. An anchored scan finds zero active conflict-marker lines. This merged log was preserved; it cannot be edited to erase the raw grep hits while retaining main exactly.

### STOP — pinned compatibility assertions (source finding; tests NOT RUN)

No test or pinned value was edited. Main now calls `app.ent3b_require_open_visit` after the original authority guard. The existing expected call lists omit it, so coordinator action is required:

- `packages/db/test/site-extra-evidence-compatibility.test.ts:51`: before `  ]);`; needed after `   "SELECT app.ent3b_require_open_visit($1,$2)",` then `  ]);`.
- `packages/db/test/site-extra-evidence-compatibility.test.ts:68`: before `  expect(f.query.mock.calls.map(([sql]) => sql).slice(-3)).toEqual([`; needed after `  expect(f.query.mock.calls.map(([sql]) => sql).slice(-4)).toEqual([`.
- `packages/db/test/site-extra-evidence-compatibility.test.ts:71`: before `   "SELECT app.ent3d_require_site_extra_evidence($1,$2)",`; needed after `   "SELECT app.ent3b_require_open_visit($1,$2)",` then the original evidence-guard line.

This order says to stop rather than edit a pinned value. Preserving main's guard and preserving these expected lists together leaves this known assertion mismatch; no code workaround was introduced. A first failing test run could not be obtained because the required launcher refused execution. No new acceptance test was added for this merge-only catch-up.

### NOT RUN files

- `packages/core/src/site-extra-evidence.test.ts`: requested helper attempt exited 1 before Vitest (launcher signature refusal); zero tests ran.
- `packages/db/test/site-extra-evidence-compatibility.test.ts`: helper/launcher blocked; pinned-list STOP above.
- `apps/api/src/contractor/site-extra-evidence.application.test.ts`: helper/launcher blocked.
- `apps/web/app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts`: helper/launcher blocked.
- `packages/db/test/site-extra-evidence.integration.test.ts` and `packages/db/test/site-extra-evidence-routines.integration.test.ts`: NOT RUN (cannot start PostgreSQL here; database suites prohibited for this catch-up).
- Browser suites: NOT RUN (cannot start a browser here; browser suites prohibited for this catch-up). No browser spec belongs to this server-only slice.

### Grants and migrations

No new GRANT was introduced or changed by r7. Migration 0141 remains byte-identical. Its five pre-existing EXECUTE grants are listed individually here; standard F remains unchanged, with no new direct INSERT/UPDATE/DELETE grant to the application login:

- `GRANT EXECUTE` on `app.ent3d_content_sha256(uuid,text,text,text)` to `jobguard_runtime`.
- `GRANT EXECUTE` on `app.ent3d_confirmation_document(uuid,uuid,uuid,text)` to `jobguard_runtime`.
- `GRANT EXECUTE` on `app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid)` to `jobguard_runtime`.
- `GRANT EXECUTE` on `app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text)` to `jobguard_runtime`.
- `GRANT EXECUTE` on `app.ent3d_require_site_extra_evidence(uuid,uuid)` to `jobguard_runtime`.

No migration, backfill, privilege change, prompt/model change, external action, new alert or production policy change was made in this catch-up. Existing forward-fix strategy and release gates remain.

### Scope evidence

A SHA-256 snapshot of every tracked file at dispatch entry was saved to `/private/tmp/ent-3d-r7-initial-sha256.json`. Before this receipt append, every tracked file outside the nine conflict paths was compared to that snapshot and remained identical. No merged test or pinned value changed. Resolution SHA-256 values:

```text
21d7c5ba11b66d000c3689b8c65d9defa9c8840889cde4ff1241105f558682b3  BUILD_PLAN.md
15dd797c3d11c63da21aa659501b06fccfd51dc09115b58abddb0d05598a4bb8  apps/api/openapi.json
e705ae4084b7325bda656d560e17ddb29f816a2dd02231aabfbb26a2e5375bfa  apps/api/src/contractor/site-extra.application.ts
b3ffcbe8ee9bd6ad85e25652fe9a3ff0dbbcefc4a12d669e3dd3e369e115bf83  apps/api/src/contractor/site-extra.controller.ts
fd027317b92103ccbeeeb7825b2afc09b05b4673192bd5850d0d295ffe8a4e03  apps/web/app/api/contractor/jobs/[id]/site-extras/route.ts
04164a0ca67e08ce117e539015416ad0f7016e1a88d40a6d112584c642c3e44b  config/agent-lane-assignments.json
626429cce51c620e254db160138fbab68ba7a0c7ce176b86bd7a526be079a95e  packages/core/src/index.ts
84541cfdbbaa0971f3736357eb17dc18eb5689624974a5214248e46e4de40ea9  packages/db/MIGRATIONS.md
f593561fd81e046e4a00b770a75251ceb9f4d9105c9bb1d4efec27ac61596758  packages/db/src/site-extra-repository.ts
```

Selected unchanged files (equal to initial dispatch bytes):

```text
95bb5640ec12ac7dff1e25b303e0224bea6ebbbdd843efe370c284ab2abe9fa2  packages/db/src/migrate.ts
58174fc0e3cd28a9c5b27c5cf344565df68fb1fca1b557bd091aa21ddfcf4377  packages/db/migrations/0139_site_visit_closeout.sql
29605ffb78bc6193da5d1483834c15456b0a23561cd2bb95f26bc564dd1ff852  packages/db/migrations/0140_site_extra_pricing.sql
253a65ba1297767cd30ed839cbbef0c570d0ffde99767f8b2de4b6a4ec85f93f  packages/db/migrations/0141_site_extra_evidence.sql
ff78a242d486508887c958d0d808cab94e6812b3e2502561e100f7766813870c  packages/db/test/site-extra-evidence-compatibility.test.ts
1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
37e980e750348b4b9a2a483f66179662b52035d17e0822526b0b28cec265fff8  docs/verdicts/ENT-3b/r3-command-log.json
```

`git diff --stat` before this receipt append (index intentionally remains unmerged):

```text
 BUILD_PLAN.md                                      | Unmerged
 BUILD_PLAN.md                                      |   2 +
 apps/api/openapi.json                              | Unmerged
 apps/api/openapi.json                              | 248 ++++++++++++++++++++-
 apps/api/src/contractor/site-extra.application.ts  | Unmerged
 apps/api/src/contractor/site-extra.application.ts  |  77 ++++++-
 apps/api/src/contractor/site-extra.controller.ts   | Unmerged
 apps/api/src/contractor/site-extra.controller.ts   |   8 +-
 .../api/contractor/jobs/[id]/site-extras/route.ts  | Unmerged
 .../api/contractor/jobs/[id]/site-extras/route.ts  |   7 +-
 config/agent-lane-assignments.json                 | Unmerged
 config/agent-lane-assignments.json                 |   2 +
 packages/core/src/index.ts                         | Unmerged
 packages/core/src/index.ts                         |   1 +
 packages/db/MIGRATIONS.md                          | Unmerged
 packages/db/MIGRATIONS.md                          |   8 +
 packages/db/src/site-extra-repository.ts           | Unmerged
 packages/db/src/site-extra-repository.ts           |  16 +-
 9 files changed, 351 insertions(+), 18 deletions(-)
```

### Builder scope inspection

Source-inspected, not a reviewer verdict: request schemas select v1/v2/v3 distinctly; v3 cannot supply a visit. The persisted-session resolver is unchanged. Authority precedes visit/evidence checks. Main's visit guard participates in the base seam, and the evidence guard follows it only for evidence-bearing calls. Pricing's authority/refusal type stays narrow and its transaction uses the base seam. All main pricing and visit methods remain. No test was changed to make this claim pass. Compiler and runtime evidence are unavailable here and remain a hold. The dispatcher needs real forced checks, targeted tests, PostgreSQL evidence, the coordinator's pinned-assertion decision, an exact-commit independent verdict and separate acceptance before merge/release.


### Final r7 command results

Every check command below ran through `/private/tmp/ent-3d-r7-run.py`, which captured its output, final exit code and elapsed time. The launcher refused before the three forced tasks could execute; zero Turbo tasks and zero tests ran. All three used `--force`; none was repeated.

| Check | Exact shell command | Exit | Executed count |
|---|---|---|---|
| core-unit | `export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure \| tail -1; df -g /System/Volumes/Data; ~/.local/bin/heavy-slot ent-3d-r7-core pnpm --filter @jobguard/core exec vitest run src/site-extra-evidence.test.ts --maxWorkers=2` | 1 | 0 tests |
| lane-check | `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | 1 check |
| openapi-check | `apps/api/node_modules/.bin/tsx apps/api/src/generate-openapi.ts --check` | 1 | 1 check |
| typecheck | `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm exec turbo run typecheck --force` | 1 | 0 Turbo tasks |
| lint | `export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure \| tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 1 | 0 Turbo tasks |
| build | `export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure \| tail -1; df -g /System/Volumes/Data; pnpm build --concurrency=2 --force` | 1 | 0 Turbo tasks |

Additional completed commands and results:

- `export PATH="$HOME/Library/pnpm/bin:$PATH"; export npm_config_manage_package_manager_versions=false; export COREPACK_ENABLE_NETWORK=0; pnpm --version`: exit 1, same signature-verification refusal; no version bypass succeeded or was used for verification.
- Python cancellation of owned helper group via `os.killpg(11332, signal.SIGTERM)`: exit 1, permission refusal quoted above; no repeat.
- `git diff --check`: exit 0 on both post-resolution and final runs.
- Raw `git grep -n` for the two marker strings: exit 0, three literal historical command-log matches; anchored version: exit 1, zero active marker lines. Neither scan edited any file.
- `memory_pressure | tail -1`: exit 0 on each resource check, 68–72% free; `df -g /System/Volumes/Data`: exit 0, 65 GB available throughout. No run went below the dispatch thresholds.
- `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse MERGE_HEAD`, `git ls-files -u`, `git diff --stat`, `git diff --name-only origin/main`, and `git diff --numstat origin/main -- docs/verdicts/ENT-3b packages/db/test apps/api/src/auth/context-boundary.test.ts`: exit 0, read-only merge/scope inspection. The index retains nine unmerged entries until the dispatcher stages the resolved files.
- `cat AGENTS.md`, `cat ~/.local/share/full-steam/handoffs/jobguard-task.md`, contract and receipt reads, `cat package.json`, workspace/package/Turbo configuration reads, `cat tools/lint.mjs | head -65`, and `cat ~/.local/bin/heavy-slot`: exit 0, instruction/tool inspection only.
- `rg`, `rg --files`, `sed -n`, `head`, `tail` and `nl -ba` inspections of the task ledger, nine conflicting files, source types, applicable test files, OpenAPI generator and grants: completed; the `.npmrc` lookup reported no such file (no modification). No test command is hidden among these reads.
- Launcher-path inspections with `ls -l`: existing pnpm wrapper, Turbo and Vitest binaries read successfully; absent `~/.local/bin/pnpm`, repository `.bin/pnpm`, `/opt/homebrew/bin/pnpm` and `/usr/local/bin/pnpm` reported no such file. No executable was installed or replaced.
- Python dispatch snapshot and nine-file conflict resolution: exit 0, all nine resolved, JSON parses.
- Python JSON/marker/change-set inspection: exit 0, exactly nine tracked paths changed before the receipt; one OpenAPI path differs from main.
- Python final preservation assertions and hash snapshot: exit 0, every other tracked file byte-identical, exact main v1/v2 schemas and main migration/ledger paragraphs retained, migration runner sorted 0139/0140/0141.
- Python intended-message write and receipt append: exit 0, only requested artifact/receipt paths written.

Final check status: typecheck exit 1, lint exit 1, build exit 1 (all launcher refusals, checks NOT RUN); unit attempt exit 1 with zero tests; lane lint exit 1; OpenAPI CLI exit 1 with IPC refusal. JSON, preservation, migration order, absence of active markers and whitespace checks pass as static checks only. Head unchanged at `5d2c196b2fe2161b97f5733f951472ae0d293a26`.
