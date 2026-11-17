# SBOX-SESSION-1 builder run receipt

Date: 5 October 2026. Builder: Codex. **Implementation and local deterministic checks only; no independent verdict or technical acceptance.** The dispatcher commits this working tree; Claude Opus reviews that exact commit and a separate actor records acceptance.

Requested branch: `codex/sandbox/sbox-session-1`. Base: `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`. HEAD/branch/origin metadata was read directly from the read-only git files, without a git command. HEAD and `origin/main` both name that base. No commit, add, checkout, push, merge, PR, deployment, provider call, spending, real send or decision-record approval was performed. The user’s explicit released dispatch supersedes the historical held prerequisite notes. This receipt does not accept PR #108 or its feed.

## Changes and scope

The first working-tree change appended an exact-path SBOX-SESSION-1 lane. Existing lane registrations are unchanged. Additional necessary exact paths were appended within this task’s entry. Shared application/transport files serialize with sibling repair lanes; they cannot be concurrently edited safely.

The shared `PracticeAccess`/database principal bridge authenticates a persisted, server-issued opaque session, checks current owner membership/role/identity/expiry/revocation, and resolves immutable creation-time ownership before job projections, commands, approvals, revocations, advancement, reconciliation and replay. A different issued session gets `NOT_FOUND`/404; unknown or invented UUIDs fail authentication. Next applications are request-scoped, and standalone Nest handlers forward the actual cookie. No caller-selected tenant or membership becomes authority. Pilot/production practice initialization is refused.

Capture records the session digest and server-selected scenario in the transaction creating the job/source/proposal, and checks ownership before returning an existing capture ID. Sandbox creation and new generated home scenarios bind at insertion too. Existing home fixture templates remain internal seed/test data, not shared practice jobs. Legacy/unbound jobs and runs fail closed; no first-touch backfill or inferred creator. Sandbox run handles/audit actors derive from the digest instead of recording a bearer cookie.

Case IDs and decision IDs resolve via tenant-qualified job links. Proof finalize/complete/invalidate commands additionally bind the upload/evidence to the authorized job, and stored original-byte reads check ownership. The decision inbox filters ownership in SQL before projecting records/counts. The authenticated empty fixture workspace still returns an empty inbox. Commercial-integrity feedback is restricted to the owned job. The original pure unpersisted fee calculator is unchanged; both job-scoped what-if transports authorize the job first.

M0-6L, recovery-message and practice-feed applications/migration 0046 are **absent at this base**. This implements their shared prerequisite, not a claim that their absent handlers, receipt/account tables or first-touch routines were repaired/tested. When integrated, the feed must require positive creation-time binding before receipts, owner/account creation, connect, replay and raw SQL claims, and preserve its existing membership/RLS/audit checks. No legacy first-touch attribution is permitted. M0-6L integration must use its principal bridge; this synthetic-only adapter grants no live identity authority.

Affected invariants: AGENTS §§5.1–5.4, 5.7, 5.10–5.12 and BUILD_PLAN C3/C5. Commercial document/version/idempotency/provider contracts, real-provider gates and earlier test assertions are retained. No model, prompt, extraction parser or AI output schema changed.

## Application inventory

Every public stateful method below has missing/invented/stranger regressions (session-only creation/rate entry has missing/invented checks; new owned jobs are legitimate creations). There are 74 application boundary cases plus 74 production/pilot confinement cases. Actual standalone handlers contribute another 70 cases. These are SQL-client doubles/control-flow checks, not PostgreSQL proof.

| Application | Covered methods |
|---|---|
| Capture | capture, view, save, confirm |
| Quote | get, save, preview, issue, deliveryView, execute (including reconcile), pdf, acceptanceView, accept, disposition, activationView, activate |
| Variation | get, command (propose/revise/approve/reject) |
| Decisions | list, evaluate, dismiss; SQL ownership filter before inbox projection |
| Proof | get, command (select/finalize/complete/invalidate); referenced upload/evidence and original-byte guards |
| FinalAccount | get, build |
| CustomerInvoice | get, issue, pdf, creditView, previewCredit, issueCredit, receiptView, recordReceipt, reverseReceipt |
| Material | view, addRequirement; addRate authenticates the session at its tenant-level boundary |
| PurchaseOrder | view, revise, place |
| SupplierDocument | view, intake, receipt, confirm |
| SupplierMatch | view, create, correct |
| ThingsToCheck | view, evaluate, review, supersede |
| Readiness | view, record, advance |
| InboxRelevance | view, seed, budget, dismiss |
| RecoveryCase | list, command, eligibility; standalone GET/POST and missing-session checks |
| EvidencePack | list, generate, approveAttachment, inspect, download; case-to-owned-job resolution |
| CommercialIntegrity | view, review; feedback restricted to that job |
| Value | read |
| Recovery demo | read, select, approve |
| Fee illustration | read, create; pure whatIf retained with guarded job transports |
| Workspace service | getJob, actual session retained; authorized second-context/reload coverage preserved |
| Sandbox service/repository | create, read/get, reset, archive, advance; issued sessions and immutable job binding |

## Tests-first evidence

After dependencies were compiled, `node apps/api/node_modules/vitest/vitest.mjs run --root apps/api src/practice-session.test.ts` **exited 1: 75/75 failed** against the original implementations. Log: `/private/tmp/sbox-red-direct.log`. This demonstrated missing authorization/guard ordering before implementation, using SQL-client doubles. It is not a live DB test. The initial matrix included the non-job-owned pure calculator; its existing purity assertions were preserved, and its job-scoped transports are guarded/tested instead. The final stateful matrix has 74 cases, with no skips.

PostgreSQL and browser regressions were written before the ownership implementation; execution is deferred to CI per the dispatch environment. PostgreSQL tests cover capture-time binding, stranger-first denial, concurrent creator/stranger checks, replay and capture-ID reuse across sessions, missing/unknown/expired/revoked sessions, role/membership revocation, unbound upgrade data, raw runtime ownership updates even with a forged feed-session setting and appended claim audit, rollback of that audit, migration-owner immutability, SQL-scoped inbox reads, sandbox binding, credential-free audit references and privilege/RLS posture. Fresh migration/bootstrap tests remain mandatory; migration-count assertions advance from 44 to 45.

The browser regression creates through the real capture POST without mounting the creator workspace or requesting a feed, attacks reads/writes from a separately issued session first, checks missing recovery reads/writes and an invented cookie, exercises every evidence-pack endpoint against a real synthetic case/artifact, then verifies creator access and reload. Both existing projects discover it; no successful API interception, retries, timeout extension or skip. The existing SBOX-1 second *authorized* context now copies the creator’s storage state; its assertions are unchanged. The old sandbox DB fixture now issues its sessions; its assertions remain unchanged. Evidence-pack unit coverage replaces the old arbitrary-second-UUID admission assertion with an explicit denial and no second write.

## Executed commands and exit codes

Node 24.17.0; dependencies were already installed. No install or lockfile change. The default pnpm launcher attempted a manager switch and eventually exited 1 on unavailable registry verification; it never reached Vitest. The locally cached pinned pnpm **10.28.1** was then used via `/private/tmp/sbox-tools/pnpm`, with `PATH=/private/tmp/sbox-tools:$PATH` for the pnpm commands below. No packages were downloaded/installed. Turbo cached results are distinguished from fresh package execution.

| Command | Exit / actual result |
|---|---|
| Baseline `node .../typescript/bin/tsc` for core, config, storage, ai, db | 0; built dependency exports before the red test |
| Initial direct Vitest attempt before those builds | 1; no tests imported because core exports were not yet built, not defect evidence |
| Baseline direct API practice-session Vitest command above | 1; 75 failed, tests-first defect evidence |
| `pnpm typecheck` (final) | 0; 7 successful tasks, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed; lane checker refuses HEAD/base self-comparison before package lint |
| `pnpm lint:lanes` | 1; same “Missing branch or self-comparison range; refusing a misleading pass.” No bypass or lint-script change |
| `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs && pnpm exec turbo run lint` (final) | 0; all source boundary checks and 7 package lint tasks pass, 4 cached |
| `node --test tools/*.test.mjs` | 0; 42 passed, none skipped |
| `pnpm exec turbo run test --filter='!@jobguard/db' --filter='!@jobguard/api'` | 0; 11 successful tasks, 8 cached; web 63 tests freshly passed. Core/config/storage/AI fixture results include Turbo replay |
| Initial unfiltered API Vitest run | 1; exposed expected old fixture/auth assumptions, subsequently repaired, plus health listener `EPERM`. No assertion was weakened to obtain green |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` (final) | 0; 16 files, **325 tests passed**, none skipped. Health excluded only from this local command, not from source/CI |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | 0; 4 non-DB unit tests passed |
| Explicit strict `tsc --noEmit` on `packages/db/test/practice-session.integration.test.ts` | 0; checks the deferred test source/types, not PostgreSQL behavior |
| `pnpm build` (final) | 0; 7 successful tasks, 4 cached; real API compilation and Next production build executed |
| `pnpm --filter @jobguard/api openapi:generate` / `pnpm openapi:check` | 1 each; tsx CLI tries to bind an IPC pipe and gets `EPERM` |
| From apps/api: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts` | 0; generated the real OpenAPI document without the CLI IPC listener |
| Same Node-loader command with `--check` (final) | 0; actual generated document equals committed-tree artifact |
| `pnpm --filter @jobguard/web exec playwright test --list SBOX-SESSION-1.spec.ts` | 0; discovers one regression in each of `mobile-360` and `desktop` (2 cases); **discovery only** |

Initial typecheck/build attempts after the transport-test additions reported exact-optional-cookie type errors. Those were fixed by omitting absent cookie fields in the fixture; subsequent checks above pass. Cross-session handler testing also exposed missing cookie forwarding in ProofController; the actual transport was fixed. These intermediate failures are not final passes.

Detailed logs are `/private/tmp/sbox-{typecheck-final,build-final,package-lint,api-tests-final,unit-tests,tool-tests,db-unit-tests,browser-list,db-test-typecheck,lint,lanes,openapi-script}.log`. No clean reinstall was attempted; this is evidence from the provided installed workspace, not a clean-install claim.

## Migration, compatibility and remaining gates

**0094_practice_session_ownership.sql** is registered append-only and recorded as the §12.2 ledger amendment under Ben’s 5 October merge-ahead ruling: this checkout has migrations 0000–0042 and 0053, while §12.3 reserves 0054–0093. Existing reservations are untouched. The migration adds a restricted control-plane token-digest registry (explicit identity/control-plane exception), narrow issue/authenticate routines, immutable session/scenario job columns, positive FK/completeness/synthetic-tenant checks and a transfer/backfill guard. Runtime table/schema enumeration and ownership updates remain denied; existing FORCE RLS/business grants and commercial write/audit lock order remain. **No migration was applied locally.**

Old arbitrary UUID cookies must start a newly issued practice session. Old unbound captured/template/run jobs cannot be claimed or recovered by first touch. New home scenarios are generated per session. New headers/cookies do not grant live authority. The forward-fix strategy is in `packages/db/MIGRATIONS.md`; revoke affected synthetic sessions and correct routines/guards with a reviewed migration, without rewriting ownership or restoring shape-only admission. No new external action or provider alert was introduced; typed 401/404 denials are the operational outcome.

`pnpm test:db`, `pnpm test:migrations`, full `pnpm test:e2e` and both browser regressions **were not run**: this sandbox cannot start PostgreSQL or bind localhost, and the dispatch explicitly assigns those suites to GitHub CI after dispatcher push. The unfiltered root `pnpm test` was not represented as green because it includes DB and the listener-dependent API health test; its runnable unit/tool portions were executed separately. The health test and all mandatory CI scripts/suites stay enforced. AI fixture checks are included in the unit task results; no independent `pnpm eval` or live model run was needed/run because no model/prompt/parser/output contract changed, and live processing remains gated.

The dispatcher must commit, run the unchanged full CI checks (including real PostgreSQL fresh/upgrade/privileges/RLS and both browser projects), obtain the Claude Opus verdict bound to that head, and obtain separate acceptance. The local lane checker must run after there is a non-self-comparison commit range. The feed/message integration prerequisites described above remain explicit for those absent branches. This builder has not independently verified, accepted, merged or released the task.
