# ENT-2 builder receipt — incomplete, authorization amendment required

Issued order: 8 October 2026; its header wins over the draft. Builder: Codex, local workspace. This is a construction receipt, **not an independent verdict or technical acceptance**. ENT-2 is not ready for acceptance or merge.

## Base and working tree

- Exact base and current HEAD: `b552bdc8ec0091fd4bc0f4d1911f496a7418b790` (CH-3b #120 merge).
- Branch inspected: `codex/sandbox/ent-2`.
- Confirmed `0102_contractor_parties.sql` exists and is registered last in the base migration list.
- No workspace git writes, commit, push, PR, merge, deployment, provider, real data, spending or decision approval (existing tool tests create isolated temporary git fixtures). Dispatcher must supply the eventual head SHA; this receipt does not fabricate one.
- First working-tree edit added exactly one sorted compact line, `ent-2`, to the lane registry. No neighbour changed (removing the new line reproduces the base byte-for-byte; JSON parse also passed). It includes `0105_work_orders.sql` and `apps/api/src/watchdog-registry.test.ts` as issued.

## Blocking dependency contract

`packages/db/migrations/0102_contractor_parties.sql:117`, inside `app.bind_contractor_parties`, requires either `organisation.manage` on the client or `data.import` on the tenant. The issued Q6 permits only `surveyor` and `commercial_manager` for work-order imports. Neither role has either permission: see `packages/db/migrations/0054_contractor_organisation.sql:103–105` and the equivalent core permission matrix. A normal active surveyor or commercial-manager grant therefore reaches `NOT_FOUND` for a complete party binding. Finance, owner and admin can satisfy the existing routine's permission predicates, but the issued order expressly excludes them from ENT-2 import.

This is **source-inspected**, not a PostgreSQL-executed claim. No database was started in this sandbox. The order requires calling this routine in the import transaction, forbids changing CH-3a/CH-3b routines or merged migrations, and does not authorize changing ENT-1's role policy. I requested an integrator amendment asynchronously and continued the independent core/scanner work. No amendment was received during this build. I have not substituted an owner/finance actor, created extra grants, impersonated a user, fabricated authorization, or changed a routine to bypass it. The amendment must specify the narrow authorized import boundary and allowed files/new migration changes while preserving existing role/refusal tests.

## Reviewable work prepared

| File | Change |
|---|---|
| `config/agent-lane-assignments.json` | Issued ENT-2 lane only |
| `packages/core/src/work-order.ts` | Strict row schema, bounded CSV parser/encoder, typed quantity errors, issued-role pure scope predicates, stable identity matching, revision diff and audit allowlist |
| `packages/core/src/work-order.test.ts` | 19 tests covering malformed/forged inputs, parties left for the routine, CSV quoting and per-row failure, roles/scopes, stable identities, diffs and privacy allowlist |
| `packages/core/src/sor-pricing.ts` | Strict rate/version candidates, exact line pricing through the existing bigint kernel, contract-authorized effective-date selection |
| `packages/core/src/sor-pricing.test.ts` | 20 tests covering signed/zero adjustment, fractional quantity, ties, overflow, invalid multiplier, duplicate codes and effective-date ambiguity |
| `packages/core/src/index.ts` | Append-only exports for these two modules |
| `apps/api/src/watchdog-registry.test.ts` | Additive scope extension of both scanners to contractor jobs/work-order imports/orders; adversarial unclassified-import assertions for Next and Nest; tenant administration and SoR imports excluded |
| `docs/contracts/work-order-import-v1.md` | Explicit partial-core contract and unresolved transaction boundary |
| `docs/verdicts/ENT-2/BUILDER_RECEIPT.md` | This receipt |

No persistence, command handler, route, screen, fixture generator or new origin write path is enabled. There are no new transport mutation routes to classify in the actual registry yet; the completed leaf must add their entries when it adds routes. No existing tests were deleted or relaxed.

## Acceptance mapping — none of DW1–DW6 is claimed complete

| Assertion | Current evidence / remaining work |
|---|---|
| DW1 | Not implemented: 2,000-order PostgreSQL import, same-file no-op, three revisions/diffs and concurrent imports all remain. No import fixture identity or measured import time exists; parser tests are not an import benchmark. |
| DW2 | Core row/CSV malformed input and typed quantity tests pass. Unknown code, out-of-range persisted pricing, foreign contract, row receipts and transaction rollback still require application/PostgreSQL tests. Missing site is deliberately represented for CH-3b's controlled `CONTRACTOR_PARTIES_REQUIRED` refusal. |
| DW3 | Pure stable identity and added/removed/changed/cancellation diff tests pass. No runtime SQL immutability, cancellation revision persistence or scope-registry FK proof yet. |
| DW4 / CH-3b DW1 held clause | **Held by the authorization conflict.** No real import transaction exists, so no claim that ENT-2 calls the routine or proves its refusals. Live provenance, no-fee counts, track binding and watchdogActive integration remain. M1-17 files are byte-identical and its three core tests pass. |
| DW5 | Pure exact pricing and effective-date selection tests pass. Version pinning and no repricing still require PostgreSQL tests. The existing rational kernel is reused; no binary-float monetary multiplication/division. |
| DW6 | Strict input/priced-line origin and audit allowlists prepared. No import can currently write any origin because no import write path exists. That is not proof of the completed import's SH-1 map/SQL origin behavior or audit/log/screen privacy. These remain integration assertions. |
| CH-3b DW3 held cases | Not proved: no imported job/team/operative assignment exists. The eventual import must populate assignments and extend authoritative job-scope resolution, then prove supervisor/assigned-operative reads and out-of-scope refusals. No scheduling command was invented. |
| C1–C8 | Partial core and scan evidence only; vertical slice, migration/integration/browser checks and independent exact-commit review/acceptance remain mandatory. |

## Run environment and evidence

Dependencies were already installed. No install/download was attempted as a task step. Node observed: `v24.17.0`; repository `.nvmrc` is `24.15.0`. No runtime was downloaded or pin changed. This is not claimed as a clean install under the exact runtime pin; pinned CI remains required. The ambient `pnpm` executable is a newer version whose version management stalled; its first targeted test launch was interrupted with exit 130 before running tests. Used the already-cached **pnpm 10.28.1** CLI at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. `/private/tmp/jg-ent-2-bin/pnpm` is only a wrapper to that exact cached CLI. Commands below use `PATH=/private/tmp/jg-ent-2-bin:$PATH`; this changes no repository dependency, lockfile, script, check or timeout.

Core failed-first command, before implementation:

`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --filter @jobguard/core exec vitest run src/work-order.test.ts src/sor-pricing.test.ts src/job-import.test.ts`

Exit **1**: the two new suites could not import their missing implementation modules; M1-17's three tests passed. First implementation run also exited **1** on CSV delimiter escaping; fixed the parser/encoder and reran the identical suite. Latest targeted run exits **0**, 3 files / 42 tests passed (39 new plus 3 unchanged M1-17 tests).

Scanner regression sensitivity: temporarily restored only the two original scanner scope filters, leaving the new test in place. `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts -t 'ENT-2 refuses'` exited **1** because the original Next scanner returned `[]` for contractor import mutations. Restored both additive filters. The full registry suite (no test filter) exited **0**, 121 tests passed, including the assertions that an unclassified import fails independently for Next and Nest. The filtered diagnostic is not presented as the mandatory API suite; full API results are recorded below.

| Command | Exit / observed result |
|---|---|
| `pnpm --filter @jobguard/core typecheck` (final core source) | 0 |
| `pnpm typecheck` | 0; 7 tasks successful. Shared Turbo cache writes emit `IO error: Operation not permitted`; no type errors. An earlier ambient-launcher attempt was interrupted before completion and is not a typecheck pass. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passes, then lane lint says `Missing branch or self-comparison range; refusing a misleading pass.` HEAD and origin/main are the same base because dispatcher owns commits. No guard changed or bypassed. |
| `pnpm lint:lanes` | 1; same self-comparison refusal. Mandatory CI/committed-range check remains outstanding. |
| Supplementary working-tree inspection using the existing exported `selectLane`/`matches` and actual `git diff`/untracked paths | 0; every changed path belongs to ENT-2. This is explicitly not the mandatory lane-lint result. |
| `node tools/core-purity-lint.mjs` | 0; 115 TypeScript files |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `git diff --check` | 0 |
| `node --test tools/*.test.mjs` | 0; 42 tests passed |
| `pnpm --filter @jobguard/core test` (before dist build) | 1; 55 files passed / 2 failed, 1641 passed / 3 timed out at existing 5000ms limits (receipt-allocation wide 2000 lines, receipt-allocation working-size bound, enterprise purity boundary). No timeout changed. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | 1; 110 files / 3283 tests pass, 4 files / 5 tests time out at unchanged 5000ms limits. Generated dist copies are also discovered after build; failures are the same three source cases plus two generated copies. Duration 360.37s. No tests deleted/disabled or timeout extended. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` initial attempt before DB build | 1; package entry `@jobguard/db` unresolved (dist absent). Same suite after dependency build: 0 / 121 passed. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1; 24 files / 593 tests passed; `health.test.ts` fails because supertest cannot bind (`listen EPERM: operation not permitted 0.0.0.0`), followed by a null server-address port error. Existing health test unchanged. |
| `pnpm --filter @jobguard/web test` initial attempt before API build | 1; 4 suites cannot resolve API package entries, 15 files / 125 tests pass. Retried after API build: 0; all 19 files / 350 tests passed. |
| `pnpm --filter @jobguard/core build` (final core source) | 0 |
| `pnpm build` | 0; all 7 tasks successful (2 cached), 9m8.574s. Existing CSS/autoprefixer, workspace-root and restricted Turbo-cache warnings. This run began before the last core diff ordering assertion/change; final core compilation is separately recorded below, and exact committed-head CI remains required. |
| `pnpm openapi:check` | 1; `listen EPERM` on tsx's IPC pipe under `/var/folders/.../T/tsx-501/...pipe` (sandbox listener restriction) |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0; identical check entrypoint/arguments, Node loader avoids tsx CLI's IPC listener. OpenAPI was not edited. |

`pnpm install --frozen-lockfile` was not run: dispatcher explicitly says installed dependencies, no package downloads. `pnpm test` as a whole was not run: its Turbo DB suite starts PostgreSQL, reserved for CI in this sandbox; its tool/core/API/web components are separately reported above, with failures retained. `pnpm test:db`, `pnpm test:migrations`, the specified PostgreSQL ENT-2 suites and actual Playwright browser execution were not run: sandbox cannot start PostgreSQL or bind localhost. They run in GitHub CI after the integrator pushes the completed leaf. An ENT-2 browser spec/list is not available because the affected application and screen are still blocked and not implemented. No passing CI claim is made. No AI/prompt/gateway change; no live model/provider evaluation is applicable to this partial core.

## Migration, compatibility and handoff

0105 is the issued reservation. **No migration file or registration has been created/applied** while the transaction authorization boundary is held. No merged migration or BUILD_PLAN.md changed. Its eventual contents must cover work orders/revisions/lines, batches/receipts, schedules/version/items, assignments/visits, provenance/track/party bindings, FORCE RLS, qualified FKs, grants and controlled writes, audit/idempotency and expand compatibility. Rollback/forward-fix and catalog tests remain unfinished.

M1-17 SHA-256 hashes, each verified byte-identical to the base with `git show`:

| Path | SHA-256 |
|---|---|
| `packages/core/src/job-import.ts` | `0160a0e55db8c7b1e55d019c3364c49f652316430d3168f51967253be7b722db` |
| `packages/core/src/job-import.test.ts` | `14b21e6a7c32e94ab0aa43b8900420ad94853a7c54a3c8458ceece0c814915bd` |
| `packages/db/src/job-import-repository.ts` | `5006393d1d1aab9064a85206f239c3ae2698daa3be9ca1b3398c7f19f9a78a65` |
| `packages/db/test/job-import.integration.test.ts` | `dc6b9316fee112a1c73f3c72227893bdb7d54a5471bfe5566a9d4d379bbe0d23` |

Shared-file overlaps: lane registry and core index are append-only, owned locally by ENT-2 for this preparation and serialized with the integrator; watchdog scan changes overlap CH-2's API test and preserve its existing coverage. No other existing file changed. No DB/UI registration overlap yet. Resume this same leaf after an issued narrow authorization amendment; do not treat these foundations as the full ENT-2 feature.

Invariants touched: pure exact quantity/money, stable scope identity versus commercial revision, strict input authority, client-instruction-only output shape, privacy audit allowlist, fail-closed route classification. Persisted tenant isolation, membership/track authorization, atomicity, retries and audit guarantees are not yet implemented for ENT-2 and are not claimed verified. No new operational alert or backward-incompatible enabled behavior exists in this preparation.

Remaining release gates remain unchanged: D12 v4, D16, G1, G5 for connectors, ENT-14 (and all relevant enterprise charging gates); no approvals inferred. Independent Claude verdict on the eventual exact head, separate acceptance and full green CI remain required. No builder self-acceptance.
