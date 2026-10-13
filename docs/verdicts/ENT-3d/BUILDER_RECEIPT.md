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
