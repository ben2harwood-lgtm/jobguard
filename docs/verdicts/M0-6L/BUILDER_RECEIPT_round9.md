# M0-6L builder receipt — round 9, 8 October 2026

Builder: Codex. Branch `codex/sandbox/m0-6l`, PR #104. Unchanged Git HEAD / repair base: `55c98a56dd4c149de1868a4de6a972379f401d54`, preserving round 8 and both integrator main merges. This receipt describes working-tree changes, not a commit, independent verdict or technical acceptance. The dispatcher commits/pushes and binds CI and the next independent verdict to the resulting exact commit.

Read AGENTS.md, BUILD_PLAN.md §11.1 M0-6L and §5.6 authentication/security contracts, `docs/contracts/authentication-v1.md`, the round 8 receipt, and the [REPAIR verdict at 55c98a5](https://github.com/ben2harwood-lgtm/jobguard/issues/104#issuecomment-6068142282) using `gh api repos/ben2harwood-lgtm/jobguard/issues/comments/6068142282 --jq .body`. The initial sandbox network attempt failed; the read-only escalated retry returned the actual verdict.

## Repairs

**P1-1:** `packages/db/test/identity.integration.test.ts` keeps the upgrade from exactly `MIGRATION_URLS.slice(0,identityIndex)`, including the existing equality check on that applied prefix. It now looks up `0097_recovery_case_current.sql` and `0102_contractor_parties.sql` by name, checks the predecessor exists, and asserts 0098 is immediately between them. The post-upgrade count equals `MIGRATION_URLS.length`; a new exact full-name equality requires every listed migration, including 0102, 0103 and 0106. Both `migrate()` calls and the absent-before/present-after `identity.challenge` assertions remain.

This repairs a **stale fixture, not a weakened assertion**. The merge-ahead ruling makes “0098 is last”, index 44 and total 45 false. A read-only Node assertion against the real source list reproduced `49 !== 52` before editing. A second source-only check passed the named adjacency and full four-migration tail, and confirmed the exact-prefix and challenge assertions remain. Neither probe executed PostgreSQL. The revised database fixture checks the actual merged ordering and complete upgrade result instead of obsolete positions/counts.

Searched the remaining identity suite, auth tests, M0-6L browser test, tenancy, UIWIRE-12 and demo-bootstrap migration assertions, plus repository occurrences of 0098 and last/fixed-count assumptions. No additional M0-6L test repair was needed: UIWIRE-12 and demo-bootstrap already use the current list/count. The stale historical lane note remains untouched as instructed.

**P3-1:** `packages/db/MIGRATIONS.md` now records 0098 immediately after 0097 and before 0102, with 0103/0106 applying afterward; the fixture starts through 0097 and checks the complete applied list. Existing rollback/forward-fix guidance remains. The integrator still renumbers at merge.

**P3-2:** the scanner header documents `id<typeof c>({tenantId} as any)` beside O11/R8/R10 and states that TENANT-STAMP-1's runtime check refuses the reconstruction before connecting. Documentation only: distinguishing an arbitrary generic helper's fresh object from preservation of a genuine stamped context requires semantic/type-flow knowledge beyond this per-file scan. A blanket syntax ban would also reject context-preserving generic calls. No scanner rule, constructor approval, merge resolution or runtime stamp changes; therefore no new scanner-rule regression is claimed.

No assertion was weakened, skipped or deleted; the obsolete ordering/count assertions are replaced by the required current-contract assertions. No timeout was added or increased. All earlier identity, authorization, invitation, throttling, CSRF/origin and scanner work remains.

## Actual validation

Node `24.17.0`, installed pinned pnpm `10.28.1`; all pnpm checks used `PATH=/private/tmp/jg-m0-6l-round4-bin:$PATH`. Dependencies were already installed; no install/download was attempted. An initial host `pnpm --version` frontend stalled and was interrupted (exit 130); checks used the installed pinned shim. Turbo replayed some prior cache logs and warned about restricted cache writes; Next emitted its existing workspace-root/CSS warnings.

| Command | Actual result |
|---|---|
| `pnpm typecheck` | Exit 0; seven successful packages, four cached; 4m40.997s. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; repository purity, lane, money and commercial boundaries plus seven successful package checks; one cached; 6m1.747s. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0 initially and after writing this receipt; actual local merge-base comparison against `3a06a02ea03f84c56fc6946e874c3c33fed915a7`, including working-tree paths. |
| `pnpm build` | Exit 0; seven successful packages, four cached; 13m42.243s. Compilation only; no deployment or JobGuard production activation. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | Exit 1; **803 passed / one failed**, 29 passing files / one failing file, 804 tests total; 27.84s. Sole failure: unchanged `src/health.test.ts:13`, Supertest cannot bind `0.0.0.0` (`listen EPERM`, then null port); one associated unhandled listener error. All other API tests pass. Full source suite, no exclusions. |
| `pnpm --filter @jobguard/core test --maxWorkers=1` | Exit 0; **3340/3340**, 114 files; 62.11s. Existing source/dist discovery unchanged. |
| `pnpm --filter @jobguard/web test --maxWorkers=1` | Exit 0; **361/361**, 20 files; 15.20s, after build refreshed package artifacts. |
| `pnpm openapi:check` | Exit 1; `tsx` cannot bind its IPC pipe (`listen EPERM`). This is not a document mismatch or a claimed required-script pass. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; the same source generator/check passes through Node's no-IPC loader. Snapshot unchanged. CI must run the literal required script. |
| Read-only source probes, protected-file/scanner integrity check, `git diff --check` | Stale-last probe exit 1 as expected; repaired source probe and final integrity/whitespace checks exit 0. Source inspection is distinct from database execution. |

Logs: `/private/tmp/jg-m0-6l-round9-{typecheck,lint,lanes,build,api,core,web,openapi,openapi-noipc,lanes-final}.log`. Unit suites ran sequentially after build; no load-timeout failure or timeout adjustment. This is not a whole-API or whole-repository green result because the listener checks remain blocked locally.

## Integrity and handoff

Four changed paths: the identity database test, migration documentation, scanner header and this receipt. Migration `0098_persisted_identity.sql` stays numbered 0098 and byte-identical to HEAD, SHA-256 `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0`. BUILD_PLAN.md, `config/agent-lane-assignments.json`, the migration runner and tenant-context runtime are byte-identical to HEAD. The scanner implementation/approvals after its header are byte-identical. No schema, backfill, data reset, dependency, business-command compatibility, provider route or alert change.

No Git write, commit, push, merge, PR write, live provider/send/spending, real customer data, JobGuard production/pilot mode, decision approval, deployment or release. Synthetic data only. The intended conventional commit subject/body is `/private/tmp/jg-msg-m0-6l.txt`.

Affected invariants: preserved tenant provenance (AGENTS §5.1), current migration/upgrade guarantees, synthetic-only execution (§5.10–5.11) and truthful independent evidence (§5.13). PostgreSQL/migration and browser suites were not run because this sandbox cannot start PostgreSQL or bind localhost; the dispatcher explicitly reserves them for GitHub CI. No mocked or source-only check is presented as database proof. No AI prompt/model change requires evaluation in this round.

Remaining holds: green exact-new-commit CI including the complete identity upgrade/privilege/race/revocation/invitation suite, migration suites, build, required OpenAPI script and browser suites; fresh independent verdict and separate acceptance. The builder does not accept its own repair. Existing G0/G1 and D04/provider/residency/retention release gates remain; no release or live activation is authorized here.
