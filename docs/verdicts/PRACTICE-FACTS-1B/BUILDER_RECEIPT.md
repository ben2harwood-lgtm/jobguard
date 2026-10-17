Built by Codex; dispatched 13 Oct 2026.

# PRACTICE-FACTS-1B — builder receipt (RED, partial evidence)

No acceptance or independent verdict is claimed. All changes are uncommitted. The dispatch sentence attributing this build to Claude Sonnet and saying Codex was unavailable would be false for this session, so it has not been used.

## Identity, base and authority

- Branch: `codex/sandbox/practice-facts-1b`.
- Issued base and current HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`.
- Initial `origin/main` matched the issued base. It advanced during this task first to `43a52cd957b3b41fe3fa44eb2153213b62717b39` (FIXLATER-7), then to `2350b1a718b76aabdedd1782f02e92f516914246` (SV-3-BARRIER), the final inspected main. Main wins. The plan, applicable 0119/0130 routine definitions and migration runner are byte-identical between those heads; the newer changes concern another upgrade test, an SV-3 browser barrier, receipts and lane registration. No Git write or refresh was attempted. The dispatcher must integrate newer main and its lane entry.
- Migration: `0187_practice_supplier_credit.sql`; runner registration appended after 0140. 0130 remains the newest pre-existing eligibility guard; 0119 remains the newest completeness routine. Both #138 and #139's migrations, 0130 and 0131, are in the issued base.
- Read AGENTS.md, BUILD_PLAN.md rev 3.0 §10.3.3/§10.3.5/CH-7 and §12.2, the issued order/addendum, the standing handoff, practice-facts, recovery-eligibility and recovery-timing contracts, the original hold note and the later two-document ruling. The plan/category/fixture/ledger citations still match current main.
- Installed runtime: Node `v24.17.0`; repository `.nvmrc` is `24.15.0`. Cached pinned pnpm `10.28.1` was used. No dependency download, installation or fresh pinned-install verification was performed, as the dispatch forbids it.
- Intended commit message: `/private/tmp/jg-msg-practice-facts-1b.txt`. No commit, push, PR, merge, review or acceptance action was performed.

## Built scope

Appended precisely the two authorised INTERIM supplier fixtures and allowed IDs, preserving previous entries and CR-MB-001 at GBP 90.00. Normal intake retains unknown quantity/unit-price facts; the parser is unchanged.

Added an owner-controlled SECURITY DEFINER writer deriving the actor from the persisted owning practice session, strict SQL command validation, canonical database payload hashing, current authority checks before replay, expected revision checks and command/case/feed/job locks before audit. Side tables have FORCE RLS, tenant/job-qualified relationships and immutable/timestamp guards. New credit reviews require live jobs; exact replay survives later lifecycle/source changes while rechecking current authority.

F14 binds both original supplier payments and saves Q=30000p. F16-partial saves Q=0, the exact unpaid-in-full reason, one 60000p link and no consumption. Only the partial-to-full fixture change is permitted, saving the later positive result with both links and a 30000p consumption snapshot; historical snapshots remain separate. Sources bind the exact original document versions/hashes and generated settled event identities/hashes. Deferred checks require matching source/claim/consumption/audit completeness without new business locks after audit.

At/before-opening, equality and mixed timing remain a zero-write capability hold. They use the existing supplier-payment-unavailable refusal with internal `PF1B_EARLIER_PAYMENT_CAPABILITY_HELD` detail; they do not save an earlier-credit business exclusion. Fee posting/collection, pursuit, allocations and production authority remain absent. Reference fee tests only calculate 0p/3000p. F17's newer `withheld_customer_payment` AND `duplicate_supplier_payment` timing condition is retained.

Existing files changed only by appending fixture IDs/objects, the narrow repository dispatch, migration registration/documentation and this lane's registration. The pinned recovery application and all merged tests remain unchanged. The existing transport/application paths are reused.

## Tests first and run evidence

All five new test files were written before the migration/writer implementation. The first core run failed on the absent document IDs: 1 failed, 2 passed. Database first-failing runs are **NOT RUN (cannot start PostgreSQL here)** under the dispatch environment restriction. The application/controller retention assertions prove existing contracts; they are not falsely described as newly failing behavior. The first API invocation failed during package loading because `@jobguard/db/dist` was absent (0 tests), not because an application assertion ran.

Final executed checks:

| Command | Exit | Actual result |
|---|---:|---|
| `pnpm exec turbo run typecheck --force` | 0 | 7/7 packages; 0 cached |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity (152 files), lane, money and commercial boundary checks |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7/7 packages; 0 cached |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 packages; 0 cached; 37.42s |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-supplier-credit.test.ts` | 0 | 1 file, 3/3 tests on final core source |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/practice-supplier-credit.application.test.ts src/practice-supplier-credit.http.test.ts` | 0 | 2 files, 7/7 tests; application/repository adapter/controller tests, using mocks and direct controller invocation; no listening HTTP server or browser journey |
| `pnpm openapi:check` | 1 | STOP: tsx IPC socket was refused before OpenAPI verification |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Exact lane, all 14 payload paths, current main comparison |
| `git diff --check` | 0 | No whitespace errors |

Every pnpm invocation starts with `export PATH="$HOME/Library/pnpm/bin:$PATH"`. The first invocations explicitly selected this already-cached binary:

```text
/Users/benharwood/Library/pnpm/store/v11/links/@pnpm/exe/10.28.1/fb01edf4af110b9a4ace971426a9e1b8e5948ece46be4a99cffa555e3c429dcc/node_modules/@pnpm/exe/pnpm
```

Turbo's child tasks initially selected the global pnpm 11 shim and stalled. Subsequent commands additionally prefixed the containing cached directory to PATH, so Turbo's children also used 10.28.1. No packages were downloaded. Commands were sequential, never build/test together; Vitest used at most two files per invocation and `--maxWorkers=2`. Memory checks before heavy work reported 67–70% free and disk remained at least 71 GB available (both above the dispatch thresholds). No database/browser command was attempted outside the shared gate.

Complete verification attempt ledger (repeated commands are separate actual runs):

1. `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main`: exit 0, clean tree, both SHAs equal issued base.
2. `node --version`: exit 0, v24.17.0. Global `pnpm --version` stalled and was interrupted: exit 130, no version returned. Cached pinned binary `--version`: exit 0, 10.28.1.
3. First core invocation above, before implementation: exit 1; 1 failed, 2 passed, 1 file.
4. Second core invocation after fixture append: exit 0; 3 passed, 1 file.
5. First API invocation above: exit 1; 2 suites failed to load, 0 tests (missing database build output).
6. First forced typecheck attempt: exit 130, interrupted while global pnpm child shims stalled; no compilation pass claimed.
7. Forced typecheck: exit 2, 2/3 successful; the new pure-core test imported node:crypto, unsupported by the core's platform-free compiler configuration. Removed that import and used a pure fixture ID.
8. Forced typecheck: exit 2, 4/5 successful; cross-package nested Zod types caused excessive type instantiation. Kept strict envelope and existing versioned candidate validation in separate parses.
9. Forced typecheck: exit 2, 5/6 successful; the new API test needed to narrow the v1/v3 response union. Corrected the test, without changing the application.
10. Final forced typecheck: exit 0; 7/7 successful, 0 cached.
11. Root static lint command above: exit 0.
12. Forced lint command above: exit 0; 7/7 successful, 0 cached.
13. Forced build command above: exit 0; 7/7 successful, 0 cached.
14. Final API invocation above: exit 0; 7/7 tests, 2 files.
15. Final core invocation above: exit 0; 3/3 tests, 1 file.
16. OpenAPI command above: exit 1; validation did not run. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/32472.pipe`. No alternate route was attempted.
17. Process inspection `ps -Ao pid,ppid,command | rg '(pnpm|turbo|tsc)' | head -25`: shell pipeline exit 0, but ps was refused: `zsh:1: operation not permitted: ps`. That inspection was stopped, with no alternate process-list route.
18. Read-only repository/source inspections used `cat`, `head`, `sed`, `rg`, `rg --files`, `ls`, `wc`, `nl`, `git log`, `git grep`, `git show`, `git diff`, `git ls-files`, `git rev-parse` and `git branch --show-current`. Searches for guessed non-existent source filenames returned missing-file diagnostics; the actual files were found with rg. No permission escalation or Git mutation occurred. Edits used apply_patch and Python/heredocs confined to this lane and authorised /private/tmp files; all editing commands exited 0.
19. Unchanged-file Python inspection: exit 0; 371 merged tests unchanged, all eight reviewed source hashes match, relevant main definitions unchanged. `git diff --stat`, `git diff --numstat`, `git diff --name-only`, untracked-file listing and repeated `git diff --check`: exit 0.
20. `memory_pressure | tail -1` and `df -g /System/Volumes/Data`: exit 0 at each check; sufficient memory/disk throughout.
21. Final `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0; all 14 payload paths belong to this lane.
22. Source-only `node --input-type=module` with TypeScript transpileModule on the two new database test files: exit 0; 0 syntax diagnostics, 27/3 named tests. No test body or PostgreSQL code ran.
23. Final read-only main/HEAD inspection and payload manifest/hash generation: exit 0; relevant plan/routines/runner still match the issued base, HEAD unchanged, all payload paths inside the lane.

Turbo emitted non-fatal `WARNING IO error: Operation not permitted (os error 1)` for the shared cache. The reported successful tasks actually ran under `--force`; 0 cache hits were used. The build also emitted pre-existing Next workspace-root/CSS warnings. No cache or UI configuration was changed to suppress them.

Two new database files also passed a source-only TypeScript transpile/syntax check: exit 0, 0 syntax diagnostics; 27 and 3 named tests respectively. This did not execute either file or validate PostgreSQL semantics.

## NOT RUN and partial acceptance

- `packages/db/test/practice-supplier-credit.integration.test.ts`: **NOT RUN (cannot start PostgreSQL here)**. 27 named tests written, including the six exact replay titles and lifecycle replay test. Covers A02–A07, A09–A24 as applicable; administrative identity/scope setup and invalid catalog/source probes are explicit. Quote generation/send to a fake adapter, acceptance and no-charge v3 activation use normal implementations; supplier/case/feed writes use their normal repositories. Invalid timestamp/source/FK/completeness probes use owner connections and rolled-back controls. No real provider test is claimed.
- `packages/db/test/practice-supplier-credit-upgrade.integration.test.ts`: **NOT RUN (cannot start PostgreSQL here)**. Three tests: A26 fresh install; A26 own migration then all later migrations twice; A27 rolled-back controls. Nonempty v1/v3 review, claim-line, supplier/version/intake, case/history, feed and audit seeds; canonical named-column text, full types and primary-key identities use the existing unmodified proof helpers. Later inserted rows/nullable columns/function replacement pass; one-microsecond changes, removed rows and retyping fail. Nullable-column control targets a non-fingerprinted table. No persistent schema/control changes or destructive cleanup is introduced.
- Merged A25 suites remain **NOT RUN** locally because the addendum permits only this piece's files. Core: recovery-eligibility-v3, practice-facts, supplier-documents, shadow-domain/eligibility and practice-feed. API: recovery-eligibility-v3.application, practice-facts.application, practice-facts.controller and auth/context-boundary. DB: recovery-eligibility-v3, practice-facts, practice-feed, supplier-documents, tenancy, demo-bootstrap and fingerprinted-row-shape integration suites; these also cannot start PostgreSQL here. Every listed file remains unchanged.
- Saved CH-7 F14/F16 browser journey: **NOT RUN (cannot start a browser here)** and parked; no browser file added/edited.
- OpenAPI validation: **NOT RUN**, command attempted but stopped at tsx's refused IPC socket; exit 1 is retained.
- Fresh pinned install, unrestricted `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and CI exact-commit evidence: **NOT RUN** here. These remain dispatcher/CI obligations; targeted tests do not replace them.
- `pnpm eval`: inapplicable to this slice: no prompt, model, extraction parser or AI gateway change.
- A01/A08 and the core portion of A14 executed; application/controller portions of A07/A16/A17/A23 executed. PostgreSQL assertions, browser obligation, A25/full CI and independent exact-commit verdict/acceptance remain outstanding. A28 is this truthful partial receipt, not acceptance.

## Every new GRANT — standard F

```sql
GRANT SELECT ON app.practice_supplier_credit_case_binding TO jobguard_runtime;
GRANT SELECT ON app.practice_supplier_credit_review_payment TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.pf1b_review_supplier_credit(uuid,uuid,jsonb) TO jobguard_runtime;
```

Standard F: no new direct INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER grant on these tables; no new PUBLIC/infrastructure business-data privilege. The checked writer carries its own persisted-session/current-owner authority checks. Private functions revoke PUBLIC/runtime/infrastructure execution. Historical grants are preserved rather than widened or described as repaired. No contractor-track route or watchdog registry/harness changes are introduced.

## STOP — coordinator-owned catalogue prerequisite

Do not merge/accept while this prerequisite is unresolved. The migration adds two business tables, so the merged tenancy catalogue's exact arrays require coordinator-owned additions. They have not been edited or bypassed.

`packages/db/test/tenancy.integration.test.ts:291`, before:

```ts
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Required after (insert two rows in name order immediately before that original line):

```ts
      { relname: "practice_supplier_credit_case_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "practice_supplier_credit_review_payment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

`packages/db/test/tenancy.integration.test.ts:530`, before:

```ts
      { relname: "proof_application_response", owner: "jobguard_migration" },
```

Required after:

```ts
      { relname: "practice_supplier_credit_case_binding", owner: "jobguard_migration" },
      { relname: "practice_supplier_credit_review_payment", owner: "jobguard_migration" },
      { relname: "proof_application_response", owner: "jobguard_migration" },
```

The dispatcher owns the §12.2 ledger amendment as the order explicitly states. BUILD_PLAN.md is unchanged. Proposed insertion before `BUILD_PLAN.md:3394` (the existing `### 12.3` heading), retaining that heading:

> **Ledger amendment — PRACTICE-FACTS-1B, 13 October 2026.** The synthetic server/database Part B takes **0146** (`practice_supplier_credit`): two immutable side tables with SELECT-only runtime access, a persisted-session checked writer, and narrow replacements of the newest CH-7 eligibility/completeness routines. It enables only the saved after-opening F14 and F16 partial-to-full examples. Earlier/mixed credit timing, applied-credit fees/collection and the saved F14/F16 browser journey remain held; no commercial-policy approval is implied. Renumber at landing if a higher migration has merged, preserving SQL bytes.

## Builder self-review (source inspection, not an independent verdict)

Inspected the new privileges, actor/session derivation, raw SQL strict fields, original-source hashes, document/version association, exact fixture transition, timestamp hold, result/audit/line completeness, F17 branch, replay lock order and unknown-outcome mapping. Runtime's historical review/consumption INSERT permissions cannot enter the new credit branch directly; the checked writer runs as the migration owner and rechecks authority. New side triggers revalidate original sources; deferred checks read without acquiring business locks. One immutable case binding prevents additive interpretation of repeated consumption snapshots.

Inspected all changed paths against the lane and all merged tests/source pins against the issued base. This is **source-inspected** evidence. Typecheck/lint/build and the 10 targeted unit/adapter assertions are **test-executed** evidence. Database guarantees, full transport/browser journeys and the final committed diff are **not independently verified**. PostgreSQL validation and the coordinator catalogue update are material remaining risks/gates. A builder cannot accept its own work. No self-review is represented as commercial/security sign-off.

Affected invariants: tenant/session/actor isolation, exact synthetic money, immutable source/commercial history, audit atomicity, durable command identity and authority-first replay, finalized/version-specific document sources, no commercial/external effects, held timing/policy and independent acceptance. No backfill or changed existing table columns; application rollback must retain compatible readers/history. Recovery is a forward fix; no saved rows are dropped or rewritten. No new provider, environment variable, operational alert or live evaluation is introduced.

LATER: CH-7 saved F14/F16 browser journey when UI work resumes.

## Unchanged-file and change-scope evidence

All 371 tracked merged test/spec files match HEAD byte-for-byte. Aggregate SHA-256 over sorted `path + space + SHA256(file)` lines: `ca40bfa3965678cfa979382b01c865c2e742ae57b8365920b5ec02252442f49d`.

| Unchanged file | SHA-256 |
|---|---|
| AGENTS.md | ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1 |
| BUILD_PLAN.md | abe4a650e2ca928c38ee21bc7168caf10e44e66c45f55e25aa80c6f238a6148b |
| apps/api/src/auth/context-boundary.test.ts | a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 |
| packages/db/test/tenancy.integration.test.ts | 41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac |
| packages/db/test/watchdog-command-harness.ts | 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 |
| packages/db/test/command-replay-contract.integration.test.ts | db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f |

All eight REVIEWED_PRACTICE_SOURCES match their merged recorded hashes (no new permanent shared-file pin test):

```text
packages/db/src/practice-session.ts 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14
packages/db/src/contractor-repository.ts 56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c
packages/db/src/contractor-party-repository.ts e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0
packages/db/src/work-order-repository.ts 4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3
packages/db/src/sor-repository.ts 45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5
packages/db/src/job-scheduling-repository.ts ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d
packages/db/src/work-order-fixtures.ts cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386
packages/db/src/contractor-session-context.ts a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c
```

`git diff --stat` (tracked changes only; untracked payload files are listed and hashed below):

```text
 config/agent-lane-assignments.json                    | 1 +
 packages/core/src/supplier-documents.ts               | 4 +++-
 packages/db/MIGRATIONS.md                             | 4 ++++
 packages/db/src/migrate.ts                            | 1 +
 packages/db/src/recovery-eligibility-v3-repository.ts | 2 ++
 5 files changed, 11 insertions(+), 1 deletion(-)
```

The single replaced line appends the two IDs; no existing ID/value is removed. Migration SHA-256: `ef25c48e36c00c7296f7ca07733a20fa922421af293dac5f100933f29762f222`.

Changed payload SHA-256 (receipt excluded from its own recursive hash):

| File | State | Lines | SHA-256 |
|---|---|---:|---|
| apps/api/src/practice-supplier-credit.application.test.ts | new | 78 | 2fe8c7f366074181a2eb1eb0d75c21c41924a780be21957ed859619790812c28 |
| apps/api/src/practice-supplier-credit.http.test.ts | new | 30 | fa86a75ce49ff258ddbebc134632482481fff3a9a8a6ec0da0f531185af1920e |
| config/agent-lane-assignments.json | tracked edit | 154 | 00c27e0470ccb1eb63149210436885ff3a4ed0e39f2040cb70b513f314eb7595 |
| docs/contracts/practice-supplier-credit-v1.md | new | 17 | bf3d461f749ecffb5782d5045d5dbf7a36e93ad0a2dbef742f775bcdb704a153 |
| packages/core/src/practice-supplier-credit.test.ts | new | 36 | 54bf49f6e70133308a79192b5e0069cff9e1b03562a184f0760bcb57f6805770 |
| packages/core/src/supplier-documents.ts | tracked edit | 30 | d6269db6c3dce0901f2c77c2059b1127c9b79f5a7e56355bf993d48b35239b6a |
| packages/db/MIGRATIONS.md | tracked edit | 975 | 85ede0d50bc54da1342a1306b36d64646abcb2bf1b8b57ed382a32922ed5adc5 |
| packages/db/migrations/0187_practice_supplier_credit.sql | new | 425 | ef25c48e36c00c7296f7ca07733a20fa922421af293dac5f100933f29762f222 |
| packages/db/src/migrate.ts | tracked edit | 99 | 986a613045e0196de1a4b183c9c6a92622d893fbd47087a572bd61cea08ed504 |
| packages/db/src/practice-supplier-credit-repository.ts | new | 50 | 500b34d262237374680934ae528acfa9d76b071ba70df4be63d989eee601fd1f |
| packages/db/src/recovery-eligibility-v3-repository.ts | tracked edit | 72 | 5d6729d8661114c77abdc4d67aff1675be4263bda50ed00f0bca2619cee739c0 |
| packages/db/test/practice-supplier-credit-upgrade.integration.test.ts | new | 105 | 1fa23c97030203bdef7be3e57e198434fb5450a0807b0d357cee005d324254d1 |
| packages/db/test/practice-supplier-credit.integration.test.ts | new | 289 | 787dd3cc9222795e8436ebc2554cafa54b72a7e4eda7567cc031586ec9dea359 |

Final manifest: 14 files total (5 tracked edits, 9 new files including this receipt), all in the exact registered lane. No tracked file outside the lane changed. The receipt hash is emitted separately after its final write.

Final head SHA: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. This identifies the unchanged base HEAD, not an invented commit of this uncommitted payload. Dispatcher commitment and exact-commit CI/independent verdict remain required.

## r2

Built by Claude Sonnet (Codex stand-in), dispatcher 14

Change: `packages/core/src/practice-supplier-credit.test.ts:26` helper `result()` now passes `payer: "not_insurer"`, the fact `recoveryEligibilityFactsV3` (recovery-eligibility-v3.ts:14) now requires. Expected values unchanged. No other file touched (recovery-eligibility-v3.ts and merged tests untouched).

Commands run:
- `pnpm --filter @jobguard/core exec vitest run src/practice-supplier-credit.test.ts --maxWorkers=2`: 3 of 3 pass.
- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2`: 112 files, 2804 of 2804 pass.
- `pnpm --filter @jobguard/core typecheck`: clean.

Note: running vitest without `src` also picks up the git-ignored stale `packages/core/dist` copies (7 failures, ENOENT on dist/*.ts and the old test); not part of CI, not a change in this branch.

NOT RUN: lane lint, DB integration tests (unchanged by r2). Not committed or pushed, per the r2 order.

## r3

Built by Claude Sonnet (Codex stand-in), dispatcher 14

Change: `apps/api/src/practice-supplier-credit.application.test.ts:13` candidate() now passes `payer: "not_insurer"` to evaluateRecoveryEligibilityV3 (same missing fact as r2). Expected values unchanged; no product code or merged test touched.

Run: `pnpm --filter @jobguard/core build`; api vitest on that file (--maxWorkers=2): 5 of 5 pass; `pnpm --filter @jobguard/api typecheck`: clean. NOT RUN: lane lint, DB integration tests.

## r4

Built by Claude Sonnet (Codex stand-in), dispatcher 14

Change: `packages/db/test/practice-supplier-credit.integration.test.ts:285` `forged` now passes `payer:'not_insurer'` (same missing fact). Grep of the piece's own test files found no other evaluateRecoveryEligibilityV3 call missing it (core test:26 and api test:13 already fixed). Expected values unchanged.

Run: `pnpm --filter @jobguard/db typecheck`: see below result. NOT RUN: DB integration test (not started), lane lint.

## r5

Built by Claude Sonnet (Codex stand-in), dispatcher 14

Root cause: `assertRecoverySources` (packages/core/src/recovery-case.ts:~195) accepts only catalogue labels of the right source type (recoverySourceCatalogueV1) or recorded-id (UUID) shaped refs. The piece's own test fixture opened its case with `sourceRefs:['CR-PF1B-001','INV-PF1B-001']` (document numbers), which are neither, so every test failed at open with RECOVERY_SOURCE_NOT_RECOGNISED.
Change: `packages/db/test/practice-supplier-credit.integration.test.ts:64` sourceRefs now `['Supplier agreement AG-320','Supplier invoice INV-320']` (catalogue labels, supplier_documents). The supplier-credit binding is by document number inside the SQL routine, not via the case's sourceRefs (grep of CR-PF1B-001/INV-PF1B-001 shows no sourceRefs link), so intent and expected values are unchanged. Main's recovery-case rules and merged tests untouched.
Run: `pnpm --filter @jobguard/db typecheck` clean. NOT RUN: the DB integration test (no PostgreSQL), lane lint. Residual risk: if the test or SQL later reads the case's source refs to match documents, CI will show it.
