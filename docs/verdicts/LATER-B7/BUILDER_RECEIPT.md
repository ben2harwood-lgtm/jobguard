Built by Codex (GPT-6); dispatched 13 Oct 2026, built 16 Oct 2026.

# LATER-B7 builder receipt — partial evidence, PARK

The addendum requested the first line “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026”. That label would misidentify this builder; the actual author is recorded above. This is a builder run receipt, not an independent verdict or acceptance.

## Authority and base

- Branch: `codex/sandbox/later-b7`; worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/later-b7`.
- Issued base: `ca435eeb5791638c787c830d6ba717146f694539`; older draft base: `0bbb5ddb`.
- Actual initial HEAD and `origin/main`: `4c407a6c81bd714a6875b7adf995812381d0fe57`. Main wins over both older bases.
- During the run, another actor advanced `origin/main` to `7ff452eeec1c523345d34715adfa3f8310062013`. Read-only comparison found no changes between HEAD and that main in the cited projection, BUILD_PLAN, shell assertions or JobPartiesRepository. No Git write or refresh was performed.
- `BUILD_PLAN.md:109`, C1, still requires authoritative state and persisted reads after refresh and in a second context. `BUILD_PLAN.md:107` is still the inherited Done-when heading.
- Main's `synthetic-server.ts:41–45` still infers `Q-1007` / delivered and `Q-1008` / queued from titles. This premise was source-inspected and reproduced by the first unit run.
- Decision 74 applies: synthetic construction only, then RED independent checks and PARK. Nothing is accepted, merged, enabled or deployed by this receipt.

## Change and acceptance evidence

Only the four allowed code/test paths plus this receipt and the ledger were changed. No migration, new grants, command, access-policy change, screen change or external adapter action was introduced.

`syntheticWorkspace` authenticates the persisted session, uses the existing `JobPartiesRepository.list` authorization and ownership projection, then reads documents only for that tenant and those job IDs under `withTenant`. This also supplies summaries for captured/adopted jobs already exposed by the existing jobs endpoint. There is no title-based document inference or response interception.

The latest immutable quote version uses its own latest send identity, hash and outbox state. A newer unsent preview cannot inherit a previous version's delivery. An issued customer invoice takes precedence over a quote and uses its persisted invoice number and authorization-bound outbox artifact. These are reversible summary selection details within the existing quote/invoice response contract. No new source-ID fields were added to that contract.

No stored document gives `none / null / not_sent`. A stored preview without a send gives `quote / stored reference / not_sent`. Pending/executing/retryable map to queued; unknown outcome remains outcome_unknown; cancelled, terminal failure, absent send outcome and unfamiliar states remain unknown because the existing contract has no failed state. Real delivery requires a persisted delivered event. In this synthetic-only function, succeeded `fake_quote_delivery` / `fake_invoice_delivery` records map to the existing delivered enum, matching their existing simulated-delivery semantics. Provider success on another adapter alone is insufficient.

| ID | Assertion / evidence | Status |
| --- | --- | --- |
| L143-1 | Title alone cannot create Q1007 or delivered; no document means no summary | Unit passed; DB/browser written, NOT RUN |
| L143-2 | Persisted identity/reference and delivery survive a title change | Unit passed; DB written, NOT RUN; browser reload coverage written |
| L143-3 | Unknown, queued and delivered remain distinct | 11 unit state cases passed; DB transitions and browser queued/delivered written, NOT RUN |
| L143-4 | Source IDs/reference and persisted state agree | Unit reference association passed; DB exact document/send/outbox join and new-preview isolation written, NOT RUN |
| L143-5 | Failed projection cannot become a successful empty summary | Unit passed |
| L143-6 | Reload/second authorized reader retain data; another practice session cannot see it | DB/browser written, NOT RUN |

The new DB suite runs the exact production projection with real PostgreSQL authentication/repositories; only Next request infrastructure is substituted in a TypeScript/VM loader. Fixture quotes use the existing draft, preview, command and fake executor/reconciliation paths. The new browser spec uses real requests and existing UI commands, a second context with the same session, and a separate session. It does not fabricate a successful business response. Both existing Playwright projects discover it; existing CI uses one worker (within the two-worker limit).

## Tests first and verification

All three test files were created before the production change. The PostgreSQL fixture was subsequently corrected to explicitly supply fictional customer/site details through the existing fixture helper; its run remains NOT RUN.

First executed unit run, before production change:

```text
pnpm exec vitest run app/lib/later-home-documents.test.ts --maxWorkers=2
cwd: apps/web
exit 1; 1 test file failed; 14 tests failed, 1 passed (15 total)
L143-1 received quote/Q-1007/delivered and quote/Q-1008/queued
where none/null/not_sent was expected.
```

After production change, same command: exit 0; 1 file passed; 15/15 tests passed. Unit adapters are not evidence of database integration or live delivery.

All pnpm commands put `export PATH="$HOME/Library/pnpm/bin:$PATH"` first. Installed Node is `v24.17.0`; the installed pnpm launcher is `11.8.0`, while the repository pins `10.28.1`. No package was intentionally installed or downloaded and no pin/lockfile was edited. The launcher initially attempted automatic version handling; interrupted runs are recorded below. Its automatic dependency check then attempted an install which failed the pinned-engine check before changing the working tree. Subsequent commands used these environment settings, derived from installed launcher source, to prevent version downloads and installs while using existing dependencies:

```sh
export PNPM_CONFIG_PM_ON_FAIL=ignore
export PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
export TURBO_ENV_MODE=loose
```

The loose environment passes these no-download/no-install settings to Turbo's child scripts; no repository configuration changed. This is not clean pinned-install evidence. CI must use the pinned package manager.

| Executed verification command | Exit / counts / outcome |
| --- | --- |
| `pnpm exec turbo run build --filter=@jobguard/api... --concurrency=2` (initial launcher) | Interrupted, exit 130; no task results |
| `pnpm --manage-package-manager-versions=false --package-manager-strict=false --version` | Interrupted, exit 130; old options did not prevent pnpm 11 version handling |
| `pnpm --pm-on-fail=ignore --version` | 0; 11.8.0 |
| Dependency build with only `npm_config_pm_on_fail=ignore` | Interrupted, exit 130; no task results |
| `pnpm --version && pnpm exec turbo run build --filter=@jobguard/api... --concurrency=2` with PNPM_CONFIG_PM_ON_FAIL | 1; version 11.8.0, automatic install refused by expected 10.28.1 / got 11.8.0 engine check |
| Dependency build with both PNPM_CONFIG settings, strict Turbo environment | Interrupted, exit 130; child version handling stalled |
| Dependency build with both settings and TURBO_ENV_MODE=loose | 0; 6/6 tasks executed, 0 cached; dependencies built before unit runs |
| `pnpm --filter @jobguard/web exec vitest run app/lib/later-home-documents.test.ts --maxWorkers=2` | 1; pinned-engine check, no tests executed |
| `pnpm exec vitest run app/lib/later-home-documents.test.ts --maxWorkers=2`, cwd apps/web, before change | 1; 14 failed / 1 passed |
| Same unit command after change | 0; 15 passed |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 tasks executed; 0 cached; --force used |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 tasks executed; 0 cached; --force used |
| `pnpm build --force --concurrency=2` | 1; pinned-engine check before build; no build result |
| `pnpm exec turbo run build --force --concurrency=2` | 0; 7/7 tasks executed; 0 cached; --force used; equivalent installed-dependency build, not a pinned pnpm run |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` (twice) | 1 each; lane absent, exact refusal below |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; pinned-engine check |
| `git diff --check` (inspection and post-change checks) | 0; no whitespace errors |
| `pnpm exec tsx src/generate-openapi.ts --check`, cwd apps/api | 1; tsx IPC socket refused before generator verification; stopped, no alternate route |
| `LANE_BASE_REF=origin/main node tools/lint.mjs && git diff --check` | 1; core purity passed for 190 TypeScript files, then missing lane stopped root lint; chained diff check did not execute in this invocation |

Turbo also printed `WARNING IO error: Operation not permitted (os error 1)` while writing its shared cache. The tasks continued. No alternate cache write location or cache-permission change was attempted. Forced checks executed their task bodies; no cache-hit result is claimed as a run.

The forced web build completed with existing CSS/autoprefixer, Nest dependency and multiple-worktree-lockfile warnings. No UI/package/configuration changes were made to address adjacent warnings.

NOT RUN:

- `packages/db/test/later-home-document-projection.integration.test.ts`: cannot start PostgreSQL / bind sockets here; dispatcher explicitly prohibited running it. Initial failing DB run: NOT RUN for that reason.
- `apps/web/e2e/later-home-documents.spec.ts`: browser/Playwright forbidden here; CI headless in the two existing projects. Initial failing browser run: NOT RUN for that reason.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: full suites forbidden by dispatcher memory/sandbox limits; no migration in this piece.
- `pnpm test:e2e`: browser/sockets forbidden. Existing browser assertions require coordinator action before the full suite can pass.
- OpenAPI comparison: NOT COMPLETED. The attempted tsx command failed before verification because its IPC socket could not listen. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/51170.pipe`. No alternate OpenAPI execution route was attempted.
- Live providers, real data, real spending and outward actions: excluded from this task. No live integration claimed.

## STOP / coordinator-owned prerequisites

1. `config/lanes/later-b7.json:1` is absent in the working tree and inspected main. Before: absent. Required after: coordinator registration for branch `codex/sandbox/later-b7`, key `later-b7`, the exact six allowed paths and receipt. No lane file or shared pinned list was changed. Enforcement is at `tools/agent-lane-boundary-lint.mjs:116`, left unchanged:

```text
Lane boundary FAILED: Branch "codex/sandbox/later-b7" must match exactly one registered lane; found 0. Register the task before building.
```

2. `apps/web/e2e/shell.spec.ts:48`, existing merged assertion; left unchanged. Its expected value conflicts with L143-1. Before:

```ts
  await expect(live).toContainText("Q-1007 · Sent");
```

Required after (coordinator only):

```ts
  await expect(live).toContainText("None yet · Not sent");
```

3. `apps/web/e2e/shell.spec.ts:51`, existing merged assertion; left unchanged. Before:

```ts
  await expect(page.getByRole("article").filter({ hasText: "Loft conversion" })).toContainText("Waiting to send — not sent yet");
```

Required after (coordinator only):

```ts
  await expect(page.getByRole("article").filter({ hasText: "Loft conversion" })).toContainText("None yet · Not sent");
```

No fabricated document fixtures were added to satisfy either merged assertion. These lines were not edited, the assertions were not bypassed, and their suites were not run.

4. Pinned verification environment: package.json's pnpm engine is unchanged. The exact root build, filtered unit and pnpm lane commands refuse installed 11.8.0; dispatcher/CI must supply 10.28.1. No pin was weakened.

One read-only diagnostic was refused: `ps -Ao pid,ppid,etime,command | rg '(pnpm|turbo)' | head -25` returned `zsh:1: operation not permitted: ps`. That diagnostic item stopped; no alternate process-list route was attempted. This was a sandbox refusal, not an automatic approval-review rejection.

## Builder inspection (not an independent review)

Affected invariants: authoritative persisted projections (C1), tenant/session ownership (§5.1), immutable document identity (§5.2), truthful send/unknown state (§5.4), and synthetic-only/no-charge behavior (§5.10). No financial facts or authorization records are written by the projection. No grants were added. Standard F: **no new direct INSERT, UPDATE or DELETE grant to jobguard_runtime**; no migration, so the migration GRANT list is empty. The DB test creates a synthetic test login inheriting the existing runtime role; it adds no table privilege.

Backward compatibility: response shape is unchanged; invented references disappear, captured/adopted jobs gain persisted summaries, and issued invoices use their stored identity. Existing fake delivery semantics remain synthetic. No new operational alerts or migration/rollback steps; reverting this projection is a code-only rollback, though it would restore the reported defect.

Limitations: DB/browser suites are source-inspected only, not test-executed or independently verified. The invoice branch has unit coverage but no executed PostgreSQL proof here. Full suite, pinned install/build, coordinator test repairs, lane registration, RED two-model checks and separate acceptance remain outstanding. No acceptance is claimed.

## File evidence and final head

Git diff --stat includes tracked changes only; new files are separately enumerated and hashed. This receipt is not hashed into itself. `git status --short` showed exactly one tracked modification and five new files/directories, all inside the six allowed paths:

```text
 M apps/web/app/lib/synthetic-server.ts
?? apps/web/app/lib/later-home-documents.test.ts
?? apps/web/e2e/later-home-documents.spec.ts
?? docs/ledger/LATER-B7.md
?? docs/verdicts/LATER-B7/
?? packages/db/test/later-home-document-projection.integration.test.ts

 apps/web/app/lib/synthetic-server.ts | 57 +++++++++++++++++++++++++++++++-----
 1 file changed, 49 insertions(+), 8 deletions(-)
```

New code/tests: 85 unit-test lines, 112 database-test lines, 60 browser-test lines. Ledger: 9 lines. No existing merged test, shared guard/harness, migration, pin, fingerprint or lane register was modified.

SHA-256 from `shasum -a 256` (exit 0):

```text
2324ce43bbdd2283720255e86a6bb2c8f2bc1f4b3f2f33136bf76d8e701a6bbc  apps/web/app/lib/synthetic-server.ts
302aac65d0987ee84453399fe1ce6d7dc388f93454a6ee43991cd0bb876da6f7  apps/web/app/lib/later-home-documents.test.ts
8e0a6d56af057f56566db589385f17407018fc43cfd50bae413366ec34a95037  packages/db/test/later-home-document-projection.integration.test.ts
7e841514f1fc5b496affbdb9c33066f77cced46e7ad1f1e7b160b26a28eae9d1  apps/web/e2e/later-home-documents.spec.ts
e4e48c7b22b2fba7b948b60ccfc79b42e63e8eb519b818e25d18af76c0aa3e59  docs/ledger/LATER-B7.md
```

Unchanged coordinator-owned files: both `shasum` of the working file and `git show HEAD:<path> | shasum -a 256` (exit 0 each) returned:

```text
f47769eb5494a191de2b52be1a48928961abc7957c112a80fb47ab3630cd06dc  apps/web/e2e/shell.spec.ts
99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e  config/agent-lane-assignments.json
```

Final resource probe: `memory_pressure | tail -1` reported 76% free; `df -g /System/Volumes/Data` reported 39 GB available. Earlier pre-heavy probes reported 72–76% free and 40–41 GB available, all above the dispatcher's thresholds. No tests ran concurrently, and no test run contained more than the one owned unit file.

## Read-only inspection command inventory

The verification commands and interrupted command exits are listed above. These additional shell reads informed implementation; none are test passes. Pipeline counts are file/line output only, not test counts. `&&` stopped on each indicated failure; later terms in such a chain were not run.

| Command / inspection | Exit |
| --- | --- |
| `pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat config/lanes/later-b7.json` | 1; clean worktree, refs read; lane file absent |
| `cat AGENTS.md && sed -n '1,240p' apps/web/app/lib/synthetic-server.ts && cat package.json` | 0 |
| `sed -n '1,220p' BUILD_PLAN.md && cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 0 |
| `cat apps/web/app/lib/synthetic-server.ts` | 0 |
| `cat package.json && cat apps/web/package.json && cat packages/db/package.json && rg -n 'Inherited Done|No localStorage|L143|pkg-lib-86|document summar' BUILD_PLAN.md` followed by `rg --files config/lanes apps/web/app/lib apps/web/e2e packages/db/test` filtered for later/synthetic/practice/home/vitest/playwright paths | 0 |
| `cat tools/agent-lane-boundary-lint.mjs`, targeted document/delivery/quote search across web library servers/tests, memory/disk probe | 0 |
| Targeted quote/document/delivery search including unquoted `packages/db/src/*projection*` | 1; zsh no matching files; later commands not run |
| `cat packages/db/test/practice-facts.integration.test.ts && cat apps/web/e2e/practice-session.spec.ts && cat apps/web/playwright.config.ts` | 1; second path absent; third not run |
| Source/e2e file inventory, document projection search across DB/API/web and lane-register search | 2; absent workspace glob paths during search; no mutation |
| `cat apps/web/app/lib/contracts.ts && cat packages/db/src/quote-delivery-repository.ts && cat packages/db/src/quote-repository.ts` | 0 |
| Playwright configuration / session-spec inventory / pool helpers / practice-session integration source reads | 0 |
| `rg -n 'syntheticWorkspace|JobSummary|delivery:' apps/web/app`, targeted preview/ownership search including absent `packages/db/test/quote-delivery.integration.test.ts` | 2; missing path |
| `cat apps/web/playwright.config.ts && cat apps/web/vitest.config.ts && cat packages/db/vitest.config.ts && sed -n '1,100p' packages/db/src/practice-session.ts && cat apps/web/app/api/jobs/route.ts`, e2e inventory and branch read | 0 |
| `sed -n '1,115p' apps/web/e2e/m1-6-quote-delivery.spec.ts` with chained helper reads | 1; absent path, chained reads not run |
| Session/delivery test inventory, first 95 practice-session integration lines, first 100 e2e setup lines, capture-journey helper read | 0 |
| Job-parties list search, document/outbox table definition search, quote-send browser test search/read | 0 |
| Job-parties repository, invoice repository, pool-helper, quote-document/outbox migration, SBOX session browser source reads | 0 |
| Invoice migration/source probes, first 75 demo-seed lines, pool helper and TypeScript/Turbo configuration reads | 0 |
| Web server-only test search, invoice migration read, demo-seed readSyntheticDemo search | 1; no match in demo-seed, chained reads not run |
| Recovery-case route-test read, actual readSyntheticDemo source search, initial ownership migration home-title search, workspace-server read | 0 |
| Demo-runtime first 73 lines, tenant-context test helper, party trigger/export searches, actual quote preview/delivery route reads | 0 |
| Quote integration fixture search/read then absent `apps/api/src/quote.application.ts` search | 2; real application was subsequently found under quote/ |
| Memory/disk probe, actual quote application/controller search, first ownership-migration lines | 0 |
| `command -v pnpm && ls -l "$HOME/Library/pnpm/bin" && node --version && ls -l node_modules/.bin/turbo && git status --short` | 0 |
| pnpm launcher read, `ps -Ao pid,ppid,etime,command` diagnostic pipeline and distribution-directory checks | 1; ps denied, absent dist paths; process diagnostic stopped |
| `cat .npmrc` with chained pnpm-cache inventory | 1; absent .npmrc; later inventory not run |
| pnpm-cache file inventory filtered for pnpm scripts/manifests | 0 |
| `type -a pnpm && ls /opt/homebrew/bin/pnpm /opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm` with chained launcher-source search | 1; alternative paths absent, chained search not run |
| Installed pnpm 11 shim read, installed-version directory list, local TypeScript package list, root tsconfig read | 0 |
| Installed pnpm distribution configuration search, root binary list, API package manifest read | 0 |
| Installed pnpm distribution lines 304805–304915 and package-manager configuration search | 0 |
| Installed pnpm distribution lines 305205–305275 and pmOnFail search | 0 |
| Installed pnpm environment-variable parsing search | 0 |
| Turbo/tsc shim first 25 lines and core dist existence probe | 1; dist absent before dependency build completed |
| Installed pnpm verify-deps setting search, git status, memory/disk probe | 0 |
| Installed pnpm distribution lines 248200–248235 and 146390–146425 | 0 |
| Migration issuer search, post-change `git diff --check`, `git diff --stat`, numbered projection read | 0 |
| Issuer/home migration searches, dependency symlink/configuration/CI reads, lane check | 1; unmatched 02* glob reported, lane check refused |
| Home/issuer migration search and explicit DEMO constant-name search of index.ts | 1; names re-exported via export-star, chained reads not run |
| Actual demo export search, generated-job-party migration lines 196–240, lane tool lines 126–134, main projection lines 29–50, build-plan lines 107–111 | 0 |
| Browser reference/state search, root lint script read, lane refusal-line search, git status | 0 |
| Shell-spec lines 37–56, synthetic-party-fixture source, HEAD/main refs, diff numstat and diff check | 0 |
| `git diff HEAD origin/main -- apps/web/app/lib/synthetic-server.ts BUILD_PLAN.md apps/web/e2e/shell.spec.ts packages/db/src/job-parties-repository.ts && git show origin/main:config/lanes/later-b7.json` | 128; comparison empty; lane absent on main |
| Final `git status --short`, `git diff --stat`, `git diff --check`, HEAD/main refs, seven file hashes, memory/disk probe | 0 |
| `git show HEAD:apps/web/e2e/shell.spec.ts` piped to `shasum -a 256` | 0 |
| `git show HEAD:config/agent-lane-assignments.json` piped to `shasum -a 256` | 0 |
| `wc -l` for the three owned tests/ledger, then repeated scoped HEAD-to-main comparison | 0; 266 total lines; comparison empty |
| Final `git diff --check && git status --short && git diff --stat && git rev-parse HEAD && git rev-parse origin/main`, followed by the five changed-file hashes and `wc -l /private/tmp/jg-msg-later-b7.txt` | 0; same six allowed paths, same hashes/refs/stat; intended commit message exists, 10 lines |

All file edits were made through successful `apply_patch` calls: tests first, production change, fixture correction, receipt/ledger/intended-message creation, and receipt completion. No Git write command, delete command, database process or browser was run. Polling/cancelling the listed sessions used the execution tool's session controls; each cancellation returned exit 130 as recorded above.

Final builder HEAD (no commits): `4c407a6c81bd714a6875b7adf995812381d0fe57`.
