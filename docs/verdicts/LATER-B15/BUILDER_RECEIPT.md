Built by Codex; dispatched 13 Oct 2026; queue header updated 16 Oct 2026.

The dispatch template's requested first line names Claude Sonnet 5.5 and says Codex is unavailable. That is not this run's provenance; this receipt records the actual builder.

# LATER-B15 — partial build, PARK

No acceptance, independent verdict, merge, enablement or deployment is claimed. Decision 74 applies. RED review (Opus and Sol-high), a separate accepting actor, CI and Ben's button remain outstanding. No sub-agents or reviewer agents were used.

## Base and scope

- Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/later-b15`.
- Branch: `codex/sandbox/later-b15`.
- Initial and final HEAD and local `origin/main`: `31682762c903d716657c573e1b5deae63588aad7`.
- The issued base `ca435eeb5791638c787c830d6ba717146f694539` and draft base `0bbb5ddb` differ from the actual local base. Main wins. No fetch, commit, index update, push or other Git write was performed.
- Verified current main's BUILD_PLAN C2 at line 111 and material/PO/supplier/Things/inbox rows at lines 421, 422, 424, 429 and 431. The cited material/controller locations still have the relevant behavior, but line numbers alone do not establish implementation evidence.
- Read AGENTS.md and the applicable plan/working rules. Added this branch's lane file first. No existing merged test, pin, fingerprint, shared command harness, application service, live-owner repository or registry was changed.
- No migration. No production GRANT. Standard F: no new direct INSERT, UPDATE or DELETE grants to `jobguard_runtime` on any protected table. The prospective disposable DB test has only `GRANT jobguard_runtime TO later_b15_login` (role inheritance in a fresh test cluster, not a production table privilege).
- No new route or command. Existing pre-live classifications for material inputs, watchdog classifications and each repository's live guard remain unchanged. The local helper invokes existing applications, so their authority checks still run before schema parsing or repository guards.

## Implemented and tested

| Item | Result |
| --- | --- |
| L084 / api-file-material#5 | Material requirement/rate stale errors map to 409 with the exact code. Invalid commands map to 400. |
| L085 / api-file-purchase-order#5 | Draft and placement stale errors map to 409. Typed command authorization failures map to 403; command conflict maps to 409. |
| L086 / api-file-supplier-document#3 | Intake, receipt and confirmation stale errors map to 409. |
| L087 / api-file-things-to-check#4 | Review and supersession conflicts map to 409. |
| L066 / api-file-inbox-relevance#5 | Invalid seed, budget and dismissal bodies map to `400 INVALID_COMMAND`. |
| Shared boundary | Exact allowlisted domain errors only; no prefix inference. Real Zod errors map to 400. SQLSTATE/decorated errors, forged error names, SyntaxErrors and unknown codes remain sanitized 500 faults. |
| Existing refusals | Original PracticeAccessError, WatchdogError, JobWorkStateError and HttpException instances are rethrown unchanged for existing filters. This preserves linked-job offers and status/body/code semantics. |

All five controllers' existing reads and writes use the helper. Responses expose only safe codes for newly mapped failures. Application services and Next transports were not changed. Unit tests use real controller/application/schema composition with access stubs for validation, and inject application errors for mapping. The tests do not prove PostgreSQL isolation, durable replay or real membership authorization. The four-state refusal loop specifically tests preservation of an injected refusal, not a real database's four job states.

First meaningful red run: 47 tests, 28 failed and 19 passed before helper/controller edits. First green: 47 passed. Final expanded file: 69 passed (one file, two workers). Tests for each issued transport item were written before implementation. Additional mapping/read cases were added during source review.

## STOP — L083 / api-file-material#4

The new five-case real-PostgreSQL file is prospective and NOT RUN. **L083 is not implemented in the final diff.** Its same-date correction tests are expected to fail against the unchanged repository when CI runs them. Do not treat this partial piece as green or mergeable.

The attempted fix inserted a conversion with `ON CONFLICT ... DO NOTHING RETURNING id`, then, on a conflict, compared the existing same-tenant/SKU/unit/date quantity using exact PostgreSQL numeric equality. Matching quantities would reuse the immutable conversion, changed content would raise `MATERIAL_PACK_CONVERSION_CONFLICT`, and prices would append under the existing catalogue lock. Source inspection found that this requires a change to another piece's merged SQL fixture. The repository edit was restored byte-for-byte to main and the unused new error mapping was removed. No fixture workaround was added.

**Coordinator-owned prerequisite: `apps/api/src/material.application.test.ts:25` and `:37`.** Rule G prohibits these edits. Numbered coordinator ruling needed before resuming L083. Exact current lines and proposed minimum changes:

Line 25 before:

```ts
 const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<{ rows: object[] }> => {
```

Line 25 proposed after:

```ts
 const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<{ rows: object[]; rowCount?: number }> => {
```

Line 37 before:

```ts
  else if (sql.startsWith("INSERT INTO app.material_pack_conversion(")) packs.push({ skuId: v[2]!, unit: v[3]!, quantity: v[4]!, from: v[5]! });
```

Line 37 proposed after:

```ts
  else if (sql.startsWith("INSERT INTO app.material_pack_conversion(")) {
   packs.push({ skuId: v[2]!, unit: v[3]!, quantity: v[4]!, from: v[5]! });
   return { rows: [{ id: v[0]! }], rowCount: 1 };
  }
```

These minimum changes would let the existing fixture acknowledge its successful first inserts. If the coordinator extends that SQL fixture to cover same-date reuse, it must also model conflict/no-insert and the exact-quantity SELECT. Existing expectations and the strict unsupported-query refusal at line 55 must remain. No assertion relaxation is requested.

Prospective PostgreSQL cases, all titled L083: repeated same-date corrections preserve version history and conversion bytes; changed conversion conflicts without appending a price; concurrent corrections produce one append and one stale refusal; later-dated conversions append without changing earlier rows; different tenants never reuse each other's conversion.

## Verification commands and outcomes

Installed Node: `v24.17.0`; pinned project pnpm: `10.28.1`; Turbo: `2.10.12`; Vitest: `4.1.11`. Dependencies were already installed and no install/download was requested. The normal pnpm shim points to 11.8.0; early commands emitted its warning and stalled. Both were interrupted (130). The pinned 10.28.1 executable already existed in the local Corepack cache. A temporary symlink made child Turbo scripts use it too; repository configuration and dependencies were not changed.

Successful pinned commands used this preamble:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-later-b15-pnpm-bin:$PATH"
```

| Command | Exit / actual result |
| --- | --- |
| `pnpm --filter @jobguard/api exec vitest run src/later-operational-errors.test.ts --maxWorkers=2` (initial global shim; log `/private/tmp/later-b15-unit-red.log`) | 130, interrupted after pnpm warning; no tests executed |
| Same command with `npm_config_manage_package_manager_versions=false` and `npm_config_package_manager_strict=false` (log `later-b15-unit-red-local.log`) | 130, same stall; no tests executed |
| `pnpm --manage-package-manager-versions=false --package-manager-strict=false --filter @jobguard/api exec vitest run src/later-operational-errors.test.ts --maxWorkers=2` | 1, installed pnpm rejects those options; no tests executed |
| `./node_modules/.bin/vitest run src/later-operational-errors.test.ts --maxWorkers=2` from apps/api (log `later-b15-unit-red-direct.log`) | 1; one suite failed to load because `@jobguard/db` had no compiled output; zero tests |
| `pnpm --version` using a shell function pointing at the cached 10.28.1 | 0; 10.28.1 |
| `pnpm exec turbo run build --filter=@jobguard/db... --force --concurrency=2` with that shell function | 130; child scripts still resolved global pnpm; interrupted before tests |
| `mkdir -p /private/tmp/jg-later-b15-pnpm-bin` and `ln -s /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs /private/tmp/jg-later-b15-pnpm-bin/pnpm` | 0; temporary pinned shim only |
| `pnpm exec turbo run build --filter=@jobguard/db... --force --concurrency=2` with pinned PATH (log `later-b15-prerequisite-build-pinned.log`) | 0; three prerequisite packages compiled to allow meaningful pre-change tests |
| `pnpm --filter @jobguard/api exec vitest run src/later-operational-errors.test.ts --maxWorkers=2` (log `later-b15-unit-red-pinned.log`) | 1; 28 failed / 19 passed / 47 total, one file |
| Same unit command, log `later-b15-unit-green.log` | 0; 47 passed, one file |
| Same unit command, log `later-b15-unit-final.log` | 0; 69 passed, one file |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7 successful tasks, 0 cached (`later-b15-typecheck.log`) |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; 7 successful tasks, 0 cached (`later-b15-lint.log`) |
| `pnpm build --force --concurrency=2` | 0; 7 successful tasks, 0 cached (`later-b15-build.log`) |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; self-comparison refusal below |
| `git diff --check` | 0; run after source edits and again after required lane check |
| `pnpm openapi:check` | 1; `tsx` listener EPERM before OpenAPI checking executed (`later-b15-openapi.log`) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal |

The final root typecheck/lint/build each ran once with **--force**, sequentially, with no cache-hit claim. Prerequisite compilation was a separate setup step before the meaningful red unit run. Turbo printed `WARNING IO error: Operation not permitted (os error 1)` for its shared cache; actual compiler/build tasks completed, zero tasks were cached. No cache permission change or alternative cache route was attempted. The web build reported existing CSS autoprefixer warnings.

Before heavy runs, `memory_pressure | tail -1` reported 81–82% free (above 35%). `df -g /System/Volumes/Data` reported 47 GB available initially and 46 GB after the build (above 45 GB). No heavy DB or browser command was run; no heavy-slot was needed. Test runs were sequential, only this piece's one unit file, maximum two workers. Build and test did not overlap.

### Refused/held checks (no bypass)

1. Exact process inspection command:

   `ps -o pid,ppid,etime,command -ax | rg 'pnpm|vitest|later-b15-unit' && tail -15 /private/tmp/later-b15-unit-red.log && sed -n '50,65p' packages/core/src/job-work-state.ts && ls -l node_modules/.bin/pnpm /Users/benharwood/Library/pnpm/bin/pnpm && command -v pnpm`

   Exit 1: `zsh:1: operation not permitted: ps`. Process inspection stopped; no alternative process inspection was used. Subsequent source/log reads were independent of process inspection.

2. Lane checking: `tools/agent-lane-boundary-lint.mjs:303` rejects equal base and target. Actual message: `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main because this builder is prohibited from committing. This is a held check until the dispatcher commits; no alternate base or shared-tool edit was attempted. Current line: `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. Proposed source change: none; dispatcher reruns the prescribed check after its commit.

3. `pnpm openapi:check`: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/28669.pipe`. The `tsx` IPC listener was refused before the generator ran. Stopped that item; no alternative execution route. OpenAPI verification is NOT RUN, not passed.

### NOT RUN

- `packages/db/test/material-pack-revision-later.integration.test.ts`: five prospective cases, NOT RUN (cannot start PostgreSQL or bind a socket here; also L083 implementation is stopped).
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN (whole suites belong to CI/dispatcher; database/socket restriction). No migration was added.
- `pnpm test:e2e`, all Playwright/browser suites: NOT RUN (explicit CI-only order; cannot start a browser here). No UI work.
- Existing merged unit/integration files: source-inspected only, not executed under the own-files-only test budget.
- Clean install: NOT RUN (dependencies provided; downloads prohibited). Provider/model eval: inapplicable; no AI/model/parser/policy change.
- Independent RED verdict and technical acceptance: NOT RUN/not recorded by builder. The dispatcher owns those steps after the intended commit.

## Source inspection / edit command audit

These commands were read-only unless specifically identified as a source edit. A missing-file exit is reported as such; it is not a check result. Repeated `tail` reads and session polls only observed the logs listed above.

| Inspection/edit command or batch | Exit / evidence |
| --- | --- |
| `pwd && git status --short && git rev-parse HEAD origin/main && cat AGENTS.md && cat config/lanes/later-b15.json` | 1; clean initial tree, equal hashes, AGENTS read; lane file initially absent |
| `cat package.json apps/api/package.json packages/db/package.json`; `sed -n '95,120p' BUILD_PLAN.md`; `sed -n '410,440p' BUILD_PLAN.md`; controller reads | 0; manifests, contracts and all five current controllers inspected |
| `rg --files -g AGENTS.md -g '*lane*' -g '*material*test*' -g '*errors*' apps packages config tools`; material repository and lane-tool reads | 0; found current files |
| Re-read five controller files with `cat apps/api/src/{material,purchase-order,supplier-document,things-to-check,inbox-relevance}.controller.ts` | 0 |
| `cat packages/db/src/material-repository.ts && cat config/lanes/later-b14.json ...` | 1; material read; unrelated example lane absent, later chained reads not executed |
| `cat apps/api/src/{material,purchase-order,supplier-document,things-to-check,inbox-relevance}.application.ts && cat apps/api/src/practice-access.ts` | 0 |
| `rg --files config/lanes packages/db/test apps/api/src ...`; lane-tool read; `rg -n 'throw|Error' packages/db/src/{purchase-order,supplier-document,things-to-check,inbox-relevance}-repository.ts` | 2; repository named things-to-check does not exist; located actual discrepancy repository later |
| `cat packages/db/test/material.integration.test.ts ...` | 1; singular filename absent, subsequent chained reads not executed |
| `cat packages/db/test/materials.integration.test.ts packages/db/migrations/0031* apps/api/src/practice-errors.filter.ts apps/api/src/evidence-pack.errors.ts apps/api/src/job-work-state.errors.ts apps/api/src/material.application.test.ts` | 0 |
| Inbox session unit read and `cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 0 |
| `rg -n 'throw new|class .*Error' packages/db/src/{discrepancy-repository,watchdog,commands,practice-access}.ts ...` | 2; practice-access filename absent in db; actual practice-session.ts read later |
| Five contract reads, inbox session test read, watchdog/command/filter reads, `memory_pressure`, `df`, `node --version`, `git branch --show-current` | 0 |
| Watchdog/recovery error filters, tenant test helper, supplier integration, pool helper reads; `rg ... packages/db/src/practice-material-pool.ts` | 2; material pool actually lives in practice-session.ts |
| Boundary pin searches; `rg -n 'practiceMaterialPool' packages/db/src`; API tsconfig; error searches; standing rules read | 0 |
| `sed -n '1,150p' apps/api/src/auth/context-boundary.test.ts`; practice-session source, exact legacy error searches, evidence controller; `cat vitest.config.*` | 1; no root config glob match; protected files read only |
| Core manifest, root/db tsconfigs, serious-b8 example lane, migration 0094 material policy, plan task searches | 0 |
| `rg -n 'class JobWorkStateError' packages/core/src` and initial test-log tail | 0 |
| Post-refusal log read, work-state read, local bin `ls`, `command -v pnpm` | 0 overall; `node_modules/.bin/pnpm` absent |
| Global pnpm shim read and `cat .npmrc ...` | 1; .npmrc absent, chained later reads not executed |
| Local node_modules, pnpm tool directories and bin listings | 0 |
| `tail -8 ...red-local.log`, local Vitest shim `ls` and `head` | 0 |
| Local Vitest/pnpm bin listings; `/opt/homebrew/bin/pnpm`, `/usr/local/bin/pnpm` | 1; latter two absent |
| Direct Vitest invocation batch also read the rejected-option log first | 1 test exit, detailed above |
| Direct test log, absent dist entries, pnpm source searches, main-worktree pnpm listing | 1 overall; missing dist and pnpm paths |
| pnpm source searches, turbo config, config-file search, pnpm/Corepack cache listings | 0 |
| Corepack cached pnpm listing, installed pnpm source sections, cache metadata listing | 0; found 10.28.1 locally |
| `python3` controller wrapping/material implementation heredoc | 0; only allowed source paths; material edit later restored |
| `nl -ba apps/api/src/material.application.test.ts | sed -n '28,95p'`; unit log, diff stats, material diff, watchdog registry search | 0; discovered L083 prerequisite |
| `python3` using read-only `git show origin/main:packages/db/src/material-repository.ts` to restore only this run's repository edit; fixture line read and `git diff --numstat` | 0 |
| Typecheck/unit log reads, status, diff check, lane-tool self-comparison search, attempted `cat docs/ledger/SERIOUS-B8.md` | 1 overall; example ledger absent; other reads/check succeeded |
| `head -65 tools/lint.mjs`, baseline note read, check-log tails, `git show origin/main:BUILD_PLAN.md | sed -n '419,432p'` | 0 |
| Build-log tails and free-disk checks (two polls) | 0 |
| `python3` SHA-256 manifest and protected-file/base equality comparison | 0; hashes below, all eight protected files equal main |
| OpenAPI log read, `git diff --stat`, `git status --short`, `git rev-parse HEAD origin/main`, GRANT/write searches in new helper/test | 0 |
| Final `git diff --check`, `git status --short`, `git diff --stat`, `git rev-parse HEAD origin/main`, Python verification of receipt hashes and intended-message read | 0; 18 recorded hashes matched the working tree; only lane files changed |
| All source edits, new tests, lane, receipt, ledger and intended-message writes used apply_patch (plus the two Python edit/restore commands above) | success; no existing uncommitted user file overwritten |

## Scope proof and hashes

`git diff --stat` (tracked files only; new files are untracked because no index writes are allowed):

```text
 apps/api/src/inbox-relevance.controller.ts   | 3 ++-
 apps/api/src/material.controller.ts          | 3 ++-
 apps/api/src/purchase-order.controller.ts    | 3 ++-
 apps/api/src/supplier-document.controller.ts | 3 ++-
 apps/api/src/things-to-check.controller.ts   | 3 ++-
 5 files changed, 10 insertions(+), 5 deletions(-)
```

New files: `apps/api/src/later-operational-errors.ts`, `apps/api/src/later-operational-errors.test.ts`, `config/lanes/later-b15.json`, `packages/db/test/material-pack-revision-later.integration.test.ts`, this receipt and `docs/ledger/LATER-B15.md`. All are explicit lane paths (the lane file is self-owned). Intended message is outside the repository at the issued `/private/tmp/jg-msg-later-b15.txt` path. No permanent test pins any file's bytes.

SHA-256 (source/lane/ledger; receipt excluded from self-hashing):

```text
842b319ac8b1b1b1b46706b55e2aff3fd1bc8ece29c16ad3e872551c6541b48c apps/api/src/inbox-relevance.controller.ts
59dc157d30f0347cbe525d3ff956d9417ef4cd1760a0fe75879b3195ea57fbf5 apps/api/src/later-operational-errors.test.ts
5435b5feebb63d7729d751440bbc15a1df8a4784803ba31df53e709cb2c747b3 apps/api/src/later-operational-errors.ts
f01cc24f61ae0ffda21fcbdd51fa242543ee2263782716ddbff5c21a83e05486 apps/api/src/material.controller.ts
3b5156f21f68b6394cd52b97f22df308bb8373348741d880746e1794ca66ed0c apps/api/src/purchase-order.controller.ts
17b68e7bd11382a255ec067faa1057fc0d24eab3b19cf26b4126d18508f2be7a apps/api/src/supplier-document.controller.ts
8335c12a8425b95ae98c879ea8d1955892866ce86136d4fce180d159f07d8436 apps/api/src/things-to-check.controller.ts
9773abbb7b2d011ade0262bdd92fc65a4f37d0a10bd3537da81fe0d6b66f870b config/lanes/later-b15.json
6770ee0c1578f41294b51c10241fd64bb8f300811942c8828957a52a9a7cd0da docs/ledger/LATER-B15.md
e6df08d8ddc6e70feef3885316bb35d33f5092b630f66da6776ca7682cc63dc5 packages/db/test/material-pack-revision-later.integration.test.ts
```

Protected files verified equal to origin/main, using SHA-256 plus actual byte comparison:

```text
0dd0ea380d1b9c807bf801611319409ad931968aaf002522151f214fb2fe845e packages/db/src/material-repository.ts
1f8709966775eacaa126f40acbfa859df2f3c79a70a8000424697ae386d16e34 apps/api/src/material.application.test.ts
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2 apps/api/src/auth/context-boundary.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
85f2b56ea0d0ca2defc56adced88ef3b1ccb97c6006eb03ad04cba61a6f0f371 packages/db/src/supplier-document-repository.ts
ae3d789c7314afbd74a107f5b129ef7ea3b69341bf530140790bd3941c33ef83 packages/db/src/inbox-relevance-repository.ts
```

## Builder source inspection (not an independent review)

Checked that the helper has an exact allowlist, authentic schema-error detection, original typed-filter identity, safe unknown responses, and no database/network/permission writes. All existing route decorators and application calls are preserved. Authentication still precedes schema parsing; no pre-auth live guard was added. No money representation, authorization rule, immutable commercial history, tenant setting, RLS policy, deletion rule or budget policy was changed. No new operational alert, migration, backfill or rollout step is introduced by this transport-only partial diff.

Residual limits: L083 remains stopped and its prospective tests fail until authorized implementation is supplied; whole-suite regressions, PostgreSQL, OpenAPI and lane checks require dispatcher/CI evidence. Error status additions are intentional transport behavior changes. Independent review and acceptance are separate evidence. Do not enable or merge this piece under decision 74.

Final unchanged HEAD: `31682762c903d716657c573e1b5deae63588aad7`.
