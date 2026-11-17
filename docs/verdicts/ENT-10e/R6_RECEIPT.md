# ENT-10e repair round r6 — builder receipt, 13 October 2026

Codex; dispatcher 4; task ENT-10e; draft PR #180. Baseline/head remains `51986a49fd9b891b752e8c808409ab01d6a4120a` on `codex/sandbox/ent-10e`. Working-tree repair only: no git command that writes, commit, push, merge, dependency install/download, PostgreSQL startup or browser run. Installed Node v24.17.0 and cached pinned pnpm 10.28.1 were used. This is not clean-install evidence, an independent model verdict or technical acceptance.

## Failures in the supplied log

Read `/Users/benharwood/.local/share/full-steam/jg-runs/ent-10e-ci-failed-38476783415.log` (run 38476783415). All distinct failures recorded there:

1. **Database test:** `packages/db/test/sso-emergency.integration.test.ts`, ENT-10e owner emergency records, **[E1] every non-owner role and all revoked or expired owner forms are refused without an OFF row**. PostgreSQL `23503`, constraint `client_organisation_tenant_id_branch_id_branch_kind_fkey`. The `grant` helper at baseline line 198 creates a client organisation with `branch_id=tenant_id`; no `(tenant_id,tenant_id,'branch')` org_unit exists. The stack reaches E1 at baseline line 222 before the client-approver refusal assertion. The database run reports **1 failed / 1,930 passed**, **1 failed / 132 passed files**. The command, `@jobguard/db#test`, root test lifecycle and checks step exit-1 messages are consequences of this same failure, not additional failed tests.
2. **Secrets job:** gitleaks 8.16.1 reports one `generic-api-key` finding at `docs/verdicts/ENT-10e/R3_FINAL_SCOPE.md:68` in historical commit `749e693364e00f23f0026aa4c677b773e9c5400f` (fingerprint `749e693364e00f23f0026aa4c677b773e9c5400f:docs/verdicts/ENT-10e/R3_FINAL_SCOPE.md:generic-api-key:68`). Source inspection identifies the reported material as a documented OpenAPI digest, not provider credentials; this is not a successful scanner rerun. Historical finding remains unresolved by this fixture repair. No allowlist, scanner change or history rewrite was made. The log also records cache-service warnings (400/service unavailable) and inability to post the scanner comment (`Resource not accessible by integration`); these are warnings, distinct from the finding.

No other failed test is listed in the supplied log. Green CI is still required on the dispatcher's resulting head; the historical secrets finding also needs disposition without weakening CI.

## Repair and retained guarantees

Only the piece-owned `grant` fixture changes. `ContractorRepository.startPractice` already creates the tenant → region → branch hierarchy (0054; hardened practice-start routine retained in 0138). The helper now selects a branch with `tenant_id=$1 AND kind='branch'`, deterministically ordered by ID, and passes its ID as a third parameter to the existing synthetic person-client INSERT. It preserves client ID creation, same-company binding, role, contractor-member link and grant behavior. No new hierarchy or production behavior is needed.

Every expectation is retained. `R6_PROTECTED_TEST_LINES.md` gives one before/after KEPT or RE-POINTED accounting row for every touched line; the second protected emergency file is entirely unchanged. `R6_ASSERTION_CHECK.json` records deterministic TypeScript AST comparison against HEAD: **96 + 25 + 76 = 197** original expect/matcher expressions remain byte-identical and ordered across integration, concurrency and window files. This is source checking, not PostgreSQL execution or independent verification. The fixture changes compile with the five integration suites and their imports.

Affected invariants: valid tenant-qualified, correctly typed organisation foreign keys in test inputs; preserved non-owner/revoked/expired-owner refusals and no-OFF-row assertions. No production source, migration, contract, schema, privilege, financial path, provider route, approval rule, audit guarantee, pin, lane policy or mandatory CI check changes. No data migration, backwards-compatibility impact or operational alert is introduced.

## Local validation

`pnpm typecheck --force`, `LANE_BASE_REF=origin/main pnpm lint --force`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, test-file compilation and `pnpm build --concurrency=2 --force` passed. The OpenAPI snapshot comparison passed through `node --import tsx` running the unchanged generator; `pnpm openapi:check` failed at the sandbox-prohibited IPC listener before executing the generator.

Final selected source/tool runs: **5,055 passed, one existing source-graph test timed out**. Core 2,445, API 1,572, web 784, AI 80, config 1, storage 2 and tools 19 passed. Database units report 152 passed and the existing `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator` timed out: `packages/db/src/audit-checkpoint-handoff.test.ts:279`, 5,675 ms elapsed against its unchanged 5,000 ms limit on the isolated final run. Earlier overloaded/interrupted runs and another completed timeout are recorded in R6_COMMANDS.md. No expectation, timeout, scanner or CI definition was weakened. This local timeout remains unresolved; this is not an all-green-local-checks claim.

## Catch-up and remaining gates

Read-only `git rev-list --count HEAD..origin/main` returns **4**. `origin/main` is `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`; `MERGE_HEAD` is absent, so the dispatcher has not started a merge. Main contains merges #182 and #183 and their underlying shadow-log and capture fixes. The dispatcher needs to catch this branch up; no git write is permitted in this round. This repair has no active same-file overlap with those two main changes.

Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e` are NOT RUN locally: they include forbidden git-writing tool fixtures, PostgreSQL startup and/or localhost/browser listeners. Selected unit suites exclude only those existing sandbox-incompatible tests; repository scripts, tests and CI definitions are unchanged. The E1 repair requires real PostgreSQL CI execution after push. Native and live-model evaluation are inapplicable to this fixture-only round.

Independent exact-commit verdict, separate technical acceptance and founder/dispatcher commit/push remain outstanding; no acceptance or release is claimed. Existing D04/G5/live-provider gates remain unchanged. Command results and sandbox limitations follow in `R6_COMMANDS.md`.
