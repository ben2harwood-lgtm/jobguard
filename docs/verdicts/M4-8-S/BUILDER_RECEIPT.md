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
