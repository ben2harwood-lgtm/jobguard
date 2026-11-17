# TENANT-STAMP-1 — round 2 builder receipt

7 October 2026. Working-tree repair on `codex/sandbox/tenant-stamp-1`, PR #115, supplied head `e7d4ba80d272b8c26c6ad4b0149d283a30b5f538`. Read the original `TENANT-STAMP-1.txt` order, repository AGENTS.md, applicable BUILD_PLAN §§2.3–2.4, SH-1 and M0-6L contracts, and round-1 receipt. All earlier work is retained. No commit, staging, checkout, push, merge or PR operation was performed; only read-only Git inspection/comparison. Dispatcher commits after handoff.

## Repair

`packages/db/test/shared-money-origin.integration.test.ts:93` now passes `{tenantId:"malformed"} as VerifiedTenantContext` directly to `withTenant`, with a short deliberate-refusal comment at line 92 and a type-only import at line 10. The old `ctx("malformed")` called the synchronous membership constructor before `expect` could receive a promise. The malformed unstamped literal now reaches `withTenant` and is asynchronously refused with the unchanged `INVALID_TENANT_CONTEXT` matcher. No other assertion changed.

Round 2 changes only this integration file, the lane registry, and this receipt. Added this receipt's exact path to the existing `tenant-stamp-1` allow list (45 entries); compact single-line JSON and every other lane are unchanged. No additional meaning-changing conversion was found or repaired.

Affected guarantees: AGENTS §§5.1 and 5.13; BUILD_PLAN C4/C5/C6/C8. This restores test coverage of refusal at the tenant boundary. Production code, SQL, schema, grants, migrations, prompts, policies, timeouts and workflows are unchanged. Round-1 capture stop remains recorded in the original receipt. No new operational alert or backwards-compatibility impact.

## Refusal-path audit (final file:line)

- `packages/db/test/shared-money-origin.integration.test.ts:93`: repaired malformed context; rejection originates in `withTenant`. Other-tenant read at `:91` retains its valid stamped `OTHER` context. Missing-context runtime reads at `:90` and `:95` are unchanged raw SQL.
- `packages/db/test/tenancy.integration.test.ts:142`: already passes a malformed unstamped literal; unchanged `INVALID_TENANT_CONTEXT` matcher reaches `withTenant`. Missing-context and pooled-state checks at `:145` and `:151` remain raw SQL.
- `packages/db/test/evidence-packs.integration.test.ts:88`: already passes `{}` to `repo.list`; valid case UUID reaches the repository's `withTenant` call at `packages/db/src/evidence-pack-repository.ts:68`. Its rejection matcher is unchanged. Raw missing/malformed SQL tests at `:57`, `:61` and `:63` are unchanged; they do not use the fixture constructor.
- `packages/db/src/tenant-context.test.ts:24–35` (individual forgery/missing inputs), `:40` (boundary invocation): literal, copies, clone, assignments, inherited object, proxy, getter, JSON, null and undefined all reach `withTenant` directly; refusal and zero-connect/work assertions are unchanged. Queued-constructor invalid-input tests at `:75` intentionally test synchronous constructor refusal with `toThrow`; they are not `withTenant` rejection tests and remain unchanged.

Searched every converted test for malformed/missing/invalid contexts, casts, helper calls and rejection expectations; inspected helper aliases and their argument call sites. All 44 converted helper calls in the 33 converted test files were checked. Each reviewed location follows (helper/conversion lines; refusal-specific locations above):

| File | Checked line(s) |
| --- | --- |
| `packages/db/src/outbox.test.ts` | 19, 74 |
| `packages/db/test/UIWIRE-10.integration.test.ts` | 3 |
| `packages/db/test/UIWIRE-11.integration.test.ts` | 3 |
| `packages/db/test/UIWIRE-12.integration.test.ts` | 13, 121 |
| `packages/db/test/activation.integration.test.ts` | 3 |
| `packages/db/test/audit.integration.test.ts` | 14 |
| `packages/db/test/capture.integration.test.ts` | 4 |
| `packages/db/test/commands.integration.test.ts` | 14 |
| `packages/db/test/commercial-integrity.integration.test.ts` | 13; callers 19–20 |
| `packages/db/test/decision-inbox.integration.test.ts` | 3 |
| `packages/db/test/evidence-pack-sources.integration.test.ts` | 30; callers 34, 51, 54, 61–63, 68, 77, 82 |
| `packages/db/test/evidence-packs.integration.test.ts` | 28, 86, 88 |
| `packages/db/test/evidence.integration.test.ts` | 17 (both contexts) |
| `packages/db/test/final-account.integration.test.ts` | 3, 12 |
| `packages/db/test/inbox-relevance.integration.test.ts` | 2 |
| `packages/db/test/job-import.integration.test.ts` | 13, 21 |
| `packages/db/test/job.integration.test.ts` | 3 |
| `packages/db/test/ledger.integration.test.ts` | 3 |
| `packages/db/test/materials.integration.test.ts` | 3 |
| `packages/db/test/outbox.integration.test.ts` | 26, 140 |
| `packages/db/test/practice-finding-scope.integration.test.ts` | 16, 38 |
| `packages/db/test/practice-scope.integration.test.ts` | 18 (both contexts) |
| `packages/db/test/quote.integration.test.ts` | 3, 6 |
| `packages/db/test/readiness.integration.test.ts` | 2 |
| `packages/db/test/recovery-cases.integration.test.ts` | 4, 45 |
| `packages/db/test/recovery.integration.test.ts` | 13 |
| `packages/db/test/review.integration.test.ts` | 19 |
| `packages/db/test/shared-money-origin.integration.test.ts` | 15, 91, 93 |
| `packages/db/test/supplier-documents.integration.test.ts` | 3 |
| `packages/db/test/supplier-matching.integration.test.ts` | 3 |
| `packages/db/test/tenancy.integration.test.ts` | 20, 142 |
| `packages/db/test/variation.integration.test.ts` | 3 |
| `packages/db/test/workspace-read.integration.test.ts` | 81 |

Foreign UUID contexts still obtain valid stamps so tests reach RLS/repository authorization rather than fail early. In particular, UIWIRE-12 `:121` still expects `INVOICE_NOT_FOUND`, evidence-packs `:86` expects `EVIDENCE_PACK_NOT_FOUND`, and recovery-cases `:45` expects `ELIGIBILITY_REVIEWER_FORBIDDEN`. UUID-producing constants, fixture fields and the outbox signal tenant remain intact. Inbox membership is independently supplied to its repository calls, preserving its original assertions.

TypeScript AST inspection compared all converted files against both pre-round-1 `e7d4ba8^` and supplied `e7d4ba8`: declaration lists and assertion counts preserved; every matcher chain unchanged, including all **609 integration `expect` calls** across **32 integration files**. All 33 converted test files parse without syntax diagnostics. This is source inspection, not PostgreSQL execution.

## Executed checks

Used existing dependencies: Node **24.17.0**, pnpm **10.28.1**, Vitest **4.1.11**. Commands use `PATH=/private/tmp/tenant-stamp-bin:$PATH` for the already-installed pinned pnpm executable; no install/download command. No clean reinstall was attempted. Logs and audit script/results are ephemeral `/private/tmp/tenant-stamp-r2-*` artifacts.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | 7/7 tasks successful; 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Root boundary checks and 7/7 package tasks passed; 4 cached; no self-comparison refusal |
| `pnpm lint:lanes` | 0 | Existing task branch and working-tree changes passed |
| `pnpm --filter @jobguard/db test src` | 0 | All DB units: 29 passed, 3 files; unqualified DB test includes forbidden local PostgreSQL suites |
| `pnpm --filter @jobguard/api test` | 1 | 109 passed, 1 failed / 110; 14 passed files, 1 failed. Health test cannot bind localhost (`listen EPERM`), with one unhandled socket error. Chained OpenAPI not reached |
| `pnpm openapi:check` | 1 | tsx CLI IPC socket bind forbidden (`listen EPERM`) |
| `cd apps/api && node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/check passed through loader without CLI IPC; contract unchanged |
| `pnpm build` | 0 | 7/7 tasks successful; 4 cached; 3m59s. Existing Next workspace-root/CSS warnings and sandbox cache IO warnings; build completed |
| `node /private/tmp/tenant-stamp-r2-audit.cjs` and AST matcher comparison | 0 | All 33 converted test files audited; 44 helper calls; unchanged declarations/counts/matchers; zero syntax diagnostics |
| Source refusal smoke via `cd apps/api && node --import tsx --input-type=module` | 0 | Malformed, not-a-UUID, null, undefined, and repository empty-context inputs: 5 asynchronous typed refusals; zero connections/work calls. Fake pool only |
| Final `pnpm lint:lanes`, exact-lane JSON verification and `git diff --check` | 0 | New receipt included; only its exact path appended; 45 entries; compact JSON; no whitespace errors |

## CI and handoff holds

User-reported GitHub run **37657122047** on `e7d4ba8`: PostgreSQL **1 failed / 218 passed, 40 files**; browser step did not run. This report is supplied CI evidence, not a locally rerun result. Round 2's only changed integration file is `packages/db/test/shared-money-origin.integration.test.ts`.

PostgreSQL/migration and browser suites were not run locally because this sandbox cannot start PostgreSQL or bind localhost. Dispatcher must push the repair and obtain GitHub CI coverage, including the SH-1 refusal test, all earlier DB/browser regressions, full API health and normal OpenAPI checks. No test, assertion or mandatory suite was weakened, skipped in configuration or deleted, and no timeout was added or lengthened. Existing mandatory CI remains required.

Independent verdict bound to the dispatcher's eventual exact commit and separate technical acceptance remain pending. This is builder evidence only; no self-acceptance or release approval. Existing release and commercial/security gates remain unchanged. No live provider, spending, real send, real data, production runtime, decision approval, deployment, release or migration.

Intended conventional commit subject and body: `/private/tmp/jg-msg-tenant-stamp-1.txt`. Dispatcher owns committing; no new head is claimed here.
