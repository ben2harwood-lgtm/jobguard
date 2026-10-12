# M4-8-S builder receipt — Continuation round 1

12 October 2026. Builder: Codex GPT-6.1 Sol (dispatch attribution). Branch `codex/sandbox/m4-8-s-r2`; LOCAL only.

**Implementation built for review; technical acceptance remains HOLD for PostgreSQL/browser execution, a fresh full build and independent verdicts.** No commit, push, acceptance or release was performed. The first-round receipt is preserved verbatim in [ROUND0-before-continuation-2026-10-12.md](ROUND0-before-continuation-2026-10-12.md).

## Base and ruling

Supplied clean HEAD: `1267a2f07c3cb7478d3f3633ed5217822bfd40df`, the first build round over main `8472ae0` through merge `7387c8220a33197fd90ce8a74e20ac7bbeb55512`. SV-2 is merged as `a0963f4`. The merged public joined entry is reused; its implementation is not copied or changed in this round. Local origin/main is ahead of the supplied base, so the origin/main diff also includes other tasks absent from this worktree; those differences are not this continuation's edits. No fetch or git write was run.

The coordinator's 12 October 22:40 ruling supersedes the former literal prohibition on caller job/case foreign-key share locks. The former lock-order HOLD is lifted; all other issued/addendum requirements remain in force.

**Lock order:** On every write path, the canonical case advisory key is taken first before any job/case access, business locks and allocation/Decision/source writes follow, `commandInTransaction` runs last for an allocation or reversal, the caller appends its own audit, and the transaction commits.

The key is exactly the merged two-key `pg_advisory_xact_lock(hashtext(tenant_uuid_text),hashtext(case_uuid_text))`. The checked writer retakes it before job/case reads, receipt/source locks and referencing inserts; it adds no explicit parent-row lock and follows the merged repository shape. Same-case v1 callers must take that same key first. The joined acquisition is reentrant. Nothing is deferred; all constraints are immediate. A newly recorded joined command holds the audit head; replay returns before the merged audit append. After the joined call the repository does only its own audit and commit. Review-only commands append Decision/review and caller audit without a landing transition; replays create no further business or audit rows.

## What was built

- Public `RecoveryAllocationRepository` allocator/reversal caller: per-call verified tenant, persisted session owner check, strict command/artifact schemas, server-derived splits and source facts, current review authorization, same-command replay, exact SH-1 mappings, persisted projections and joined case events.
- Migration **0136**, registered LAST: six immutable tenant-owned tables, their qualified keys/foreign keys, FORCE RLS, protected writes, source/rational validation and the checked writer. No fingerprinted table gains a column.
- Reviews create Decisions. Exact approval atomically records the approved resolution, authorization, case allocation/reversal, line-source bindings and receipt-line fractions before the joined command. Actor authority comes from the persisted practice session, with the routine's own current owner predicate.
- Reliable generated remittance sources use a versioned JSON PNG text chunk bound to finalized original bytes, object version and SHA-256. Commands select a source, never supply its shares. Fresh refund/credit remittances use item-specific shares; inherited remittances and unallocated reversals use SH-1's exact rules. PNG bounds/CRCs and strict JSON are checked; the writer checks hash-bound source inclusion independently.
- Nest application/controller, in-process workspace composition, authenticated thin Next routes, generated OpenAPI, allocation/reversal workbench and one mount. The workbench supports recorded payment-reversal and credit-note selection, optional finalized remittance selection, exact review/approval, source drill-down, held/reopened/paused states and focused typed refusals.
- Four authorized registry rows use **post_live_billing**, matching the existing recovery/billing classification. No watchdog_live_only route or replay-harness widening was added.
- Four real-PostgreSQL suites written tests first, catalogue rows appended in the three authorized existing suites, six browser journeys for BOTH existing projects. No provider success response is mocked in browser journeys.
- Reversal commands gained optional finalized `remittanceEvidenceId`; client shares remain refused. First-round J-REQ1–J-REQ3 are unchanged in this round.

The earlier apparent migration-role read-policy question was resolved by reading the actual later amendments: 0026 extends final-account policies and 0018 extends evidence/invalidation policies to `jobguard_migration`. No new role, role membership or old-policy exception is needed.

## Acceptance disposition

“BUILT” below means source and named executable coverage exist; it does **not** claim PostgreSQL/browser execution or independent verification.

| Item | Disposition / evidence |
| --- | --- |
| B1 | BUILT: reviewed gross/net/tax allocations, exact Decision authorization and joined `record_landing`; integration DW1 plus approval/refusal tests. |
| B2 | BUILT: workbench recorded reversal/credit sources, exact reviewed reversal and joined `reverse_landing`; browser DW4 and credit journey. |
| B3 | BUILT: persisted `receipt_line_allocation`; line integration saved F4/F4b/F6. |
| B4 | BUILT: source/version/rule/fractions and qualified invoice/final-account line bindings; source drill-down and catalogue tests. |
| B5 | BUILT: earliest server source existence time, kernel deposit cutoff and direct SQL zero/cross-product validation; persisted later-line refusal test. Saved F5 remains Q2-held. |
| B6 | BUILT: selected item-specific refund/credit and pro-rata otherwise; real-PG named partial refund/credit tests and credit browser journey. |
| DW1 | BUILT: exact 38400/32000/6400 and 300000/250000/50000, source hashes/versions/reviewer/Decision checks, reload/Jobs/second-context browser proof. NOT RUN on PG/browser. |
| DW2 | BUILT pure F4/F4b/F5/F6/F7; saved F4/F4b/F6 tests written. Saved F5/F7 HELD Q2. |
| DW3 | BUILT: direct runtime writer overcash/evidence/claim/job/line/movement refusals, replay/races, UI focused error; NOT RUN on PG/browser. |
| DW4 | BUILT: reverse £3,000, 32000 eligible net/6400 tax, 2217600 invoice balance, reopened 250000 outstanding and pause, originals retained; NOT RUN. |
| DW5 | BUILT: claim-2 evidence hold only, gross338400/balance1917600 unchanged and original facts preserved; unspecified Q3 figures remain unasserted. NOT RUN. |
| DW6 | BUILT core fixed explicit → separate invoice → pro-rata hierarchy; saved F6 source precedence; supplementary saved half HELD Q2. |
| DW7 | BUILT pure all-rule deposit exclusion, persisted late-line exclusion and explicit refusal; NOT RUN on PG. |
| DW8 | BUILT real-PG exact fractions, parallel/replay/cash races, same-case interleavings, item-specific refund/credit, pro-rata reversal, split/combined equality; NOT RUN. |
| DW9 | BUILT unrounded denominator43 and API fraction strings; own-core architecture test passes; stored fraction proof NOT RUN. |
| M-LOCK | BUILT `recovery-allocation-races.integration.test.ts`: own cluster, held canonical key/pg_stat_activity technique, both A/B orders for same-ID and distinct-ID callers, both orders against merged public case command and `app.approve_synthetic_landing`, 3s lock timeout/5s statement timeout, no deadlock/timeout and one winning write; replay assertions preserve row counts. NOT RUN. |
| J-REQ1–3 | PRESERVED byte-identically to HEAD1267a2f: guarded tenant proof, J2/J3/J11 in-transaction positive reads, replay/audit-head distinction. Prior mock-unit execution is in round0; real-PG tests remain NOT RUN. |

The untouched v1 landing routine refuses an exhausted-receipt replay rather than returning a new success; the race test asserts its 23514 refusal and no additional write. No v1 behavior was rewritten to make that test pass.

## Exact reference figures

| Scenario | Required exact pence / rational | Evidence |
| --- | --- | --- |
| DW1 | gross338400; net282000; tax56400 | Pure passed; PG/browser written, NOT RUN. |
| DW4 | net32000; tax6400; balance2217600; outstanding250000 | PG/browser written, NOT RUN. |
| DW5 | gross338400; balance1917600; only case2 held | PG/browser written, NOT RUN. |
| F4 | catch net2000000/43; pro_rata; fee cross-check4651 | Pure passed; saved proof NOT RUN. |
| F4b | cumulative80000/1; fee8000, delta3349 | Pure passed; saved proof NOT RUN. |
| F5 | deposit0/1 then40000/1; fee4000 | Pure passed; saved half Q2-held. |
| F6 | catch0/1; explicit non-catch source; fee0 | Pure passed; saved proof NOT RUN. |
| F7 | catch80000/1; separate_invoice; main4032000 untouched; fee8000 | Pure passed; saved half Q2-held. |

Fee checks are test-only imports of the existing kernel. No entitlement, cumulative fee principal, fee, posting, journal, statement or collection is derived or stored by this implementation.

## Migration and grants

0136 adds `recovery_allocation_command`, `recovery_allocation_review`, `recovery_allocation_line_source`, `recovery_case_allocation`, `recovery_case_allocation_reversal`, `receipt_line_allocation`; two partial line-uniqueness indexes plus base-binding uniqueness; mutation guards and the specific checked writer/private fraction-integrity helper. All six are owned by `jobguard_migration`, ENABLE/FORCE RLS, non-null tenant and qualified job identity, append-only, with source/Decision/authorization identities linked. Movement qualification composes the original tenant/account/event key with its existing tenant/job/account key; the routine checks the exact event's job and hash. No old movement key, table or grant is altered.

**Grant statement:** Every new table gives `jobguard_runtime` SELECT only and NO direct INSERT, UPDATE, DELETE or TRUNCATE; the new writer's EXECUTE grantees are exactly `jobguard_migration` and `jobguard_runtime`, and the private helper/trigger functions grant runtime/PUBLIC no EXECUTE.

No existing table, view, column, routine, role, policy, trigger or grant is changed by 0136. The upgrade test installs all predecessors, populates actual v1 landings/cases/movements/invoices, captures every populated predecessor table's primary identities, named canonical `row_to_json(...)::text` values and full `format_type`, applies 0136 alone via a migration login, compares old rows/types/privileges, then applies later migrations twice. Rolled-back controls cover microsecond change, retype, later nullable column, replaced function and later insert. Nonempty guards accompany all compared tables. This is written coverage, NOT executed upgrade evidence.

Forward fix: disable the allocator, retain historical rows, and add a reviewed compensating migration if necessary. Do not edit/drop financial history. This migration has no backfill and expands the preceding synthetic app compatibly. Any new expiry/default/display choice is an implementation detail, not commercial approval.

## Commands actually run

Installed Node24.17.0 and pinned pnpm10.28.1 were used. The pnpm executable directory was prepended to PATH; dependencies were already installed. No download or clean reinstall is claimed. Only changed core/API unit files ran, maxWorkers=2, no more than three files per run and one Vitest run at a time.

| Command | Actual exit/result |
| --- | --- |
| `pnpm turbo run build --filter=@jobguard/api...` | 2; DB guard-narrowing errors; fixed by explicit never-returning function declaration. |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-allocation.test.ts --maxWorkers=2` | 0; 1 file, **49 passed**. |
| `pnpm build` (one root run) | 2; DB TS2589 nested imported Zod type depth; fixed with typed wrappers preserving the same runtime validation. Root build NOT repeated under once-only order. |
| `pnpm typecheck` (one root run) | 2; 6/7 successful, web helper dynamic import lacked .js; fixed, with final web check below. |
| `LANE_BASE_REF=origin/main pnpm lint` (one root run) | 0; 7/7 successful, 2 cache hits; 23.986s. Later credit-source changes also compile in the final targeted checks below. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; m4-8-s branch and exact allow paths passed, merge-base comparison. |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-allocation.application.test.ts src/recovery-allocation.controller.test.ts --maxWorkers=2` initial | 0; 2 files, 36 passed; repository unit doubles, not PG. |
| Same API command after credit-source boundary coverage | 0; 2 files, **37 passed**; 1.23s; repository unit doubles. A final known-transition refusal case then passed **38 tests** in the same two files (handoff log). |
| `pnpm --filter @jobguard/api build` final | 0; Nest build. Does not prove the full Next production build. |
| `pnpm --filter @jobguard/web typecheck` final | 0; final helper/workbench/API/DB source types compile. |
| Targeted TypeScript compiler API, seven changed PG suites | Initial1: four mixed-Promise generic errors in the new race helper; corrected. Subsequent0: 7 targets/0 diagnostics; compiler validation only, NOT PG execution. |
| `node --import tsx src/generate-openapi.ts` in apps/api | 0; generated actual new OpenAPI paths and strict request variants without binding a listener. |
| `pnpm openapi:check` | 1; tsx IPC listen EPERM, generator not executed by that wrapper. |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | 0; same generator and byte-comparison path, without the blocked tsx CLI IPC listener. |
| `git diff --check` | 0; whitespace clean. |

Logs are `/private/tmp/jg-m4-8-s-c1-*.log`. Root scripts remain truthful failures where shown: a fresh complete root typecheck/build still belongs to the Mac helper/CI. Compiler checks are distinct from tests. Cache-replayed work is not new execution evidence. The four core/kernel/watchdog test files named by the older order were narrowed to the actually changed core file by the binding later memory/changed-files restriction; unchanged watchdog-registry/join unit files were not rerun merely to satisfy a wider older list.

## NOT RUN list

**NOT RUN (sandbox cannot start PostgreSQL / a browser):** `pnpm test:db`, `pnpm test:migrations`, `recovery-allocation.integration.test.ts`, `recovery-line-allocation.integration.test.ts`, `recovery-allocation-races.integration.test.ts` (including M-LOCK), `recovery-allocation-upgrade.integration.test.ts`, the changed `tenancy.integration.test.ts`, `UIWIRE-12.integration.test.ts`, `demo-bootstrap.integration.test.ts`, and the first-round `recovery-case-join.integration.test.ts`.

**NOT RUN (sandbox cannot start PostgreSQL / a browser):** `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-8-S.spec.ts M4-7-S.spec.ts M4-1-S.spec.ts M4-2-S.spec.ts UIWIRE-12.spec.ts UIWIRE-14.spec.ts`. The six new M4-8-S browser journeys are written for both configured projects, not passed journeys. No database, browser or listening service was started. AI/eval is inapplicable: no model/prompt/parser/gateway change.

## Self-review

Read the whole continuation diff against HEAD1267a2f and the relevant supplied-main/origin-main differences, the new migration/repository, all new tests, application/routes/workbench and source contracts. Checked exact reference amounts and preserved denominator43; exact kernel delegation and cross-product-only SQL integrity validation; no division of a fractional deemed amount; omitted explicit zero lines versus complete composition; earliest source timestamps; finalized PNG source bytes; all SELECT-only new GRANTs and exact routine grantees; session-derived owner and Decision/resolution/expiry binding; same-command/body/job/actor replay; cash/case/source lock order and absence of an extra parent-row lock; joined call last; original-preserving reversal; claim-2 invalidation projection; no deferred foreign key or completion trigger; credits/unmatched customer-payment balance projection; four post_live_billing registrations; no new live-only route; thin route authentication before deferred JSON; unknown outcome pause; source drill-down; six browser journeys and all required PG/upgrade/race controls.

Fixed during self-review: integer guard narrowing/Zod type inference; dynamic helper import and matching tenant-context module instance; exact rational database validation in place of recurring numeric division; generated PNG rather than mislabeled text evidence; predecessor fixture activation through the real switch-live routine (including the cap required by v1 races/upgrade), not merely a status transition; omitted explicit candidates; original source timestamp; SQL-computed audit/approval hashes; source/Decision audit prefix; late historical receipt refusal; replay disposition of untouched v1; credit selection preserved through approval; direct SQL test's latest eligibility binding; PL/pgSQL movement alias separated from its record variable; bounded control sizing for the credit selector. Removed the optional deferred completion assertion and its unissued extra test to obey the literal no-deferral ruling; the issued public-caller transaction/audit rollback tests remain. Earlier standing assertions were preserved; three existing suites gain only catalog rows/table names. No source hash test pins a shared/merged file. Final read-only lane inspection found 34 continuation paths and zero unauthorized paths; the four protected J/auth paths have no continuation diff.

The checked SQL writer is one stage of the trusted public repository transaction, not a complete standalone case/audit command; arbitrary direct callers must preserve that composition. Its own session/role predicate, source/money/Decision guards and conservation remain database checks.

Could not verify actual PostgreSQL syntax/catalog/privileges/RLS/conservation/races/upgrade/rollback or browser behavior, a fresh pinned install or full production build after corrections. No different-model verdict or separate technical acceptance exists for this working tree. Same-model helpers prepared separate authorized file groups, not an independent verdict.

The preserved files retain the round0 SHA-256 values: 0018 `42d13efe6aa491149300f167f2b3f7e4c66070f72357a4c75a0ca57a6840f3ba`; 0097 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`; 0106 `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7`; 0128 `d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe`; pinned auth test `d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f`; practice-session `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14`. The three J-REQ source/test files have zero continuation diff against HEAD1267a2f. No package/lockfile/tools/security decision/provider route change was made.

## Overlap, owed work and release gates

Shared append registrations serialize with dispatcher-owned merges: migration list/log, db export, core registry, app module/workspace export/composition, OpenAPI, catalogue rows and the one workbench mount. No lane widening beyond the earlier three J paths is needed. Migration0136 may be renumbered by the dispatcher at landing without changing SQL bytes. Updated types/boundaries are additive; only synthetic deployment is admitted. No new external service, secret, operational provider alert or real action is introduced.

Owed: Mac/helper/CI PG and both-project browser runs, fresh complete root checks, then a fresh Claude verdict bound to the dispatcher's commit and separate Sol acceptance. Saved F5 stays Q2-held for its separately ordered generated movements; saved F7 stays Q2-held for SV-4 supplementary invoice/line bindings. Q3 unspecified held figures, Q6 fractional splits and Q9 role widening remain held. SV-6 and M4-9-S consume this allocator; neither is implemented here. D01, D02 and D03v3 remain proposed, G4-S remains unmet, and production fees/collection remain disabled.

Intended commit message: `/private/tmp/jg-msg-m4-8-s-r2.txt`. Dispatcher owns commit, push and reviews. Generated build/test artifacts are removed before handoff; installed dependencies remain. No git write, remote operation, provider call, spending, deployment or real data occurred.

**Builder receipt only — not independently verified, not accepted.**

---

## Mac verification (12 Oct)

12 October 2026, Claude Sonnet 5.5 as the Mac-side helper (not a reviewer, no verdict). Logs and the verified patch are under `~/.local/share/full-steam/jg-runs/m4-8-s-mac/`. **Result: RED. Nothing was pushed; no pull request opened.**

**Catch-up.** `origin/main` 96f051f merged into 2f71b48 as merge commit b6d653f ("Merge main (96f051f) into M4-8-S"). Conflicts only in append-only files, main's lines first, this piece's additions inserted once: `apps/api/src/app.module.ts` (controller list), `apps/api/src/workspace/application.ts` (return object), `apps/web/app/ui/workspace-shell.tsx` (mount), `packages/core/src/index.ts`, `packages/db/src/migrate.ts` (now ends 0129, 0130, 0131, 0136), `packages/db/MIGRATIONS.md` (0136 section kept after main's 0131 section; its heading raised from `###` to `##` to match every other migration section). `apps/api/openapi.json` was taken from main and regenerated with `pnpm openapi:generate`; `pnpm openapi:check` exit 0. `git diff origin/main --stat` after the merge: 40 files, all this piece's. Rebuilt `core`, `db`, `storage`, `config`, `ai`, each alone, then `@jobguard/api` and `@jobguard/web` (`next build`): all exit 0. Embedded PostgreSQL needed `scripts/hydrate-symlinks.js` (dyld libicudata) once.

**RED finding (owner: the builder; migration 0136 does not apply).** Every database suite fails in `beforeAll` at `migrate()`: `0136_recovery_allocation.sql` raises `syntax error at end of input` (error position 20406 in the file) while creating `app.write_recovery_allocation`. Cause: three PL/pgSQL conditions hold an unparenthesised `CASE WHEN ... THEN ... END` inside an `IF`/`ELSIF ... THEN`; PL/pgSQL ends the condition at the first `THEN` inside the CASE, leaving a truncated expression. They are at lines 200 (`policyVersion` check), 222 (`action` check) and 305 (`sourceRef` check) of the migration. First failing test: `recovery-allocation.integration.test.ts` `beforeAll` (15 tests skipped), `migrate src/migrate.ts:88`. Diagnosis check on a scratch copy outside the repo (repo files unchanged): wrapping those three CASE expressions in parentheses makes all migrations through 0136 apply cleanly. The three-line diff is `~/.local/share/full-steam/jg-runs/m4-8-s-mac/0136-case-parens.diff` (NOT applied here; the builder owns the repair, and any further defects behind this one are unknown because no database suite could run).

| Item | Result |
| --- | --- |
| core `recovery-allocation.test.ts` | exit 0, 49 passed |
| core `recovery-allocation` + `receipt-allocation` + `cumulative-fee` | exit 0, 140 passed (3 files) |
| core `watchdog.test.ts` | exit 0, 7 passed |
| api `recovery-allocation.application` + `.controller` tests | exit 0, 38 passed |
| api `watchdog-registry.test.ts` | exit 0, 121 passed |
| api `auth/context-boundary.test.ts` (run only, not edited) | exit 0, 145 passed |
| `node --test tools/*.test.mjs` | exit 0, 85 passed |
| `pnpm typecheck` | exit 0, 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | exit 0, 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | exit 0 (lane m4-8-s, base 96f051f) |
| `pnpm openapi:check` | exit 0 |
| Database suites: `recovery-allocation`, `recovery-line-allocation`, `recovery-allocation-races` (incl. [M-LOCK]), `recovery-allocation-upgrade` (rule 9), `tenancy`, `UIWIRE-12`, `demo-bootstrap`, `recovery-case-join.integration` (J-REQ1 to J-REQ3), `recovery-cases*`, `recovery-eligibility-v3`, `recovery-timing-pin`, `recovery.integration`, `recovery-follow-up`, `recovery-messages`, `command-replay-contract.integration` | **BLOCKED, not passed.** Only `recovery-allocation.integration` was started (exit 1, migration error above); all others share the same `migrate()` and were not started. [M-LOCK] and J-REQ1 to J-REQ3 therefore have no execution evidence. |
| Browser: `M4-8-S.spec.ts` on `mobile-360` and `desktop` | **NOT RUN.** Same migration step (`bootstrapSyntheticDemo` calls `migrate`) would fail; two start attempts also hit ports 3000/55432 held by another agent's (sv-3) Playwright runs. |

**GRANT reading of 0136 (new build standard).** (1) `GRANT SELECT ON app.<table> TO jobguard_runtime` for the six new tables (`recovery_allocation_review`, `recovery_allocation_line_source`, `recovery_case_allocation`, `recovery_case_allocation_reversal`, `receipt_line_allocation`, `recovery_allocation_command`), each preceded by `REVOKE ALL ... FROM PUBLIC, jobguard_runtime`, owner `jobguard_migration`, ENABLE and FORCE row level security: SELECT only, no INSERT/UPDATE/DELETE grant. (2) `GRANT EXECUTE ON FUNCTION app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb) TO jobguard_runtime` after `REVOKE ALL ... FROM PUBLIC, jobguard_infrastructure`: the checked SECURITY DEFINER writer owned by `jobguard_migration`, which takes the actor from the persisted practice session and checks the owner role itself. (3) The trigger function and the fraction helper are owner `jobguard_migration` with `REVOKE ALL ... FROM PUBLIC, jobguard_runtime` and no grant back. Reading: no direct write grant for the app login on any new table, so the standard is met on its face; the routine's own checks could not be exercised. One observation, not a finding: the writer's synthetic-only guard reads `app.recovery_allocation_environment`, a setting the caller sets, the same pattern as the merged practice-feed and eligibility routines.

## Repair round 2 (13 Oct): built by Claude, Codex unavailable

13 October 2026, about 01:00 to 02:00. Built by a Claude Sonnet 5.5 builder ("built by Claude, Codex unavailable"), dispatched by the Claude session "JobGuard dispatcher, Monday". Not a reviewer; no verdict is given. Worktree `.worktrees/m4-8-s-r2`, branch `codex/sandbox/m4-8-s-r2` (the local name of the lane branch; start head 94698df, clean). Nothing was pushed, main was not merged, no pull request was opened. Logs and the wrapper config are under `~/.local/share/full-steam/jg-runs/m4-8-s-mac/repair2/`. The nine defects come from the Mac preview patches (`~/.local/share/full-steam/jg-runs/m4-8-s-mac/scratch-diffs/`); each was read, understood and applied by hand in the real tree. The preview stubs of item 8 were NOT carried over. No product code, money arithmetic, role rule, security-test list or merged file (other than the lines this piece added to `demo-bootstrap.integration.test.ts`) was touched; the migration stays 0136.

| # | Where (line numbers after this round) | Before | After | How checked |
| --- | --- | --- | --- | --- |
| 1 | `0136_recovery_allocation.sql` 203, 225, 308 (`write_recovery_allocation`) | `... IS DISTINCT FROM CASE WHEN .. THEN .. END THEN/AND` inside `IF`/`ELSIF`: PL/pgSQL ended the condition at the first `THEN`, so `migrate()` failed with "syntax error at end of input" | each CASE wrapped in parentheses. Lesson that binds from now on: wrap any CASE used inside an IF in parentheses | `migrate()` runs in `beforeAll` of every database suite below (all pass) |
| 2 | evidence set-up inserts: `recovery-allocation.integration` 106, 108, 110; `recovery-line-allocation` 117, 119, 121 and 250-252; `recovery-allocation-races` 105, 107, 109 and 295-296; `recovery-allocation-upgrade` 118, 120, 122 and 162-163 | `admin.query(...)` with no `app.tenant_id` on a live job: `app.guard_watchdog_input` raised `JOB_NOT_FOUND` (42501) | each of those inserts goes through a small per-file helper `tq()` (line 32-33 of each file) that runs it in its own transaction after `set_config('app.tenant_id', <tenant>, true)`. No shared fixture file (the lane lists exact files) and no merged file touched | the four suites pass |
| 3 | `0136_recovery_allocation.sql` 77-81 (`receipt_line_allocation` CHECKs) | `~ '^-?[0-9]{1,260213}$'` and `~ '^[1-9][0-9]{0,260212}$'` exceed PostgreSQL's regex repeat limit (255): "invalid regular expression: invalid repetition count(s)" on the first row insert | numerators `~ '^-?[0-9]+$' AND length(translate(x,'-',''))<=260213`; denominators `~ '^[1-9][0-9]*$' AND length(x)<=260213` (the exact form the order named, not the preview's one-digit-looser numerator form). Bound explained below | new test R2-3 (below), plus a mutation run: with the preview's looser numerator form temporarily put in the migration, R2-3 failed on `gross_numerator "111111"... (260214 characters) must be refused`; the migration was restored byte for byte (md5 checked) |
| 4 | `recovery-allocation.integration.test.ts` 337 (assertion at 339) | grantees came back as the string `"{jobguard_migration,jobguard_runtime}"` (node-pg does not parse a `name[]`) | the CASE is cast `::text`, so a `text[]` comes back as an array. The expected value is unchanged: exactly `["jobguard_migration", "jobguard_runtime"]` | test C4/new build standard passes |
| 5 | `recovery-allocation-races` `legacyLanding` 297; `recovery-allocation-upgrade` `legacyLanding` 165 and the later `rolledBack` insert (about 227) | "inconsistent types deduced for parameter $1" (`$1` used as uuid and as `$1::text`) | `$1::uuid` and `($1::uuid)::text` in the three statements (the order named the two `legacyLanding` helpers; the `rolledBack` insert in the upgrade file has the identical pattern and the preview patch fixed it too) | races and upgrade suites pass |
| 6 | `recovery-allocation-races` `waitForLock` 168-183 | flaky (about 1 run in 3): `pg_stat_activity` can show `wait_event_type='Lock'` while `query` still holds the previous statement | polls every 10 ms until a Lock-waiting row's query text includes `pg_advisory_xact_lock`; total wait still bounded at 2000 ms; the failure message now names the application and the queries last seen. The [M-LOCK] tests still observe the real lock wait (callers unchanged) | races file 1 run + 3 repeat runs, 10/10 each time |
| 7 | `demo-bootstrap.integration.test.ts` 100-105 (only lines this piece added) | `c.oid=$1::regclass` raised "permission denied for schema app" for the owner login used, and the failure cascaded | `FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=$1` with `[table]`; expected rows unchanged | `demo-bootstrap` 4/4 |
| 8 | `apps/web/e2e/M4-8-S.spec.ts` line 2 and `helpers/recovery-allocation-journey.ts` 1-21, 38 | Playwright's CommonJS loader could not `require` `@jobguard/core` (only an `import` condition), directly or through `apps/api/src/recovery-allocation.contracts`, so the spec found no tests | helper loads BOTH from built ESM with the native dynamic `import()` mechanism of `M4-3-S.spec.ts` (`new Function("specifier","return import(specifier)")` on a `file://` URL built from `process.cwd()` = `apps/web`): core from `packages/core/dist/index.js` (the real `parsePoundsToPence`) and the schema from `apps/api/dist/recovery-allocation.contracts.js` (the real compiled `recoveryAllocationViewV1`, the same source file). The spec calls `parseAllocationView(...)` (exported by the helper, 4 sites). Only a type-only import of `RecoveryAllocationView` remains from the TypeScript source. No stubs. Both dist folders must be built first, exactly as the web build itself needs them | browser run below; `pnpm typecheck` covers the e2e files |
| 9 | spec 109-111, 152-154, 165, 187 and helper 92-94 | `getByLabel("Recovery case"/"Matched receipt"/"Verified recovery evidence"/"Recorded reversal source", { exact: true })`: the `<select>` is nested in its `<label>`, so the label text includes the option text and the exact match never succeeded | `getByRole("combobox", { name: <label>, exact: true })`; product markup unchanged | browser run below |

**Changed expected values (before and after).** None changed meaning. Item 4's expected grantee set is the same two names; it now compares as an array because the query casts to `text[]`. Item 7's expected row is unchanged. No assertion was weakened, skipped or deleted.

**Item 3: where 260213 comes from and what the replacement keeps.** 260213 is `MAX_EXACT_PENCE_DIGITS` in `packages/core/src/cumulative-fee.ts`, the longest numerator or denominator, in digits, that the fee kernel accepts for an exact pence principal. It is derived there, not fitted: `MAX_ALLOCATION_LINES` (10,000) x `MONEY_DIGITS` (13, the digits of the 1,000,000,000,000p limit) = 130,000, plus `MAX_ALLOCATION_WORKING_DIGITS` (also 130,000), plus 2 x `MAX_EXACT_PENCE_INPUT_DIGITS` (2 x 100), plus 13 = 260,213. (Core's zod schema `exactPenceV1` applies it as `.max(260213)` on the whole string; the old and new database checks count digits only, so a negative numerator is allowed one more character in the database than in the zod schema. That is how the original migration was written, and the order required the exact same acceptance set, so it is kept; flagging it for the reviewers, not changing it.) Meaning: a numerator is an optional minus sign then 1 to 260,213 digits (leading zeros allowed, as before); a denominator is 1 to 260,213 digits whose first digit is not zero. The old patterns said exactly this using repeat counts; PostgreSQL refuses repeat counts above 255 at the first row insert, so every real allocation would have failed. The replacement splits the same rule into a shape test (regex without a large count) and a length test: for a string that passes the shape test, `translate(x,'-','')` removes only the single leading sign, so its length is the digit count, and `length(x)` is the digit count for a denominator. Plain comparison, written in TypeScript where regex repeat counts have no such limit: `new RegExp("^-?[0-9]{1,260213}$")` and `new RegExp("^[1-9][0-9]{0,260212}$")` (the intended originals) are used as the oracle inside test R2-3, and the table must agree with them on every probe: at-bound and one-over, signed and unsigned, empty, "-", "--1", "+1", "1.5", "1e3", spaces, newlines, a non-ASCII digit, and 150 seeded random short strings over a hostile alphabet, in all four columns. The oracle is also pinned to literal expectations so it cannot drift. The preview's form (`length(x)<=260214` for numerators) accepted a 260,214-digit positive numerator that the original refused; the exact form above does not.

**New test R2-3** (`recovery-allocation.integration.test.ts`, "R2-3: receipt_line_allocation fraction columns accept and refuse exactly the intended 260213-digit bound, as the table owner"). It inserts rows straight into `app.receipt_line_allocation` as the table owner (`SET LOCAL ROLE jobguard_migration`, tenant set; `session_replication_role = replica` for the probe only, so foreign-key triggers are skipped and every CHECK still fires), always rolled back, and a refusal only counts when it is SQLSTATE 23514 on the column's own CHECK (`receipt_line_allocation_<column>_check`), never the old "invalid regular expression" error. It also binds the literal 260213 to core's exported `MAX_EXACT_PENCE_DIGITS`. It adds no assertion to, and touches no assertion in, any existing test.

**GRANT / REVOKE list of 0136 (new build standard; unchanged by this round).** (1) For each of the six new tables (`recovery_allocation_review`, `recovery_allocation_line_source`, `recovery_case_allocation`, `recovery_case_allocation_reversal`, `receipt_line_allocation`, `recovery_allocation_command`): `ALTER TABLE ... OWNER TO jobguard_migration`, ENABLE and FORCE ROW LEVEL SECURITY, `REVOKE ALL ON app.<table> FROM PUBLIC, jobguard_runtime`, then `GRANT SELECT ON app.<table> TO jobguard_runtime` (line 111): SELECT only, no INSERT/UPDATE/DELETE grant, and the immutability trigger on every table. (2) `ALTER FUNCTION app.reject_recovery_allocation_mutation() OWNER TO jobguard_migration` and `REVOKE ALL ... FROM PUBLIC, jobguard_runtime` (lines 102-103), no grant back. (3) `ALTER FUNCTION app.recovery_allocation_fraction_sum(jsonb) OWNER TO jobguard_migration` and `REVOKE ALL ... FROM PUBLIC, jobguard_runtime` (lines 130-131), no grant back. (4) `ALTER FUNCTION app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb) OWNER TO jobguard_migration` (SECURITY DEFINER), `REVOKE ALL ... FROM PUBLIC, jobguard_infrastructure`, `GRANT EXECUTE ... TO jobguard_runtime` (lines 356-358). No direct write grant to `jobguard_runtime` on any money, membership, authorization, receipt or audit table. Test C4/new build standard and the `demo-bootstrap` loop check this against the real catalog and both pass.

**Run table (all on the Mac, embedded PostgreSQL, heavy-slot guarded, vitest `--maxWorkers=1`, at most three files per run; logs `<label>.log` / `<label>.exit` in `.../m4-8-s-mac/repair2/`).**

| Step | Command | Exit | Result |
| --- | --- | --- | --- |
| (a) a1 | `recovery-allocation.integration` + `recovery-line-allocation.integration` + `recovery-allocation-upgrade.integration` | 0 | 3 files, 26 passed |
| (a) a2 | `recovery-allocation-races.integration` | 0 | 10 passed (8 [M-LOCK], DW8, DW3 conservation) |
| (a) a4 | `recovery-allocation.integration` again after the random differential was added to R2-3 (final file) | 0 | 16 passed, R2-3 among them (2.2 s) |
| (b) b1, b2, b3 | races file, three more runs in a row | 0, 0, 0 | 10/10 passed each time |
| mutation m1 | `-t R2-3` with the preview's looser numerator form temporarily in 0136 (restored, md5 identical) | 1 (expected) | R2-3 failed on `gross_numerator` with 260,214 digits, as it must |
| (c) | `demo-bootstrap.integration` | 0 | 4 passed |
| (d) | `recovery-case-join.integration` (J1-J11, J-REQ1 cases, U3) | 0 | 20 passed |
| (e) | `pnpm typecheck` | 0 | 7/7 tasks (db, api, web executed; core, config, storage, ai replayed from the turbo cache) |
| (e) | `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks |
| (e) | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane m4-8-s, comparison merge-base |
| (e) | `pnpm openapi:check` | 0 | passed |
| (f) | `CI=1 npx playwright test --config .../repair2/pw-m4-8-s-r2.config.ts --workers=1 M4-8-S.spec.ts` (channel chromium, production `next start`) | 0 | 12 passed (6 tests x `mobile-360` and `desktop`) in 1.4 min; the three mobile-360 tests that timed out at 360 s in the preview pass |

**Could not run / not run.** The full regression pass (merged suites, merge of main, push) is the Mac helper's, as ordered. I did not run the core and api unit suites or `node --test tools/*.test.mjs` (no core, api or tools source changed). No dist folder needed a rebuild (every `dist` was newer than its source; the web `.next` build is newer than `apps/web/app`), so none was rebuilt; the browser spec reads core and api dist as built on 12 Oct 23:12. The stale header comments "NOT RUN (sandbox ...)" at the top of the four database files and the spec were left as written (comment-only, out of the listed scope); they are now untrue.

**Observations for the reviewers (not changed).** (1) Core's zod schema counts the minus sign inside its 260,213-character `.max`, the database counts digits only (see item 3). (2) PostgreSQL's `numeric` holds at most 131,072 digits before the decimal point, so the writer's `::numeric` arithmetic would refuse an exact-pence value longer than that with an overflow error before any row is written; this fails closed and is not changed here (not exercised by a test). (3) The local `origin/main` is now eb1e616, ahead of the 96f051f that this branch merged, so `git diff origin/main` lists other lanes' files as deletions; the lane lint compares against the merge-base and passes. (4) The lock-wait flake was in the test, not in the lock: the status row can briefly show the previous statement, so the poll now waits for the advisory-lock statement itself.

