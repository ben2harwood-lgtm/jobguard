Built by Codex; dispatched 13 Oct 2026. LATER-B17 / RED / PARK / PARTIAL.

The addendum's requested Claude Sonnet attribution is inaccurate for this run; Codex performed this work. No independent verdict or acceptance is claimed. Decision 74 requires this piece to stay parked, without merge, enablement or deployment.

## Baseline and contracts

- Branch: `codex/sandbox/later-b17`; initial working tree clean.
- HEAD and local `origin/main`: `31682762c903d716657c573e1b5deae63588aad7`. This supersedes both the issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb` bases. Main wins. No fetch, commit, staging, push or branch write was performed.
- Read repository `AGENTS.md` and the standing handoff. Applicable `BUILD_PLAN.md` references remain at 391 (M1-13), 408 (UIWIRE-13), 3825 (historical-only rows), 3845–3848 (proof/allocation/reversal), and 3863–3900 (v1 formula and paid-plan credit).
- Current defects verified in the actual sources: demo repository lines 12–14; approval port line 22 before edits; `0018_recovery_outcomes.sql:68–74`; `0097_recovery_case_current.sql:60`; existing recovery integration test line 340.
- Scope is historical `reference_fee_policy_v1` synthetic records. Production fees, v3 allocation/eligibility and contractor behavior are outside this change.

## Acceptance accounting

| ID | Implementation / evidence | Status |
| --- | --- | --- |
| L099 | Atomic landing, derivation, journal, durable receipt and audit | STOP: authority bridge and merged fixture prerequisites below |
| L100 | Exact command replay with changed job/selection/payload conflicts | STOP: same authority prerequisite; no new protected write path |
| L104 | Parse one strict complete envelope, including all three posting IDs; retain unknown-field refusal | Built; 13 unit cases pass; 1 PostgreSQL case added, NOT RUN |
| L105 | Isolated valid prerequisites reaching each named guard | STOP at merged `packages/db/test/recovery.integration.test.ts:340`; unchanged |
| L106 | Cumulative partial reversal recomputation | STOP: checked-routine authority requires coordinator-owned fixture changes |
| L107 | Paid-plan rule on reversal | STOP: same prerequisite; no policy change |
| L108 | SQL refuses eligible net above allocated settled gross | STOP: same prerequisite; no partial boundary-only fix presented as structural enforcement |
| L119 | Read `posting_delta_pence` instead of `liability_pence` for additional fee | Built; 4 unit cases pass; 1 PostgreSQL case added, NOT RUN |

17 unit cases total. Existing expectations and numbers were preserved. No migration 0191, migration note or upgrade proof was created: the SQL portion is stopped, not completed. Fresh/upgrade behavior remains unverified.

## Changes and implementation choices

`recovery-repository.ts` extends the existing core command schema with its own UUID schema for the posting identities, then parses once with strict unknown-field handling. The original split parse rejected every otherwise-valid complete envelope. Reusing the core schema's UUID avoids combining the two installed Zod versions' incompatible generic types. The exported posting-ID schema keeps its previous behavior.

`recovery-demo-repository.ts` selects and returns the immutable derivation's posting delta. This fixes a displayed amount after prior postings without changing the v1 formula or writing financial history. No UI text or screen changes.

The new pure tests exercise the real repository methods through pool doubles: complete forwarding, rejection before connecting, failure rollback/release, positive/zero/full deltas and unapproved selection. They do not prove database atomicity, audit rollback, role checks or RLS. Two separate integration cases use real PostgreSQL and made-up historical fixtures: one posts the full envelope; one posts 150,000p followed by 15,000p and expects the second delta to be 1,500p against 16,500p cumulative liability. They have not run here.

## STOP records — no coordinator-owned file changed

1. Lane registration: `config/lanes/later-b17.json:1` is absent; `config/agent-lane-assignments.json` has no `later-b17` entry. Before: file absent / entry absent. After: unchanged. Required coordinator action: register the issued branch and exact allowlist. The lane command also refuses because HEAD equals origin/main; no false comparison base was substituted.
2. Authority bridge: `apps/api/src/workspace/recovery.application.ts:3` authorizes through `PracticeAccess` but does not pass that persisted session into `RecoveryDemoRepository`. Before (entire current line):

```ts
export class RecoveryApplication{ private readonly access: PracticeAccess; private repo;constructor(pool:Pool, sessionId?: string){this.access = new PracticeAccess(pool, sessionId);this.repo=new RecoveryDemoRepository(pool)}private out(guard:Awaited<ReturnType<RecoveryDemoRepository["read"]>>){return{version:1 as const,environment:"synthetic_demo" as const,guard}}async read(id:string){const practice = await this.access.job(id);return this.repo.read(id).then(x=>this.out(x))}async select(id:string,raw:unknown){const practice = await this.access.job(id);const x=recoveryScenarioCommandV1.parse(raw);return this.repo.select(id,x.commandId,x.scenario).then(y=>this.out(y))}async approve(id:string,raw:unknown){const practice = await this.access.job(id);const x=recoveryApprovalCommandV1.parse(raw);return this.repo.approve(id,x.commandId).then(y=>this.out(y))}}
```

After: identical; STOP. A concrete interface change would pass `sessionId` into the repository and have each checked SQL routine validate the persisted actor/session itself. This requires an API file outside the allowlist. The current `VerifiedTenantContext` contains only tenant identity; a caller-supplied actor or a fixed demo membership is not a replacement for caller authority. No such replacement was implemented.

3. Existing merged success fixtures call the legacy routines without a persisted session. `packages/db/test/recovery.integration.test.ts:68` before:

```ts
  const land = (p: object, w = base) => withTenant(runtime, w.ctx, db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [p]));
```

`packages/db/test/recovery.integration.test.ts:70` before:

```ts
  const reverseApproved = (allocationId: string, amount: number, w = base) => withTenant(runtime, w.ctx, db => db.$client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7) id", [w.tenant, randomUUID(), randomUUID(), randomUUID(), allocationId, amount, "Practice receipt reversed"]));
```

After: both identical; STOP. Enforcing standard F inside the replacement money routines would require session-bearing fixture setup before these calls and the earlier direct-call success test at line 23. Rule G reserves those merged setup changes to the coordinator. This blocks the SQL portion (L099/L100/L106/L107/L108); the old routines and their defects remain. No migration was added that preserves their insufficient actor checks, and no existing test was weakened.

4. L105: `packages/db/test/recovery.integration.test.ts:340` before:

```ts
 it("rejects incomplete proof, pending cash, prevented cases, and stale approval in PostgreSQL",async()=>{for(const statement of [`UPDATE app.synthetic_recovery_receipt SET status='pending',settled_at=NULL WHERE id='${R}'`,`UPDATE app.recovery_case SET state='prevented' WHERE id='${C2}'`,`UPDATE app.recovery_approval SET expires_at=now()-interval '1 second' WHERE id='${EA2}'`]){await admin.query(`SET session_replication_role=replica;${statement};SET session_replication_role=origin`);await expect(withTenant(runtime,context,db=>db.$client.query(`SELECT app.approve_synthetic_landing($1::jsonb)`,[payload(C2,EA2,LA2)]))).rejects.toBeTruthy();}await admin.query(`SELECT set_config('app.tenant_id','${T}',false);SET session_replication_role=replica;INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)VALUES(gen_random_uuid(),'${T}','${E}',gen_random_uuid(),'verification_invalid');SET session_replication_role=origin`);expect((await admin.query(`SELECT reason FROM app.recovery_review WHERE tenant_id=$1`,[T])).rows).toEqual([{reason:"evidence_invalidated"}]);});
```

After: identical; STOP. It carries invalid receipt/case/approval state forward between cases and only asserts a rejection. Required coordinator change: independent valid fixtures per guard and a named refusal assertion, preserving existing expected financial values. The file is absent from this order's allowlist; the prose citation alone was not treated as permission to rewrite the merged test.

## Tests first and verification commands

All commands below ran in the issued worktree. No dependencies were installed. Every pnpm command used `export PATH="$HOME/Library/pnpm/bin:$PATH"` first. Memory before heavy work was 81–82% free; `/System/Volumes/Data` reported 47 GB available, above the 45 GB stop threshold. No tests ran concurrently; each run had one file and `--maxWorkers=2`. No database/browser execution was attempted, so no heavy-slot database invocation occurred.

| Command | Exit / result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/recovery-legacy-later.test.ts --maxWorkers=2` | 130; launcher stalled before Vitest; interrupted |
| `pnpm --manage-package-manager-versions=false --version` | 130; version lookup still stalled; interrupted |
| `npm_config_pm_on_fail=ignore pnpm --version` | 130; v11 does not use this configuration prefix; interrupted |
| `npm_config_pm_on_fail=ignore pnpm --filter @jobguard/db exec vitest run src/recovery-legacy-later.test.ts --maxWorkers=2 --config /private/tmp/jg-later-b17-vitest.config.mjs` | 130; launcher stalled; interrupted before tests |
| `pnpm --pm-on-fail=ignore --version` | 0; actual launcher is 11.8.0 |
| `pnpm --pm-on-fail=ignore --filter @jobguard/db exec vitest run src/recovery-legacy-later.test.ts --maxWorkers=2 --config /private/tmp/jg-later-b17-vitest.config.mjs` | 1; repository engines require pnpm 10.28.1; no Vitest run |
| `node packages/db/node_modules/vitest/vitest.mjs run src/recovery-legacy-later.test.ts --maxWorkers=2 --config /private/tmp/jg-later-b17-vitest.config.mjs` (before implementation) | 1; **5 failed, 12 passed, 17 total**. Valid envelope rejected; delta incorrectly 20,300p rather than 5,300p or zero |
| Same direct Vitest command (after implementation) | 0; **17 passed**, 1 file |
| `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` (first) | 2; TS2589 from extending with fields from the other installed Zod version |
| Same direct Vitest command (after same-package UUID adjustment) | 0; **17 passed**, 1 file |
| Same direct TypeScript command (after adjustment) | 0; package source typecheck, including new unit file |
| `node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --esModuleInterop --skipLibCheck packages/db/test/recovery-legacy-later.integration.test.ts` | 0; integration source compiles, PostgreSQL NOT RUN |
| `pnpm_config_pm_on_fail=error pnpm exec turbo run typecheck --force --concurrency=2` | 1; pnpm version refusal before Turbo |
| `pnpm_config_pm_on_fail=error pnpm exec turbo run lint --force --concurrency=2` | 1; same refusal |
| `pnpm_config_pm_on_fail=error pnpm build --force --concurrency=2` | 1; same refusal |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm_config_pm_on_fail=error pnpm lint:lanes` | 1; pnpm version refusal |
| `pnpm_config_pm_on_fail=error pnpm openapi:check` | 1; pnpm version refusal |
| `git diff --check` (multiple inspection/final calls) | 0; no whitespace errors |

`--force` was supplied for all three required root checks, but none reached Turbo. No root typecheck/lint/build success or cache hit is claimed. `pnpm_config_pm_on_fail=error` prevents the v11 launcher attempting to download the pinned version; no engine check was disabled for those commands. Direct Vitest and TypeScript used installed tools; these are supplemental results, not a clean pinned-install result. The temporary Vitest config maps workspace imports to source because this fresh worktree has no `dist`; it is outside the repository and does not change the shared config.

Exact dependency refusal:

```text
[ERROR] This project is configured to use 10.28.1 of pnpm. Your current pnpm is v11.8.0
```

A diagnostic command was refused: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest|corepack' | head -25` returned `zsh:1: operation not permitted: ps`. The shell pipeline's reported status was 0 because `head` completed. Process inspection was stopped; no alternative process-list mechanism was used. No automatic approval review rejected a mutation.

## NOT RUN / not applicable

- `packages/db/test/recovery-legacy-later.integration.test.ts`: **NOT RUN (cannot start PostgreSQL here; socket binding excluded by dispatch)**. Two cases authored and source-compiled only.
- `packages/db/test/recovery-legacy-later-upgrade.integration.test.ts`: not created; no migration because the SQL items stopped.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN**; full suites prohibited here and database/socket execution reserved for CI/dispatcher.
- `pnpm test:e2e`, Playwright, browser/device suites: **NOT RUN**; explicitly CI only, no browser/socket execution.
- Required root typecheck/lint/build, `lint:lanes`, OpenAPI check: **NOT RUN by their actual task runners**; launcher exits above.
- AI eval/live model: not applicable; no AI prompt/model/extraction/gateway change or live processing.
- No upgrade/fresh-install execution evidence, independent model verdict, actor acceptance, or release approval. RED Opus and Sol-high checks remain for the dispatcher.

## GRANT inventory and standard F

No migration and **no new migration GRANT**. No direct protected INSERT/UPDATE/DELETE grant was added, and no application write path was added for receipts or audits. The stopped SQL work must use routines carrying their own actor authority checks, after coordinator prerequisites are supplied.

Test-cluster role setup only: `GRANT jobguard_runtime TO later_b17_login`. This grants an ephemeral CI login the already-existing runtime role, not direct application-table write privileges. It is not a production migration or a new business-data grant.

## Builder source inspection (not independent review)

- L104's entire envelope remains strict. Unknown authority fields refuse before connecting; all posting identities and the command ID are retained exactly. Existing output/port signatures are preserved.
- L119 reads the persisted integer delta; it does not recompute policy or mutate history. Legacy fees remain synthetic-only in scope. Production/v3/contractor code is untouched.
- No changes to membership/authorization policy, financial posting routines, ledger history, existing tests, pinned values, migration runner/inventory, shared command guards, or shared replay harness.
- Existing gaps remain: atomic audit/receipts and exact replay (L099/L100), named legacy proof fixtures (L105), cumulative reversal/paid-plan credit (L106/L107), SQL available-value guard (L108). Their presence prevents full task acceptance.
- The integration fixture bypasses triggers only in its administrator-owned setup transaction to represent existing historical records. Runtime calls use the actual controlled routine and inherited runtime role. This is not evidence of production authorization.
- Backwards compatibility: previously-invalid complete command envelopes now parse; additional fee output becomes the posting delta. No API shape, UI wording, migrations or operational alerts added.

## Scope evidence

`git diff --stat` for tracked files (untracked additions are listed separately):

```text
 packages/db/src/recovery-demo-repository.ts | 2 +-
 packages/db/src/recovery-repository.ts      | 7 ++++++-
 2 files changed, 7 insertions(+), 2 deletions(-)
```

New files: `packages/db/src/recovery-legacy-later.test.ts`, `packages/db/test/recovery-legacy-later.integration.test.ts`, this receipt, `docs/ledger/LATER-B17.md`. No other untracked files existed before receipt/ledger creation.

Changed implementation/test SHA-256:

```text
fa1f9c4901a9f3637bdf122a0037145e6bbd643cee3fff5aea4cef2203923613  packages/db/src/recovery-repository.ts
9b976e4daa8d85b6e37bbbd80b5bfaadd629d631b3af81f50959d1367c2a7819  packages/db/src/recovery-demo-repository.ts
f974e50ed1f4f90ad6c4724b30e589d1617c96221f085eb8a7638ac00692fcd5  packages/db/src/recovery-legacy-later.test.ts
08003694bfa1816dffbcf2936cb2fda6a39aa79309657f3b5f048bf2c8af8a28  packages/db/test/recovery-legacy-later.integration.test.ts
```

Protected/shared files were compared byte-for-byte to `git show origin/main:<path>` in a one-off receipt script; all comparisons passed. No permanent hash assertion was introduced. Their SHA-256 values:

```text
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1  AGENTS.md
384fdb07869e780e44e9761a7aaa355ddb4dc0b7fb03b5370d65c47c2891fcdd  BUILD_PLAN.md
99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e  config/agent-lane-assignments.json
d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983  packages/db/src/migrate.ts
9c3f32c8a389a29a317f756b8d5823bc9ce8e99cc642c8678ae285bc08d2842b  packages/db/test/recovery.integration.test.ts
ba77fb03c00d45941865af533a8833aa6463e4f2eae3812bafe3103ae8fe54b9  packages/db/test/tenancy.integration.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
```

Read-only inspection used `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `git diff`, `git diff --numstat`, `git diff --stat`, `git ls-files --others --exclude-standard`, `shasum -a 256`, and `cat`/`rg`/`sed`/`nl`/`head`/`tail`/`ls` against the named contracts, package scripts/configs, recovery sources/migrations/tests, audit/tenant helpers, installed pnpm launcher and shared lane lint. Reads succeeded except missing paths noted here: `config/lanes/later-b17.json`, `packages/db/test/helpers.ts`, `apps/api/src/workspace/practice-access.ts` (actual file is its parent), `.npmrc`, absent workspace `dist` files, and old pnpm executable lookup paths. `rg` with no matches exited 1. These were inspection failures, not verification passes. File writes were only apply_patch additions/edits in the allowlist, the temporary Vitest config, this receipt/ledger and the intended-message file; Python's guarded replacements/writes exited 0. Resource commands and hash/status checks exited 0.

Final HEAD: `31682762c903d716657c573e1b5deae63588aad7`. Working-tree changes remain uncommitted; dispatcher must bind any later verdict to the resulting exact commit. Intended message: `/private/tmp/jg-msg-later-b17.txt`.


## r1 — PR #252 password repair (dispatcher 14, 16 October 2026 night)

Base HEAD: `ffef575f89e21b7d924b9d63a5b8fcf50f970144`, branch `codex/sandbox/later-b17`. BUILD-DON'T-MERGE, decision 74. This append supersedes no earlier STOP record or acceptance hold. The issued repair is limited to the integration test and this receipt.

The CI failure `empty password returned by client` came from the passwordless `later_b17_login` and its Pool. The two-line repair assigns that role the existing fixture credential generated by `randomUUID()` at run time and passes the same credential as the runtime Pool password, following `final-account-lock.integration.test.ts:29–30`. No password literal is committed or logged. The existing role flags, inherited runtime grant, fixtures and assertions are unchanged. No application code, financial policy, migrations, production privileges, API contract or operational alerts changed.

### r1 verification actually executed

Node: `v24.17.0`. Installed pnpm: `11.8.0`; repository pin: `10.28.1`. No dependencies downloaded or installed. Disk remained 38 GiB available, above the dispatcher-waived night floor of 30 GB. All checks were headless; no browser launched.

Each of these requested root commands exited 1 at the pnpm version guard, before its script ran: `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check`. Each invocation used `pnpm_config_pm_on_fail=error` to prevent downloads. The error was `This project is configured to use 10.28.1 of pnpm. Your current pnpm is v11.8.0`. No pinned-install/root-Turbo pass is claimed.

Supplemental checks used the already-installed tools directly:

| Command | Exit / result |
| --- | --- |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0; core purity, lane, money and commercial boundary checks |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0; registered `later-b17` lane, real merge-base with origin/main |
| `node --test tools/*.test.mjs` | 0; 100 passed; log `/private/tmp/jg-later-b17-r1-tools.log` |
| `node packages/db/node_modules/vitest/vitest.mjs run src/recovery-legacy-later.test.ts --maxWorkers=2 --config /private/tmp/jg-later-b17-vitest.config.mjs` | 0; 17 passed; existing external source-alias config |
| `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` | 0 |
| `node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --esModuleInterop --skipLibCheck packages/db/test/recovery-legacy-later.integration.test.ts` | 0; repaired integration file compiles |
| `node node_modules/typescript/bin/tsc -p packages/<name>/tsconfig.json`, sequentially for core, config, storage, ai, db | All 0; builds with source typechecking |
| `node node_modules/@nestjs/cli/bin/nest.js build` (apps/api) | 0 |
| `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` | 0 |
| `node --import tsx src/generate-openapi.ts --check` (apps/api), before dependency builds | 1; missing core dist/index.js |
| Same OpenAPI command after dependency builds | 0 |
| `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build` (apps/web) | 0; all 41 static pages generated; workspace-root inference, CSS/autoprefixer, file-type export and dynamic-dependency warnings |
| `node <worktree>/packages/db/node_modules/vitest/vitest.mjs run src --maxWorkers=2`, sequentially from core/config/storage/ai | All 0; respectively 2696 / 1 / 2 / 113 tests passed; logs `/private/tmp/jg-later-b17-r1-unit-<name>.log` |
| Same source-filter command from db (initial broad selection) | 1; 160 passed, 18 skipped; four audit integration suites failed setup with `no free port` because the substring `src` also matched `dbsrc` filenames; log `/private/tmp/jg-later-b17-r1-unit-db.log` |
| `node node_modules/vitest/vitest.mjs run src --exclude 'test/**' --maxWorkers=2` (packages/db, corrected selection) | 0; 141 passed in 16 source unit files |
| `git diff --check` | 0 |

The initial broad db selection unintentionally attempted four unrelated integration setups; each failed at the socket-availability check before PostgreSQL started. This is a failed setup result, not a PostgreSQL pass. The exact repaired `recovery-legacy-later.integration.test.ts` is **NOT RUN**: the dispatcher states this sandbox cannot bind localhost or start PostgreSQL. Its two PostgreSQL assertions must run in GitHub CI after dispatcher commit/push. Full database/migration suites, API HTTP journeys and browser suites are NOT RUN here. No live provider or model evaluation was performed; AI fixture tests above do not authorize release.

Only the two issued repository files are modified. Ignored dist/.next outputs were generated by direct builds. No git-writing command was issued against this worktree; tool tests create disposable repositories under temporary directories. No commit, push, merge, acceptance or independent verdict is claimed. Both requested intended-message paths contain the same conventional subject and body: `/private/tmp/jg-msg-later-b17-r1.txt` and `/private/tmp/jg-msg-later-b17.txt`. Dispatcher retains commit/push and CI; independent review must bind to that resulting commit.
