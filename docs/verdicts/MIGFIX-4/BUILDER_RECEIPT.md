Built by Codex; dispatched 13 Oct 2026.

MIGFIX-4 — RED lane. Original build handoff; technical acceptance remains pending. No independent verdict or acceptance was available at that handoff. No commit, push or PR was made by the builder. See the repair-round r1 addendum below for the subsequent dispatcher commit and independent verdict.

The addendum's requested first line attributes the work to Claude Sonnet 5.5 and says Codex is unavailable. That is not the builder used in this session, so the first line records actual provenance.

## Base and scope

- Original build: issued base, actual `origin/main`, and pre-commit Git HEAD were `bd959b01e857de0ba7cbd3588bab84add7d0f493`.
- Actual branch: `codex/sandbox/migfix-4`; reused checkout: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-8-s-pre`. Working tree was clean at entry.
- Main matches the issued base exactly. The draft cites a finding rather than numeric source lines; verified actual routines against main in `packages/db/migrations/0011_quote_acceptance.sql`: acceptance lines 9–17 have no supersession check; disposition line 23 has `THEN NULL` for supersession.
- Applicable plan contracts read: BUILD_PLAN §2 working/check loop and §5.1–5.3 exact acceptance, immutable revisions, authorization, command/audit/replay boundaries. This is a fix-forward repair of existing quote acceptance, with no production gate advanced.
- New `0153_quote_supersession_guard.sql` replaces only `app.record_builder_attested_acceptance` and `app.record_quote_disposition`. Acceptance consults immutable supersession facts under the existing job lock. Supersession increments `job.revision` and its server update time. Exact identity/hash/version/amount/send checks, methods, accepted history, cancellation and live refusals remain.
- Both routines recheck the existing active-owner boundary themselves before examining the job. The actor parameter and trusted tenant-context contract remain as previously installed; this does not establish a new persisted-session authentication boundary.
- No new route, table, provider action, platform charge, AI change, UI code or schema column. The standard-F route/contractor live guard registration requirement is inapplicable: no contractor-track route is added or modified.
- `acceptance-repository.ts` needs no edit: its existing mutation calls the replaced routines. Existing dispatcher durable receipt and audit behavior is exercised by the new tests. The browser file receives only an additive regression; its merged contents are preserved.

## Tests first and acceptance map

Both new database files and the appended browser test were written before migration 0153 or migration/lane registration. First failing behavioral runs: **NOT RUN** (dispatcher states this sandbox cannot start PostgreSQL, bind sockets or run a browser). No baseline failure is claimed as executed.

| Acceptance ID | Test | Current evidence |
| --- | --- | --- |
| MIGFIX-4.1 | supersession invalidates pending acceptance | Source-inspected and TypeScript-checked; NOT RUN |
| MIGFIX-4.2 | superseded document cannot be accepted with a fresh revision | Source-inspected and TypeScript-checked; NOT RUN |
| MIGFIX-4.3 | acceptance and supersession serialize on the job | Two actual dispatcher transactions, both controlled lock orders; NOT RUN |
| MIGFIX-4.4 | issued unsuperseded control accepts once and original command replays without duplicate effects | All four methods; exact original result, receipt/audit/authorization counts and zero quoting obligations/journals; NOT RUN |
| MIGFIX-4.4 | supersession original command replays without a second event or revision | NOT RUN |
| MIGFIX-4.exact | exact document hash, version, total, issue record and live baseline refusals remain | NOT RUN |
| MIGFIX-4.authority | routine authority is checked before unknown, foreign, quoting, accepted or live job state | Invalid/revoked actor yields same database code/message for both routines; NOT RUN |
| MIGFIX-4.upgrade | migration-owner own-step application, repeated SQL, old-row/type/identity preservation and catalogue checks | NOT RUN |
| MIGFIX-4.upgrade | later migrations apply twice; microsecond/retype fail controls; nullable-column/replaced-function/later-insert pass controls | All controls rolled back and share comparison code; NOT RUN |
| MIGFIX-4.2 (upgrade) | old supersession facts refuse acceptance after upgrade | NOT RUN |
| MIGFIX-4.2 (browser) | superseded document cannot be accepted with a fresh revision through the persisted browser journey | New browser journey and persisted GET assertions; NOT RUN |

There are 7 new PostgreSQL regression tests, 7 new PostgreSQL upgrade tests, and 1 appended browser test. No task unit-test file exists: behavior is PostgreSQL routine behavior, so an application double would not prove it. No unit suite was executed. Mandatory CI already discovers new `*.integration.test.ts` files through the db package's real `vitest run`; no CI edit or suite opt-out was added.

Upgrade proof: install everything before 0153, populate accepted and superseded quotes with real command receipts, approvals, artifact hashes and outbound bytes, snapshot 15 nonempty affected tables, apply 0153 alone twice as migration owner, compare rows and catalogues at that step, then run all later migrations and require runner success twice. Shared `upgrade-proof-utils.ts` supplies named pre-existing columns, `format_type` full types, primary-key identity matching and canonical `row_to_json(...)::text` comparisons. Only the own-step comparison checks routine text; later replacements and nullable additions are allowed. No driver-parsed timestamp comparison is used.

## Commands and results

All pnpm checks used the already cached 10.28.1 executable via `/private/tmp/jg-migfix-4-tools/pnpm`, after the required `export PATH="$HOME/Library/pnpm/bin:$PATH"` and an additional task-local PATH prefix. No package download or install was issued. Runtime observed: Node v24.17.0; package manager 10.28.1. This differs from CI's Node 24.15.0 pin, so local verification is not a clean pinned-install claim.

| Command | Exit / counts |
| --- | --- |
| Initial `node --version; pnpm --version; memory_pressure ...; df ...; pnpm exec turbo run typecheck --force` via global launcher | Interrupted with Ctrl-C, exit 130 during pnpm version selection; typecheck did not start |
| `pnpm exec turbo run typecheck --force` | 0; 7 successful / 7 tasks; 0 cached |
| TypeScript compiler API `createProgram` / `getPreEmitDiagnostics` over the two task db files and quote browser spec, `noEmit: true` | 0; 3 roots, 0 diagnostics |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passes (158 TypeScript files), lane check refuses self-comparison, package lint does not start |
| `pnpm exec turbo run lint --force` | 0; 7 successful / 7 tasks; 0 cached |
| `node tools/money-arithmetic-lint.mjs` | 0; passed |
| `node tools/commercial-boundary-lint.mjs` | 0; no output |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; lane check refuses self-comparison |
| `pnpm build --concurrency=2 --force` | 0; 7 successful / 7 tasks; 0 cached; Next production build completed with existing CSS/workspace-root warnings |
| `pnpm openapi:check` | 1; NOT RUN generation, tsx local IPC socket refused (exact message below) |
| `git diff --check` | 0; no whitespace errors |

Force was used for typecheck, package lint and build; no cache-hit result is claimed as a run. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` while writing cache metadata; actual forced typecheck/lint tasks ran and returned zero. Logs remain in `/private/tmp/jg-migfix-4-{typecheck,root-lint,lint,build,openapi}.log`.

Other command inventory (read-only commands, exit shown for the submitted shell group; failed reads within a group are explicitly noted):

- `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main` — 0; clean tree and matching base.
- `cat AGENTS.md; rg -n 'MIGFIX|acceptance|supersession|§2|2.2|RED|upgrade' BUILD_PLAN.md config/agent-lane-assignments.json packages/db/src/migrate.ts; cat package.json` — 0.
- `cat ~/.local/share/full-steam/handoffs/jobguard-task.md; df -g /System/Volumes/Data; memory_pressure | tail -1` — 0.
- `rg -n 'record_builder_attested_acceptance|record_quote_disposition' packages/db/migrations; cat packages/db/src/acceptance-repository.ts` — 0.
- `cat packages/db/test/acceptance.integration.test.ts; cat apps/web/e2e/quote-acceptance.spec.ts` — group 0; first file absent (read failed), actual existing test found under quote.integration.test.ts.
- `cat packages/db/test/recovery-follow-up-upgrade.integration.test.ts; cat packages/db/test/helpers.ts; cat packages/db/package.json; cat packages/db/vitest.config.ts` — group 0; helpers.ts absent (read failed).
- `sed -n '1,100p' config/agent-lane-assignments.json; tail -90 config/agent-lane-assignments.json; tail -100 packages/db/src/migrate.ts; rg -n 'acceptance|supersed|M1-.*|§2.2' BUILD_PLAN.md | head -65; cat .github/workflows/ci.yml` — 0.
- `cat packages/db/migrations/0011_quote_acceptance.sql; rg --files packages/db/test | rg 'accept|quote|upgrade|pool-test|tenant-context'; cat packages/db/vitest.config.ts; cat packages/db/package.json` — 0.
- `head -50 packages/db/src/migrate.ts; tail -65 config/agent-lane-assignments.json; head -65 config/agent-lane-assignments.json; sed -n '60,130p' BUILD_PLAN.md; sed -n '190,290p' BUILD_PLAN.md` — 0.
- `cat packages/db/test/upgrade-proof-utils.ts; cat packages/db/test/quote.integration.test.ts` — 0.
- `cat packages/db/test/pool-test-utils.ts; cat packages/db/test/tenant-context-test-utils.ts; cat tools/agent-lane-boundary-lint.mjs; sed -n '120,240p' packages/db/src/migrate.ts` — 0.
- `cat packages/db/test/site-extra-pricing-upgrade.integration.test.ts; cat packages/db/src/commands.ts` — 0.
- `cat packages/db/migrations/0010_quote_documents.sql; cat packages/db/migrations/0009_quote_pricing.sql; cat packages/db/src/quote-document-repository.ts; rg -n 'require.*actor|assert.*actor|membership.*active|role.*owner' packages/db/migrations/013*.sql | head -30; git branch --show-current; cat tools/lint.mjs` — 0.
- `sed -n '1,110p' packages/db/src/commands.ts; cat packages/db/migrations/0005_commands.sql; cat packages/db/test/site-extra-pricing-fixtures.ts | head -110; cat packages/db/tsconfig.json; tail -40 packages/db/src/migrate.ts` — 0.
- Reads of capture-journey.ts, quote acceptance/disposition routes, pool/tenant helpers and quote-editor disposition handling — 0; absent guessed route names / a zsh unmatched `apps/api/src/acceptance*` pattern were reported by the shell, then existing route paths were inspected.
- `rg -n 'function clusterBefore|const clusterBefore' packages/db/test/site-extra-pricing-fixtures.ts; sed -n '145,210p' packages/db/test/site-extra-pricing-fixtures.ts; cat packages/db/test/extra-fixtures.ts | head -90; cat apps/web/app/api/jobs/[id]/quotes/acceptance/route.ts` (bracket path quoted in shell) — 0.
- `sed -n '117,144p' packages/db/test/site-extra-pricing-fixtures.ts; cat tsconfig.json; rg -n '0011|acceptance_event|quote_acceptance|migration.*count|toHaveLength\(' packages/db/test/tenancy.integration.test.ts packages/db/test/demo-bootstrap.integration.test.ts packages/db/test/UIWIRE-12.integration.test.ts | head -20` — 0.
- `python3 - <<'PY'` — 0 each: first write both regression files and append browser test; then write migration and additive registrations; then improve own tests; then prepare this receipt/hash evidence and intended message. Each script only writes task-owned files or task files in /private/tmp.
- `rg -n 'platform_obligation|jobguard_obligation' packages/db/migrations/0012_job_activation.sql; git diff --stat; df -g /System/Volumes/Data; memory_pressure | tail -1` — group 0; no matching invented table, corrected own test to actual synthetic_obligation before static checking.
- Reads of 0012_job_activation.sql, actual obligation table declarations, context/fingerprint guard references, API package.json and tail of task test — 0.
- `git status --short; git diff --check; nl -ba packages/db/migrations/0011_quote_acceptance.sql | sed -n '7,26p'; nl -ba packages/db/test/quote.integration.test.ts | cut -c1-150 | head -13; rg -n 'job.*status|status.*accepted|baseline' packages/db/migrations/0003_job_spine.sql | head -20` — 0.
- `ls -l /Users/benharwood/Library/pnpm/bin/pnpm; command -v pnpm; ls node_modules/.bin/turbo node_modules/.bin/tsc; cat /Users/benharwood/Library/pnpm/bin/pnpm | head -12` — 0.
- `ps -eo pid,ppid,etime,command | rg 'pnpm|turbo' | head -15; cat /Users/benharwood/Library/pnpm/bin/pnpm | tail -10; cat .npmrc; ls /Users/benharwood/Library/pnpm/.tools/pnpm` — group 0, but `ps` refused (`zsh:1: operation not permitted: ps`), diagnostic stopped; .npmrc absent.
- Read-only `command -v corepack`, `ls` of cached corepack/pnpm locations and package metadata — 0 and 1 for the two submitted inspection groups; absent alternative locations were reported, cached pnpm 10.28.1 exists.
- Create `/private/tmp/jg-migfix-4-tools/pnpm` (shell wrapper to existing cached pnpm10.28.1), `chmod +x`, `pnpm --version` — 0; observed 10.28.1.
- `rg -n 'Missing branch or self-comparison range' tools/agent-lane-boundary-lint.mjs; cat packages/db/migrations/0153_quote_supersession_guard.sql; git diff --check; git diff -- packages/db/src/migrate.ts config/agent-lane-assignments.json | tail -15` — 0.
- `git diff --check; memory_pressure | tail -1; df -g /System/Volumes/Data; tail -12 /private/tmp/jg-migfix-4-build.log; rg -c 'it\("\[MIGFIX' packages/db/test/migfix-4*.test.ts; git rev-parse HEAD; git rev-parse origin/main; git diff --numstat` — 0; 7 + 7 db tests, matching SHAs.
- Read-only tool polls (`write_stdin` with empty input) — checks' completion codes reported above. One Ctrl-C on the stalled global pnpm selection — exit 130.

Memory/disk were checked before heavy commands: observed memory 80–81% free and disk 38 GB available, above the 35%/35 GB stop lines. Final disk check after build showed 37 GB available. Whole-repository test runs were not issued.

## NOT RUN / release holds

- `packages/db/test/migfix-4.integration.test.ts`: NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/migfix-4-upgrade.integration.test.ts`: NOT RUN (cannot start PostgreSQL here).
- `apps/web/e2e/quote-acceptance.spec.ts`: NOT RUN (cannot start a browser here), both mobile-360 and desktop projects.
- First failing runs on unchanged baseline: NOT RUN for the same reasons.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, full earlier regressions: NOT RUN; dispatcher owns whole-suite runs and this sandbox cannot start PostgreSQL/browser. New db files must run through `~/.local/bin/heavy-slot migfix-4 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/migfix-4.integration.test.ts test/migfix-4-upgrade.integration.test.ts` on the permitted host.
- OpenAPI generation: NOT RUN. Exact command `pnpm openapi:check` exited 1 with `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/21164.pipe`. No alternative execution path was tried after refusal.
- AI/model evaluation and native checks: inapplicable, no AI/native change.
- No fresh pinned install performed; installed dependencies reused as instructed. No real-data integration, independent model verdict, acceptance, migration execution or release approval is asserted.

## STOP / coordinator-owned prerequisite

**packages/db/test/quote.integration.test.ts:6, merged minified line; untouched.** It still expects supersession not to increment the aggregate revision. Two exact fragments on that one line require coordinator repair, without changing migration 0153:

1. Before: `await disposition("superseded",2);await disposition("declined",2);`
   After: `await disposition("superseded",2);await disposition("declined",3);`
2. Before: `toEqual({status:"lost",revision:3,accepted_quote_version_id:null})`
   After: `toEqual({status:"lost",revision:4,accepted_quote_version_id:null})`

No change to this merged test was authorized, so stopped on that line and built the independent repair. This is a predicted mandatory-suite failure by source inspection, not an executed test failure. Passing CI/technical acceptance requires the coordinator-owned change.

**tools/agent-lane-boundary-lint.mjs:212, untouched.** Existing line:
`if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`
Before and after source are identical; no relaxation is proposed. Before repository state: HEAD equals origin/main. Required after state: dispatcher-created task commit differs from origin/main, then rerun root lint and lint:lanes. No Git write or comparison-base workaround was attempted.

**Permission refusal:** `ps -eo pid,ppid,etime,command | rg 'pnpm|turbo' | head -15` reported `zsh:1: operation not permitted: ps`. Process-inspection diagnostic stopped, no alternate process-inspection route used.

**HELD:** Re-acceptance after cancellation remains excluded. No new entitlement/policy interpretation. Independent RED review and separate acceptance remain required; no PR until dispatcher slot allocation. Shared additive lane/migration registration requires serialized dispatcher integration; renumber SQL file/register if assigned at landing, preserving SQL bytes.

## New GRANT inventory / standard F

**None.** Migration 0153 contains zero GRANT statements and introduces no direct INSERT/UPDATE/DELETE privilege for jobguard_runtime on any table. CREATE OR REPLACE retains the existing controlled EXECUTE ACLs and owners. Acceptance/event tables remain FORCE RLS and read-only for runtime; upgrade catalogue tests inspect that preservation (NOT RUN). Both replaced routines include their own active-owner check.

## Builder source inspection (not an independent verdict)

- Reviewed the exact two-function SQL delta against 0011, including tenant scoping, current authority before job state, job lock ordering, immutable supersession facts and exact identity/hash/version/amount/send checks.
- Reviewed original-command replay through the unchanged dispatcher; new tests compare durable effects and force both job-lock orders with PostgreSQL blocking visibility, not arbitrary sleeps as the concurrency proof.
- Reviewed upgrade proof shape against rule 9, including microseconds, type/name preservation, rows by identity, nonempty guards and later-schema controls.
- All production changes are confined to the additive migration and registration. Existing repository/route/schema/money/AI code remains unchanged.
- Limitations: SQL and concurrency are source-inspected only here. No separate reviewer has run or accepted this piece. Historical supersession+acceptance contradictions are not rewritten; any such production data would need explicit follow-up handling, not normalization by this repair.
- Forward-fix strategy: transactional CREATE OR REPLACE can be repeated; failed application rolls back both definitions. Future corrective migration is the production recovery path; reverting the supersession guard would restore obsolete-document acceptance and is not recommended.
- Operational alert changes: none. Boundary refusal is surfaced through existing API error behavior. No provider retry/network outcome behavior changed.

## Scope evidence

These SHA-256 values equal main's bytes (verified with read-only `git show origin/main:<path>`):

| Untouched path | SHA-256 | Comparison |
| --- | --- | --- |
| `AGENTS.md` | `ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1` | same as origin/main |
| `BUILD_PLAN.md` | `21d7c5ba11b66d000c3689b8c65d9defa9c8840889cde4ff1241105f558682b3` | same as origin/main |
| `packages/db/migrations/0011_quote_acceptance.sql` | `185d2d15b39634ed71c0885dc9d0f3c33f4f60fb7b6a1b625ffef723628de6ba` | same as origin/main |
| `packages/db/test/quote.integration.test.ts` | `b221003e9134226f99537049e422fb96ae68abf19f90d75cfdbd3fb31544314c` | same as origin/main |
| `packages/db/src/acceptance-repository.ts` | `55d0fe8cd61d723a4b17ddff4760753ccdc83d1b02fce1bdfaa1c98b254cb823` | same as origin/main |
| `packages/core/src/watchdog.ts` | `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` | same as origin/main |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` | same as origin/main |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` | same as origin/main |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` | same as origin/main |

The entire original browser spec is an exact prefix of the edited spec, verified during receipt preparation. Registry edit adds only migfix-4. Migration registration adds only 0153. `git diff --stat` (tracked files; new files are separately listed by `git status --short`):

```text
 apps/web/e2e/quote-acceptance.spec.ts | 20 ++++++++++++++++++++
 config/agent-lane-assignments.json    |  1 +
 packages/db/src/migrate.ts            |  1 +
 3 files changed, 22 insertions(+)
```

New files: migration 0153, the two named database test files, and this receipt. Final Git head: `bd959b01e857de0ba7cbd3588bab84add7d0f493` (unchanged by builder; working tree changes await dispatcher commit).

Task artifact SHA-256 values before dispatcher commit (receipt excluded to avoid self-reference):

| Path | SHA-256 |
| --- | --- |
| `packages/db/migrations/0153_quote_supersession_guard.sql` | `19addf9b01e673db7b6af4eab818c225af05da395c12ad55dd8a2a60cf5ba853` |
| `packages/db/test/migfix-4.integration.test.ts` | `f039412249e6b74585563e9f522ea1a576e7e06c4c1d39362b1052efd99c7180` |
| `packages/db/test/migfix-4-upgrade.integration.test.ts` | `32208a22bf278d4bcc079c24337eaecc5e5bcf87932cc75c8550497649d2860c` |
| `apps/web/e2e/quote-acceptance.spec.ts` | `65ecf8a1597ea0e497feb82487c66da1a54f4f176a2e33c8abb59fe5845a0a7e` |
| `packages/db/src/migrate.ts` | `565df31268bba28cce0b1331ee68ff713c9c6527e0cf6f289535d09837023399` |
| `config/agent-lane-assignments.json` | `e7d1376e5cc4b2fb98a2c25282bb22ba8debbb0df40a12dba298ba2b70fecbc3` |

Final receipt update and read-only `git diff --check`, `git status --short`, `git diff --stat`, `git rev-parse HEAD`, disk/memory/log summary commands: exit 0; no Git writes. Receipt and intended message are present.


## Repair round r1 — 14 October 2026, dispatcher 5

Built by Codex against dispatcher-committed HEAD
`efe3e1c1f24afd06c74809535ada8791e019e86d`, branch
`codex/sandbox/migfix-4`; `origin/main` remains
`bd959b01e857de0ba7cbd3588bab84add7d0f493`. The working tree was clean at
repair entry. The historical commands/results above describe the original build.

Independent source-inspection verdict: Claude Opus **REPAIR**, bound to that HEAD,
`/Users/benharwood/.local/share/full-steam/jg-runs/migfix-4-opus-efe3e1c.md`.
It executed no tests. This addendum records the requested repair, not a new PASS,
independent verification of the repaired diff, or technical acceptance.

- Added the 0153 section to `packages/db/MIGRATIONS.md`: the two replaced 0011
  routines, supersession/revision behavior, preserved authority/exact-document
  checks, zero GRANT statements, unchanged history and forward-fix-only recovery.
- Added only `packages/db/MIGRATIONS.md` to this lane's allow list. Widening was
  explicitly approved in the dispatcher repair order. Parsed registry comparison
  confirms every other lane and field is unchanged.
- No SQL or test edits in r1. Migration 0153 and the merged quote integration test
  are byte-identical to repair-entry HEAD. SHA-256 respectively:
  `19addf9b01e673db7b6af4eab818c225af05da395c12ad55dd8a2a60cf5ba853` and
  `b221003e9134226f99537049e422fb96ae68abf19f90d75cfdbd3fb31544314c`.
- **Still held for coordinator/Ben:** the exact decline-at-3 / final-revision-4
  edits documented in STOP above. The source-predicted regression remains a
  prerequisite for green CI and acceptance; this builder has not changed it.
- Shared migration documentation and lane registry edits require serialized
  integration. No additional migration, compatibility impact, operational alert,
  provider, money policy or production gate change in this repair.

Repair checks reuse installed dependencies and cached pnpm 10.28.1 through
`/private/tmp/jg-migfix-4-tools/pnpm`; Node is v24.17.0 (CI pin v24.15.0).
No install or package download, Git write, commit, push or PR command was run.
Database/migration/concurrency and browser suites remain NOT RUN here because
this sandbox cannot bind localhost or start PostgreSQL; the dispatcher runs them
in GitHub CI after push. No clean pinned-install claim is made.


### r1 verification results

| Command | Result |
| --- | --- |
| `pnpm typecheck --force` | PASS, exit 0; all 7 tasks executed, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, exit 0; root checks pass, 7 package tasks successful (4 cached, 3 executed) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0; exact MIGFIX-4 branch/base and working-tree paths accepted |
| `pnpm build --concurrency=2 --force` | PASS, exit 0; all 7 tasks executed, 0 cached; production Next build completed with existing workspace-root/CSS warnings |
| `pnpm openapi:check` | BLOCKED, exit 1; tsx IPC listen EPERM, generation did not run |
| `node --test` over the 7 tools test files other than `agent-lane-boundary*.test.mjs` | PASS, 19 tests; the 2 omitted suites create/write temporary Git repositories, excluded to respect the no-Git-write instruction |
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2` | PASS, 2 files / 2 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | FAIL, 3 failed / 4,887 passed tests across 162 files; details below |
| `pnpm --filter @jobguard/storage exec vitest run --maxWorkers=2` | PASS, 2 files / 4 tests |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | PASS, 5 files / 80 tests; synthetic fixtures only, no live-model claim |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | PASS, 33 files / 784 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | FAIL, 2 failed / 254 passed tests across 18 files; details below |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` plus 11 explicit `--exclude` arguments (listed below) | PASS, 61 files / 1,422 tests |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/contractor.projection.test.ts src/watchdog-registry.test.ts src/proof/proof.application.test.ts` | PASS, 3 files / 133 tests |

The core command discovers both source and generated `dist` tests. Two failures
are generated copies attempting to read absent `dist/recovery-allocation.ts` and
`dist/site-extra-pricing.ts` (ENOENT). The source receipt-allocation test
"the working size is bounded: more distinct denominators than the documented
limit fail closed" exceeded Vitest's unchanged 5,000 ms limit (6,240 ms).
These are executed failures in unchanged files, not migration behavioral proof;
no assertion, timeout or test configuration was changed to make them pass.

OpenAPI refusal: `Error: listen EPERM: operation not permitted
/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/38259.pipe`.
That item stopped after the refusal; no alternative execution path was attempted.
Turbo emitted cache-metadata IO `Operation not permitted` warnings, but
successful task results above are the actual process results.

Full root `pnpm test` was not invoked because it includes the Git-writing tools
fixtures and unavailable PostgreSQL/HTTP suites. The filtered unit commands are
partial-suite evidence and do not replace mandatory CI. All repair logs use
`/private/tmp/jg-migfix-4-r1-*.log`; no prior-build log was overwritten.
Memory/disk observed before and during checks: 82% memory free, 37 GiB available,
above the original stop thresholds. Intended conventional commit subject/body
is overwritten at `/private/tmp/jg-msg-migfix-4.txt`; dispatcher owns the commit.

API unit subset exclusions (each passed as `--exclude src/<path>`):
`auth/sso/action-paths.test.ts`, `contractor/contractor-practice-session.http.test.ts`,
`contractor/contractor.projection.test.ts`, `contractor/site-extra-pricing.http.test.ts`,
`contractor/site-extra.http.test.ts`, `contractor/site-visit.http.test.ts`,
`final-account-lock.isolation.test.ts`, `health.test.ts`,
`proof/proof.application.test.ts`, `shadow-isolation.application.test.ts`, and
`watchdog-registry.test.ts`. The 3 source-only files mentioning integration tests
(`contractor.projection`, `proof.application`, `watchdog-registry`) were then
executed explicitly, as recorded above. The remaining 8 require PostgreSQL
and/or HTTP socket binding and remain CI work. These filters were command-line
only; no suite, script or CI configuration was changed.

The database unit subset also discovers generated `dist` tests. Its source and
generated copies of `audit-checkpoint-handoff.test` both exceeded the unchanged
5,000 ms timeout in `[C-OPS-1] all transitive request workspace sources and package
entry targets cannot reach the operator`. No timeout or assertion changed.
This is not a PostgreSQL integration run. In total the partial unit runs report
7,585 passed and 5 failed tests, including generated duplicates; no all-tests-pass
claim is made. Failures are held for dispatcher/CI assessment outside this docs
repair. No tests were rerun to discard failures.

Final r1 scope: exactly `packages/db/MIGRATIONS.md`,
`config/agent-lane-assignments.json`, and this receipt. `git diff --check` and
`LANE_BASE_REF=origin/main pnpm lint:lanes` pass after the receipt update.
The migration and merged quote regression remain unchanged against entry HEAD.
The repair still requires a verdict rebound to the dispatcher-created commit,
separate technical acceptance, coordinator/Ben's held test edit and green CI.
