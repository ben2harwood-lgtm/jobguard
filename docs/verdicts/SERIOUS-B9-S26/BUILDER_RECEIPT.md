# SERIOUS-B9-S26 — builder receipt

16 October 2026; dispatcher 13; RED (money). Branch `codex/sandbox/serious-b9-s26`; unchanged HEAD `5746f7b15c88db3fe279a0d4adce4dfb37491731`. Working-tree delivery only; dispatcher owns commit/push. No repository Git writes, package download, PostgreSQL startup, browser, external send, spending or real data. This is builder evidence, not an independent verdict or technical acceptance.

**Disposition: requested S26 scope implemented; HOLD for PostgreSQL CI, additional unchanged fixture contradictions below, independent exact-commit RED verdicts and separate acceptance.** No additional fixture repair or expectation change has been made. The optional setup-repair question received no answer during this work; it is not approval.

Read AGENTS.md; BUILD_PLAN.md §§10.3.1–10.3.5, especially F18/F19 at 1687–1688; the eligibility contract; Batch 9/S26 in the triage; the earlier fixlater-6 SERIOUS-B9 receipt and stopped reproductions; and the full coordinator ruling 55 at `/Users/benharwood/.local/share/full-steam/handoffs/BEN-DECISIONS-2026-10-14.md:77`.

## Reproduction and change

Before changing the reader, added and executed `test/recovery-eligibility-v3-interest.test.ts` case **F18 principal-only** against this HEAD's reader, with its core output rebuilt from source. It failed for the required reason:

```text
FAIL test/recovery-eligibility-v3-interest.test.ts > F18 principal-only
AssertionError: expected 262000 to be 250000
Expected: 250000
Received: 262000
Tests: 1 failed (1)
```

Actual command: `pnpm --filter @jobguard/db exec vitest run test/recovery-eligibility-v3-interest.test.ts --maxWorkers=1`; exit 1; log `/private/tmp/jg-s26-red.log`. These are repository adapter doubles, not a database run. After the fix, that case and four added component-state cases pass (5/5; `/private/tmp/jg-s26-green.log`); the broader DB unit run also passes all 393 tests including these cases.

Existing stored facts distinguish the components: `packages/core/src/practice-facts.ts:24–25` defines `receipt-interest-120` and `receipt-compensation-70`; 0131 permits their original identified movements in `app.practice_feed_event`. No money rule or settlement source was invented.

- Existing F18 row: **262000 and every assertion retained**. Its only change is an added setup call settling both movements through the existing `PracticeFeedRepository.factsView/factsCommand` path before review. All F15/F17/F19–F22 rows and all other original file bytes remain unchanged. A read-only baseline comparison verifies that deleting just that inserted setup line leaves the complete original file as a byte-identical prefix; all new coverage is appended.
- Reader: otherwise-qualifying F18 interest uses its own original identified event, same tenant/job, settled state, unreconciled-duplicate hold and PostgreSQL timestamp comparison. Missing/pending/held interest contributes zero and says `Pending money cannot qualify`; at/before-opening interest contributes zero with its component's paid-before reason. Principal stays 250000p and compensation zero. Paid, unheld, after-opening interest contributes 12000p, retaining F18's 262000p and compensation reason. Whole-case pending, timing and insurer exclusions are preserved. Exact checked bigint aggregation; no float money arithmetic. An available interest event is also referenced in the review audit.
- Migration **0172_recovery_eligibility_paid_interest.sql** restates the latest 0142 guard and deferred effect definitions, preserving insurer checks, ownership/signatures/grants and completeness checks. It independently refuses unpaid interest in the header and component lines. Historical 0130/0142 SQL, all earlier migrations, `src/migrate.ts` and `MIGRATIONS.md` are unchanged. Directory discovery finds 0166, above main's highest 0165.
- New PostgreSQL coverage (authored/collected, not executed): principal-only/pending/paid/compensation/representation/duplicate behavior, immutable replay, cross-job interest exclusion, interest timestamp boundary, raw runtime header/component forgery, and replacing the previous guard definitions on populated current schema followed by 0166 alone. The upgrade case compares all identified saved review/claim/audit rows and types plus routine owner/ACL/security attributes, then appends a corrected review and reruns the runner twice. This is not claimed as an executed upgrade proof.

## Exact-scope hold: further original fixtures still assume unpaid interest qualifies

**STOP on additional repairs outside ruling 55's single existing-row setup change.** These existing assertions were not changed or weakened. Source inspection predicts failures; PostgreSQL was not executed here. The remedy could be additional explicit setup-only repairs preserving their assertions, but none is authorized/performed by this receipt. No before/after expectation edit has been applied.

| Original file and baseline line | Before (untouched assertion/setup) | Corrected behavior on that unchanged setup |
| --- | --- | --- |
| `packages/db/test/recovery-eligibility-v3.integration.test.ts:295–300` (assertion 299; now 300) | Only receipt-3000 settled; expects Q 262000 and compensation reason | Q 250000; pending-interest reason. Needs separately settled interest setup to retain its existing assertion. |
| `packages/db/test/recovery-insurer-money.integration.test.ts:124–132` | Pre-0142 current-reader setup settles only receipt-3000; expects 262000 | New reader derives 250000; old pre-0166 SQL refuses it with `ELIGIBILITY_FIXTURE_MISMATCH` before assertion 132. |
| Same insurer file `:329–344` | Mark-concurrency fixture settles only receipt-3000; expects 262000 at 344 | Q 250000 after the mark; interest is still unpaid. |
| Same insurer file `:400–417` | F18 after principal customer-own mark expects 262000 and compensation reason at 407/417 | Q 250000 and pending-interest reason. F19 remains unchanged. |
| Same insurer file `:421–423` | Non-insurer parameter rows expect 262000 and compensation reason with only receipt-3000 | Q 250000 and pending-interest reason; insurer-zero controls stay zero. |
| Same insurer file `:425–434` | Missing-binding fixture only settles receipt-3000; assertion 434 expects 262000 | Q 250000; missing binding does not prove settled interest. |
| Same insurer file `:448–450` | Payer-change fixture expects 262000 after changing payer to person | Q 250000; payer change does not settle interest. |
| `packages/db/test/recovery-timing-pin.integration.test.ts:118–123` | After-opening F18 helper sums business interest into `full` (262000) and expects compensation reason; only principal is settled | Q 250000 and pending-interest reason; F19 and before-opening exclusions remain unchanged. |

These holds are not an instruction to change any expected amount, reason, list, pin, hash, count or fingerprint. A coordinator must disposition the additional setups before a green full database claim. The existing `practice-facts.integration.test.ts:389–403` already settles all three components and retains its 262000 assertion.

## Commands and actual evidence

Installed dependencies reused. Node 24.17.0 (repo pin 24.15.0), cached pnpm 10.28.1. Successful pnpm commands used `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`, selecting the installed pinned pnpm without downloading. This is not a clean pinned install.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core build` | Exit 0; rebuild before red reproduction. |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached; `/private/tmp/jg-s26-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; purity, money/commercial boundary, lane and 7 package checks; `/private/tmp/jg-s26-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; `/private/tmp/jg-s26-lint-lanes.log`. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; `/private/tmp/jg-s26-lane-direct.log`. Unlike the earlier stopped batch, it did not refuse self-comparison: shared origin/main advanced to 66205cfa419f7ebee00dabaa4babb325aeb92472 while HEAD stayed fixed. No fetch or ref write by this builder. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached, Next production build; `/private/tmp/jg-s26-build.log`. Existing webpack dynamic-import and Turbo cache-write permission warnings retained. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 0; 94 files, 2601 passed; `/private/tmp/jg-s26-core-unit-final.log`. |
| Individual same command for config/storage/AI | Exit 0 each; 1 / 2 / 85 passed; `/private/tmp/jg-s26-{config,storage,ai}-unit-final.log`. AI is synthetic fixture coverage only. |
| `pnpm --filter @jobguard/db exec vitest run src test --exclude 'test/**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Exit 0; 34 files, 393 passed; `/private/tmp/jg-s26-db-unit.log`. No PostgreSQL; free-port listener test excluded. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files, 844 passed; `/private/tmp/jg-s26-web-unit.log`. No browser. |
| API source unit suite with nine socket/database suites excluded | Exit 0; 78 files, 1642 passed; `/private/tmp/jg-s26-api-unit-final.log`. |
| Seven non-Git-mutating tool unit suites | Exit 0; 19 passed; `/private/tmp/jg-s26-tools-unit.log`. Exact command below. |
| `pnpm openapi:check` | Exit 1: tsx CLI cannot bind its IPC pipe (`EPERM`); `/private/tmp/jg-s26-openapi.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` after build | Exit 0; same generator/snapshot comparison without CLI listener; `/private/tmp/jg-s26-openapi-direct-final.log`. |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-eligibility-v3.integration.test.ts --json` | Exit 0; 39 cases collected, including 8 new cases. Hooks/tests not executed; `/private/tmp/jg-s26-collection-final.log`. |
| `git diff --check`; read-only original-byte and migration-order checks | Pass. No original assertion, row, pin, hash, count or fingerprint changed. |

API command: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude src/auth/sso/action-paths.test.ts --exclude src/contractor/contractor-practice-session.http.test.ts --exclude src/contractor/site-extra-pricing.http.test.ts --exclude src/contractor/site-extra.http.test.ts --exclude src/contractor/site-visit.http.test.ts --exclude src/contractor/practice-worker-switch.http.test.ts --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts`. These are invocation-only exclusions; no test/configuration was disabled. CI owes all mandatory suites.

Tool command: `node --test tools/core-purity.test.mjs tools/commercial-boundary.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs`. The three Git-fixture suites are deferred because they issue Git writes, prohibited by this order; `pnpm test` would also start PostgreSQL and was not run.

Earlier unsuccessful checks are retained: initial API unit run (13 files failed; 77 tests failed / 1548 passed) and listener-free OpenAPI run used stale installed DB exports, before the required full build; the latter reported missing `JobSourceRepository`. They were rerun after the successful full build. An initial recursive four-package domain command returned exit 1 even though all four package summaries passed; individual reruns returned exit 0 and are the evidence above. An auxiliary byte-check script initially had a comparison-line typo, then passed with the exact inserted line; this did not change repository content.

## Invariants, migration and release gates

Affected invariants: tenant/job-qualified proof (§5.1, §5.8), settled-money-only eligibility and exact arithmetic (§5.5–§5.6), immutable snapshots/audit/replay (§5.4, §5.7), synthetic/no-charge/production-disabled boundary (§5.10). No new business table, network call, authorization route, provider, credential, UI, alert, model/prompt or fee posting. Existing command/result versions and all production/commercial approval gates stay unchanged.

Migration notes: `packages/db/migration-notes/0172_recovery_eligibility_paid_interest.md`. Roll out reader and SQL together; an older reader's unpaid-interest artifact is intentionally refused by the new guard. Existing snapshots/replays remain historical; new commands append corrected snapshots. Failure during installation rolls back; after installation fix forward, retaining the financial guard and append-only history.

Final scoped recheck: `LANE_BASE_REF=origin/main pnpm lint` again exited 0 (7 successful tasks; `/private/tmp/jg-s26-lint-final.log`); direct lane check again exited 0 and included all seven changed/new files (`/private/tmp/jg-s26-lane-final.log`). Final read-only comparison verified every pre-existing migration, runner and MIGRATIONS.md unchanged, and all original integration rows/assertions retained. `git diff --check` passed; HEAD remained the issued baseline.

Dispatcher must commit, obtain exact-commit independent RED verdicts and separate acceptance, resolve the held additional fixtures and run the complete PostgreSQL fresh/upgrade/regression suites in CI. No technical acceptance, independently verified guarantee or production release is claimed. No database/browser execution in this sandbox. Intended commit message is `/private/tmp/jg-msg-serious-b9-s26.txt` (overwritten as ordered).
