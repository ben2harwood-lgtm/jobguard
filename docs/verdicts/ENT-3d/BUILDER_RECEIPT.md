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
