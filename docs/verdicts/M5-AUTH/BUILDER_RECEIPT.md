# M5-AUTH builder receipt

## Session block

- Order: M5-AUTH, counted DEMO-S piece / MON-5 second leaf, C270; C271 catalogue standing instruction; 25 October 2026.
- Builder: Codex (GPT-6), this dispatched conversation. Persistent session UUID and actual reviewer/acceptance session identities were not exposed; none invented. This is not an independent verdict or acceptance.
- Repository: ben2harwood-lgtm/jobguard. Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m5-auth`. Branch: `codex/sandbox/m5-auth`.
- Starting HEAD: `52f3503abfc4d2b9414dfb1bb294c557b032a758` (M5-PREP, in review). Recorded local origin/main: `ff5d53bec4cc656f5e29cfc5098694bd9c52c28c`. Initial working tree clean. Build-ahead exception applies to this parent only; merge after accepted M5-PREP.
- Git writes prohibited by dispatch: no add, commit, checkout or push. Final SHA, CI links and exact-head reviews are dispatcher-owned and unavailable here.
- Intended commit message: `/private/tmp/jg-msg-m5-auth.txt`.

## Disposition: runtime DEPENDENCY-BOUND, task incomplete

Read repository AGENTS.md, BUILD_PLAN MON-5 and §12.1 ready rule; issued planning pack's complete MON-5 section (5811–6035), shared contract/tables (3235–3380), registration/resource/review rules (5486–5559), and coordinator-only ownership. The pack names an old proposed `pca-mon5-authority-20261020` registration, not `m5-auth`; this dispatch supplies the authoritative branch/worktree/lane path and conditional migration reservation.

Read M5-PREP's authority proposal, candidate reuse map, receipt and the original `jg-orders/next-wave/BEN-ANSWERS-20261023.md`. Ben's safest-choice answer is applied as refusal, no standing authority, owner/finance ceiling, no disclosure or invented successful customer principal. It supplies no exact customer credential construction, SQL signature or grant lifetime. M5-PREP explicitly records:

> Neither alternative is selected or implemented here. Until the security handoff fixes all required values the selected behavior is refusal.

The issued M5-AUTH contract requires:

> The selected design must define their exact type and SQL signature before issuance.

It also says scope changes/additional shared-file needs stop for a corrected order, and the authority gate waits for the real decision and exact reused candidate contracts. Dispatch preserves those holds. Implementing a guessed capability, actor-switch, expiry duration, issuer role, opaque constructor or receipt namespace would contradict this contract and AGENTS §1/§5.3. No placeholder repository is offered as implemented authority. A clarification for a later exact approved handoff was sent while independent verification continued.

| Retained hold | Missing concrete handoff |
|---|---|
| M5-H-AUTHORITY | Selected persisted small-builder customer/tester binding, trusted opaque issuer/customer types and construction, current-authority source and checked SQL signatures. |
| M5-H-GRANT | Exact purposes, lifetime, replacement/reuse/revocation, party revision, view scope and credential redemption/transfer. Owner/finance ceiling alone is not an issuer principal. |
| M5-H-CANDIDATES | Accepted integrated A/B contracts and candidate-owner reconciliation. M5-PREP reports A/B absent from its base and needing repairs; this worktree has no customer-portal approval/link source. No substitute copied from candidate branches. |
| Dependency | M5-PREP remains in review; this is the explicitly authorized build-ahead base, not merged acceptance evidence. |
| Separate composition | Public routes/global guard, consumers, stage semantics and source intake remain with their owning leaves; no such construction here. |

Only this receipt and the exact own-lane registration are added. C1 reason: bookkeeping-only held handoff, no working product/UI claimed. Lane allowlist deliberately authorizes only this receipt, excludes its own registration and the central register, and cannot authorize later runtime files without the exact corrected handoff/order. Central register, shared exports, auth, ENT-5, A/B and all product code untouched.

## Acceptance and catalogue status

M5-A01–A05 and A07: DEPENDENCY-BOUND / NOT IMPLEMENTED / NOT RUN. No valid persisted selected authority, current-authority race, idempotency, rollback, runtime-DML refusal or own-migration upgrade claim. M5-A06: no changes to existing builder/contractor authority or candidate gate; source preservation only, regression runs recorded separately below, no authenticated customer proof.

Migration **0235 unused**; no SQL/note, table, routine, privilege, policy, trigger or approval namespace added. C271 delta is exactly zero for `recorded.routines`/tables, LP-0 including authority paths, tenancy, serious-b5-upgrade and contractor-entitlement-upgrade expectations. Those files and all freezes stay unchanged. No migration rollback/backfill required. No new provider, alert, secret, AI prompt or model behavior.

Reviewer-run PostgreSQL obligations remain: LP0-17 in `lp-0-authority-paths.integration.test.ts`, `serious-b5-upgrade.integration.test.ts`, `contractor-entitlement-upgrade.integration.test.ts`, `tenancy.integration.test.ts` and LP-0 grant-freeze/catalogue suites. The proposed two M5-AUTH DB tests and two unit files do not exist and are held with runtime construction, not claimed runnable or passing. Database, race, browser and whole `pnpm test` aggregates were not invoked because they require prohibited PostgreSQL/listeners or unreviewed DB harnesses. CI retains every mandatory suite. No real data, provider, delivery, funds, release, independent review or technical acceptance performed.

## Verification

Installed dependencies reused; no install/download requested. Node `v24.17.0` differs from repository `.nvmrc` pin `24.15.0`; no clean pinned-install claim. Existing cached pnpm 10.28.1 is invoked with network disabled through `/private/tmp/m5-auth-bin/pnpm`. The ordinary global `pnpm --version` launcher stalled and was interrupted (130); subsequent checks use the existing cached version directly.

Checks are sequential, through `/private/tmp/m5-auth-check`: admission refuses load above 20 and uses existing inspected heavy-slot with HEAVY_SLOTS=1; no more than one local heavy operation. Initial load 6.09, disk 94 GiB, memory-pressure free percentage 54%. Turbo concurrency 1, Vitest maxWorkers 2, Node test concurrency 1. No local PostgreSQL or browser/listener started intentionally. Actual command results follow.

| Actual command | Exit / result |
|---|---|
| `pnpm typecheck --concurrency=1` | 0; seven tasks successful, four cache hits. The initial admitted invocation completed; a second invocation also completed 0 after scheduler probes were retried with tool escalation. No scheduler logic changed. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | 1; core purity passed, lane check refused the five inherited M5-PREP paths. Root stopped before later lint steps. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same inherited-parent scope refusal. No parent paths added to this lane and no range/guard weakened. Dispatcher reruns on final commit after parent integration. |
| `pnpm exec turbo run lint --concurrency=1` | 0; seven package lint tasks passed. Does not turn root lint green. |
| From `packages/db`: `pnpm exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts src/tenant-context.test.ts test/proof-invalidation.test.ts` | Initial 1: tenant-context 21 tests passed; two suites could not resolve missing `@jobguard/storage`/`@jobguard/core` build entries. After build, identical three-file batch through `pnpm --filter @jobguard/db exec ...` exited 0: 49 tests passed. No test or package resolver changed. |
| `pnpm build --concurrency=1` | 0; seven tasks successful, four cache hits. No application/browser listener run. |
| `pnpm openapi:check` | 1; tsx CLI IPC listener refused with EPERM before generator execution. |
| From `apps/api`: `node --import tsx src/generate-openapi.ts --check` | 0; same generator/check via loader, no CLI IPC dependency. Snapshot unchanged. Standard command remains CI obligation. |
| From `packages/db`: `pnpm exec vitest run --maxWorkers=2 src/migrate-discovery.test.ts` | 0; three migration discovery/order/negative-control tests, no PostgreSQL. |
| `node /private/tmp/m5-auth-mutation-check.mjs` | 0; positive receipt/own-registration paths plus eight actual lane mutation/negative controls. |
| `node tools/money-arithmetic-lint.mjs` | 0; separate money boundary check, because root stopped before it. |
| `node tools/commercial-boundary-lint.mjs` | Final 0; no diagnostics. An earlier scheduler-waiting invocation was interrupted (130) before this sequential retry; no commercial check was claimed from that interruption. |
| `git diff --check` | 0; tracked diff check only. The two new untracked files were inspected separately. |

Initial admission attempts for the lint-through-migration sequence returned 75
without starting checks while load exceeded 20 (observed 22.87); waited and
retried sequentially after load dropped. The stock scheduler's sysctl/ps probes
report sandbox-denied diagnostics; no probe result is claimed verified and no
scheduler bypass was implemented. Temporary slot ownership is still controlled
by the existing wrapper. Full command/results manifest:
`/private/tmp/m5-auth-results.json`; logs `/private/tmp/m5-auth-*.log`.
Package-lint/build logs include shared-cache IO permission warnings and historical
cache log paths in other worktrees, Next multiple-lockfile/root-inference and
CSS/autoprefixer warnings. Cache hits are not fresh test execution. No dependency,
package link, cache, source, test timeout or configuration was edited to suppress
warnings. Installed Vitest 4.1.12 / Turbo 2.10.12; no package download.

## Mutation and independent-evidence limits

The only new executable boundary is the lane registration. Its executed controls
reject an unconditional-allow replacement; own-registration, directory-wide
registration and central-register grants; integration and branch-prefix fields;
a wrong lane ID; and a forged branch. Positive controls accept this receipt and
the branch's own registration. Script is retained in private tmp; production
validator/tests unchanged. These controls do **not** prove a customer authority
guard. All runtime G-AUTH/G-CURRENT/G-COMMAND/G-SECRECY mutation checks and
M5-A01–A07 persistence tests stay DEPENDENCY-BOUND with their unbuilt guards.

The 49 passing unit tests are comparator fixtures, stamped-context tests and
scripted proof orchestration, not actual PostgreSQL RLS/privilege/concurrency
proof. The migration discovery tests prove file order only. No successful
customer principal, usable grant, authenticated journey or immutable customer
approval is claimed. Full mandatory test suites, DB catalogues, browser tests,
current-main CI, two independent exact-head Claude verdicts and separate
acceptance remain reviewer/dispatcher obligations. Task remains incomplete until
the selected security handoff and candidate dependencies are supplied; this
bookkeeping diff must not be accepted as the runtime foundation.
