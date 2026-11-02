Built by Codex (GPT-6.1), dispatched for LATER-B28; synthetic construction only.

# LATER-B28 builder receipt

Status: PARTIAL; RED check lane; decision 74 PARK. Uncommitted working tree. No acceptance, independent verdict, merge, enablement or deployment is claimed.

The addendum's requested first line attributes this build to Claude Sonnet and says Codex was unavailable. That attribution is inaccurate for this session, so the actual builder is recorded above. All other applicable dispatch restrictions remain in force.

## Base and authority

Branch: `codex/sandbox/later-b28`. Initial and final HEAD: `4c407a6c81bd714a6875b7adf995812381d0fe57`. At initial inspection local `origin/main` was the same SHA; during verification it advanced externally to `7ff452eeec1c523345d34715adfa3f8310062013`. All seven cited files (plan, both source files, issuer migration, old identity test, executor, actual revocation migration) were compared byte-for-byte between those main snapshots and are unchanged. The header's `ca435eeb5791638c787c830d6ba717146f694539` and draft's `0bbb5ddb` are superseded by this checkout; current main wins. No fetch or Git write was performed. The starting working tree was clean.

Read AGENTS.md, BUILD_PLAN.md C1–C8 / ENT-10, the enterprise identity contract, synthetic SCIM contract and dispatcher standing rules. Revalidated cited lines against `git show origin/main:<path>`:

| Citation | Current main |
| --- | --- |
| BUILD_PLAN.md ENT-10 | Heading 1050, bounded lifetime requirement 1054 |
| BUILD_PLAN.md C5 | 117 |
| Identity refusal guard | packages/db/src/enterprise-identity-repository.ts:66 |
| Nested link authentication | apps/api/src/auth/sso/sso.application.ts:80–87 |
| Application-clock expiry | apps/api/src/auth/sso/sso.application.ts:112 |
| SQL maximum expiry | packages/db/migrations/0120_enterprise_identity.sql:176 |
| Old background test | packages/db/test/enterprise-identity.integration.test.ts:362–363, commercial-manager setup |

Node is v24.17.0. Dependencies were already installed; no install/download command was issued. The default pnpm launcher reports the pnpm 11 configuration warning and stalled selecting the project runner. Three attempts were interrupted (130). A read-only search found the already cached pinned pnpm 10.28.1. `/private/tmp/jg-later-b28-bin/pnpm` invokes that cached runner. Successful verification uses:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-later-b28-bin:$PATH"
```

## Changes and task evidence

| ID | Work | Evidence / limit |
| --- | --- | --- |
| FL52 | Validate the complete canonical UUID layout before the UUID-keyed tenant refusal path. Keep the bootstrap insert first. | 9 repository unit tests plus application refusal coverage; real PostgreSQL proof authored, NOT RUN. Valid uppercase UUIDs still reach tenant audit. Unknown and blocked connections retain bootstrap recording. |
| FL63 | Read expiry from `clock_timestamp()` on the existing callback transaction/client, truncate to milliseconds, add the validated connection limit. | Unit cases cover both one-hour application clock offsets at 60 and 900 seconds. Existing SQL 15-minute upper bound remains unchanged. PostgreSQL 900-second proof authored, NOT RUN. No grace period or lifetime extension. |
| FL64 | Release the metadata lookup client, authenticate and verify origin/CSRF/membership, then acquire the write transaction. Reload metadata under the shared tenant authority lock and recheck session, digest, CSRF, expiry, binding and current membership using only that client. | Unit pool with capacity four progresses for four concurrent starts. Six gap cases refuse before cache/audit writes: revoked session, revoked membership, changed bound tenant, changed bound membership, revoked binding and changed connection tenant. Ordinary sign-in remains covered. Real four-client pool and command-revocation gap proofs authored, NOT RUN. |
| L054 | Add a real SSO-linked owner positive executor control and use `ContractorRepository.command` for revocation. | PARTIAL / STOP. The desired negative executor assertion is explicitly `it.fails` because the executor remains outside the lane. Fixture, revocation command and execution happen in a normal beforeAll hook, so setup failures cannot satisfy the expected-failure assertion. It is a reproduction of a known gap, not acceptance evidence. NOT RUN. |

The unit resource tests use a bounded fake pool and replace SAML adapter behavior. They do not prove PostgreSQL permissions, lock behavior, signature validation or live provider interoperability. The integration file uses the existing embedded PostgreSQL harness and generated fictional identities/signer. No real IdP, customer data, sign-in material, provider calls, spending, outward delivery or permanent deletion was used.

## STOP / coordinator-owned work

**L054: packages/db/src/outbox.ts:13, unchanged.** Its owner-only membership join checks `m.revoked_at` and expiry but does not read the contractor command's revocation record. The actual command appends `app.contractor_membership_revocation` at packages/db/migrations/0138_practice_session_hardening.sql:195. The older test substitutes a column update and a commercial manager, which cannot prove this owner path.

Exact relevant fragment before:

```sql
JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) WHERE o.id=$1
```

Proposed fragment after, for a separately authorized coordinator change and appropriate race checks:

```sql
JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation cmr WHERE cmr.tenant_id=m.tenant_id AND cmr.membership_id=m.id) WHERE o.id=$1
```

This retains the owner requirement and avoids applying a contractor-only role predicate to small-builder work. It is not implemented here. Changing this file is outside the issued allowlist. After the coordinator fixes the executor, the new expected-failure assertion must become an ordinary passing regression under a follow-up order; an unexpected pass currently fails the test. The existing merged test and all pins are unchanged.

## Verification commands and results

Before each test/check, `memory_pressure | tail -1` reported 74–77% free and `df -g /System/Volumes/Data` reported 39–41 GB available. All runs were sequential; tests used two workers and one file per actual run. No database/browser run was attempted, so no heavy-slot database run occurred.

`V=/private/tmp/jg-later-b28-vitest.config.mjs` below is only a readable abbreviation for the exact path passed to `--config`. It aliases workspace packages to this worktree's sources so first-red tests can run before dist exists. It replaces no implementation and is outside the repository.

| Actual verification command (after the PATH prefix above) | Exit | Result |
| --- | --- | --- |
| `pnpm --version` via cached runner | 0 | 10.28.1 |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --config /private/tmp/jg-later-b28-vitest.config.mjs src/later-sso-refusal.test.ts ../../apps/api/src/auth/sso/later-sso-resource.test.ts` before implementation | 1 | Only the DB-local file was discovered: 3 failed / 6 passed, 9 total. Outside-root API file was not run in this invocation. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --config /private/tmp/jg-later-b28-vitest.config.mjs src/auth/sso/later-sso-resource.test.ts` before implementation | 1 | 5 failed / 2 passed, 7 total: typed refusal, both clock offsets, four-client exhaustion, gap revocation. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --config /private/tmp/jg-later-b28-vitest.config.mjs src/later-sso-refusal.test.ts` after implementation | 0 | 9 passed, 1 file. |
| API unit command above after implementation | 0 | 7 passed, 1 file. |
| API unit command above after adding the extra lifetime/gap cases | 0 | 14 passed, 1 file. Final unit total: 23 passed. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7 successful, 0 cached; 36.614 seconds. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7 successful, 0 cached; 19.001 seconds. |
| `pnpm build --force --concurrency=2` | 0 | 7 successful, 0 cached; 1m12.426s. Production Next build completed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0 | All 8 changed/new paths in later-b28. origin/main had advanced to 7ff452ee, so no self-comparison refusal occurred. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | All 8 paths allowed; same observed main/HEAD pair. |
| `pnpm openapi:check` | 1 | BLOCKED before schema generation: tsx IPC listen EPERM; not retried or worked around. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-later-b28-integration-tsconfig.json` | 0 | New integration file and its imported types compile; zero diagnostics. This is not PostgreSQL execution. |
| `git diff --check` (inspection runs) | 0 | No whitespace errors. |

Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` while the forced typecheck/lint tasks executed successfully. No sandbox escalation or alternate route to a refused operation was attempted. These are task execution results, not approval or model review.

Logs are local scratch artifacts: `/private/tmp/jg-later-b28-typecheck.log`, `/private/tmp/jg-later-b28-lint.log`, `/private/tmp/jg-later-b28-build.log`, `/private/tmp/jg-later-b28-openapi.log`, `/private/tmp/jg-later-b28-integration-types.log`. No cache-hit result is reported as a run; `--force` was used for every required root task.

The separate OpenAPI item STOPPED at `pnpm openapi:check` (exit 1). Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/51774.pipe`, `code: EPERM`, `syscall: listen`. This is the tsx launcher IPC pipe, before the checker executes. Per the dispatch rule, no alternate invocation or retry was attempted. CI must run the checker.

## NOT RUN

| Command / file | Reason |
| --- | --- |
| packages/db/test/later-sso-authority.integration.test.ts (6 tests, including one known-gap expected failure) | NOT RUN: explicit dispatcher prohibition on PostgreSQL/socket starts in this sandbox. CI and dispatcher must run through heavy-slot. |
| `pnpm test` | NOT RUN: full suites prohibited; only this piece's unit files run locally. |
| `pnpm test:db` | NOT RUN: full DB suite prohibited; cannot start PostgreSQL here. |
| `pnpm test:migrations` | NOT RUN: PostgreSQL prohibited; no migration in this task. |
| `pnpm test:e2e`, Playwright / browsers | NOT RUN: explicit dispatch restriction; no UI change. |
| Existing merged security/permission suites | NOT RUN: limited to this piece's own files. Existing expectations and files remain unchanged. |
| Approved-region live-model eval | NOT RUN / inapplicable: no AI/model/parser/prompt change. |
| Clean install | NOT RUN: dependencies preinstalled; package download/install prohibited. |
| Independent Opus / Sol-high review and separate acceptance | NOT RUN: dispatcher/checker responsibilities; exact committed head does not exist yet. |

## Invariants, compatibility and builder self-check

- No migration. No backfill or schema change. New GRANTs: **none**. Standard F: no new direct INSERT/UPDATE/DELETE grants to jobguard_runtime on money, membership, authorization, receipt or audit tables. Existing restricted identity reads/routines and existing bootstrap insert are reused.
- No fingerprinted table, shared harness, protected context file, existing merged test, pinned list/value, route registry, owner-only executor rule or provider configuration changed.
- Linking still requires an authenticated current member with the same origin/CSRF and connection tenant. The held-client SQL recheck is additional race protection, using the existing membership/binding policy; it introduces no role policy or new sign-in path. Callback independently rechecks linking as before.
- Lock order for the new linking path: tenant advisory lock, connection reload, session row read lock, current authority reads, request cache, audit head last. No business lock follows audit append. No network call is made from these changes.
- The database-time expiry remains inside the existing configured 60–900 second contract and the unchanged SQL issuer bound. Millisecond truncation avoids rounding expiry above the sampled database time plus the limit.
- No HTTP/schema/OpenAPI response changes, UI, subscription/fee behavior, external action or operational alert added. More restrictive gap refusal is intentional; successful request format is unchanged. Rollback is reverting the two source-file changes; there is no data migration to undo.
- L054 remains an execution-authority gap on current main, demonstrated in source and represented by a new expected-failure test, not observed against PostgreSQL in this sandbox. It prevents claiming complete task acceptance.
- Required gates: CI PostgreSQL proofs and unchanged regression suites, RED independent reviews bound to the dispatcher commit, separate acceptance, decision-74 PARK. Real data, live identity/provider use, release and production activation remain excluded.

## Scope evidence

Final hashes and tracked diff stat follow. The receipt cannot hash its own final bytes without a self-reference; all source/test and protected sentinel hashes are recorded separately.

## Read-only inspection command log

The shell inspection batches used `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git branch --show-current`, `git show origin/main:<cited-file>`, `git diff --check`, `git diff --stat`, `git diff --numstat`, `nl -ba`, `rg`, `rg --files`, `cat`, `head`, `tail`, `sed`, `ls`, `file`, `command -v`, `wc -l`, `node --version`, `memory_pressure | tail -1` and `df -g /System/Volumes/Data`. No Git command wrote state. These source-inspection batches ran successfully except the missing-path/glob cases listed below; they ran no tests and have no test counts.

Inspected paths: AGENTS.md; BUILD_PLAN.md; package.json; turbo.json; tsconfig.json; package manifests/tsconfigs; tools/lint.mjs and tools/agent-lane-boundary-lint.mjs; existing lane examples; enterprise-identity-repository.ts; SSO application/contracts/adapter and existing unit files; auth provider/bridge; identity/contractor repositories; tenant-context.ts; outbox.ts; relevant migration routines in 0001/0006/0054/0111/0120/0129/0137/0138/0143/0150; enterprise identity, SCIM and privilege contracts; enterprise identity integration files, scim-fixtures.ts and pool-test-utils.ts; database Vitest config; the night-audit finding and local dispatcher handoff. Source-only tool discovery returned exec_command and unrelated app capabilities; none were invoked for external writes.

Nonzero / interrupted inspection batches (no policy refusal, no mutation):

- `pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat AGENTS.md && cat config/lanes/later-b28.json`: 1, lane did not yet exist. Lane registered as the first repository change.
- `cat packages/db/migrations/0127_enterprise_identity_fixlater_6.sql && rg ... && cat apps/api/src/auth/principal-bridge.ts ...`: 1, draft-assumed migration path absent; remaining chained reads did not run.
- Batch containing `rg ... apps/api/src/auth/*scim* ...`, `cat apps/api/src/auth/scim/scim.application.ts`, and `ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm /Users/benharwood/.local/share/pnpm`: intermediate missing glob/path errors; overall 0. Correct SSO/scim path and cached pnpm located by subsequent read-only inspection.
- `cat .npmrc`, cache-directory probes and `rg packages/db/test/membership-authority*.ts`: missing files/glob; no changes. One combined inspection batch ended 1 on that unmatched glob.
- Batch ending `rg -n 'pnpm|packageManager' pnpm-workspace.yaml`: 1, no match. Dist files also absent before build, prompting the temporary unit-test source aliases.
- Initial pnpm version batch, then `npm_config_manage_package_manager_versions=false pnpm --version`, then `pnpm --manage-package-manager-versions=false --version`: each interrupted with Ctrl-C, 130. A standalone cached pnpm 9.0.0 version probe returned 0 / 9.0.0; it was not used for any test/check/build. All successful verification uses the cached 10.28.1 runner.

Scratch creation commands: `mkdir -p /private/tmp/jg-later-b28-bin`, `cat > /private/tmp/jg-later-b28-bin/pnpm`, `chmod +x /private/tmp/jg-later-b28-bin/pnpm`, `cat > /private/tmp/jg-later-b28-vitest.config.mjs`, `mkdir -p docs/verdicts/LATER-B28`, `cat > /private/tmp/jg-msg-later-b28.txt`, and `cat > /private/tmp/jg-later-b28-integration-tsconfig.json`: all 0. Repository edits used apply_patch. Intended commit subject is `fix(auth): preserve SSO refusal expiry and pool boundaries`; the scratch message also carries a body and the partial/PARK status. No commit, add, checkout, push, reset, cleanup or deletion command ran.

## Final source/test manifest (SHA-256)

| Path | SHA-256 |
| --- | --- |
| config/lanes/later-b28.json | `fd82021139fff61f01271edbf3345425ff758468509779fc92b39635268fe175` |
| packages/db/src/enterprise-identity-repository.ts | `aba7721d7a22e8beff142f9d20baab63f03ac5a56ce9b75c87bd6668c0b2e6f9` |
| apps/api/src/auth/sso/sso.application.ts | `54cb7d18ba4c8d8ed293967df568372b0dcaf32a20309c7cd298df58ff88b0e9` |
| packages/db/src/later-sso-refusal.test.ts | `7b4082e86af545a2121472337e53a487f510e2ca8a766df785fd320517948747` |
| apps/api/src/auth/sso/later-sso-resource.test.ts | `8fe30e8db158aa787a4b168e3751eca599c356db0a39b456ef2662ba86df1b7b` |
| packages/db/test/later-sso-authority.integration.test.ts | `8e674043f178ea029165906ec991534b7d5f2e1503e5f80ec0e8304bb303ce7f` |
| docs/ledger/LATER-B28.md | `8ad60a5b5a53df94a3a743953c6de830a149262335f663957ac143edf4e024aa` |

Unchanged sentinel files, compared with final observed origin/main (each comparison returned identical bytes):

| Path | SHA-256 (working tree and main) |
| --- | --- |
| apps/api/src/auth/context-boundary.test.ts | `ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2` |
| packages/core/src/watchdog.ts | `a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca` |
| packages/db/test/watchdog-command-harness.ts | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| packages/db/test/command-replay-contract.integration.test.ts | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| packages/db/test/enterprise-identity.integration.test.ts | `b3e075f269e9e9db5d45523c32d4cd5f76b1898447500e05e5c67acf939df52d` |
| packages/db/test/scim-fixtures.ts | `583c2f68e98141427f4e30971f918392c3fc593cc6b266d9409200bdff5a6fc0` |
| packages/db/src/outbox.ts | `99032dfa0bdcd3782fa8b25dfea2282eb8f4de76a627800070a0b9c37a01e2b7` |
| packages/db/migrations/0120_enterprise_identity.sql | `2045266607de49574a569a5b8140b82529d2048c4a410dcd525b0677a2bd87ac` |
| packages/db/migrations/0138_practice_session_hardening.sql | `af34ad0b9795f124eb8d892f315731917da897223396be8374161ac463d112cb` |
| docs/contracts/lp-0-effective-privileges-v1.json | `36336521d5fd8d6acbe908b7efee58716b8810da7df35b39c5ebc5f4981b182a` |

Actual `git diff --stat` (tracked files only; exit 0):

```text
 apps/api/src/auth/sso/sso.application.ts          | 26 +++++++++++++++++------
 packages/db/src/enterprise-identity-repository.ts | 11 +++++++++-
 2 files changed, 29 insertions(+), 8 deletions(-)
```

Untracked additions, also checked by the lane tool: the three new test files, the new lane registration, ledger and this receipt. Git diff does not include these until the dispatcher stages them. No staging was performed.

Final verification/receipt commands: `git rev-parse HEAD`, `git rev-parse origin/main`, `git diff --check` (all 0), Python byte comparison of all seven cited files between the two observed main refs (0; 7 unchanged), and this Python receipt/manifest update (0; 7 artifact hashes, 10 unchanged sentinel comparisons). No other repository path changed.

## r1 — repair round, dispatcher 14, 17 October night

PR #256; branch `codex/sandbox/later-b28`; starting HEAD `b4a900076ab5a0402420bc66cbecb3640d863804`. This appendix records only the requested repair. The earlier receipt remains historical. Decision 74 BUILD-DON'T-MERGE remains in force; no commit, staging, push, browser, database start, package install or download was performed.

Dispatcher-supplied CI run `38964614690` reported 2544 passes, one expected failure (L054, unchanged) and one failure: FL64's bounded-pool test could not authenticate (PostgreSQL 28P01, empty password). Inspected the supplied local excerpt. A local, connection-free inspection of installed `pg` confirmed `Pool.options.password` is non-enumerable and absent from an object spread.

Changed only `packages/db/test/later-sso-authority.integration.test.ts` and this receipt. FL64 now creates a dedicated synthetic login with a runtime-generated UUID password, grants it the existing `jobguard_identity` role, and passes the identical password explicitly to the four-client Pool. This follows `final-account-lock.integration.test.ts`'s login/password pattern without changing the shared harness. The pool limit, concurrency assertions, cleanup and L054 `it.fails` remain unchanged. No migration, production grants, API, policy, authorization or operational behavior changed.

Verification used Node `v24.17.0` and the already-cached pinned pnpm `10.28.1`, with `PATH=/private/tmp/jg-pnpm-later-b11:$PATH`. The default launcher version probe stalled and was interrupted (130); no download/install command was issued. Turbo checks used `--force`; no cached check is reported as execution.

| Command | Result |
| --- | --- |
| `pnpm typecheck --force --concurrency=2` | PASS; 7 tasks, 0 cached. |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | PASS; root boundary checks and 7 tasks, 0 cached. Turbo emitted an IO permission warning. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS; later-b28 lane. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-later-b28-integration-tsconfig.json` | PASS; separate no-emit compilation includes the changed integration test. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --config /private/tmp/jg-later-b28-vitest.config.mjs src/later-sso-refusal.test.ts` | PASS; 9 unit tests. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --config /private/tmp/jg-later-b28-vitest.config.mjs src/auth/sso/later-sso-resource.test.ts` | PASS; 14 unit tests. |
| `pnpm build --force --concurrency=2` | PASS; 7 tasks, 0 cached; Next production build completed. |
| `pnpm openapi:check` | BLOCKED; exit 1 before generation: `listen EPERM` on the tsx IPC pipe. No workaround/retry. |
| `git diff --check` | PASS. |

The existing temporary Vitest config aliases workspace imports to this worktree's sources; the existing temporary TypeScript config extends this checkout's strict config and includes the integration file. Neither changes repository configuration. Logs: `/private/tmp/jg-later-b28-r1-{typecheck,lint,lanes,integration-types,db-unit,api-unit,build,openapi}.log`.

PostgreSQL integration test **NOT RUN**: the dispatcher states PostgreSQL is unavailable and this sandbox cannot bind/start it. No PostgreSQL client was found in the inspected standard locations. Full `pnpm test`, database/migration suites and browser suites **NOT RUN** because they require the prohibited infrastructure; only the two scoped unit files ran. No AI evaluation applies. CI must execute the repaired PostgreSQL test and retain L054's expected failure. This is local build evidence, not an independent verdict or acceptance; decision 74 and existing release gates remain held.

Intended conventional commit subject/body written to both `/private/tmp/jg-msg-later-b28-r1.txt` and `/private/tmp/jg-msg-later-b28.txt` for the dispatcher. No Git writes performed.
