# ENT-13A-P-A builder receipt — AMBER

Built by Codex, 18 October 2026. Only sub-order A is implemented. Branch `codex/sandbox/ent-13a-p-a`; initial HEAD and inspected origin/main both `b881f90be0a6d368838ca4392338147ef819bd3a`. The initial working tree was clean. This is an uncommitted diff, not an exact-commit verdict or acceptance. The dispatcher must commit it before the independent actor binds a verdict; separate acceptance and Ben's merge/push/release remain outstanding. No verdict/acceptance file was authored.

## Changes and scope

Recovered `connector-environment.ts` byte-for-byte from `origin/codex/sandbox/ent-13a` (`26536d3d` as identified by dispatch), not its parent tree. Strict versioned Zod input requires explicit synthetic_demo/fake and fictional endpoint/credential references; no defaults or unknown fields. Output is frozen, errors use one redacted typed diagnostic. No reference resolution, credential retrieval, runtime registration or commercial authority. The fixture label syntax is a reversible fictional choice, not production credential policy.

Copied the original 31 expanded tests before the implementation and ran them against the absent module. Added one test for frozen-copy/input preservation. All original cases remain intact. Appended only the narrow export and commented `.env.example` entries to existing files. These two shared files must serialize with other builders at integration; no other builder edited them during this run as far as this working-tree inspection shows.

Updated the three connector documents for Ben's 17 October answers and current merged foundations; added aggregate and slice ledgers. The aggregate ledger preserves every E13-A01–A30 assertion and records item-specific STOPs with file:line and before/after. Ben's original answer file and the 13 October finisher acceptance table were readable and source-inspected. The original reusable branch's unexecuted test claims are not carried forward as passes.

Lane file follows the dispatch with one required correction: omit its own path from allow. The dispatch explicitly says it may not list itself; the checker rejects such a grant and grants branch ownership implicitly. No legacy registry edits. Supplemental path validation covers all 11 changed paths. Only `.env.example` and `packages/config/src/index.ts` modify existing tracked files, both append-only. Protected sources/pins, dependency pins, database files, merged tests and upstream receipts remain unchanged.

Affected invariants: strict boundaries and safe diagnostics (§2.7/2.8); tenant/authority boundaries preserved (§5.1/5.3); synthetic-only mode (§5.10/5.11); independent review (§5.13); immutable origin/commercial authority (§5.16). No new operational alert, external action or backwards-incompatible runtime behavior. No migration, backfill, grant change or reserved migration number; rollback is removal of this unused additive configuration/export.

## Execution environment and commands

Existing installed dependencies used; no install/download or clean-install claim. Node `v24.17.0`, while `.nvmrc` pins `24.15.0`; no pin changed. The default pnpm launcher stalled after a v11 warning during `pnpm --version` and was interrupted (130). Cached pinned pnpm **10.28.1** was then used through a temporary symlink `/private/tmp/jg-ent-13a-p-a-bin/pnpm` to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. All pnpm checks below prepend that temporary directory to PATH. Root checks use `LANE_BASE_REF=origin/main`. Turbo reused unaffected cached tasks and emitted sandbox cache I/O warnings; cached logs referring to other worktrees are not fresh executions here.

| Command / stage | Actual result |
|---|---|
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/connector-environment.test.ts` before parser | RED, exit 1: cannot find `./connector-environment.js`; one failed suite, zero executed assertions. This is the requested missing-module failure, not 31 failed assertions. |
| Same command after parser and added test | GREEN, exit 0: **32/32 passed**, 1 file. |
| `pnpm test` | FAIL, exit 1. Tool tests 100/100 pass; config package 33/33 pass (32 connector + existing identity case); AI 113/113 pass; core 5,595 pass / 7 fail, 216 passing files / 6 failing files. Turbo 7/10 tasks successful, 4 cached. Full regression not green. |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1 at lane self-comparison guard; core purity passed first. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1: “Missing branch or self-comparison range; refusing a misleading pass.” HEAD equals origin/main because committing is prohibited. Dispatcher/CI must rerun after commit; checker not changed. |
| Supplemental working-tree lane validation | PASS using existing `loadLanePolicy`, `selectLane`, `lanePathAllowed` against tracked diff plus untracked paths: all 11 in issued lane. Not a substitute for commit-range validation. |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 each. Core purity checks 212 TypeScript files. |
| `git diff --check` and additive/protected-source inspection | PASS. Only two tracked files differ, both append-only; parser matches reusable source exactly. |

| `pnpm typecheck` | PASS, exit 0; 7/7 tasks, 3 cached. |
| `pnpm exec turbo run lint` (supplement after root lane refusal) | PASS, exit 0; 7/7 tasks, 3 cached. Does not clear root lint's lane guard. |
| `pnpm openapi:check` | BLOCKED/FAIL, exit 1: tsx CLI cannot listen on its IPC pipe (`EPERM`), before schema comparison. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator/check with no CLI IPC socket, no generated-file edits. |

`pnpm build`: **PASS**, exit 0; 7/7 tasks, 3 cached, 8m50.841s. Next.js compiled and generated all 41 pages. Warnings included inferred workspace root, dynamic dependency expressions, autoprefixer support and sandbox cache I/O; no source changes made to suppress them. This is a build, not browser/e2e execution.

## Root-test failure details and item-specific STOPs

Five compiled-test assertions read nonexistent adjacent TypeScript files under `packages/core/dist`: jobs-on-the-go, recovery-allocation, site-extra-pricing and two subscription-architecture assertions. Their corresponding source locations are `src/jobs-on-the-go.test.ts:156`, `src/recovery-allocation.test.ts:190`, `src/site-extra-pricing.test.ts:140`, and `src/subscription-architecture.test.ts:10`. The other two failures are the existing `src/receipt-allocation.test.ts:212` 5-second case and its compiled copy timing out. Before: existing tests unchanged. After: STOP changing their expectations, source or repository test configuration outside this lane; failures remain reported. No claim that this is an independently reproduced baseline failure.

A diagnostic rerun `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/receipt-allocation.test.ts` also failed: 31 passed / 3 timed out, exit 1 (`src/receipt-allocation.test.ts:125`, `:212`, `:222`). No limit or assertion was weakened. This does not clear the root regression failure.

Local logs: `/private/tmp/jg-ent-13a-p-a-checks/` (lint, typecheck, test, build, openapi:check, package-lint and receipt-allocation). They are local diagnostic artifacts; CI must produce durable check evidence on the committed diff.

## Preservation and outstanding gates

No new PostgreSQL behavior, so new failing-first PostgreSQL tests and own-step migration proof are **inapplicable to A**. No new AI evaluation or browser journey is applicable. PostgreSQL preservation is **NOT RUN to completion / unverified locally**: root `pnpm test` reached DB setup and reported skipped assertions before cancellation after the core failure; this proves no PostgreSQL guarantee. Standalone `pnpm test:db` and `pnpm test:migrations` were NOT RUN in this sandbox. No browser, Playwright or e2e command ran, as instructed.

Dispatcher-pushed CI must retain `pnpm test:db`, `pnpm test:migrations` and existing e2e gates, including unchanged DB preservation suites: `tenancy.integration.test.ts`, `demo-bootstrap.integration.test.ts`, `fingerprinted-row-shape.integration.test.ts`, `contractor-session-context.integration.test.ts`, `work-order-import.integration.test.ts`, `work-order-concurrency.integration.test.ts`, `site-extra.integration.test.ts`, and `command-replay-contract.integration.test.ts`. No test/gate was removed or made optional.

A24 remains **configuration-only**, not complete application/HTTP proof. A29 documents requirements without granting approval. A30 remains held for full regressions and independent exact-commit verdict. Q2–Q4/Q7, exact delivery lifetime if absent, post-closure/revocation delivery reconciliation, accepted ENT-6B #240 interfaces and accepted ENT-8a persistence remain item-specific STOPs. Ben 1.9 non-live refusal/same-time conflict quarantine and finance-only billing rules are requirements, not implemented by this config slice. No aggregate ENT-13a or roadmap completion credit.

D01/D02/D03/D08/D09/D16 and G5 stay closed; no real data, credentials/endpoints, spending, external sending, deployment, deletion/retention changes or UI. No Git write, add, commit, push, checkout or fetch. Intended conventional commit message: `/private/tmp/jg-msg-ent-13a-p-a.txt`.

## Final handoff

Sub-order A implementation/configuration execution is ready for independent review, with full technical acceptance held by the recorded root-test failures, post-commit lane checks, CI preservation and independent actor records. Final HEAD remains `b881f90be0a6d368838ca4392338147ef819bd3a`; all 11 task paths remain uncommitted. The final diff/allow-list check passes; no independent verdict or acceptance is claimed.

## ENT-13a-machine follow-on — 4 November 2026 (RED, NOPR)

This follow-on adopts only the supplied fictional Q2/H1, Q3/H2, Q4/H3 and Q7/H5
rulings, recorded in the capability contract. Historical configuration-only evidence
above is unchanged. Added an unregistered raw-body machine route/application,
member-guard refusal, normal membership bridge for owner management, and additive
0940 persistence/proof. 0941–0944 unused. No Git writes, PR, real credential, network
call, database/browser run or G5 activation. Existing intake is reused with zero
domain effects; there is no ENT-2 promotion/origin write, job mutation or new job
command type to register. Management command IDs/receipts are connection control
plane records, not generic commercial command receipts.

Authority: distinct generated machine actor, separate sponsor, tenant/environment/
client binding, append-only capability versions, owner provision/widen/rotate/
revoke/disconnect with idempotent receipt plus audit. HMAC method/path/timestamp/
nonce/body hash and authority selectors; ±300 seconds, nonce ≥600 seconds, old key
cutoff ≤24 hours, 1 MiB transport limit plus unchanged domain envelope validation.
Only fixture key labels persist. Dedicated NOLOGIN machine role cannot call legacy
intake or member SQL. SQL rechecks authenticated binding token, authority/key set,
capability, timestamp and nonce under connection locks. Trusted adapter credentials
remain outside the end-user HMAC boundary. No claim of safety against their compromise.
No fingerprinted row-shape, protected source pin or scanner change. No data migration
or backfill; additive forward-fix strategy is in the migration note.

Local checks used installed Node v24.17.0 and cached pinned pnpm 10.28.1 via temporary
PATH shim `/tmp/ent13-machine-bin`. Default global pnpm stalled (both commands
interrupted, exit 130, no test result). Initial Vitest attempts could not resolve
unbuilt workspace package exports: zero assertions executed. Built existing core,
storage, DB, AI and config dependencies (all successful); no package downloaded.
Turbo reported cache I/O sandbox warnings, with 4/4 builds executed successfully.

- API typecheck: PASS.
- API Vitest `machine.test.ts inbound.test.ts identity.test.ts --maxWorkers=2`:
  PASS, 62 tests across 3 files, after dependency builds.
- DB Vitest `migration-proof-loader.test.ts connector-intake-proof.test.ts
  --maxWorkers=2`: PASS, 80 tests across 2 files (no database involved).
- API Vitest `auth/context-boundary.test.ts --maxWorkers=2`: PASS, 145 tests;
  protected bridges and fingerprints unchanged.

New database test coverage is authored, not executed here: immediate predecessor
upgrade and unchanged existing routine bodies/row snapshots, repeat migration,
owner and cross-tenant management, immutable capability revision and idempotent
commands/audit, concurrent nonce refusal, wrong tenant/environment/contract/capability,
skew, credential refusal, rotation overlap/expiry, revoke/disconnect, atomic failed
staging and source deduplication, direct SQL privilege/RLS refusal. Existing intake
catalogue test now asserts all five added private FORCE-RLS tables explicitly.
Transport tests cover bad signature, timestamp, tenant/environment/contract,
capability, bytes/size/method/path and sanitised persisted refusals. Global and tenant
member guards are exercised for every method/path in the current OpenAPI document,
including a practice cookie. No browser/listener is started.

### Named holds for landing

CI must prove real PostgreSQL tests, fresh/upgrade migration and catalogue/privilege
checks, existing mandatory suites and green current-main CI. Independent RED review
must bind to the exact router-committed head. Local SQL source inspection and fake
store responses are not PostgreSQL or independent review proof. SFTP, domain
promotion/reconciliation, real credential store/endpoints, operational approvals and
G5 remain held. No scanner or protected pin edit was needed. This is readiness for
router commit/push and checking, not acceptance or aggregate ENT-13a completion.

Final local verification:
- API typecheck rerun after final boundary tests: PASS.
- Final `machine.test.ts watchdog-registry.test.ts --maxWorkers=2`: PASS,
  146 tests across 2 files (includes inclusive ±300-second and newline refusal tests).
- New PostgreSQL integration file and its imported fixtures typechecked with a
  temporary tsconfig extending the repository configuration: PASS; not DB execution.
- PL/pgSQL CASE-in-IF lint: PASS, 255 migrations. Commercial-boundary lint,
  money-arithmetic lint and `git diff --check`: PASS.
- Standard lane lint was run and correctly REFUSED self-comparison: HEAD equals
  origin/main and all task changes are uncommitted. No scanner/pin was edited.
  Exact working-tree coverage validated with the existing exported lane loader and
  lanePathAllowed: PASS, all 14 task paths plus implicit own lane; no extra entries.
  Named landing hold: router must rerun the standard lane check after committing.

READY for router commit/push and CI/RED checking; not independently reviewed,
merged, released or aggregate ENT-13a complete.
