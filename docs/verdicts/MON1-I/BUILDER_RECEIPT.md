# MON1-I builder receipt — 24 October 2026

**STOP / partial build-ahead handoff. Not technically complete, reviewed or accepted.**
Builder: Codex. Decision 74, C250 one build; no commits or pushes. Runtime
consumer integration is blocked by the accepted parent's deliberately held API.

## Source and authorization

Worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon1-i`,
branch `codex/sandbox/mon1-i`, base `a9dc9c42ba23df5b5bb35bb4537c904aae71dac6`.
Local integration ref `origin/main` = `4b1a779008505c86ca85db78fb38eda412394fe4`.
No fetch; remote freshness is not claimed. Initial working tree was clean.
Read AGENTS.md, applicable BUILD_PLAN §§10.1.4–10.1.6/MON-1/MON-2, draft
MON1-I and common contract (§§1–2, verification contract), migration conventions,
and the accepted A/S/T/L source/acceptance records. Source symbols verified with
`git grep`; source inspection is distinct from executed tests.

Acceptance records read in `/Users/benharwood/.local/share/full-steam/jg-runs/`:

- `v5-mon1-a-acceptance-a9dc9c42-20261024.md` — accepts HELD foundation, positive routine always refuses.
- `v5-mon1-s-acceptance-cd1bfdec-20261024.md` — retains H-MON1S-SHADOW-PRIV.
- `v5-mon1-t-acceptance-153dd5b2-20261023.md` — retains lock-order STOP and B6 reconciliation/approval restriction.
- `v5-mon1-l-acceptance-70e1778a-20261023.md` — accepts PARTIAL foundation; intervals/counts held.

These are parent records, not verdicts for this working tree. CI on this diff:
NOT RUN; no run URL or candidate commit exists. New independent A/B verdicts and
separate acceptance remain owed. Dispatcher owns commit/push; merge/release held.

## STOPs and safest choices

Full source mapping: `docs/contracts/meter-command-consumers-v1.md`.

| STOP | Verified evidence | Choice / owner action |
| --- | --- | --- |
| S-ADMISSION | No executable TS admission export; 0210 `app.mon1_admit_place` always raises `METER_PLACE_SOURCE_HANDOFF_HELD`, runtime/meter EXECUTE revoked | Do not call held refusal in builder commands or grant privilege. MON1-A/coordinator must supply authenticated pre-mutation resolver and lock-order contract. |
| S-CLOCK | MON1-L/S preserve `H-METER-CLOCK`, unknown counted places | Do not count or price candidate allowances; upstream must supply resolved operational intervals. |
| S-TRIP | 0208:111/:128 `SMALL_TRIP_RECONCILIATION_REQUIRED`; routine acquires audit head | Do not wire into approvals and roll them back. MON1-T/coordinator must supply non-refusing reconciliation and complete lock order. |
| S-SUBSCRIPTION | `app.mon2_source` reads `meter_input_event`; no lifecycle version dispatch | Preserve supplied-source path; no unknown→zero conversion, session→company bridge or invented trial facts. |
| S-EXTERNAL | CH-5/SV-7A consumer closure outside this leaf | Owner integration/execution evidence still required; no guessed new API/spec. |

Ben's answer was read at
`/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`
(the repository-relative location is absent). Applied safest choices: unknown
meter intervals do not become counts, held authority does not become a permit,
private trip state stays private, exact existing source/approval contracts stay
intact, and no paid/settled/live action is inferred. No new product policy.

## Allowed-file reconciliation

Added own lane `config/lanes/mon1-i.json`, contract, this receipt and three named
owned DB integration test files. No existing product file edited. No SQL emitted;
reserved 0223 unused. No migration note/own-step upgrade test without migration.
No new role, grant, public API, schema, prompt, model, environment setting or alert.
Shared barrels/catalogue tests/route registration: exact additive rows **none**.
Existing v1 activation/import/fees untouched; backwards compatibility not claimed
as tested until CI. No browser route/page added; therefore no browser spec for an
absent route. No package install, DB/listener/browser/provider/real-data execution.

## Acceptance mapping

| Acceptance | Evidence supplied | Remaining hold |
| --- | --- | --- |
| M1I-01/02/03/05 | source mapping; CI preflight refusal/grants/replay test | Actual command success/refusal/rollback/cap/linked work not implemented. |
| M1I-04 | CI private-boundary wait test in both kind orders | Source-vs-lock/plan/revocation races absent until upstream admission. |
| M1I-06/08/09 | CI supplied-source fresh read, accepted terms and foreign-company refusal test; existing nine-price regression identified | No lifecycle bridge/prices; mandatory regressions NOT RUN. |
| M1I-07 | no response changes or trip hooks | Positive integrated response non-disclosure proof still owed. |
| M1I-10 | no schema/routine/catalogue change | No own migration proof applicable; existing 0210 upgrade and catalogue CI mandatory. |

The new tests are preflight/compatibility evidence, not real-command journeys.
No test is skipped, expected-failure, seeded to an asserted command end state or
used to claim MON1-I completion. No guard/drop control added. Every newly asserted
held/grant guard has a direct rejection assertion; no product guard introduced.

## Commands and results

All run from the worktree above. Local heavy commands use `HEAVY_SLOTS=1
/Users/benharwood/.local/bin/heavy-slot <label> ...`, one batch at a time. Disk
initially 112,372,824 KiB free (>45 GiB), memory 57% free; host process count 2.
Sandbox `ps` was denied on initial read, so authorized checks use host execution
through the existing scheduler with process visibility. Node v24.17.0;
package manager pinned pnpm 10.28.1; dependencies preinstalled, no clean install.

| Command (inside scheduler unless stated) | Result |
| --- | --- |
| `pnpm --filter @jobguard/db typecheck` (initial) | exit 2: missing generated `packages/core/dist/meter-lifecycle.js`, with dependent implicit-any diagnostics in accepted parent tests. |
| `pnpm --filter @jobguard/core build` | exit 0; generated existing dependency, no source change. |
| `pnpm --filter @jobguard/db typecheck` (after core build) | exit 0. |
| `pnpm --filter @jobguard/db lint` | exit 0. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-persistence.test.ts src/meter-repository.test.ts src/meter-lifecycle-repository.test.ts` | exit 0; 3 files, 21 tests passed. Existing scripted/pure unit tests, no DB/socket. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | exit 1: inherited CH-4/MON1-L/T/S/A stack paths outside MON1-I lane (including API/OpenAPI, catalogues, prior receipts/lane files). No allowlist widening. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | exit 1 at same lane boundary; purity emitted eight existing computed-import warnings. Package lint phase not reached; DB lint separately passed. |
| `pnpm build --concurrency=1` | exit 0; 7/7 tasks successful, 3 cached. Existing CSS autoprefixer warnings. Not all tasks rebuilt from clean output. |
| `pnpm openapi:check` | exit 0. |
| `git diff --check` (read-only, outside scheduler) | exit 0; new files remain untracked for dispatcher. |

`HEAVY_SLOTS=1 /Users/benharwood/.local/bin/heavy-slot jg-mon1-i-root-typecheck
node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs
typecheck --concurrency=1` also passed, exit 0 (7/7 tasks). Log:
`/private/tmp/jg-mon1-i-root-typecheck.log`. The final sequential check runner
is `/private/tmp/jg-mon1-i-checks.sh`, with exact statuses in
`/private/tmp/jg-mon1-i-check-status.txt`; individual logs are
`/private/tmp/jg-mon1-i-{typecheck-final,db-lint-final,units,lanes,lint,build,openapi}.log`.
Two earlier scheduler-queued typecheck/lint launchers were cancelled before they
started, then replaced by this one sequential runner; no execution result is
claimed for those cancelled launchers. One generated-dependency retry, no product
repair round. The cached pinned pnpm executable reports `10.28.1`; ordinary pnpm
commands also emitted an ignored-overrides warning. No dependency/toolchain edits. The global pnpm shim (under global/v11) stalled
on `pnpm --version` and was cancelled; cached pinned pnpm version verification
returned 10.28.1. Ordinary commands above report their actual observed results,
not a clean pinned-install claim.

No SQL/catalogue/RLS/race/browser/restore assertion has been executed here. The
three new DB files are outside the package's src-only TypeScript include; their
real execution/validation remains explicitly CI-only. The 21 unit passes do not
validate them or satisfy the held M1I acceptance criteria.

## CI-only commands (NOT RUN locally)

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/meter-source-command-wiring.integration.test.ts test/meter-source-command-races.integration.test.ts test/meter-subscription-source.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-persistence.integration.test.ts test/subscription-statements.integration.test.ts test/subscription-authority.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/activation.integration.test.ts test/job-import.integration.test.ts test/variation.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/final-account.integration.test.ts test/job-work-state-races.integration.test.ts test/job-work-state-post-lock.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/meter-place-admission-upgrade.integration.test.ts test/meter-lifecycle-upgrade.integration.test.ts test/meter-trip-upgrade.integration.test.ts
```

Mandatory root CI typecheck/lint/test/build/openapi/database/migrations/eval and
earlier browser/restore/security/dependency gates remain required. Root `pnpm test`
has an unbounded nested Node runner; common contract holds local use until the
coordinator supplies bounded invocation. No broad local suite run. No live model
run is authorized/needed. Browser closure remains MON1-J/DEMO-S ownership.

Discovered later: operational admission, trip reconciliation and lifecycle billing
are substantive upstream work, not a permission to relax their holds. No edits to
BUILD_PLAN (outside allowlist). No independent verdict or acceptance manufactured.

Intended conventional commit text: `/private/tmp/jg-msg-mon1-i.txt`. No commit SHA
exists for this diff; no git write command was run.

Final source-only working-tree reconciliation (Node imported the existing lane
helpers and checked `git ls-files --others --exclude-standard`): exit 0, all six
new paths permitted. This is an allowlist check only, not a replacement or pass
for the failed `origin/main` lane gate.
