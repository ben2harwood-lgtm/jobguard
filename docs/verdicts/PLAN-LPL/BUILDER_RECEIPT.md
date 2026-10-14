# Builder receipt: PLAN-LPL

**Preparer:** Codex. **Date:** 13 October 2026. **Task/branch:** `PLAN-LPL` / `codex/sandbox/plan-lpl`. **Inspected base:** `origin/main` at `ec6ad4d2a411bf058cb1f107419d68da9fdffc05`; the initial working tree was clean. This is document preparation and source inspection, not a security implementation, model verdict, technical acceptance or permission to load real data. Ben owns this plan PR's merge click. No commit, staging, push, PR creation, migration, test source or product code change was made.

## Authority and scope

The dispatcher records Ben's adoption on 13 October 2026, about 13:45: **"yes, lock down the database login"**. The explicit work order also says the track must be complete before real customer data. Accordingly §11.8 includes all of A's LP-0–LP-13 scope, including every named LP-5/6/8 subpart, in the whole-track gate; A's conditional pilot deferrals do not discharge that gate. No extra piece is invented. The main programme is 17 named cards (LP-0–LP-9 after splitting only A's named subparts); four further cards are A's LP-10–LP-13. "About 18" and later "about 7" describe estimated build orders, not exact card counts; multi-order cards remain possible under the existing split rule. No schedule/cost promise is adopted.

Changed files: `BUILD_PLAN.md` (new §11.8, one dated §12.2 ledger amendment, additive §12.3 graph rows); one compact lane line in name order, first change, in `config/agent-lane-assignments.json`; this receipt and source-inspection evidence under `docs/verdicts/PLAN-LPL/`. The placement is shared platform work because the login, audit, identity, worker and RLS controls apply to both commercial tracks. Original plan text, including §3 and M0-13a, is preserved; the new section expressly adds to those gates. Earlier dated ledger amendments were read on origin/main and their additive style retained; no historic row was replaced.

## First four build orders

- **LP-0** — grant freeze guard, no migration.
- **LP-1** — membership/account closed to the app login.
- **LP-2** — unchecked job doors closed.
- **LP-3** — old activation/acceptance routes get the v3 checks.

Each is buildable after Ben merges this plan PR and its predecessor dependency merges; invisible does not mean free of compatibility risk. LP-4–LP-6's reviewed design note is prepared early, without adding a separate invented build piece.

## Astra N6 change dispositions

Every numbered recommendation in B is addressed below. Where one recommendation contains both technical acceptance improvements and a policy choice, its policy part has a separate line. TAKEN means incorporated in this draft; it does not assert that the control exists.

- **B1 — TAKEN:** classify all reachable caller-to-authority paths by downstream effect in the shared inventory/LP-0 and applicable cards; the roughly 100 working-data tables are not presumed safe.
- **B2 — TAKEN:** distinguish identity, permission, exact approval and completion; review the binding/command contracts before fixing LP-5's interface, preserving decided member and contractor permissions rather than a new blanket owner rule.
- **B3 — TAKEN:** mandatory trusted search path, temporary-object/dynamic-SQL safety, narrow execution, owner/role-assumption checks, called-helper review and explicit tenant/resource checks in R2; no assumption that definer ownership implies RLS safety.
- **B4 — TAKEN:** LP-0 inventories effective column/table/sequence/view/overload/PUBLIC/inherited/switchable/owner/default privileges and equivalent routine capabilities; deliberate additions fail and behavioural tests remain necessary.
- **B5 — TAKEN:** LP-1 proves any locking column immutable and tests RLS locking/remaining side effects; otherwise use the narrow lock routine, including account and seed separation.
- **B6 — TAKEN:** LP-2 covers ordinary as well as imported inserts, prohibited initial money/state, forged/unset contexts, trusted adoption/deployment boundaries, narrow start-quote permission and all legacy paths; NULL interpretation remains unexecuted.
- **B7 — TAKEN:** LP-3 binds exact operation/resource/payload/terms and rejects reuse, stale state and expired approvals with race/long-transaction tests; hardened v1 remains for the saved earlier-pricing journey, obsolete signatures withdrawn.
- **B7 clock tests — TAKEN:** long-transaction/wait expiry tests retain A's clock distinction and merged 0134/T8: approval time is transaction start, audit uses wall clock with ordered times in one transaction; authorization expiry already uses wall clock. This is test coverage, not a new clock ruling.
- **B8 — TAKEN:** LP-4/6e stop generic append from certifying invented high-trust events; checked mutations produce those facts atomically, with actor/tenant/type/payload integrity, canonical/verifier/display agreement, historical-format compatibility and retained backstop assertions.
- **B9 — TAKEN:** LP-5 controls creation, completion and permitted replay, exact scope/approved use, current access, duplicate-input conflicts and consistent mutation/receipt/audit/outbox, including stale claims, cancellation and failure before completion; all writers converted before revoke.
- **B10 — TAKEN:** LP-6's credential/transaction threat model tests absence, kind, expiry, revocation, substitution, rebinding, pools/commit/rollback/savepoints/backend reuse and privileged lookup; usable digest is credential material, not harmless metadata.
- **B11 — TAKEN:** LP-7 proves next-request removal/demotion, concurrency/last-owner protection and atomic audit, with a documented tested authenticated administration procedure while the screen remains parked; existing execution-time revocation rules govern queued work.
- **B11 ownership/continuation-policy additions — NEEDS A RULING:** creation/removal/transfer/recovery rights and any exception allowing revoked authority to continue are Ben's decisions. Keep A's recommendation (owners at sign-up only; another active owner for removal; never last owner) as a recommendation, not approved access policy. B cannot silently add transfer/recovery powers or a continuation exception.
- **B12 — TAKEN:** LP-8 covers allocations/final pointer/evidence/prevention/outbox and equivalent lower-trust dependencies, exact actor/resource/amount/state rules, tenant/job links inside owner routines and external evidence versions/access/integrity. Restore-tool conversion and fingerprint restriction remain.
- **B13 — TAKEN:** refusal suite grows throughout; LP-9 finally tests security properties and positive committed outcomes using real roles/pools, races/retries, alternative routes and preserved backstops; results bind deployment/migration/role/app versions, with destructive tests confined to an equivalent disposable database.
- **B14 — TAKEN:** LP-10 creates worker-only binding/claim/completion before real-data worker use; web cannot invoke it, worker derives authority from the authorized action, and execution/authorizer attribution and lease/retry semantics are tested.
- **B15 — TAKEN:** LP-11 covers both read visibility and write checks, policy alternatives/views/definers; dedicated database or risk acceptance cannot be labelled passing tenant enforcement.
- **B16 — TAKEN:** narrow ownership for new binding/command/audit/money chokepoints starts in LP-6a; LP-12 addresses relevant remainder with grants/helper/role-assumption and positive tests, without an invented wholesale move of all routines.
- **B17 — TAKEN:** LP-13 explicitly traces each of A's five items; authority/evidence/money consequences go to their relevant existing earlier piece and are retested, rather than inferred harmless from the batch title.
- **B18 — TAKEN:** early contracts, gradual refusal coverage and compatible landing groups replace invisible-means-risk-free; conversion/revocation/caller groups serialize, new money grants are frozen and scanner-pin approval remains separate.
- **B18 maintenance cutover — TAKEN within C4:** a maintenance window can coordinate compatible release groups; it supplies no exception to the decided expand-compatible rollout or unsafe mixed-version fallback.
- **B19 — TAKEN:** gate completion requires effective privileges, trustworthy binding on every reachable authority path, exact approvals, trusted audit, money/evidence/outbox controls, offboarding and final deployment proof; LP-6d/e and LP-8b cannot disappear behind blanket partial-piece deferral.
- **B19 conditional deferrals — DECLINED:** dedicated-database/disabled-worker/later-low-risk exceptions cannot substitute for whole-track completion because this dispatch explicitly requires the track complete before real customer data. Scope remains A's pieces; no additional hardening task is invented.
- **B20 — TAKEN:** LP-9 includes deployment roles/secrets/rotation and existing connections, owner absent from services, seed destinations, restored privileges/policies/triggers and restored session/revocation/authorization/queue behaviour; source claims about synthetic intent are distinguished from uninspected deployed contents.
- **B21 — TAKEN:** no blanket per-entry signature prerequisite; existing restricted checkpoints before G1 and later M4 anchoring/M5 verification remain. Cutover distinguishes legacy records and the residual claim does not authenticate them retroactively or resist administrators without independent evidence.
- **B22 — TAKEN:** schedule/review counts are assumptions, not acceptance; the ambiguous round arithmetic is not copied as a promise and no replacement cost is invented. Actual direct-role/concurrency/positive tests remain distinct from model reviews.
- **B22 human reviewer/spending — NEEDS A RULING:** A's independent human review recommendation remains an explicit real-data approval hold with reviewer/affordable route to identify; adoption does not approve spending against the current no-spend rule, or let an agent claim professional sign-off.
- **B23 — TAKEN:** bounded residual risk distinguishes business-password protection from stolen valid sessions, API/sign-in takeover and administrator powers; audit says what the system accepted, not what a person intended or happened on site.

No decided fee formula, tax rule, commercial permission list, safety rule, owner right, session lifetime, retention policy or deployment approval is amended here.

## Proposal versus merged origin/main

All findings below are **SOURCE-INSPECTED ONLY** via `git show origin/main:` migrations, with paths/line declarations in [SOURCE_INSPECTION.md](SOURCE_INSPECTION.md). Neither the proposal's audit nor this preparation executed attacks or queried deployed grants/data. The checked head is seven migrations beyond A's `ad1bad2`.

- **Reservations/open work are stale:** 0132 SV-4, 0133 SV-3, 0134 CH-7-TERMS, 0135 ENT-3a, 0136 M4-8-S, 0137 ENT-10a2 and 0138 PRACTICE-SESSION-HARDEN-1 are all merged, not merely reserved. The ledger records this and reserves no reused LP number.
- **M4-8-S's supposed money INSERT grant is absent in the merged result:** 0136 lines 110–111 revoke all runtime table grants and restore SELECT only on its allocation tables; its checked write routine has specific runtime EXECUTE (357–358). LP-8 verifies/preserves this, rather than calling it an unresolved direct-INSERT exception.
- **"No product member removal" / "every membership UPDATE is in a test" is stale:** 0137 `identity.scim_deactivate` updates `app.membership.revoked_at` (78), EXECUTE is identity-only (97–98), with merged API/Next routes. This does not establish the proposed general identity-side owner role-change/administration capability; LP-7 must cover the current route as well.
- **The clock question is no longer merely open:** merged 0134 stores/pins approval time at transaction start (12, 31) and checks owner/authorization expiry using wall clock (61, 63); the CH-7-TERMS receipt records the coordinator's amended T8 on 12 October. LP work preserves that rule.
- **SV-4's old invoice grant uncertainty can now be resolved by source:** 0132 grants the lock-bound invoice routine; it contains no withdrawal of `issue_practice_customer_invoice`, whose runtime EXECUTE in 0027:52 survives. LP-8a inventories both routes. Whether the old grant provides a full exploitable bypass depends on other checks and remains unexecuted.
- **Practice session assumption is now implemented:** 0138 replaces contractor lookup/start using digest/lifetime/revocation helpers, adds holder revoke and the owner grant-create refusal. LP-6 uses the new trusted records and must not re-create the already merged hardening. No lifetime change is proposed.
- **"Three owner-side audit insert routines" is no longer complete:** 0132 adds `append_final_lock_audit` (142 inserts); 0133 adds a shadow-detection audit writer (111 inserts), both using head helpers. LP-4 must cover these too; narrowing only the earlier three would miss merged writers.
- **Worker scope has grown:** the same business worker now also composes shadow-detection work from 0133. The proposal's missing incoming-work information is no longer a reason to assume worker actions are harmless just because delivery adapters are fake.
- **The plain-English price/cap fee description is legacy-specific:** 0109 explicitly gives v3 activations no recovery-cap baseline; the merged plan's v3 success fee has no cap or base-plan credit. LP-3 preserves saved v1 behaviour, not a new cap for v3. The login track changes no fee entitlement or formula.
- **Working-data privilege simplification is incomplete even at the earlier baseline:** 0008:50 grants full SELECT/INSERT/UPDATE/DELETE on proposal-review tables, 0002:100 permits evidence_upload UPDATE, and 0003:113–114 retains column UPDATE grants. A's "stay as SELECT+INSERT" is not a literal inventory of all current working-data powers. LP-0/B1 must classify the effective capabilities rather than silently dropping them from the list.
- **Counts/caller/fixture totals are snapshot estimates:** A's 76 routines, about 50 EXECUTEs, roughly 100/125 tables and fixture counts were not treated as a verified current catalogue. New routines and callers have landed; LP-0 inventories actual effective catalogues and LP-5b inventories all current writers. No replacement figure is invented.

The core grant/routine concerns remain in the checked definitions: 0000:82 still grants account/membership SELECT/INSERT/UPDATE/DELETE with no later revoke; 0001:89/91 still gives runtime audit head EXECUTE and audit INSERT; 0003:121 still grants transition_job; 0005:76/79/80 still permits authority INSERT and column UPDATE; 0017:8/0028:14 still grants direct billing/sequence INSERT; v1 activation and settlement signatures remain executable from 0012:72 and the legacy activation caller remains. 0020:32 still tests a caller-set import flag with `<>`; its NULL branch reading is plausible, not an executed full-insert proof. The current tenant bridge still assigns transaction-local tenant context; later hardened routines still take caller actor arguments. No merged change read closes those foundational paths.

Practice-only invoice watermark/synthetic constraints, fake outbound restriction, synthetic identity checks, activation mode restrictions and disabled recovery posting remain code-level safeguards, not inspected deployed contents or proof that free text/uploads contain no real data. Identity and business pools remain co-located in the API; a role boundary does not protect a taken-over process holding both.

## Validation and remaining gates

Actual environment: Node v24.17.0; dependencies were already installed. No fresh install or package download was performed; no package-manager/signature check was disabled. The normal pnpm launcher attempted its pinned-version verification and failed; direct installed-binary checks below do not constitute a clean pinned pnpm run.

| Command actually run | Result |
|---|---|
| `pnpm typecheck` | exit 1 before execution: pinned pnpm 10.28.1 signature verification could not fetch registry evidence. |
| `pnpm build` | exit 1 before execution: same launcher block. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | exit 1: core purity passed, then lane lint refused HEAD equal to base on this uncommitted worktree. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | exit 1: same self-comparison refusal. Dispatcher must rerun official lane lint after committing; no lint weakened. |
| Installed `tsc -p tsconfig.json --noEmit` in config, core, ai, storage, db, API and web | all exit 0. These also execute every package's current lint script body (each is this TypeScript check). |
| Installed `tsc -p tsconfig.json` in config/core/ai/storage/db, then API `nest build`, then web `next build` | all exit 0, full build chain; existing Autoprefixer warnings. |
| `node --test tools/*.test.mjs` | exit 0: 85 passed, none failed/skipped. |
| Installed `vitest run src --maxWorkers=1` in config/core/ai/storage | all exit 0: respectively 1/2140/80/2 tests passed. AI run is fixture-only existing suite, not a live evaluation. |
| Installed `vitest run src --maxWorkers=1` in API | exit 1: 57 files passed, 7 failed; 1416 tests passed, 59 failed, 23 skipped, 58 unhandled errors. Socket tests report EPERM/null server port; database isolation reports no available port; shadow isolation's nested pnpm build hits the launcher block. One unchanged source architecture assertion also fails as explained below. |
| Installed web `vitest run src --maxWorkers=1` | exit 1: mistaken filter, no tests found; corrected to the package's actual test command below. This is not a pass. |
| Installed web `vitest run --maxWorkers=1` | exit 0: 24 files / 534 tests passed. |
| API `tsx ...generate-openapi.ts --check` | exit 1: tsx CLI IPC socket is sandbox-blocked. Root `node --import tsx` attempt also failed because tsx is installed in API, not root. |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | exit 0: OpenAPI check through installed loader without CLI IPC. |
| `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | each separately exit 0; 149 core TypeScript files checked. |
| Working-tree lane/config check using existing `selectLane`/`matches` and read-only git diff/untracked paths | exit 0: only plan/lane/PLAN-LPL documentation paths; deleting the added lane reproduces the original JSON configuration. This is a deterministic worktree check, not the official committed-range lint. |
| Original-plan preservation check | exit 0: removing only §11.8, PLAN-LPL ledger amendment and appended LP graph rows reproduces origin/main BUILD_PLAN.md byte-for-byte. |
| `git diff --check` | exit 0. |

Additional observed test limitation: `prevention-check.application.test.ts` selects protected files with a regex applied to their absolute paths. The `/plan-lpl/` worktree segment matches its `plan` path alternative, so it classifies the unchanged core export index as a money/plan module and rejects its existing prevention exports. Both the assertion and core index are byte-identical to origin/main. This is an observed path-sensitive existing test failure, not a fix made or a green test claimed by this documents-only task.

`pnpm lint`, `pnpm lint:lanes`, `pnpm test` and `pnpm openapi:check` wrappers were not additionally invoked after the launcher failure; their installed script bodies were exercised above where possible. The exact root pnpm suite is not claimed passing. Database/migration/restore/e2e suites remain for CI; the API tests that try sockets/database isolation did not prove those properties locally. No checks were made optional and no earlier assertion was changed.
 No database/browser/evaluation implementation test or migration is introduced by this document task. DB, migration, restore and browser suites cannot execute in this sandbox (no PostgreSQL/localhost); mandatory GitHub CI still runs after dispatcher commit/push. No fixture/live-model evaluation applies to plan text. No screenshot applies.

Independent review on the dispatcher-created exact commit and separate acceptance remain outstanding. Astra N6 is a critique of the supplied proposal, not an independent verdict on this diff. Ben's merge click is the final plan step. Implementation security guarantees, G1, scanner-pin approval, owner-policy decisions, human-review/spend arrangements and deployment topology remain unfulfilled gates.

**Commit handoff:** intended conventional commit subject/body written to `/private/tmp/jg-msg-plan-lpl.txt`; no git-writing commands run.
