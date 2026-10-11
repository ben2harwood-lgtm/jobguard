# CH-3a round 9 — builder receipt

7 October 2026. Branch `codex/sandbox/ch-3a`, PR #98. Repair is an uncommitted working-tree diff against `8722f7ff37c047ce0d204d2af3afe6536adc7061`; the dispatcher owns the next commit. Earlier work and migration **0095** are retained. Migration 0053, migration registration/order, the lane registry and BUILD_PLAN are unchanged.

**Status: repair implemented; local required checks passed. PostgreSQL execution, browser execution and independent review of the new commit remain pending. This is a builder receipt, not acceptance or an independent verdict.**

| Finding | Fix | Regression evidence |
| --- | --- | --- |
| Sol P2-1: fresh bootstrap and restore lose the commercial-track binding | Both fixture transactions insert SH-1's existing `job_commercial_track` binding as the migration role before UPDATE-to-live: immutable `small_builder`, `synthetic_demo`, `legacy_synthetic_live_fixture`, source = fixture job. Bootstrap uses conflict-safe insertion for replay. No new SECURITY DEFINER helper; 0053 is unchanged. | New bootstrap SQL-trace test was written first, failed against the original implementation at HEAD, then passed after repair. Real-PG bootstrap assertions check the committed binding and a subsequently committed runtime-role builder origin. Restore assertions check binding before live, committed origin creation, exact restored binding/origin and a new runtime-role origin after restore. PG assertions await CI. |
| Sol P2-2: runtime INSERT stores malformed revisions | 0095 enforces revision object/version/field types, nonblank text, schema length limits, optional phone/email/company-number shapes and unit/UPRN types. The existing match-key trigger validates address-array elements before text coercion; its prior CR/LF constraint remains. A pure, immutable SECURITY INVOKER validator matches JavaScript trimming and UTF-16 lengths; PUBLIC execute is revoked, runtime execute is specific and catalog-tested. | Tests written before the corresponding repairs require runtime SQL rejection of `[null]`, `[7]`, `[""]`, blank/overlong lines and `phone: ""`; additional scalar, optional-field and Unicode cases check rollback of both identity and revision. A positive maximum-length/Unicode case preserves readable valid revisions. These real-PG cases were collected, **not executed** locally; their red/green PostgreSQL evidence still requires CI. |
| Sol P3-4 / Opus P3-2: active contract says 0051 | Active reference in `docs/contracts/job-parties-v1.md` now says 0095. | Source/diff inspection; historical receipts retain historical numbers. |
| Opus P3-1: restore requires 0095 to be newest | Restore requires that the applied migration list includes 0095. The existing exact registry-order comparison remains. | Source inspection and JavaScript syntax check; full restore awaits CI. |

Tests/restore assertions were added before the bootstrap, restore-binding and migration fixes. The executable pre-fix result was `missing SH-1 binding before UPDATE-to-live: expected -1 to be greater than 63` (exit 1). It proves missing emitted SQL, **not PostgreSQL trigger behavior**. This sandbox cannot provide the requested real-PG pre-fix failures; none are claimed.

Environment: Node `24.17.0`, cached pinned pnpm `10.28.1`, existing installed dependencies. Commands below used `PATH=/private/tmp/jg-ch3a-round9-bin:$PATH`; that temporary launcher invokes the cached `10.28.1` binary. The initial default `pnpm -v` launcher tried version resolution and reported registry fetch/signature-verification failure; no install was performed and no package or lockfile changed. Logs: `/private/tmp/jg-ch3a-round9-logs/`.

| Command actually run | Exit | Result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/db exec vitest run test/demo-bootstrap.integration.test.ts -t 'bootstrap SQL trace'` before repair | 1 | Expected regression: missing binding SQL on 8722f7f. |
| Same trace command after repair; repeated after mock typing fix | 0 / 0 | One trace passed; three PG cases excluded by the explicit local filter. No source test is skipped or weakened. |
| `pnpm typecheck` | 0 | Seven packages; four cached, three executed. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Purity, lane, money/commercial boundaries and seven package checks; no self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | CH-3a lane passed, including local edits. Repeated after adding this receipt. |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | 0 | Four offline database CLI tests. |
| `pnpm --filter @jobguard/core exec vitest run src/job-parties.test.ts src/quote-document.test.ts src/job-import.test.ts` | 0 | 16 tests. |
| `pnpm --filter @jobguard/api exec vitest run src/job-parties.application.test.ts` | 0 | Four tests. |
| `pnpm --filter @jobguard/web test` | 0 | 71 tests in ten files. |
| `node --test tools/*.test.mjs` | 0 | 42 tests. |
| `pnpm build` | 0 | Seven packages; four cached, three executed; production Next build completed. |
| `pnpm openapi:check` | 1 | tsx IPC socket blocked by sandbox `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0 | Same generator/check, without the IPC-opening CLI. |
| `pnpm --filter @jobguard/db exec vitest list test/job-parties.integration.test.ts test/demo-bootstrap.integration.test.ts test/restore-rehearsal.integration.test.ts` | 0 | 82 cases collected; no PG execution. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-3a.spec.ts` | 0 | 36 cases collected across mobile-360 and desktop; no browser execution. |
| `node --check packages/db/tools/synthetic-restore.mjs`; `git diff --check` | 0 / 0 | Syntax and whitespace clean. |

Supplemental strict test-file compilation used `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 --types node`. The first attempt on both edited tests exited 1 (compiler 2): pnpm's isolated package layout could not find Node's ambient types. Adding `--typeRoots ../../node_modules/.pnpm/@types+node@24.0.3/node_modules/@types` exited 1 (compiler 2), exposing one new mock overload error and six pre-existing `unknown`-to-`string` errors in job-parties tests. The mock was repaired. Compiling `test/demo-bootstrap.integration.test.ts` alone with those resolved-type options exited **0**. The same compiler options on a temporary copy of `git show HEAD:packages/db/test/job-parties.integration.test.ts` (only import paths adjusted for the temporary location) exited 1 (compiler 2) with those same six earlier errors. Existing assertions and root check definitions were preserved; this extra compilation is not reported as a green suite.

**Not run and why:** full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:restore` and browser execution require the localhost/PostgreSQL/server capabilities that the dispatcher says are blocked here. The two free-port unit cases also require listening sockets. Full core/API regression suites and a clean install were left to CI; targeted task tests ran locally and dependencies were already installed. No AI behavior changed, so no live-model evaluation was needed or authorized. No live providers, real data, spending, real sends, production execution or policy approvals were used.

The user's supplied exact-head CI evidence answers Sol P2-3: run **37612791226**, HEAD **8722f7f**, `checks` green, DB **220** and browser **202** passed. That evidence covers the preceding head, **not this uncommitted repair**; it was not independently fetched here. New-commit CI, an independent recorded verdict and separate technical acceptance remain required. No assertion was removed/weakened; no timeout was added or lengthened.

Migration/compatibility: only unmerged 0095 is tightened, still in its original atomic transaction. The preceding supported schema/upgrade fixture (through 0053), synthetic backfill and old document-preservation assertions remain. Valid maximum-length revisions have new positive coverage. Fresh/upgrade SQL correctness still needs CI; local typecheck/build are not SQL proof. A failed application rolls back 0095; after successful deployment use a reviewed forward migration rather than rewriting applied history or deleting valid party data. No new operational alerts or release permissions were introduced.

Intended conventional commit message is in `/private/tmp/jg-msg-ch-3a.txt`. No git add/commit/checkout, push, merge, deployment or PR creation was performed.
