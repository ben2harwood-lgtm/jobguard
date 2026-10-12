# ENT-4c-R2 builder receipt — 12 October 2026

Builder: Codex GPT-6.1 Sol. Task id: ENT-4c. Branch: `codex/sandbox/ent-4c`. Check lane: RED (access rule with a money consequence). BASE: **4f539892a056554a68b85f14dc7d3368b603e99b**. Head: uncommitted working tree; dispatcher supplies the committed head. Initial working tree was clean. No commit, push, merge or PR was made by the builder. Intended commit message: `/private/tmp/jg-msg-ent-4c.txt`.

Builder receipt only — not independently verified, not accepted.

Repair round 1 (12 Oct) is recorded at the end of this receipt. The original build evidence below is historical; the repair section records the Mac failure supplied by the dispatcher and the checks run for this repair.

## First questions

Source inspection of coordinator commit `edb79557fbdccb622f905c71671305c0bdd9deaf` says it adds exactly the five-role un-link list, uses it for pre-export repair, and changes the one corresponding merged test row. The `senior` list, prompt test and fee rule keep their bytes. It was already in BASE, followed by dispatcher lane commit `4f53989`; neither was edited. The new R tests executed: five roles need covering grants, other five are refused, all five are refused after export, and prompt/reconciliation lists keep their rules.

For the command's first call, replay and insert, source inspection says the database decides the allowed test and a caller without a covering grant of an allowed role receives `UNLINK_FORBIDDEN`. That check precedes job, command-receipt and link-row reads. D2–D8 and D15 were written to prove it against PostgreSQL; **NOT RUN means pending, not pass**. There is no basis here to claim those database guarantees independently verified. The answer code for an authority-refused caller cannot reveal whether the named job/link/command exists. Invalid schema remains the separate, public `INVALID_COMMAND` boundary. Constant execution time is not claimed.

The raw-SQL path is the expressly adopted limit: the existing table does not role-check an un-link row. The absolute claim "no caller of raw runtime SQL can get round the role rule" is not made. No route exists; actor-to-signed-in-person binding belongs to ENT-3.

Coordinator presence command (exit 0):

```text
git grep -n unlinkRoles -- packages/core/src/enterprise-domain/origin.ts
packages/core/src/enterprise-domain/origin.ts:8:const unlinkRoles = ["supervisor", "surveyor", "commercial_manager", "admin", "owner"] as const;
packages/core/src/enterprise-domain/origin.ts:126:    if (exported || !covers(actor, g, unlinkRoles)) return refuse("PERMISSION_DENIED");
```

## Scope and existing-line edits

New files: `packages/core/src/extra-unlink.test.ts`, `packages/core/src/enterprise-domain/duplicate-unlink-roles.test.ts`, `packages/db/test/extra-unlink.integration.test.ts`, `docs/contracts/extra-unlink-v1.md`, and this builder-receipt folder with observed logs and one-time evidence records. Modified: `packages/core/src/extra-persistence.ts`, `packages/db/src/extra-repository.ts`, `docs/contracts/extra-origin-persistence-v1.md`. The pre-existing lane line was checked for all nine required paths and left unchanged.

Existing source-line edits are exactly:

- `extra-persistence.ts`: append `UNLINK_FORBIDDEN`, `NOT_LINKED`, `ALREADY_UNLINKED` after the ten merged error codes. All schemas, reason list, command type and types are appended after merged code.
- `extra-repository.ts`: additive import-list line; add seam kind `duplicate_unlink` and optional `reversesLinkId`; broaden only `complete`'s result parameter union. Append two methods and the result type, SQL-text helper, semantic-value helper and new error mapper. No merged method or merged `failure` text changes.
- Existing contract: replace the last sentence of `extra_duplicate_link` with a pointer to the new contract; replace only Q9's held clause with the pointer; add `reverses` for the un-linked audit event. No other contract text changes.

**no migration; no database object created, replaced or altered**. No trigger, permission table, grant, dependency, package manifest, lockfile, route, controller, OpenAPI, UI, money calculation, extra-event write or extra state rule added. No business network call.

INTERIM (Q2 adopted): `organisation.manage OR extra.price` through `app.contractor_job_allowed` is the database reading of the five roles. Authority follows grants, not the membership's invited role. A read-only member with a later covering supervisor grant may un-link. No dedicated permission name is built.

## Role-by-role map

P = `packages/core/src/extra-unlink.test.ts`; R = `packages/core/src/enterprise-domain/duplicate-unlink-roles.test.ts`; D = `packages/db/test/extra-unlink.integration.test.ts`. Every R row below passed; all D evidence is written/source-inspected and NOT RUN.

| Role | With covering grant, before export | R decision row | D decision rows | No covering grant / export |
|---|---|---|---|---|
| owner | allowed | R1 owner | D2 owner: tenant (P), R1, B1, T1; D3 true row | R2 owner (control + four refused cases), D4 owner (T2/B2/R2), D5 owner (revocations/replay); R3 owner, D13 |
| admin | allowed | R1 admin | D2 admin: tenant/R1/B1/T1; D3 true row | R2 admin, D4 admin, D5 admin; R3 admin, D13 |
| supervisor | allowed | R1 supervisor | D2 supervisor: tenant/R1/B1/T1; D3 true row | R2 supervisor, D4 supervisor, D5 supervisor, D7 wrong team; R3 supervisor, D13 |
| surveyor | allowed | R1 surveyor | D2 surveyor: tenant/R1/B1/T1; D3 true row | R2 surveyor, D4 surveyor, D5 surveyor; R3 surveyor, D13 |
| commercial_manager | allowed | R1 commercial_manager | D2 commercial_manager: tenant/R1/B1/T1; D3 true row | R2 commercial_manager, D4 commercial_manager, D5 commercial_manager; R3 commercial_manager, D13 |
| operative | refused | R1 operative | D3 assigned and unassigned T1 operatives; D8 assigned | D3 false permission row |
| finance | refused | R1 finance | D3 finance tenant; D8 finance | D3 false permission row |
| read_only | refused | R1 read_only | D3 tenant and T1; D7/D8 tenant | D3 false permission row; D6 mixed grant |
| client_approver | refused | R1 client_approver | D3 same client's approver; D8 | D3 false permission row |
| connector | refused | R1 connector | D3 false permission-function row; no database grant can carry this role | R1; schema already excludes a database grant |

R1 has exactly ten unique names matching `enterpriseRoles`; D3 has exactly nine names matching `contractorRoles`, with true rows pointing to D2. D2 also covers two covering grants on one member; D6 covers mixed grants that do not jointly satisfy role plus coverage. R4 has four reconciliation rows and ten prompt-confirmation rows; the confirmer is the raiser so only role differs.

## Definitions built

The complete binding definitions are copied into `docs/contracts/extra-unlink-v1.md`.

| Definition | Status and where applied |
|---|---|
| Extra | BUILT: persisted variation/origin identity; D1/D16 |
| Contractor job | BUILT: unchanged raise binding checked at command step 4; D7 tests pre-authority refusal of other jobs |
| Link row / un-link row; duplicate / canonical | BUILT: stored pair selected by INSERT, never supplied; D1/D12 |
| Active link / reversed link | BUILT: absence/presence of reversal; D12/D17; merged group read unchanged |
| Exported | BUILT: existing event guard; D13, R3 |
| Link history / link revision | BUILT: both kinds counted under job lock; read count/list one statement; D10/D11/D12/D17 |
| Actor | BUILT: actorMembershipId; no route or authentication binding claimed |
| Covering grant / five roles | BUILT: call merged function, no scope rule copy; R1/R2, D2–D6 |
| Allowed test | BUILT: one private SQL-text function, two calls (initial SELECT and INSERT WHERE); D8 |
| Command / read | BUILT: unlinkDuplicate / readDuplicateLinks; D1/D17 |
| Command receipt / result / builder receipt | BUILT: command storage, returned/persisted four-field result, this run report; D1/D11 |
| Request hash | BUILT: normalize all four UUIDs, canonical parsed content excluding commandId; D10/D15 |
| Replay | BUILT: stored result only after current authority; D5/D11/D15 |
| Refused; nothing written | BUILT: full transaction rollback; all D refusal helpers compare counts/head and every protected row |
| Passes unedited | BUILT definition; applies to executed pure regressions/scanner only; database regressions pending |

## Acceptance criteria

BUILT means the code/test is written. Execution results are stated separately.

| ID | Status | Exact new test title / coverage |
|---|---|---|
| P1 | BUILT; PASS | `[P1] un-link input and links-read schemas are strict and versioned` |
| P2 | BUILT; PASS | `[P2] three new codes are appended and the ten merged codes keep their order` |
| R1 | BUILT; PASS, 10 rows | `[R1] one row per role: %s before export allowed=%s` |
| R2 | BUILT; PASS, 5 tests, 20 refused changes + 5 controls | `[R2] %s is not enough without a covering grant` |
| R3 | BUILT; PASS, 5 rows | `[R3] after export %s cannot un-link` |
| R4 | BUILT; PASS, 4 + 10 rows | `[R4] reconciliation keeps its list: %s allowed=%s`; `[R4] prompt confirmation keeps its list: %s site-originated=%s` |
| D1 | BUILT; NOT RUN | `[D1] an owner un-links an active link: one un-link row, one completed command receipt, one audit event, nothing else` |
| D2 | BUILT; NOT RUN | `[D2] each of the five roles un-links at each scope that covers the job` (literal 20-row table + mixed covering grants) |
| D3 | BUILT; NOT RUN | `[D3] every role in the merged list is decided, and the four other roles are refused` |
| D4 | BUILT; NOT RUN | `[D4] one of the five roles without a covering grant is refused` (15 rows) |
| D5 | BUILT; NOT RUN | `[D5] a revoked grant or membership is refused, on a new command and on a replay` (10 members) |
| D6 | BUILT; NOT RUN | `[D6] mixed and foreign actors are refused` |
| D7 | BUILT; NOT RUN | `[D7] a refused caller gets one answer, whatever they name` |
| D8 | BUILT; NOT RUN | `[D8] the write statement carries the rule itself` (six refused actors + owner control, initial SELECT answer made true) |
| D9 | BUILT; NOT RUN | `[D9] authority is read from the database at the moment of the command` (actual ungranted pg_locks row, no sleep proof) |
| D10 | BUILT; NOT RUN | `[D10] typed refusals for an allowed actor, each writing nothing` |
| D11 | BUILT; NOT RUN | `[D11] replay returns the stored result once; two callers produce one un-link` |
| D12 | BUILT; NOT RUN | `[D12] history is preserved, append-only, and a pair can be linked again` |
| D13 | BUILT; NOT RUN | `[D13] refusal after export on either extra` |
| D14 | BUILT; NOT RUN | `[D14] the audit event commits or rolls back with the command` (seam, command insert, fact insert, audit insert, completion, commit, raw row without audit) |
| D15 | BUILT; NOT RUN | `[D15] tenant isolation and spelling` |
| D16 | BUILT; NOT RUN | `[D16] nothing else changes` (order-line link plus exact protected rows around success and each D10 refusal) |
| D17 | BUILT; NOT RUN | `[D17] readDuplicateLinks` (0/2/3 histories; list sorted by id) |
| D18 | BUILT; NOT RUN | `[D18] errors carry codes only` (all refusal helpers; both mappers' SQL failures, known codes, strict boolean authority) |
| E1 | BUILT; source-inspected | Commands/output below and `scope-evidence.log`; scanner 145 PASS |
| E2 | BUILT; source-inspected | All requested working-tree git blobs equal BASE; table below and `unchanged-files.tsv` |

New test budgets: P1/P2 and all 34 R cases use unchanged Vitest default 5000 ms. D1/D9/D12/D13/D15/D17 use 60000 ms; D2/D3/D4/D5/D6/D7/D8/D10/D11/D14/D16/D18 use 120000 ms. Database setup is 60000 ms; teardown uses the unchanged default. No merged budget was changed. D9's pg_locks observation has a 10000 ms polling deadline and requires an actual ungranted request, with no sleep used as evidence.

All three test files were created before product code. Database tests use imported `cluster()`/`fixture()` and actual runtime/migration roles. No sign-in value or new dependency. D fault cases wrap actual connections; they are faults for rollback/error checks, not a replacement for PostgreSQL rules. During source review the spied-pool helper was fixed to wrap a reused client only once per spy scope, and D16's helper accounts for existing history. These were fixes to this leaf's new tests, not changes to expected behavior or merged tests.

## Commands actually run

Runtime observed: Node `v24.17.0`. Repository pins pnpm `10.28.1`. PATH's standalone pnpm launcher stalled after a warning; the pinned version is not installed in its local tools directory. pnpm 9.0.0 and 11.8.0 are locally present. **No package was downloaded or installed, and no pin/engine/version check was weakened.**

The exact required Run 1 command was attempted with both Vitest environment variables and maxWorkers 2, logged in `run-1-before.log`. It stalled before Vitest and was interrupted: exit **130**, no tests executed. Local pnpm 9 attempt (same arguments) failed closed: exit **1**, `ERR_PNPM_UNSUPPORTED_ENGINE`, expected 10.28.1, got 9.0.0; `run-1-before-local.log`. Local pnpm 11 version probe with `--pm-on-fail=error` failed closed: exit **1**, expected 10.28.1, got 11.8.0. No version-switch download was allowed.

Installed Vitest was invoked directly as a clearly labelled fallback, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` and `--maxWorkers=2` on every call, at most three files and one Vitest run at a time:

| Command / cwd | Exit | Observed result | Log |
|---|---|---|---|
| `packages/core/node_modules/.bin/vitest run --maxWorkers=2 packages/core/src/extra-unlink.test.ts packages/core/src/enterprise-domain/duplicate-unlink-roles.test.ts` / root, BEFORE product code | 1 | 2 files: P failed 2; R passed 34; 36 total | run-1-before-direct.log |
| same command AFTER product code / root | 0 | 2 files, 36 passed | run-1-after-direct.log |
| `packages/core/node_modules/.bin/vitest run --maxWorkers=2 packages/core/src/extra-persistence.test.ts packages/core/src/enterprise-domain/origin.test.ts packages/core/src/enterprise-domain/boundaries.test.ts` / root | 1 | 184 cases: 183 passed, one source lookup failed because cwd was wrong | run-2-direct.log |
| `node_modules/.bin/vitest run --maxWorkers=2 src/extra-persistence.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/boundaries.test.ts` / packages/core, corrected cwd | 0 | 3 files, 184 passed | run-2-core-cwd.log |
| `node_modules/.bin/vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` / apps/api | 0 | unchanged scanner, 145 passed | scanner-direct.log |

First actual pure-run log SHA-256: **6377ae61fa0bc2fe94618d6b5a5b5209011f8d3ad2531fba12ff994155a57d61**, path `docs/verdicts/ENT-4c/run-1-before-direct.log`. Failure names were exactly `[P1] un-link input and links-read schemas are strict and versioned` (schema undefined) and `[P2] three new codes are appended and the ten merged codes keep their order` (missing new codes). All R rows passed because the coordinator commit was in BASE. The launcher-only log SHA-256 is 16834415285119a2b7a019b0ea8fcf21fe945de6d2efc45ab2d8ce0e87b02707; no red schema result is claimed from that launcher attempt.

The root `pnpm typecheck` launcher attempt also stalled before checks and was interrupted: exit 130, `typecheck.log`. The initial inspection command ending in `pnpm --version` yielded without printing a pnpm version; its final exit was not observed. The environment-only and legacy-flag version probes were interrupted with observed exit 130; they ran no check. An attempted process listing was refused by the sandbox (`operation not permitted: ps`); no alternative process inspection was attempted. The locally installed CLI was then called as `node /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0/node_modules/pnpm/bin/pnpm.mjs --pm-on-fail=error <arguments>` to record immediate, fail-closed results without any download. All seven commands below exit **1** before their scripts run, with the same exact version refusal:

```text
[ERROR] This project is configured to use 10.28.1 of pnpm. Your current pnpm is v11.8.0
```

Arguments: `typecheck`; `lint`; `lint:lanes`; `build`; `--filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts`; `openapi:check`; `turbo run lint`. Lint calls carried `LANE_BASE_REF=4f539892a056554a68b85f14dc7d3368b603e99b`. Exact invocation arrays, exits and log paths are in `pnpm-checks.json` and `direct-checks.json`. These are **not passes for root pnpm checks**.

Direct unchanged checks and compiler:

| Command | Exit | Evidence |
|---|---|---|
| `node tools/core-purity-lint.mjs` | 0 | core-purity-lint.log |
| `LANE_BASE_REF=4f539892a056554a68b85f14dc7d3368b603e99b node tools/agent-lane-boundary-lint.mjs` | 1 | `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.`; expected uncommitted BASE=HEAD, rerun after dispatcher commit |
| `node tools/money-arithmetic-lint.mjs` | 0 | money-arithmetic-lint.log |
| `node tools/commercial-boundary-lint.mjs` | 0 | commercial-boundary-lint.log |
| `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit` | 0 | core-typecheck-direct.log; P and R compile |
| same compiler, `-p packages/config/tsconfig.json --noEmit` | 0 | config-typecheck-direct.log |
| same compiler, `-p packages/storage/tsconfig.json --noEmit` | 0 | storage-typecheck-direct.log |
| same compiler, `-p packages/ai/tsconfig.json --noEmit` | 0 | ai-typecheck-direct.log |
| same compiler, `-p packages/db/tsconfig.json --noEmit` | 0 | db-typecheck-direct.log; new source compiles |
| same compiler, `-p apps/api/tsconfig.json --noEmit` | 0 | api-typecheck-direct.log |
| same compiler, `-p apps/web/tsconfig.json --noEmit` | 0 | web-typecheck-direct.log |
| standalone strict database-test compiler command below | 0 | db-test-typecheck.log, db-test-typecheck-final.log; rerun after new fault cases; latest reviewed result recorded below |
| `node_modules/.bin/tsx src/generate-openapi.ts --check` / apps/api | 1 | openapi-direct.log: `listen EPERM: operation not permitted .../tsx-501/32436.pipe`; socket unavailable; no workaround attempted |

Standalone database-test compiler (only compilation, never PostgreSQL execution):

```sh
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module NodeNext --moduleResolution NodeNext --target ES2023 packages/db/test/extra-unlink.integration.test.ts
```

All package compiler checks passed, but a clean pinned pnpm run and build remain pending. The regression wrong-cwd run is explicitly retained; no assertion was edited and no timeout extension was used. No full package/repository test suite was run.

## NOT RUN / pending checks

**NOT RUN (sandbox cannot start PostgreSQL / a browser):** all D1–D18; both Mac helper runs below. They must run separately through `~/.local/bin/heavy-slot`, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-unlink.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-links.integration.test.ts test/extra-origin.integration.test.ts test/job-scheduling.integration.test.ts
```

These merged database files are byte-identical, not claimed passing. Every other repository test not listed as actually executed is NOT RUN by the builder; GitHub on the pushed exact head must cover the applicable suites. `pnpm test`, `pnpm test:db`, `pnpm test:migrations` were not attempted under the memory/sandbox order. Migration/upgrade proof is not applicable: no migration (rule 9 not applicable). No browser test applies: no workflow/route/UI changed. No AI model/prompt/extraction/matching change; no eval or live model run applies. No native work.

Required root pnpm typecheck/lint/lint:lanes/build, Turbo lint and OpenAPI checks remain pending with the stated environment failures. Root build was not executed past the version gate; no build-pass claim. Run lane checks after the dispatcher's commit (BASE must no longer equal HEAD). Fresh RED Opus + Sol reviews, exact-head GitHub run, separate technical acceptance and one integrator catch-up on main before PR are pending. G1, D16 and enterprise release gates are not supplied by this leaf.

## Two adopted limits

1. Raw runtime SQL bypassing `unlinkDuplicate` is not role-checked by the existing table. No new trigger/migration is built; later database order owns role plus command-type row checks (Q4 adopted default, ENT-4b reviewer LATER).
2. Shared tenant lock protects check/write against concurrent grant/membership revocation: revocation either commits first and the command is refused, or waits for the command. An un-link committing just before revocation stands, recorded with actor and server time.

## HELD / LATER owners

| Item | State / owner |
|---|---|
| Pure rule list and its merged test row | ALREADY DONE / coordinator; builder untouched |
| Screen/page/wording/component | HELD / founder UI pause |
| Route/controller/OpenAPI, signed-in actor binding | HELD / ENT-3 |
| Owner/admin duplicate visibility | HELD / founder's screen order |
| Former duplicate state and extra_event | HELD / ENT-5 |
| Who marks duplicates | HELD / ENT-5; merged linkDuplicate still has no role rule |
| Who records each kind of extra | Other leaves / ENT-3a, ENT-4a-ALIGN |
| Raw-row role and command-type guard | LATER / later database order, Q4 default |
| Dedicated un-link permission | LATER / later permission order, INTERIM Q2 |
| After-export repair and roles | HELD / ENT-7 |
| Fee rule, senior, prompt confirmation, pricing basis, money | Outside leaf / commercial/prompt/pricing owners; no changes |
| Index files, migrate/MIGRATIONS, audit, tenant context, commands, variation/shadow repositories; apps, tools, CI, AI, BUILD_PLAN, AGENTS, other lane lines | Outside leaf / owning tasks; untouched |

No FIX-LATER or BUILD_PLAN edit was made: neither path is in this lane. The later raw-row guard is recorded here for the dispatcher to carry to its list.

## Self-review

This is builder source inspection, not an independent model verdict. Whole diff against BASE plus all new files were re-read. Role rows and every coverage/replay/write/missing-job path are mapped above. First call: D1–D8. Replay: D5/D11/D15. INSERT rule despite a made-true initial answer: D8. Missing/non-work-order/foreign jobs and one refusal answer: D7/D15. Raw SQL without audit: D14; raw SQL without role checking is the stated limit, not claimed closed.

The allowed test is written once in `unlinkAllowed`, used by step 2 and step 9, with each permission literal appearing once in the file. All ordered steps match the issued order: tenant shared lock first; database authority before row reads; job lock/binding; claim/replay; named link; reversal; history count; one guarded INSERT; seam; audit; command completion. Duplicate/canonical come from the stored link in the INSERT SELECT and stored-row audit values. No savepoint. Audit head is the last new lock; completion updates the command row already inserted/locked earlier. After a true authority result the missing job/binding guards remain defensive; merged import/immutable track paths cannot reach their refusals, as the order states.

No role-name literal, scope rule or permission matrix in either edited source file. `withTenant` receives the original stamped context per call; source reads only tenantId, never stores/builds/returns/casts the context. Scanner passed unchanged. Existing methods/helpers were compared by TypeScript AST text once; exact equality and per-method SHA-256 are in `unchanged-methods.json` (an evidence record, never a standing test). Existing-line edits are limited to those listed above. The three error codes are appended, not reordered. New mapper passes known codes, maps unique/retry errors and hides raw detail, tested in written D18 cases.

Expected decisions, refusal codes, schema values, role tables, reference names and revision examples are handwritten test literals. Fixture IDs and before/after snapshots represent actual stored facts; no expected role answer is derived from the tested rule/function. Dynamic history counters in D2/D5 and setup offsets in the shared refusal helper count the test's own writes, not returned revisions. No .skip/.todo/.only, retry wrapper or merged assertion/budget change. No standing test freezes any file. No credential-shaped string is added; the semantic value comes from a small function and SQL values are parameter-bound. Plain wording is used; command receipt, builder receipt and result are distinguished.

All forbidden source/test/pin/migration paths are unchanged relative to BASE. Lane remains exactly dispatcher-issued. Full E1/E2 records follow. Every database claim remains source-inspected/written, pending real PostgreSQL execution; compilation is not that proof. No acceptance, professional sign-off or independent verification is inferred.

## E2 working-tree hashes against BASE

For every row below, `git hash-object <path>` equals `git rev-parse 4f539892a056554a68b85f14dc7d3368b603e99b:<path>` (all exit 0). These are one-time builder evidence, never a standing test.

| File | Working tree = BASE git blob |
|---|---|
| packages/core/src/enterprise-domain/origin.ts | e7a6e89288903694574518eff2bc957698ba4c9f |
| packages/core/src/enterprise-domain/origin.test.ts | d61ab8f6f65271e6b9c2ddbeb2742668b01bfd41 |
| packages/core/src/enterprise-domain/contracts.ts | fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71 |
| packages/core/src/enterprise-domain/transitions.ts | ae571eef932074775dc1515394a4f898b7b53636 |
| packages/core/src/enterprise-domain/transitions.test.ts | d6134286120124a4179de0714ccb5d365c4ccb91 |
| packages/core/src/enterprise-domain/fee.ts | eec73e564acf36851025db88afa49f92ee9ed542 |
| packages/core/src/enterprise-domain/index.ts | c0a9dae7bb168bacc6a392b808c4edb81696a8f5 |
| packages/core/src/enterprise-domain/fee.test.ts | 0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0 |
| packages/core/src/enterprise-domain/boundaries.test.ts | edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7 |
| packages/core/src/extra-persistence.test.ts | c751e0a7486b094f794111e42d8b3c3ead23f397 |
| packages/db/test/extra-fixtures.ts | 418f14ac6f36876d89195d64bd10476c0980b4f0 |
| packages/db/test/extra-links.integration.test.ts | 86b831b92bfb36b94ac07ba362a89d441241d3ec |
| packages/db/test/extra-origin.integration.test.ts | 164e2e64020da56ba4522fdeec06363c3c903db8 |
| packages/db/test/extra-origin-upgrade.integration.test.ts | 01caff7d582b0fb348721b5b8bd099726e083a4b |
| packages/db/test/job-scheduling.integration.test.ts | 63ece92e194b0f7431d9b45110aba70e3712872a |
| apps/api/src/auth/context-boundary.test.ts | bc63da29c0415bb55efefad54525822c2a437862 |
| packages/db/src/practice-session.ts | 5f8f191e0e398c41c88523848f78d059acad3e11 |
| packages/db/src/contractor-repository.ts | fcccaca554274dfbc8808e6fec685b9607491944 |
| packages/db/src/contractor-party-repository.ts | 637184fa115057e84ffb36d1b5f56a706ea8cf17 |
| packages/db/src/work-order-repository.ts | ded2735f49d55befb4c27c433519d588b0896ca3 |
| packages/db/src/sor-repository.ts | 2942e6f97a0ac1d298e67efd5f5e02f894e065a1 |
| packages/db/src/job-scheduling-repository.ts | 443e712d31fac7adea069c31528d787026b8f9ec |
| packages/db/src/work-order-fixtures.ts | 7d5b84ad594e6fc4112a204d8ef19ded9982635a |
| packages/db/src/index.ts | 9fce08a8e70adabc1f91f28271a271c3260a3464 |
| packages/db/src/audit.ts | c4753bd0ae004a1fcb80bab322fd158ba7ecf911 |
| packages/db/src/tenant-context.ts | 683c90416ae570497965a7a740f9c9f0ba0f2d74 |
| packages/db/src/commands.ts | 8c087ba79e648c03c032e87246dc3ee04c23d7fa |
| packages/db/src/variation-repository.ts | cece16ea1fb2d833dd860f2ad755f00e62c308fc |
| packages/db/src/shadow-repository.ts | de5cccce9529b4fadf6eef1fb6aeef8ca01a0e38 |
| packages/core/src/index.ts | 0af7dd1356593631dc27efa8f9719c3878880223 |
| apps/api/openapi.json | 1d9949de426d391fdf779e3b3ab7fffea63066d0 |
| config/agent-lane-assignments.json | 342c6992607c09f337bdc98af69da501192025b1 |
| BUILD_PLAN.md | da718525b3b0f566d4be5928dbfb2749490537c1 |
| AGENTS.md | 28259e6e37509829dd4df8499798e1a1fac803ec |

Latest standalone database-test compilation: exit **0**, `db-test-typecheck-reviewed.log`, after the reused-client helper fix. No PostgreSQL execution.

## Inherited criteria

C1/C2: expressly server-only leaf; persisted result/read built, route/UI composition HELD by issued order. C3: synthetic jobs and .invalid members, no outbound calls. C4: no new table/SQL object/money; existing runtime grants and append-only audit path retained, written D coverage pending. C5: current database authority, revision/replay/tenant/rollback/race cases written; real execution pending. C6: pure tests executed, PostgreSQL cases written first and NOT RUN. C7: not applicable, no web workflow. C8: lane unchanged, scanner and checks kept fail-closed; exact-head RED verdicts and CI pending.

## E1 scope outputs

The commands below ran with the full BASE hash; role-name search exit 1 is the expected empty match set. The source search is an honest-mistake guard, not database authority proof. Database refusal proof remains pending D2–D8.

```text
$ git diff --name-only 4f539892a056554a68b85f14dc7d3368b603e99b
exit 0
docs/contracts/extra-origin-persistence-v1.md
packages/core/src/extra-persistence.ts
packages/db/src/extra-repository.ts

$ git status --porcelain
exit 0
 M docs/contracts/extra-origin-persistence-v1.md
 M packages/core/src/extra-persistence.ts
 M packages/db/src/extra-repository.ts
?? docs/contracts/extra-unlink-v1.md
?? docs/verdicts/ENT-4c/
?? packages/core/src/enterprise-domain/duplicate-unlink-roles.test.ts
?? packages/core/src/extra-unlink.test.ts
?? packages/db/test/extra-unlink.integration.test.ts

$ git diff --check
exit 0

$ git diff 4f539892a056554a68b85f14dc7d3368b603e99b -- packages/db/migrations/ apps/
exit 0

$ rg -n '[\x27\x22](owner|admin|supervisor|surveyor|commercial_manager|finance|operative|read_only|client_approver|connector)[\x27\x22]' packages/db/src/extra-repository.ts packages/core/src/extra-persistence.ts
exit 1

All changed/untracked files match the unchanged issued lane.
No changed app or migration file.

One-time added-line credential-shape check: no matches.
```

OpenAPI is byte-identical to BASE (E2 blob); its generator did not complete because the sandbox refused the pipe. The lane line is byte-identical to BASE. No app, migration, shared pin or coordinator file changed. Generated output cleanup removed only `.pnpm-store` and `apps/web/tsconfig.tsbuildinfo`; no build output or test-results remains.

## Repair round 1 (12 Oct)

Repair starting head: `f03144ca074c1ea1d98a9f28e6bbf38445c75870` (build plus the dispatcher's plain merge of main). Branch: `codex/sandbox/ent-4c`; initial working tree clean. The issued order remains in force. This repair changes only `packages/db/test/extra-unlink.integration.test.ts` and this receipt. No product code, migration, merged fixture, assertion, timeout, role list, security pin or lane line changes. No commit, add, checkout, push, merge or PR action by the builder. Intended commit message: `/private/tmp/jg-msg-ent-4c.txt`.

### Cause and exact edit

The dispatcher supplied the first Mac PostgreSQL result: 17 database tests passed, but D7 stopped in `madeUpJobs` with `job_commercial_track_pkey` before reaching its refusal assertions. Those assertions were unproven; this receipt does not turn that run into a D7 pass.

Source inspection confirms the cause. Migration `0053_shared_money_origin.sql` defines `PRIMARY KEY(tenant_id,job_id)` on `app.job_commercial_track`. Its `job_legacy_live_track` AFTER INSERT trigger calls `app.bind_small_builder_track()`, which inserts a `small_builder` row for a live, non-imported job. The helper inserted both jobs as live, then tried to insert a second track row for the contractor job. The permitted values and checks allow the existing contractor binding (`contractor`, `synthetic_demo`, `work_order_import`), but the primary key already existed. This was a test setup mistake, with no evidence of a product defect.

Merged pattern reused: `extra-origin-upgrade.integration.test.ts:65` creates a contractor fixture with the default draft status, then inserts its contractor track. Migration 0003 defines that default as `draft`; the merged work-order creation routine in 0110 also inserts a draft job before its contractor track. `work-order-fixtures.ts` and scheduling fixtures use that work-order import path. The repair uses an explicit draft status for the contractor fixture. The live small-builder fixture still exercises the normal trigger; the contractor fixture still has no work order and retains the same job provenance. No trigger is disabled and no track row is updated or deleted.

The only test-file edit is line 100 in `madeUpJobs`, before:

```ts
  await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional small builder','live'),($1,$3,'Fictional contractor fixture','live')", [f.p.tenantId, small, contractor]);
```

After:

```ts
  await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional small builder','live'),($1,$3,'Fictional contractor fixture','draft')", [f.p.tenantId, small, contractor]);
```

Line 101's track INSERT and parameters are unchanged. `madeUpJobs` is called only by D7 (line 239). **D7 is still the same test:** its entire body, every named job/link/member/role case, refusal code/message checks and before/after snapshots are unchanged. All other 17 test bodies, including the non-member checks, are unchanged. Test budgets are unchanged. No skipped, deleted or weakened assertion, retry wrapper or new fixture file.

### Repair checks actually run

Runtime: Node `v24.17.0`. Available local pnpm versions remain 9.0.0 and 11.8.0; the pinned 10.28.1 executable is unavailable. No package download/install or version-check bypass. Logs and exact invocation arrays for this repair are under `/private/tmp/jg-ent-4c-repair-round-1/`.

Five root-script attempts used `node /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0/node_modules/pnpm/bin/pnpm.mjs --pm-on-fail=error <script>`: `typecheck`, `lint`, `lint:lanes`, `build`, `openapi:check`. Every attempt exited **1 before its script ran**, refusing pnpm 11.8.0 because the repository requires 10.28.1. All carried `LANE_BASE_REF=origin/main`. `pnpm-checks.json` and the five `pnpm-*.log` files record these failures. These are not root pnpm passes.

Direct checks with installed tools:

| Command / cwd | Exit | Result / log |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module NodeNext --moduleResolution NodeNext --target ES2023 packages/db/test/extra-unlink.integration.test.ts` / root | 0 | Changed test compiles; `db-test-typecheck.log`; not PostgreSQL proof |
| `node tools/core-purity-lint.mjs` / root | 0 | 131 TypeScript files; `core-purity-lint.log` |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` / root | 0 | Lane `ent-4c`; `agent-lane-boundary-lint.log` |
| `node tools/money-arithmetic-lint.mjs` / root | 0 | `money-arithmetic-lint.log` |
| `node tools/commercial-boundary-lint.mjs` / root | 0 | `commercial-boundary-lint.log` |
| `node node_modules/typescript/bin/tsc -p <package>/tsconfig.json --noEmit` / root, separately for `packages/core`, `packages/config`, `packages/storage`, `packages/ai`, `packages/db`, `apps/api`, `apps/web` | 0 each | All seven compiler checks passed; `<package-with-slashes-replaced>-typecheck.log`; `direct-checks.json` |
| `node --import tsx src/generate-openapi.ts --check` / apps/api | 0 | Actual generator matched committed OpenAPI; `openapi-node-import.log`, `openapi-check.json`; this Node invocation needs no tsx CLI pipe |
| `node node_modules/typescript/bin/tsc -p packages/<name>/tsconfig.json --outDir /private/tmp/jg-ent-4c-repair-round-1/build/<name>` / root, separately for core, config, storage, ai, db | 0 each | All five library builds emitted to temporary directories; `<name>-build-direct.log`, `direct-builds.json` |
| `node node_modules/@nestjs/cli/bin/nest.js build` / apps/api | 0 | API build passed; `api-build-normal.log`, `build-retry.json` |
| `node node_modules/next/dist/bin/next build` / apps/web, after the API build | 0 | Compiled successfully and generated 29/29 static pages; `web-build-with-api.log`, `build-retry.json`; workspace-root and CSS warnings retained in the log |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` / root, after the receipt update | 0 | All four root boundary checks passed together; no changed source to require another compiler run |
| `git diff --check` / root | 0 | No whitespace errors |

Build sequence note: an earlier Nest attempt with `--path /private/tmp/jg-ent-4c-repair-round-1/api-build-tsconfig.json` exited 1 because Nest did not locate the absolute config path (`api-build-direct.log`). The first direct Next build exited 1 because the API's compiled package exports were absent (`web-build-direct.log`, `web-build.json`). The normal API build resolved that setup issue before the web build was repeated; both initial failures remain recorded.

The direct library/API/web build tools passed; the pinned root pnpm build remains blocked at the version check. Newly generated `apps/api/dist` and `apps/web/.next` were removed after the build. Library emission went only to `/private/tmp`. No package store or test-results directory was created; pre-existing ignored dependency/build directories were not replaced by the library checks. The generated web typecheck cache was removed at cleanup.

### NOT RUN and remaining proof

**NOT RUN (sandbox cannot start PostgreSQL / a browser):** the changed `extra-unlink.integration.test.ts`, all D1–D18 including repaired D7. No attempt to start PostgreSQL or bind a socket. The Mac helper must rerun the complete file, unchanged in meaning:

```sh
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-unlink.integration.test.ts
```

No Vitest unit file changed in this repair. Unit tests and the unchanged scanner were not rerun, respecting the repair order's limit to changed test files. The dispatcher's reported core/scanner results are supplied prior-run evidence, not new builder execution. No full `pnpm test`, database/migration suite, regression file or browser suite ran. No migration (rule 9 not applicable); no database object created, replaced or altered. No AI/native/UI change. Pinned root checks, exact repaired-head PostgreSQL/CI results, fresh independent RED reviews and separate acceptance remain pending. D7 and the other database cases are not claimed passing after this repair.

### Repair self-review

Builder source inspection only. One-time comparison against repair HEAD confirmed the test file equals the original with exactly one literal substitution. D7 was compared by its D7/D8 markers, giving identical SHA-256 `a375453426f370789cdb2a01dccca4b4d381557ea7862e697cacd2b9395a5cef`. An initial comparison reused old character offsets after the one-character length change and failed the inspection script; the corrected marker-based comparison exited 0. This was no test execution or assertion change.

One-time byte comparisons against repair HEAD passed for coordinator-only `origin.ts` and `origin.test.ts`, the dispatcher's lane file and `apps/api/src/auth/context-boundary.test.ts`. No standing hash test was added. The whole repair diff was reviewed: test setup plus receipt only, no credential-shaped added string, no product/migration/security edit, no widening of the lane. The draft contractor still lacks a work order, so the existing database authority check refuses it for the same reason; the small-builder job remains live. The repair requires the real PostgreSQL rerun to prove setup and refusal assertions. No self-acceptance or independent-verdict claim.

Final repair diff: two files only, this receipt and `packages/db/test/extra-unlink.integration.test.ts`; the test diff is one insertion and one deletion on the same line. Working HEAD remains `f03144ca074c1ea1d98a9f28e6bbf38445c75870`. Self-review passed for the permitted test setup repair; database execution and independent acceptance are still pending.

Builder receipt only — not independently verified, not accepted.
