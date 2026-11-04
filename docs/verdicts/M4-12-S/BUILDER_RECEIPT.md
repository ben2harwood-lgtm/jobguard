# M4-12-S — RED builder handoff

Built ahead on `codex/sandbox/m4-12-s-collect`, stacked on m4-10-s-issue and m4-9-s-posting. No commit, push, PR, merge or independent review performed by this sandbox. Router owns those steps.

Implemented additive migration 0491; immutable attempt/event/command records; exact statement and displayed principal approval; atomic reservation; pending/unknown/settled/definite-failure reconciliation; bounded refunds; fake-only HTTP and browser controls. Sources and locking reuse 0490. No existing migration or subscription routine was changed. LP inventories, SERIOUS-B5, entitlement and tenancy expectations are additive exact unions.

Local verification (installed runners; pnpm wrapper stalled before running scripts and was stopped):

- `node_modules/.bin/tsc -p packages/core/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/api/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- Core Vitest: `src/simulation-fee-collection.test.ts src/issued-simulation-fee-statement.test.ts --maxWorkers=1` — 6 tests PASS.
- DB Vitest: `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 5 tests PASS. Catalogue test is static inventory/source validation, not PostgreSQL execution.
- API Vitest: `src/success-fee.application.test.ts --maxWorkers=1` — 18 tests PASS.
- Web Vitest: `app/api/jobs/[id]/success-fees/collection/route.test.ts app/api/jobs/[id]/success-fees/statements/route.test.ts --maxWorkers=1` — 6 tests PASS.

- `node --import tsx src/generate-openapi.ts --check` from `apps/api` — PASS; source generator used because the tsx CLI's IPC socket is sandbox-blocked.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE lint — PASS.
- `git diff --check` — PASS.
- Full `node tools/lint.mjs` stops at lane lint: its main-based range includes the unmerged predecessor stack, which this piece correctly does not claim. A working-diff comparison using the existing exported `lanePathAllowed` verifies exactly the 28 paths in this piece, with no missing or extra allow entries. Router must land the base before opening this PR so full lane CI can run against current main. No lane rule was relaxed.

CI must execute PostgreSQL integration/upgrade tests and the browser journey. Database tests attack concurrent identical/new command IDs, redirect non-settlement, unknown outcome blocking/reconciliation, terminal transitions, over-refund, stale statements/amounts, cross-job/session access, FORCE RLS, denied direct table writes, audit rollback and migration replay. The browser transport fixture demonstrates £282 → refund due £250 → refunded £250, retained £32 using mocked transport. It does not prove PostgreSQL or a live provider. Local PostgreSQL and browser execution are unavailable because the sandbox cannot bind localhost/start PostgreSQL. Full pinned-install suites, CI against current main and fresh Claude RED review are still required.

Initial source review: LATER / SIMPLICITY — `packages/db/src/simulation-fee-collection-repository.ts` and `simulation-fee-statement-repository.ts` share SQL error mapping; a future focused change could reuse one bounded mapper to keep public errors consistent. Not part of this money change and not a blocker.

Complexity is limited to durable attempts, append-only state events and idempotent command receipts; each is needed to preserve reservations and unknown outcomes across retries. No generic payment orchestration or new worker framework was added.


Follow-up repair, 30 October 2026 (RED; router commits/pushes):

- Branch-own migration 0491 now derives a separate namespaced UUIDv8 for statement approval and refuses a replayed internal approval. A caller pre-claiming even the derived ID cannot bypass the current-source check. Collection-command replay still returns its own durable result before reaching this approval step.
- PostgreSQL regressions cover a current approval sharing the caller UUID, stale-source collisions with both the original and derived approval IDs, and the exact £282 collection → £250 refund due → £250 refunded → £32 retained journey. The latter uses genuine quote/variation, receipt/feed, allocation, attribution, posting and linked reversal writers. Fixture defaults preserve existing callers; no accounting rows are overridden.
- Edited only branch-own migration 0491; confirmed absent from local main with `git ls-tree main packages/db/migrations/0509_simulation_fee_collection.sql`. LP-0 and SERIOUS-B5 exact unions remain unchanged: this repair adds no routine, table, privilege, call or write target. The static catalogue test passes for both LP inventories.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `node_modules/.bin/tsc -p /tmp/m4-12-s-collect-followup-tsconfig.json` — PASS; temporary config extends repository settings and includes all three affected integration/fixture files and their imports, with no emit.
- From `packages/db`: `node_modules/.bin/vitest run --maxWorkers=1 src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts` — 5 tests PASS.
- From `packages/db`: `node_modules/.bin/vitest list --maxWorkers=1 test/simulation-fee-collection.integration.test.ts` — all 11 tests discovered, including the four new cases. Discovery is not PostgreSQL execution.
- `node tools/plpgsql-case-in-if-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` — PASS.
- Existing `lanePathAllowed` against the union of the initial piece commit and this working diff — PASS, no missing or extra lane paths. `git diff --check` — PASS.
- PostgreSQL integration/upgrade, browser suites, whole-repository CI against current main and independent Claude RED review remain pending. No database/browser server was started and no git write command was run. Router owns commit, push, PR and review handoff.

Terminal-outcome follow-up, 30 October 2026 (RED; router commits/pushes):

- Session-facing application and repository reject `settle`/`fail` with `SUCCESS_FEE_FORBIDDEN`. OpenAPI and builder controls no longer offer either action. Redirect and unknown-outcome controls remain; refresh reads rail results.
- Branch-own migration 0491 checks `pg_has_role(session_user,'jobguard_migration','USAGE')` for terminal actions before looking up replay receipts. The SECURITY DEFINER owner and caller-supplied session/settings cannot promote a runtime login. Only the internal migration/operator connection can append terminal facts, still bound to the originating authenticated session/job and existing audit/idempotency/transition controls. No new grants, routines, roles, tables or write targets; both LP-0 inventories and SERIOUS-B5 exact unions are preserved unchanged. Migration 0491 is absent from local main (`git ls-tree main ...` returned no entry).
- Added application/repository regressions for both forbidden outcomes. PostgreSQL regressions explicitly exercise direct runtime SQL before and after operator reconciliation, with practice-material isolation set, and verify no settlement or release on refusal. Existing terminal-transition, duplicate/replay, refund-limit and GBP282/GBP250/GBP32 journey assertions are retained; terminal events now use the operator connection. Browser transport fixture receives the fake rail outcome outside builder POSTs, asserts no reconciliation buttons, then refreshes; all monetary assertions remain.
- Local installed-runner checks: DB Vitest `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 7 PASS; API Vitest `src/success-fee.application.test.ts --maxWorkers=1` — 20 PASS; web Vitest `app/api/jobs/[id]/success-fees/collection/route.test.ts --maxWorkers=1` — 3 PASS. The catalogue check verifies both inventories against actual calls/writes; it is static validation.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, API equivalent, and web equivalent with `--incremental false` — PASS. Temporary `/tmp/m4-12-s-collect-rail-tsconfig.json` extends repository settings and typechecks the integration suite and imports — PASS.
- `node --import tsx src/generate-openapi.ts` and `--check` from `apps/api` — PASS. PL/pgSQL CASE, money-arithmetic and commercial-boundary lints — PASS; `git diff --check` — PASS. Existing `lanePathAllowed` checked the complete piece diff from predecessor `cedb00ba`: exact 30-path union including its own lane, no missing/extra paths. No lane checks were weakened.
- Vitest list discovers all 13 PostgreSQL cases, including direct builder settle/fail refusal and the GBP282 journey. PostgreSQL integration/upgrade and browser execution were NOT RUN (sandbox cannot start PostgreSQL/bind localhost); required GitHub CI and fresh independent Claude RED review remain pending. No git write, provider or live-money action was performed.

Journey-first catch-up, 31 October 2026 (RED; router stages/commits/pushes):

- Resolved the three conflict contents from incoming M4-10-S `2ae2cd61`. Migration 0490 is byte-identical to that ref and merge stage 3, retaining `v_source_hash`, the `s` alias, correction-direction approvals and authorization renewal. No M4-12-specific 0490 addition existed. Both core export sets remain.
- The shared receipt fixture retains numeric-baseline and third-argument protocol callers, the incoming fifth-argument protocol override, and M4-12's fifth-argument collection flag and genuine £384/£3,000 receipt recipe. Six deterministic argument-binding cases executed from the actual source prefix pass; this is not PostgreSQL execution.
- Branch-owned 0491 reuses the incoming private `app.lock_success_fee_sources()` at the original lock-order position. Its lock statement is byte-identical to the removed inline statement; the helper denies runtime EXECUTE. Collection entrypoints no longer directly reference protected shadow tables. JSON comparisons/subtractions are bracketed. Both LP inventories record the added helper call; definition hashes were already null. The catalogue regression now checks the protected-source boundary and lock-order placement. No grant, role, table or financial outcome was added.
- Shared expectations retain named rows from both parents. Both 345-row tenancy blocks are unique and sorted in PostgreSQL byte order; the platform-fee snapshot entries are also ordered. No expectation was removed or weakened.
- From `packages/db`, installed Vitest with `--maxWorkers=2`: `test/lp-0-catalog.test.ts test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts` — 29 PASS; `src/simulation-fee-collection-repository.test.ts test/upgrade-proof-utils.test.ts` — 9 PASS.
- From `packages/core`, installed Vitest with `--maxWorkers=2`: `src/simulation-fee-collection.test.ts src/issued-simulation-fee-statement.test.ts` — 6 PASS.
- Installed TypeScript `--noEmit` checks for core and DB — PASS. Temporary `/tmp/m4-12-s-collect-catchup-tsconfig.json` typechecks collection integration, upgrade, catalogue and shared-fixture sources and imports under repository settings — PASS.
- PL/pgSQL CASE, money-arithmetic and commercial-boundary lints — PASS. `git diff --check` — PASS; no conflict markers remain in the three conflicted files. The git index still has unmerged entries because the sandbox prohibits git writes; the router must stage the resolved contents.
- No migration present on `origin/main` was edited. PostgreSQL/shadow-catalog integration, upgrade, browser journey, current-main CI and independent Claude RED review remain pending. The coordinator runs PostgreSQL. No git write, provider, release or live-money action was performed.

Current-main catch-up, 31 October 2026, 06:19 order (RED; DEMO-S step 3 / money chain step 3):

- Caught up to local `origin/main` `faa26359139259a53e1c36597e2132a4114f0533`, including merged M4-10-S #455. Migration 0490 is byte-identical to main, including its per-source `SUCCESS_FEE_SOURCE_CHANGED` refusal. No migration on main was edited. Own 0491 exceeds main's highest migration stem 0490 and retains its existing reservation; no renumber or new migration claim was needed.
- Resolved the statement-panel conflict by preserving main's native versioned download filename and complete availability/statement response reads, plus M4-12's collection panel. The unavailable-settlement placeholder is removed because the fake collection panel supplies this piece's integration.
- Added both collection transports to `jobMutationRegistry` as `post_live_billing`, matching main's statement routes. No command authority or lifecycle policy was changed. Existing exhaustive Next/Nest registry discovery tests pass without modifying their expectations.
- Collection reads and command requests now use `keepalive` and consume the complete response body, including refusals, before returning or refreshing. Four delayed-body regressions verify these navigation/request boundaries. No abort path or builder terminal-outcome action was added. This is local request validation, not an SV-3 browser-Q pass.
- Preserved every main live LP-0 capability/routine record unchanged; this lane's additive rows are in byte order. The downstream design input is restored byte-for-byte to main, matching main's deliberate frozen-snapshot contract for later fee migrations. Live 0491 calls/writes remain fully covered; an additional regression requires its objects to remain absent from the historical snapshot. No generator boundary or historical snapshot was advanced. This supersedes this receipt's earlier references to adding collection rows to both inventories.
- Both 345-row tenancy expectation blocks are unique and in PostgreSQL byte order. Named main expectations remain present in tenancy, contractor-entitlement and SERIOUS-B5; the latter preserves the existing exact additive-catalogue comparison. Lane allowance exactly matches all 31 changed paths, including its own lane file and the new web regression file.
- Installed-runner local checks, all Vitest runs with `--maxWorkers=2`: web `simulation-fee-collection.test.ts`, `simulation-fee-statements.test.ts`, `workspace-shell-statements.test.tsx` — 24 PASS; API `watchdog-registry.test.ts`, `success-fee.application.test.ts` — 145 PASS after rebuilding core's stale compiled runtime; DB `lp-0-catalog.test.ts`, `simulation-fee-collection-catalog.test.ts`, `simulation-fee-statement-catalog.test.ts` — 31 PASS; core `simulation-fee-collection.test.ts` — 3 PASS. Total: 203 targeted Vitest tests.
- `node --test tools/lp-downstream-inventory.test.mjs` — all 5 PASS. Core TypeScript build, web typecheck with `--incremental false`, API `tsc --noEmit`, PL/pgSQL CASE lint, money-arithmetic lint, commercial-boundary lint and `git diff --check` — PASS. No package installation was performed.
- PostgreSQL migration/integration/upgrade/shadow-catalog suites, SV-3 Q, the collection browser journey, both complete demos, current-main CI and fresh independent Claude RED review remain unverified in this sandbox. The coordinator/CI runs PostgreSQL and browser checks. Conflict content is resolved; the read-only git index remains for the router to stage. No git write, provider, real-money or release action was performed.

CI repair 1 at 7c8eccb0, 31 October 2026 (RED):

- Customer-variation's immediate 0502 snapshot is unchanged; only its later full-migration snapshot adds 0519's three empty collection tables. The 0505 upgrade catalogue now admits exactly those three tables/policies and two named collection routines, in byte order, while comparing every predecessor table/policy and unrelated routine exactly as before. Row/type fingerprints and replay checks remain.
- The genuine GBP3000 receipt reversal now includes `grossPence:300000`, required by the current strict allocation-v1 contract. A source comparison confirms this is the only change in that integration test; every GBP282 / minus GBP250 / GBP32 assertion is unchanged.
- The statement transport spec mocks availability/statements but leaves the newly nested collection read unmocked. Its statement-approval refusal and the collection read failure are distinct alerts, not duplicate rendering. Both remain visible, now named `Simulation statement error` and `Simulation collection error`; the browser assertion selects the statement error by its accessible name and exact message. A local rendering regression proves both errors remain distinct and visible in markup. No error was hidden and no command failure became success.
- Local installed Vitest: web `app/ui/simulation-fee-statements.test.ts app/ui/simulation-fee-collection.test.ts app/ui/workspace-shell-statements.test.tsx --maxWorkers=2` — 25 PASS. Core `src/receipt-line-allocation-source.test.ts --maxWorkers=1` — 22 PASS. Web TypeScript check with `--incremental false` — PASS. Temporary `/tmp/m4-12-s-collect-ci1-tsconfig.json` typechecks the three changed PostgreSQL suites and their imports — PASS.
- Vitest list with `--maxWorkers=1` successfully collects all three affected DB suites, including the exact GBP282 reversal/refund case; discovery is not PostgreSQL execution. Lane-path, no-migration-edit and exact grossPence-only test-diff audits — PASS. `git diff --check` — PASS. React checklist applied to the two accessible-name edits; no new hooks, fetching or state behavior was introduced.
- PostgreSQL upgrade/integration execution, the browser spec, full CI and independent exact-head RED review remain for coordinator/CI. No server, provider, real-money, release or git write action was performed in this sandbox.


C261 current-main helper-list catch-up verification, 31 October 2026 (M4-12-S-CATCHUP, RED):

- Starting HEAD `06188b5bca2362a420f38da793f7673d2c2ca797` already contains the clean merge of fetched `origin/main` `bc0a1940ac2f469b81f8a73120aecad371cc3238`, including #466/0507 and #467/0508. No git write or fetch was run. No source or test expectation change was necessary.
- Deterministic comparison against both merge parents confirms the LP-0 inventory is their exact structural union, with no missing or additional array entries. Every parent's B5 additive helper definition is unchanged, and helper names/calls are exactly their union, each called once, including `mobileAuthStoreAdditions`, `keyRegistryAdditions` and this branch's `simulationCollectionAdditions`. Tenancy and entitlement row lists are exactly the parent union. This is source inspection, not PostgreSQL verification or independent review.
- All 173 migrations on main are byte-identical to main. The only branch migration remains `0509_simulation_fee_collection.sql`, byte-identical to the pre-merge branch parent and contiguous after main's 0508. No migration renumbering was needed.
- Installed DB Vitest, `--maxWorkers=2`, first run: `test/lp-0-catalog.test.ts test/contractor-entitlement-snapshot.test.ts test/audit-export-privilege-comparator.test.ts` — 53 PASS. Second run: `test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts test/upgrade-proof-utils.test.ts` — 7 PASS. No run included more than three named files.
- Installed DB Vitest `list --maxWorkers=2 test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts` — all 19 cases collected; discovery only, not database execution.
- `turbo run typecheck --concurrency=2` stalled at pnpm startup and was interrupted. The installed root `node_modules/.bin/tsc -p tsconfig.json --noEmit`, executed from each package with at most two concurrent processes, passed for config, storage, core, ai, db, api and web (all seven workspace typecheck scripts). No package download was performed. `git diff --check` passed.
- READY for router commit/push and required CI/independent exact-head RED review. Whole PostgreSQL migration/privilege/upgrade suites and browser suites remain for GitHub CI; neither demo was executed here. No provider, live-money or release action was performed.


<!-- Preserved branch history from the NOPR catch-up. -->

# M4-12-S builder receipt

Status: independent pure reference portion built. Full server/database task and complete plan card INCOMPLETE; not a completed counted money-chain execution piece. No independent model verdict or technical acceptance claimed.

## Session

- Builder: Codex, 24 October 2026, worktree `.worktrees/m4-12-s`, branch `codex/sandbox/m4-12-s`.
- Ordered and inspected HEAD: `4710ea180696b91b4fbf161534b57c1dffffe87f`, accepted partial M4-10-S with accepted M4-9-S R1 `3cd699af` and the accepted SV-6 stack. Inspected origin/main: `4b1a779008505c86ca85db78fb38eda412394fe4`. Decision 74 authorizes stacked preparation; stack presence does not create missing authoritative interfaces or prove dependency merges.
- Full authoritative order read: `/Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-m4-12-s-20261013T173524.md`. AGENTS.md and applicable BUILD_PLAN.md §§10.2.8, 10.3.1–10.3.5, M4-9-S/M4-10-S/M4-12-S cards and shared ownership inspected. User's dispatch header overrides draft merge-only rule and placeholder allocation.
- C260 reserves **0220**, not 0080/0090 or the draft placeholder. No migration is created/registered: required upstream statement-family/correction/source keys and balance-lock interfaces do not exist, and mutation routines are held. No additional migration allocated.
- First edit: own `config/lanes/m4-12-s.json`, granting only seven independent implementation/test/export/contract/receipt paths plus the implicit own lane file. `config/agent-lane-assignments.json` untouched. Shared BUILD_PLAN.md ledger remains dispatcher-owned; no historical/card/policy edits.
- Runtime: Node `v24.17.0` (repository `.nvmrc`: `24.15.0`), pnpm `10.28.1` using existing cached `/private/tmp/jg-sv6-bin/pnpm`. No install/download/pin changes. This is not a clean pinned-install proof.
- No git write/add/checkout/commit/push, PostgreSQL startup, localhost binding, browser run, real data, provider invocation, deployment or release. Unit/tool suites may create isolated temporary fixtures. Dispatcher owns commit/push; intended commit message saved at `/private/tmp/jg-msg-m4-12-s.txt`.
- Heavy checks serial; direct Vitest uses `--maxWorkers=2` and at most three files; turbo `--concurrency=1`. Batch/mutation drivers wait while one-minute load exceeds 20. Observed spot readings were below 20.
- No final commit exists in this session. Exact dispatcher-created commit still needs a different-model recorded verdict and separate actor acceptance. Deterministic tests and source inspection below do not supply that evidence.

## Delivered behavior and invariant effects

Core `fee-collection.ts` adds strict synthetic reference schemas, typed errors, bigint balance/reservation/refund arithmetic, original-collection bounds, unknown holds, transition validation and full supplied tenant/job/actor/command/hash identity comparison. It does not derive a fee, allocate receipts, execute compensation, grant authority or read authoritative money. Supplied B/C/R examples produce £282 settled, £0 outstanding, £250 refund due, £250 refunded and £32 retained, solely as in-memory arithmetic. Snapshot fixtures do not prove a stored settlement/refund. Capacity is arithmetic before authorization, proof validity, dispute checks and locking.

API `fee-collection-fake-adapter.ts` supplies only an environment-gated strict fake-event validator and pure duplicate/conflict classification. It performs no invocation, durable generation, provider action or reconciliation. Accepted is distinct from settled; same event ID conflicts on changed payload, and invariant bindings on the original tenant-scoped effect cannot change under a new event ID. Parsing cannot authenticate an event. No executable adapter, in-memory authority map, route, worker registration or OpenAPI operation is introduced.

Only shared code edit: one additive core barrel export. No changes to existing merged tests, fingerprints, authentication constructors/pins/bridge, privileged clients, grant/RLS policy, migration registry, v1 ledgers, commercial policy, watchdog entries or CI/scripts. No data migration/backfill, external actions or operational alerts. Reference contracts are additive; existing interfaces unchanged. No AI/model/prompt/parser/matching/gateway/native change; live-model eval and native device suites are inapplicable to this diff.

Contract: `docs/contracts/fee-collection-simulation-v1.md`, including formulas, state semantics, typed errors, identity rules, synthetic limits and exact holds.

## Dependency inspection and held migration

M4-10-S `simulation-fee-statement.ts` is a pure representation: no persisted immutable issued v3 statement/correction, current collectible family balance, approval/source manifest or numbering lifecycle. Its settlement history explicitly says integration unavailable. Existing subscription `app.platform_statement` and `PlatformSubscriptionStatementRepository` cannot supply a success-fee family. M4-9-S migration `0218_success_fee_v3.sql` exposes authenticated read/refusal routines; `app.write_success_fee_v3(uuid,text,jsonb,jsonb)` always raises `SUCCESS_FEE_DEPENDENCY_BOUND`. SV-6's assessment path similarly refuses without its source adapter. M4-9-S R1 repairs fixtures/arithmetic; it does not release these missing interfaces.

S12-01 cannot be built truthfully from commands. No shared authoritative current corrected-balance/source-dispute/compensation lock can be named or joined. No substitute allocator, journal, statement table, source authority or collection lock is invented. Structural FK/read work cannot be independently completed against required nonexistent keys; the whole runnable migration sub-part remains held under the order. There is no empty 0220 migration or provisional mutation path.

No new database table/routine means no new applicable catalogue rows. LP-0 JSON, lp-0-authority-paths, tenancy, serious-b5, contractor-entitlement and fingerprints remain byte-for-byte unchanged from HEAD. Future authorized database construction must add exact rows and effective-privilege/upgrade proofs, never loosen these freezes. The reserved plan names remain `fee_collection_attempt`, `fee_refund`, `fee_collection_authority`; none is created provisionally here.

## Acceptance disposition

| IDs | Delivered evidence / remaining obligation |
| --- | --- |
| S12-01 | DEPENDENCY-BOUND: upstream command-built immutable approved £282 statement/source chain absent. No v1 or owner-seeded substitute. |
| S12-04 | Strict reference/fake-event schema rejection of forged success/mode/financial fields covered. Actual GET/render/download/redirect non-writing transport proof remains unbuilt. |
| S12-07/09/12/16/17 | Independent identity comparison, unknown reservations, transition/duplicate/conflict validation and original/family refund-limit arithmetic tested. No persisted replay, race, restart, event authentication or refund execution acceptance claimed. Full IDs held. |
| S12-20/22/29 | Database access/catalogue/upgrade assertions unbuilt because the whole safe structural migration is held. No new protected-mutation path exists to test. |
| S12-25 | Independent fake-validator server-environment rejection and zero external ports tested. Application/routine refusal and executable-adapter proofs unbuilt. |
| S12-26 | No statement-kind mutation validator is fabricated without an upstream statement source contract. Contractor/subscription checked execution refusal and non-offset proof remain unbuilt. |
| S12-27 | No complete persisted read-only transport exists to expose. All Nest/Next contracts, parity, command parsing and execution assertions remain unbuilt. |
| S12-28 | Pure/reference/event-schema safe integer, magnitude, GBP, strictness and overflow boundaries tested. SQL/command/event persistence boundaries unbuilt. |
| S12-30 | Source preservation checked; unchanged context-boundary/watchdog unit regressions run in serial batches. PostgreSQL fingerprint/tenancy/contractor replay suites NOT RUN; CI obligation remains. |
| S12-31 | Builder receipt only. Exact-commit different-model verdict, separate technical acceptance and whole-card completion remain owed. |
| S12-02/03/05/06/08/10/11/13/14/15/18/19/21/23/24 | Full persisted assertions entirely held under H1/Q4 and upstream missing source/statement interfaces. Pure examples elsewhere do not satisfy them. |

## Holds and release limits

- H1/Q4: authority lifetime unanswered. No invented duration, approval/consent, authority creation/use, approval-derived reservation, execution claim/invocation, durable fact recording, reconciliation, revocation/expiry execution, repository/application/controller/Next mutation, EXECUTE grant or route/OpenAPI registration. Exact approval-binding validation also cannot claim integration without the held upstream artifact contract; a supplied timestamp is never consent.
- DEPENDENCY-BOUND: M4-10-S issued immutable statements/corrections, family balance and approval/source bindings; M4-9-S persisted postings/compensation/source/dispute locks; SV-6/SV-5 authoritative attribution/reveal/disposition proof. Accepted storage and pure representations are not those capabilities.
- Missing non-catch qualification authority and negative-compensation execution remain unbuilt. F10/F11 figures are supplied arithmetic examples, not a real recovery-18800 journey. M4-8-S remains the sole persisted allocator; this diff implements no allocation or fee derivation.
- H2/Q5: automatic refund selection/splitting/waterfall across original collections unbuilt. H3/Q7: standing-authority/Direct Debit consent/integration remains with MON-4A/MON-4B/M4-15, unbuilt.
- H4: approval/pending/unknown/refund/reconciliation screens and browser V(...) assertions parked. No new browser journey or native changes. Real data/providers/charging/refunds/deployment/release remain founder-controlled and unopened.
- Independent exact-commit verdict, separate acceptance, reviewer CI PostgreSQL/browser checks and clean pinned-install evidence remain open. Full server task and full plan card remain INCOMPLETE.

## Commands and results

All pnpm commands used the existing cached wrapper via `PATH=/private/tmp/jg-sv6-bin:$PATH`. Logs and drivers under `/private/tmp` are local scratch evidence, not independently verified or committed artifacts.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/fee-collection.test.ts` | Red before implementation (missing module); first implementation 26 passed. Final restored source: 28 passed, exit 0 (`jg-m412-core-restored.log`). |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/fee-collection-fake-adapter.test.ts` | Red before implementation. Initial implementation run failed to resolve unbuilt core exports; no test pass claimed. After build and on final restored source: 10 passed, exit 0 (`jg-m412-adapter-restored.log`). |
| `pnpm typecheck --concurrency=1` | Exit 0, seven tasks; initial and final runs. Final log `jg-m412-typecheck-final.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1 at inherited stack lane paths before package checks; no lane widening. Log `jg-m412-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, inherited M4-10-S/M4-9-S/SV-6 stack paths. Log `jg-m412-lanes.log`. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0, seven package tasks. Log `jg-m412-package-lint.log`. |
| Serial `pnpm exec vitest run --maxWorkers=2 <up to three named files>` from each package cwd | 125 batches / 365 files, all exit 0: 6,742 tests passed; one PostgreSQL/socket test filtered. Driver `jg-m412-units.py`, command/file/log manifest `jg-m412-unit-summary.json`, per-batch `jg-m412-unit-<package>-<batch>.log`. Exact file batches below. |
| `pnpm build --concurrency=1` | Exit 0, seven tasks including Next production build; initial and final runs. Final log `jg-m412-build-final.log`. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC `listen EPERM` imposed by sandbox. Log `jg-m412-openapi.log`; wrapper not claimed passing. |
| `node --import tsx src/generate-openapi.ts --check` (API cwd) | Exit 0; same generator/check source without CLI IPC listener. Log `jg-m412-openapi-loader.log`. No generated OpenAPI diff. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Exit 0, 122 passed, including migration-order/lane tests without PostgreSQL. Log `jg-m412-tools.log`. |
| `LANE_BASE_REF=HEAD pnpm lint:lanes` | Exit 1: refuses self-comparison range. Supplemental attempt only; not a lane pass (`jg-m412-lanes-stack-base.log`). |
| `python3 /private/tmp/jg-m412-working-tree-check.py` and `git diff --check` | Exit 0. Exactly eight own working-tree paths; precisely one additive export; every other prior file unchanged. This custom delta check does not override the failing official stack lane checks or prove PostgreSQL behavior. |

Root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e` NOT RUN. No new PostgreSQL or browser suites are fabricated for the held implementation. Existing database/migration/browser CI checks remain mandatory for reviewer/CI after dispatcher push. The Node tool run and source-unit migration-discovery tests are the permitted migration-order checks without PostgreSQL; they do not prove an installed schema. No clean install/download attempted per dispatch. Turbo emitted sandbox telemetry IO warnings while successful commands still exited 0.

The source-unit selection enumerates all core and web unit files, preserves the preceding accepted stack's config/storage/AI/DB/API source-unit coverage, and adds the new core/API files and 22 non-PostgreSQL DB test-directory units. Explicitly unrun API files: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/final-account-lock.isolation.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`. DB `test/free-port.test.ts` is unrun because it binds localhost. API attribution batch uses `-t '^(?!.*PostgreSQL actual HTTP)'` to exclude its one real PostgreSQL/socket test. This is selected unit coverage, never full-root or live integration evidence. Unchanged allocator/fingerprint/tenancy/contractor PostgreSQL suites and new task-specific real source-chain assertions remain for reviewer CI or future held implementation as applicable.

## Guard mutation evidence

Driver `/private/tmp/jg-m412-mutations.py` changes only the new core/API implementation, one mutant at a time, restores original bytes after each and in `finally`, and runs that file's new unit suite with `--maxWorkers=2`. Final 82/82 mutants exited 1 with failing executed tests, not import/compilation failures. 80 have explicit assertion failures; the tenant/effect scope mutants reject valid distinct facts and are killed by unexpected typed exceptions in positive tests. Summary `jg-m412-mutation-summary.json` records both classifications; logs `jg-m412-mutant-<name>.log`. Final unmutated suites pass 28 core + 10 API tests.

Initial runs exposed three coverage gaps (direct schema bound, duplicate ID with different effect, original refund remaining after partial refund) and then an enum case masked by another guard. Added adversarial cases without changing existing tests. The final run kills all guards listed below. Shared existing Money validators are reused, never mutated. These deterministic checks are not independent review.

| Mutation | Final executed result |
| --- | --- |
| `core-strict-1` | Exit 1, assertion failure |
| `core-strict-2` | Exit 1, assertion failure |
| `core-strict-3` | Exit 1, assertion failure |
| `core-strict-4` | Exit 1, assertion failure |
| `core-uuid-1` | Exit 1, assertion failure |
| `core-uuid-2` | Exit 1, assertion failure |
| `core-uuid-3` | Exit 1, assertion failure |
| `core-uuid-4` | Exit 1, assertion failure |
| `core-integer-1` | Exit 1, assertion failure |
| `core-nonnegative-1` | Exit 1, assertion failure |
| `core-nonempty-1` | Exit 1, assertion failure |
| `core-key-bound-1` | Exit 1, assertion failure |
| `core-array-bound-1` | Exit 1, assertion failure |
| `core-money-bound-1` | Exit 1, assertion failure |
| `core-hash-1` | Exit 1, assertion failure |
| `core-literal-1` | Exit 1, assertion failure |
| `core-literal-2` | Exit 1, assertion failure |
| `core-literal-3` | Exit 1, assertion failure |
| `core-literal-4` | Exit 1, assertion failure |
| `adapter-strict-1` | Exit 1, assertion failure |
| `adapter-strict-2` | Exit 1, assertion failure |
| `adapter-uuid-1` | Exit 1, assertion failure |
| `adapter-uuid-2` | Exit 1, assertion failure |
| `adapter-uuid-3` | Exit 1, assertion failure |
| `adapter-uuid-4` | Exit 1, assertion failure |
| `adapter-integer-1` | Exit 1, assertion failure |
| `adapter-nonempty-1` | Exit 1, assertion failure |
| `adapter-key-bound-1` | Exit 1, assertion failure |
| `adapter-money-bound-1` | Exit 1, assertion failure |
| `adapter-positive-1` | Exit 1, assertion failure |
| `adapter-literal-1` | Exit 1, assertion failure |
| `adapter-literal-2` | Exit 1, assertion failure |
| `adapter-literal-3` | Exit 1, assertion failure |
| `adapter-literal-4` | Exit 1, assertion failure |
| `adapter-literal-5` | Exit 1, assertion failure |
| `positive-transfer` | Exit 1, assertion failure |
| `original-kind-correspondence` | Exit 1, assertion failure |
| `duplicate-id` | Exit 1, assertion failure |
| `duplicate-effect` | Exit 1, assertion failure |
| `original-ref-required` | Exit 1, assertion failure |
| `original-kind` | Exit 1, assertion failure |
| `original-settled` | Exit 1, assertion failure |
| `refund-limit` | Exit 1, assertion failure |
| `parsed-input` | Exit 1, assertion failure |
| `identity-parse` | Exit 1, assertion failure |
| `identity-equality` | Exit 1, assertion failure |
| `transition-matrix` | Exit 1, assertion failure |
| `transition-input` | Exit 1, assertion failure |
| `unknown-reservation` | Exit 1, assertion failure |
| `accepted-reservation` | Exit 1, assertion failure |
| `pending-reservation` | Exit 1, assertion failure |
| `refund-reservation-limit` | Exit 1, assertion failure |
| `outstanding-clamp` | Exit 1, assertion failure |
| `lesser-refund-bound` | Exit 1, assertion failure |
| `settlement-only` | Exit 1, assertion failure |
| `collection-kind-total` | Exit 1, assertion failure |
| `unknown-block` | Exit 1, assertion failure |
| `refund-unknown-block` | Exit 1, assertion failure |
| `collection-reservation-subtract` | Exit 1, assertion failure |
| `refund-reservation-subtract` | Exit 1, assertion failure |
| `refund-used-subtract` | Exit 1, assertion failure |
| `money-overflow` | Exit 1, assertion failure |
| `projection-freeze` | Exit 1, assertion failure |
| `refund-original-required` | Exit 1, assertion failure |
| `deployment-mode` | Exit 1, assertion failure |
| `event-parse` | Exit 1, assertion failure |
| `conflicting-event` | Exit 1, assertion failure |
| `same-event` | Exit 1, assertion failure |
| `same-fact` | Exit 1, assertion failure |
| `event-payload-equality` | Exit 1, assertion failure |
| `validator-freeze` | Exit 1, assertion failure |
| `adapter-readonly-1` | Exit 1, assertion failure |
| `adapter-readonly-2` | Exit 1, assertion failure |
| `state-enum` | Exit 1, assertion failure |
| `kind-enum` | Exit 1, assertion failure |
| `adapter-action-enum` | Exit 1, assertion failure |
| `adapter-kind-enum` | Exit 1, assertion failure |
| `refund-reader-original-kind` | Exit 1, assertion failure |
| `refund-reader-original-settled` | Exit 1, assertion failure |
| `effect-bindings` | Exit 1, assertion failure |
| `effect-tenant-scope` | Exit 1, valid-input typed-refusal failure |
| `effect-key-scope` | Exit 1, valid-input typed-refusal failure |

## Exact sequential unit batches

Each bullet is one `pnpm exec vitest run --maxWorkers=2` command from its named package directory. Every batch exited 0; the attribution batch adds the filter specified above.

### core

- `src/acceptance.test.ts src/activation-v3.test.ts src/activation.test.ts`
- `src/allocation.test.ts src/capture.test.ts src/commercial-integrity.test.ts`
- `src/contractor-billing-ordering.test.ts src/contractor-billing.test.ts src/contractor-entitlement-authority.test.ts`
- `src/contractor-parties.test.ts src/contractor-practice-session.test.ts src/contractor.test.ts`
- `src/cumulative-fee.test.ts src/customer-billing.test.ts src/decision-checks-later.test.ts`
- `src/decision-checks.test.ts src/discrepancy-audit-fix.test.ts src/discrepancy.test.ts`
- `src/enterprise-baseline.property.test.ts src/enterprise-baseline.test.ts src/enterprise-dashboard-billing.test.ts`
- `src/enterprise-dashboard.test.ts src/enterprise-domain/boundaries.test.ts src/enterprise-domain/duplicate-unlink-roles.test.ts`
- `src/enterprise-domain/fee-both.test.ts src/enterprise-domain/fee-pins.test.ts src/enterprise-domain/fee.test.ts`
- `src/enterprise-domain/later-explicit-refund.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/transitions.test.ts`
- `src/enterprise-fee-statement.test.ts src/enterprise-live-prompt-contracts.test.ts src/enterprise-live-prompt-persistence.test.ts`
- `src/enterprise-live-prompts.test.ts src/enterprise-signal.test.ts src/evidence-pack.test.ts`
- `src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts`
- `src/extra-origin.test.ts src/extra-persistence.test.ts src/extra-unlink.test.ts`
- `src/fee-collection.test.ts src/fee-statement.test.ts src/fee-what-if.test.ts`
- `src/fee.test.ts src/final-account-lock.test.ts src/final-account.test.ts`
- `src/free-first-job-keys.test.ts src/free-first-job-period.test.ts src/free-first-job.test.ts`
- `src/inbox-relevance.test.ts src/index.test.ts src/job-import.test.ts`
- `src/job-parties.test.ts src/job-sources.test.ts src/job-work-state.test.ts`
- `src/job.test.ts src/jobs-on-the-go-pricing.test.ts src/jobs-on-the-go.test.ts`
- `src/later-review-boundary.test.ts src/materials.test.ts src/mobile-auth.test.ts`
- `src/mobile-device-lifecycle.test.ts src/money.test.ts src/observation.test.ts`
- `src/offline-contract.properties.test.ts src/offline-contract.test.ts src/plan-entitlements.test.ts`
- `src/practice-facts.test.ts src/practice-feed.test.ts src/practice-supplier-credit.test.ts`
- `src/practice-worker-switch.test.ts src/prevention-checks.test.ts src/proof.test.ts`
- `src/purchase-order.test.ts src/quantity.test.ts src/quote-document.test.ts`
- `src/quote-rounding.test.ts src/quote.test.ts src/readiness.test.ts`
- `src/receipt-allocation.test.ts src/recovery-allocation.test.ts src/recovery-attribution-persistence.test.ts`
- `src/recovery-attribution-persistence.type.test.ts src/recovery-case-terms.test.ts src/recovery-case.test.ts`
- `src/recovery-eligibility-v3.test.ts src/recovery-eligibility.test.ts src/recovery-fee-illustration.test.ts`
- `src/recovery-fee-illustration.type.test.ts src/recovery-follow-up.test.ts src/recovery-message.test.ts`
- `src/recovery-payment-payer.test.ts src/recovery.test.ts src/review.test.ts`
- `src/shadow-detection.test.ts src/shadow-domain/architecture.test.ts src/shadow-domain/attribution.test.ts`
- `src/shadow-domain/capture.test.ts src/shadow-domain/eligibility.test.ts src/shadow-domain/evaluation.test.ts`
- `src/shadow-domain/lock.test.ts src/shadow-domain/must-surface.test.ts src/shadow-domain/signal.test.ts`
- `src/shadow-domain/success-fee.test.ts src/shadow-domain/type-contracts.test.ts src/simulation-fee-statement.test.ts`
- `src/site-extra-evidence.test.ts src/site-extra-pricing.test.ts src/site-extra-v2.test.ts`
- `src/site-extra.test.ts src/site-visit.test.ts src/sor-pricing.test.ts`
- `src/subscription-allocation.test.ts src/subscription-architecture.test.ts src/subscription-period.test.ts`
- `src/subscription-persistence.test.ts src/subscription-track-review.test.ts src/subscription.test.ts`
- `src/success-fee-posting-fixtures.test.ts src/success-fee-posting.test.ts src/supplier-documents.test.ts`
- `src/supplier-facts.test.ts src/supplier-matching.test.ts src/sync-download.test.ts`
- `src/tax.test.ts src/variation.test.ts src/watchdog.test.ts`
- `src/work-order.test.ts`

### config

- `src/connector-environment.test.ts src/index.test.ts src/policy-gates.decision-identity.test.ts`
- `src/policy-gates.superseded-replay.test.ts`

### storage

- `src/index.test.ts`

### ai

- `src/capture-evaluation.test.ts src/capture.test.ts src/enterprise-ai-evaluation.test.ts`
- `src/enterprise-ai-prompts.test.ts src/enterprise-live-prompt-evaluation.test.ts src/enterprise-live-prompt-persisted-evaluation.test.ts`
- `src/gateway.test.ts src/later-capture-evaluation.test.ts src/later-gateway.test.ts`
- `src/later-shadow-evaluation.test.ts src/later-shadow-proposal.test.ts src/shadow-evaluation.test.ts`
- `src/shadow-proposal.test.ts src/sor-suggestion-evaluation.test.ts src/sor-suggestion.test.ts`

### db

- `src/audit-checkpoint-handoff.test.ts src/audit-fix-dbsrc-08.test.ts src/decision-adoption.test.ts`
- `src/demo-seed.determinism.test.ts src/demo-seed.test.ts src/evidence-finalization-race.test.ts`
- `src/later-money-boundaries.test.ts src/later-outbox.test.ts src/later-sso-refusal.test.ts`
- `src/meter-persistence.test.ts src/meter-repository.test.ts src/migrate-discovery.test.ts`
- `src/northside-settings.test.ts src/outbox.test.ts src/practice-invoice-later.test.ts`
- `src/practice-invoice-repository.test.ts src/proof-replacement.test.ts src/recovery-allocation-serious-b9.test.ts`
- `src/recovery-attribution-repository.test.ts src/recovery-legacy-later.test.ts src/serious-b10.test.ts`
- `src/serious-b7.test.ts src/serious-b8.test.ts src/subscription-simulated-payment-adapter.test.ts`
- `src/success-fee-repository.test.ts src/supplier-match-repository.test.ts src/tenant-context.test.ts`
- `test/audit-api-capture.test.ts test/audit-api-file-final-account.test.ts test/audit-api-file-supplier-document.test.ts`
- `test/audit-api-variation.test.ts test/audit-dbsrc-01.test.ts test/audit-dbsrc-03.test.ts`
- `test/audit-export-privilege-comparator.test.ts test/audit-fix-dbsrc-04.test.ts test/contractor-session-context.test.ts`
- `test/job-work-state-syntax.test.ts test/lock-order-1.test.ts test/lp-0-catalog.test.ts`
- `test/proof-invalidation.test.ts test/purchase-order-audit.test.ts test/recovery-case-join.test.ts`
- `test/recovery-case-outcome.test.ts test/recovery-eligibility-v3-interest.test.ts test/recovery-message-repository.test.ts`
- `test/site-extra-evidence-compatibility.test.ts test/sor-suggestion-confirmation.test.ts test/verify-audit-export-cli.test.ts`
- `test/verify-evidence-pack-cli.test.ts`

### api

- `src/audit-export/audit-export.application.test.ts src/audit-export/audit-export.context.test.ts src/auth/auth.test.ts`
- `src/auth/context-boundary.test.ts src/auth/identity.test.ts src/auth/sso/later-sso-resource.test.ts`
- `src/auth/sso/linking.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/oidc.test.ts`
- `src/auth/sso/role-mapping.test.ts src/auth/sso/saml-fixlater-6.test.ts src/auth/sso/saml.test.ts`
- `src/auth/sso/scim-paths.test.ts src/auth/sso/scim.test.ts src/auth/sso/sso-emergency-owner.test.ts`
- `src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-required-disclosure.test.ts src/auth/sso/sso-required-paths.test.ts`
- `src/auth/sso/sso-required-unlinked.test.ts src/auth/sso/sso-required.test.ts src/capture/capture-state.test.ts`
- `src/commercial-integrity.application.test.ts src/commercial-integrity.audit.test.ts src/contractor/billing.adapters.test.ts`
- `src/contractor/contractor-parties.application.test.ts src/contractor/contractor-parties.controller.test.ts src/contractor/contractor-parties.privacy.test.ts`
- `src/contractor/contractor-practice-session.application.test.ts src/contractor/contractor.application.test.ts src/contractor/contractor.projection.test.ts`
- `src/contractor/enterprise-baseline.application.test.ts src/contractor/enterprise-dashboard.application.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts`
- `src/contractor/enterprise-fee.application.test.ts src/contractor/enterprise-fee.executor.test.ts src/contractor/enterprise-live-prompt-boundaries.test.ts`
- `src/contractor/enterprise-live-prompt.application.test.ts src/contractor/enterprise-live-prompt.http.test.ts src/contractor/full-demo-package-baseline.test.ts`
- `src/contractor/full-demo-package-sales.test.ts src/contractor/full-demo-package.application.test.ts src/contractor/offline-risk.application.test.ts`
- `src/contractor/practice-worker-switch.application.test.ts src/contractor/site-extra-evidence.application.test.ts src/contractor/site-extra-pricing.application.test.ts`
- `src/contractor/site-extra.application.test.ts src/contractor/site-visit.application.test.ts src/contractor/work-order.application.test.ts`
- `src/customer-receipt-input.amount-types.test.ts src/customer-receipt-input.command-identity.test.ts src/customer-receipt-input.fractions.test.ts`
- `src/customer-receipt-input.reversal-authority.test.ts src/customer-receipt-input.reversal-reason.test.ts src/customer-receipt-input.test.ts`
- `src/decisions/decisions-later.test.ts src/effects/policy-gates.test.ts src/evidence-pack.application.test.ts`
- `src/evidence-pack.controller.test.ts src/evidence-pack.errors.test.ts src/fee-collection-fake-adapter.test.ts`
- `src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account.application.test.ts`
- `src/free-first-job-card.adapter.test.ts src/free-first-job.application.test.ts src/health-database-independence.test.ts`
- `src/inbox-relevance.boundary-missing.test.ts src/inbox-relevance.session.test.ts src/job-parties.application.test.ts`
- `src/job-source.application.test.ts src/job-source.controller.test.ts src/job-work-state.application.test.ts`
- `src/job-work-state.controller.test.ts src/job-work-state.http.test.ts src/job-work-state.isolation.test.ts`
- `src/later-shadow-detection.worker.test.ts src/material.application.test.ts src/material.contracts.boundary.test.ts`
- `src/plan-entitlements.application.test.ts src/plan-entitlements.boundary.test.ts src/practice-errors.redaction.test.ts`
- `src/practice-facts.application.test.ts src/practice-facts.controller.test.ts src/practice-feed.application.test.ts`
- `src/practice-feed.controller.test.ts src/practice-session.test.ts src/practice-supplier-credit.application.test.ts`
- `src/practice-supplier-credit.http.test.ts src/practice-transports.test.ts src/prevention-check.application.test.ts`
- `src/proof/proof-adopted-original.test.ts src/proof/proof.application.test.ts src/quote/serious-b3-preview.test.ts`
- `src/readiness.later.test.ts src/readiness.payload-preservation.test.ts src/recovery-allocation.application.test.ts`
- `src/recovery-allocation.controller.test.ts src/recovery-allocation.credit.test.ts src/recovery-attribution.application.test.ts`
- `src/recovery-attribution.controller.test.ts src/recovery-attribution.http.test.ts src/recovery-case-terms.application.test.ts`
- `src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts`
- `src/recovery-eligibility-v3.application.test.ts src/recovery-follow-up.application.test.ts src/recovery-follow-up.controller.test.ts`
- `src/recovery-message.application.test.ts src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts`
- `src/recovery-payment-payer.application.test.ts src/shadow-detection-lock-race.test.ts src/shadow-detection.worker.test.ts`
- `src/subscription-boundaries.test.ts src/subscription.application.test.ts src/success-fee.application.test.ts`
- `src/success-fee.http.test.ts src/value/value.application.test.ts src/variation/variation.application.test.ts`
- `src/watchdog-registry.test.ts src/watchdog.filter.privacy.test.ts src/workspace/fee-illustration-later.test.ts`
- `src/workspace/fee-illustration.application.test.ts src/workspace/workspace.service.test.ts`

### web

- `app/admin/contractor/audit-exports/page.test.tsx app/admin/contractor/contractor-admin.test.tsx app/api/contractor/jobs/[id]/order-check/route.test.ts`
- `app/api/contractor/jobs/[id]/order-lines/route.test.ts app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts`
- `app/api/contractor/jobs/[id]/site-extras/route.test.ts app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts`
- `app/api/contractor/jobs/[id]/site-visits/start/route.test.ts app/api/contractor/jobs/[id]/sor-items/route.test.ts app/api/contractor/origin.test.ts`
- `app/api/contractor/practice/acting-as/end/route.test.ts app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/session/revoke/route.test.ts`
- `app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts app/api/contractor/route.test.ts app/api/contractor/site/jobs/route.test.ts`
- `app/api/jobs/[id]/customer-messages/route.test.ts app/api/jobs/[id]/diary/route.test.ts app/api/jobs/[id]/success-fees/route.test.ts`
- `app/api/northside/routes.test.ts app/lib/audit-pkg-lib-86.test.ts app/lib/invoice-payment-state.test.ts`
- `app/lib/receipt-http-error.test.ts app/lib/recovery-case-requests.test.ts app/lib/recovery-case-routes.test.ts`
- `app/lib/recovery-case-selection.test.ts app/lib/recovery-fee-note.test.ts app/page.test.tsx`
- `app/ui/job-parties-draft.test.ts app/ui/job-parties.test.tsx app/ui/materials-command.test.ts`
- `app/ui/practice-receipts-state.test.ts app/ui/purchase-order-state.test.ts app/ui/recovery-cases.behaviour.test.ts`
- `app/ui/recovery-cases.test.ts app/ui/recovery-eligibility-command.test.ts app/ui/recovery-messages.test.tsx`
- `app/ui/supplier-fact-editor.test.ts app/ui/workspace-lifecycle.test.ts`

# M4-12-S — RED builder handoff

Built ahead on `codex/sandbox/m4-12-s-collect`, stacked on m4-10-s-issue and m4-9-s-posting. No commit, push, PR, merge or independent review performed by this sandbox. Router owns those steps.

Implemented additive migration 0491; immutable attempt/event/command records; exact statement and displayed principal approval; atomic reservation; pending/unknown/settled/definite-failure reconciliation; bounded refunds; fake-only HTTP and browser controls. Sources and locking reuse 0490. No existing migration or subscription routine was changed. LP inventories, SERIOUS-B5, entitlement and tenancy expectations are additive exact unions.

Local verification (installed runners; pnpm wrapper stalled before running scripts and was stopped):

- `node_modules/.bin/tsc -p packages/core/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/api/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- Core Vitest: `src/simulation-fee-collection.test.ts src/issued-simulation-fee-statement.test.ts --maxWorkers=1` — 6 tests PASS.
- DB Vitest: `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 5 tests PASS. Catalogue test is static inventory/source validation, not PostgreSQL execution.
- API Vitest: `src/success-fee.application.test.ts --maxWorkers=1` — 18 tests PASS.
- Web Vitest: `app/api/jobs/[id]/success-fees/collection/route.test.ts app/api/jobs/[id]/success-fees/statements/route.test.ts --maxWorkers=1` — 6 tests PASS.

- `node --import tsx src/generate-openapi.ts --check` from `apps/api` — PASS; source generator used because the tsx CLI's IPC socket is sandbox-blocked.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE lint — PASS.
- `git diff --check` — PASS.
- Full `node tools/lint.mjs` stops at lane lint: its main-based range includes the unmerged predecessor stack, which this piece correctly does not claim. A working-diff comparison using the existing exported `lanePathAllowed` verifies exactly the 28 paths in this piece, with no missing or extra allow entries. Router must land the base before opening this PR so full lane CI can run against current main. No lane rule was relaxed.

CI must execute PostgreSQL integration/upgrade tests and the browser journey. Database tests attack concurrent identical/new command IDs, redirect non-settlement, unknown outcome blocking/reconciliation, terminal transitions, over-refund, stale statements/amounts, cross-job/session access, FORCE RLS, denied direct table writes, audit rollback and migration replay. The browser transport fixture demonstrates £282 → refund due £250 → refunded £250, retained £32 using mocked transport. It does not prove PostgreSQL or a live provider. Local PostgreSQL and browser execution are unavailable because the sandbox cannot bind localhost/start PostgreSQL. Full pinned-install suites, CI against current main and fresh Claude RED review are still required.

Initial source review: LATER / SIMPLICITY — `packages/db/src/simulation-fee-collection-repository.ts` and `simulation-fee-statement-repository.ts` share SQL error mapping; a future focused change could reuse one bounded mapper to keep public errors consistent. Not part of this money change and not a blocker.

Complexity is limited to durable attempts, append-only state events and idempotent command receipts; each is needed to preserve reservations and unknown outcomes across retries. No generic payment orchestration or new worker framework was added.


Follow-up repair, 30 October 2026 (RED; router commits/pushes):

- Branch-own migration 0491 now derives a separate namespaced UUIDv8 for statement approval and refuses a replayed internal approval. A caller pre-claiming even the derived ID cannot bypass the current-source check. Collection-command replay still returns its own durable result before reaching this approval step.
- PostgreSQL regressions cover a current approval sharing the caller UUID, stale-source collisions with both the original and derived approval IDs, and the exact £282 collection → £250 refund due → £250 refunded → £32 retained journey. The latter uses genuine quote/variation, receipt/feed, allocation, attribution, posting and linked reversal writers. Fixture defaults preserve existing callers; no accounting rows are overridden.
- Edited only branch-own migration 0491; confirmed absent from local main with `git ls-tree main packages/db/migrations/0509_simulation_fee_collection.sql`. LP-0 and SERIOUS-B5 exact unions remain unchanged: this repair adds no routine, table, privilege, call or write target. The static catalogue test passes for both LP inventories.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `node_modules/.bin/tsc -p /tmp/m4-12-s-collect-followup-tsconfig.json` — PASS; temporary config extends repository settings and includes all three affected integration/fixture files and their imports, with no emit.
- From `packages/db`: `node_modules/.bin/vitest run --maxWorkers=1 src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts` — 5 tests PASS.
- From `packages/db`: `node_modules/.bin/vitest list --maxWorkers=1 test/simulation-fee-collection.integration.test.ts` — all 11 tests discovered, including the four new cases. Discovery is not PostgreSQL execution.
- `node tools/plpgsql-case-in-if-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` — PASS.
- Existing `lanePathAllowed` against the union of the initial piece commit and this working diff — PASS, no missing or extra lane paths. `git diff --check` — PASS.
- PostgreSQL integration/upgrade, browser suites, whole-repository CI against current main and independent Claude RED review remain pending. No database/browser server was started and no git write command was run. Router owns commit, push, PR and review handoff.

Terminal-outcome follow-up, 30 October 2026 (RED; router commits/pushes):

- Session-facing application and repository reject `settle`/`fail` with `SUCCESS_FEE_FORBIDDEN`. OpenAPI and builder controls no longer offer either action. Redirect and unknown-outcome controls remain; refresh reads rail results.
- Branch-own migration 0491 checks `pg_has_role(session_user,'jobguard_migration','USAGE')` for terminal actions before looking up replay receipts. The SECURITY DEFINER owner and caller-supplied session/settings cannot promote a runtime login. Only the internal migration/operator connection can append terminal facts, still bound to the originating authenticated session/job and existing audit/idempotency/transition controls. No new grants, routines, roles, tables or write targets; both LP-0 inventories and SERIOUS-B5 exact unions are preserved unchanged. Migration 0491 is absent from local main (`git ls-tree main ...` returned no entry).
- Added application/repository regressions for both forbidden outcomes. PostgreSQL regressions explicitly exercise direct runtime SQL before and after operator reconciliation, with practice-material isolation set, and verify no settlement or release on refusal. Existing terminal-transition, duplicate/replay, refund-limit and GBP282/GBP250/GBP32 journey assertions are retained; terminal events now use the operator connection. Browser transport fixture receives the fake rail outcome outside builder POSTs, asserts no reconciliation buttons, then refreshes; all monetary assertions remain.
- Local installed-runner checks: DB Vitest `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 7 PASS; API Vitest `src/success-fee.application.test.ts --maxWorkers=1` — 20 PASS; web Vitest `app/api/jobs/[id]/success-fees/collection/route.test.ts --maxWorkers=1` — 3 PASS. The catalogue check verifies both inventories against actual calls/writes; it is static validation.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, API equivalent, and web equivalent with `--incremental false` — PASS. Temporary `/tmp/m4-12-s-collect-rail-tsconfig.json` extends repository settings and typechecks the integration suite and imports — PASS.
- `node --import tsx src/generate-openapi.ts` and `--check` from `apps/api` — PASS. PL/pgSQL CASE, money-arithmetic and commercial-boundary lints — PASS; `git diff --check` — PASS. Existing `lanePathAllowed` checked the complete piece diff from predecessor `cedb00ba`: exact 30-path union including its own lane, no missing/extra paths. No lane checks were weakened.
- Vitest list discovers all 13 PostgreSQL cases, including direct builder settle/fail refusal and the GBP282 journey. PostgreSQL integration/upgrade and browser execution were NOT RUN (sandbox cannot start PostgreSQL/bind localhost); required GitHub CI and fresh independent Claude RED review remain pending. No git write, provider or live-money action was performed.

Journey-first catch-up, 31 October 2026 (RED; router stages/commits/pushes):

- Resolved the three conflict contents from incoming M4-10-S `2ae2cd61`. Migration 0490 is byte-identical to that ref and merge stage 3, retaining `v_source_hash`, the `s` alias, correction-direction approvals and authorization renewal. No M4-12-specific 0490 addition existed. Both core export sets remain.
- The shared receipt fixture retains numeric-baseline and third-argument protocol callers, the incoming fifth-argument protocol override, and M4-12's fifth-argument collection flag and genuine £384/£3,000 receipt recipe. Six deterministic argument-binding cases executed from the actual source prefix pass; this is not PostgreSQL execution.
- Branch-owned 0491 reuses the incoming private `app.lock_success_fee_sources()` at the original lock-order position. Its lock statement is byte-identical to the removed inline statement; the helper denies runtime EXECUTE. Collection entrypoints no longer directly reference protected shadow tables. JSON comparisons/subtractions are bracketed. Both LP inventories record the added helper call; definition hashes were already null. The catalogue regression now checks the protected-source boundary and lock-order placement. No grant, role, table or financial outcome was added.
- Shared expectations retain named rows from both parents. Both 345-row tenancy blocks are unique and sorted in PostgreSQL byte order; the platform-fee snapshot entries are also ordered. No expectation was removed or weakened.
- From `packages/db`, installed Vitest with `--maxWorkers=2`: `test/lp-0-catalog.test.ts test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts` — 29 PASS; `src/simulation-fee-collection-repository.test.ts test/upgrade-proof-utils.test.ts` — 9 PASS.
- From `packages/core`, installed Vitest with `--maxWorkers=2`: `src/simulation-fee-collection.test.ts src/issued-simulation-fee-statement.test.ts` — 6 PASS.
- Installed TypeScript `--noEmit` checks for core and DB — PASS. Temporary `/tmp/m4-12-s-collect-catchup-tsconfig.json` typechecks collection integration, upgrade, catalogue and shared-fixture sources and imports under repository settings — PASS.
- PL/pgSQL CASE, money-arithmetic and commercial-boundary lints — PASS. `git diff --check` — PASS; no conflict markers remain in the three conflicted files. The git index still has unmerged entries because the sandbox prohibits git writes; the router must stage the resolved contents.
- No migration present on `origin/main` was edited. PostgreSQL/shadow-catalog integration, upgrade, browser journey, current-main CI and independent Claude RED review remain pending. The coordinator runs PostgreSQL. No git write, provider, release or live-money action was performed.

Current-main catch-up, 31 October 2026, 06:19 order (RED; DEMO-S step 3 / money chain step 3):

- Caught up to local `origin/main` `faa26359139259a53e1c36597e2132a4114f0533`, including merged M4-10-S #455. Migration 0490 is byte-identical to main, including its per-source `SUCCESS_FEE_SOURCE_CHANGED` refusal. No migration on main was edited. Own 0491 exceeds main's highest migration stem 0490 and retains its existing reservation; no renumber or new migration claim was needed.
- Resolved the statement-panel conflict by preserving main's native versioned download filename and complete availability/statement response reads, plus M4-12's collection panel. The unavailable-settlement placeholder is removed because the fake collection panel supplies this piece's integration.
- Added both collection transports to `jobMutationRegistry` as `post_live_billing`, matching main's statement routes. No command authority or lifecycle policy was changed. Existing exhaustive Next/Nest registry discovery tests pass without modifying their expectations.
- Collection reads and command requests now use `keepalive` and consume the complete response body, including refusals, before returning or refreshing. Four delayed-body regressions verify these navigation/request boundaries. No abort path or builder terminal-outcome action was added. This is local request validation, not an SV-3 browser-Q pass.
- Preserved every main live LP-0 capability/routine record unchanged; this lane's additive rows are in byte order. The downstream design input is restored byte-for-byte to main, matching main's deliberate frozen-snapshot contract for later fee migrations. Live 0491 calls/writes remain fully covered; an additional regression requires its objects to remain absent from the historical snapshot. No generator boundary or historical snapshot was advanced. This supersedes this receipt's earlier references to adding collection rows to both inventories.
- Both 345-row tenancy expectation blocks are unique and in PostgreSQL byte order. Named main expectations remain present in tenancy, contractor-entitlement and SERIOUS-B5; the latter preserves the existing exact additive-catalogue comparison. Lane allowance exactly matches all 31 changed paths, including its own lane file and the new web regression file.
- Installed-runner local checks, all Vitest runs with `--maxWorkers=2`: web `simulation-fee-collection.test.ts`, `simulation-fee-statements.test.ts`, `workspace-shell-statements.test.tsx` — 24 PASS; API `watchdog-registry.test.ts`, `success-fee.application.test.ts` — 145 PASS after rebuilding core's stale compiled runtime; DB `lp-0-catalog.test.ts`, `simulation-fee-collection-catalog.test.ts`, `simulation-fee-statement-catalog.test.ts` — 31 PASS; core `simulation-fee-collection.test.ts` — 3 PASS. Total: 203 targeted Vitest tests.
- `node --test tools/lp-downstream-inventory.test.mjs` — all 5 PASS. Core TypeScript build, web typecheck with `--incremental false`, API `tsc --noEmit`, PL/pgSQL CASE lint, money-arithmetic lint, commercial-boundary lint and `git diff --check` — PASS. No package installation was performed.
- PostgreSQL migration/integration/upgrade/shadow-catalog suites, SV-3 Q, the collection browser journey, both complete demos, current-main CI and fresh independent Claude RED review remain unverified in this sandbox. The coordinator/CI runs PostgreSQL and browser checks. Conflict content is resolved; the read-only git index remains for the router to stage. No git write, provider, real-money or release action was performed.

CI repair 1 at 7c8eccb0, 31 October 2026 (RED):

- Customer-variation's immediate 0502 snapshot is unchanged; only its later full-migration snapshot adds 0519's three empty collection tables. The 0505 upgrade catalogue now admits exactly those three tables/policies and two named collection routines, in byte order, while comparing every predecessor table/policy and unrelated routine exactly as before. Row/type fingerprints and replay checks remain.
- The genuine GBP3000 receipt reversal now includes `grossPence:300000`, required by the current strict allocation-v1 contract. A source comparison confirms this is the only change in that integration test; every GBP282 / minus GBP250 / GBP32 assertion is unchanged.
- The statement transport spec mocks availability/statements but leaves the newly nested collection read unmocked. Its statement-approval refusal and the collection read failure are distinct alerts, not duplicate rendering. Both remain visible, now named `Simulation statement error` and `Simulation collection error`; the browser assertion selects the statement error by its accessible name and exact message. A local rendering regression proves both errors remain distinct and visible in markup. No error was hidden and no command failure became success.
- Local installed Vitest: web `app/ui/simulation-fee-statements.test.ts app/ui/simulation-fee-collection.test.ts app/ui/workspace-shell-statements.test.tsx --maxWorkers=2` — 25 PASS. Core `src/receipt-line-allocation-source.test.ts --maxWorkers=1` — 22 PASS. Web TypeScript check with `--incremental false` — PASS. Temporary `/tmp/m4-12-s-collect-ci1-tsconfig.json` typechecks the three changed PostgreSQL suites and their imports — PASS.
- Vitest list with `--maxWorkers=1` successfully collects all three affected DB suites, including the exact GBP282 reversal/refund case; discovery is not PostgreSQL execution. Lane-path, no-migration-edit and exact grossPence-only test-diff audits — PASS. `git diff --check` — PASS. React checklist applied to the two accessible-name edits; no new hooks, fetching or state behavior was introduced.
- PostgreSQL upgrade/integration execution, the browser spec, full CI and independent exact-head RED review remain for coordinator/CI. No server, provider, real-money, release or git write action was performed in this sandbox.


C261 current-main helper-list catch-up verification, 31 October 2026 (M4-12-S-CATCHUP, RED):

- Starting HEAD `06188b5bca2362a420f38da793f7673d2c2ca797` already contains the clean merge of fetched `origin/main` `bc0a1940ac2f469b81f8a73120aecad371cc3238`, including #466/0507 and #467/0508. No git write or fetch was run. No source or test expectation change was necessary.
- Deterministic comparison against both merge parents confirms the LP-0 inventory is their exact structural union, with no missing or additional array entries. Every parent's B5 additive helper definition is unchanged, and helper names/calls are exactly their union, each called once, including `mobileAuthStoreAdditions`, `keyRegistryAdditions` and this branch's `simulationCollectionAdditions`. Tenancy and entitlement row lists are exactly the parent union. This is source inspection, not PostgreSQL verification or independent review.
- All 173 migrations on main are byte-identical to main. The only branch migration remains `0509_simulation_fee_collection.sql`, byte-identical to the pre-merge branch parent and contiguous after main's 0508. No migration renumbering was needed.
- Installed DB Vitest, `--maxWorkers=2`, first run: `test/lp-0-catalog.test.ts test/contractor-entitlement-snapshot.test.ts test/audit-export-privilege-comparator.test.ts` — 53 PASS. Second run: `test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts test/upgrade-proof-utils.test.ts` — 7 PASS. No run included more than three named files.
- Installed DB Vitest `list --maxWorkers=2 test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts` — all 19 cases collected; discovery only, not database execution.
- `turbo run typecheck --concurrency=2` stalled at pnpm startup and was interrupted. The installed root `node_modules/.bin/tsc -p tsconfig.json --noEmit`, executed from each package with at most two concurrent processes, passed for config, storage, core, ai, db, api and web (all seven workspace typecheck scripts). No package download was performed. `git diff --check` passed.
- READY for router commit/push and required CI/independent exact-head RED review. Whole PostgreSQL migration/privilege/upgrade suites and browser suites remain for GitHub CI; neither demo was executed here. No provider, live-money or release action was performed.
