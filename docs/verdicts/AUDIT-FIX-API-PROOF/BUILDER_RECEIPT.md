# AUDIT-FIX-API-PROOF builder receipt — repair r1

Issued 13 October 2026 by dispatcher 4. Branch: `codex/sandbox/audit-fix-api-proof`. Repair starts at `32c413488652ed2177108ce0b23afaf9457a7b94`; comparison base: `e4cb8437d044746300c377647f6061d06cd960cc` (`origin/main`). Review lane: **RED** for proof/Decision authorization effects. **HOLD: B1 and B3a have code repairs with red/green application tests; real PostgreSQL verification and an independent verdict on the dispatcher's eventual commit are pending. B2 and B3b remain OPEN BLOCKING.** No technical acceptance is claimed.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.4, 5.3, 5.6 and CH-2, and the independent Opus verdict `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-proof-opus-32c4134.md` (REPAIR; source inspection, no tests run). This receipt replaces the incorrect blanket “DROPPED” classifications in the first receipt. Inability to run PostgreSQL does not close a finding.

## Blocking findings and implemented repair

- **B1 — code repaired, application reproduction red → green; PostgreSQL verification pending.** `ProofCommandService.invalidate` now locks the upload row joined to the tenant-scoped evidence before its INSERT. Completion locks the same upload in a separate statement before its authoritative eligibility read. The separate statement matters: a READ COMMITTED eligibility statement that waits for a row lock could otherwise retain a snapshot from before the invalidation committed. The original stage advisory lock and eligibility predicate remain. If completion wins, invalidation waits and records rework against that committed completion. If invalidation wins, completion reads its committed invalidation and refuses with `PROOF_NOT_FINAL`, rolling back its identity/receipt. Locks precede the audit append. No storage/network operation was moved inside a transaction.
- **B3a — code repaired, application reproduction red → green; PostgreSQL verification pending.** `proof.rework_required` is appended only when the invalidation INSERT returned a row, using that inserted row's generated ID. Same-command retries and a fresh command targeting the already-invalidated evidence retain the existing response and do not add a second business audit event. Existing guards already prevent duplicate review/finding writes. This does **not** establish invalidate command identity or changed-payload conflict handling: that is B3b.
- **B2 — OPEN BLOCKING / STOPPED: migration required.** Original-stage replacement proof is still blocked by the unique stage completion and stage-wide receipt semantic key.
- **B3b — OPEN BLOCKING / STOPPED: migration required.** Invalidate still bypasses application replay records and has no tenant-wide command identity binding. This repair does not claim the larger “audit and command identity” finding is closed.

New application tests in `packages/db/test/proof-invalidation.test.ts`:

1. `completion cannot clear a concurrent evidence invalidation` — before the fix, the completion survives with no review event; after the fix, the invalidation records its required review against that completion.
2. `invalidation retries preserve audit references without a second business event` — before the fix, three calls produce three audit events for one invalidation; after the fix, only one event references the stored invalidation ID.

Both tests were written and executed before any source change. The red run failed both assertions (empty review list; audit count 3 instead of 1). The source fix then passed both unchanged assertions. A final test-double adjustment identifies the invalidating transaction explicitly before releasing the completion barrier; the final rerun also passed both assertions (`green-final.log`). This SQL/transaction double is application orchestration evidence, **not PostgreSQL assurance**.

New real-PostgreSQL tests in `packages/db/test/proof-invalidation.integration.test.ts`, written before the fix and **not executed here**:

1. `completion cannot clear a concurrent evidence invalidation` — two real runtime connections; pause after actual eligibility SQL, observe the invalidator blocked using `pg_blocking_pids`, then check immutable completion and its review/invalidation link.
2. `completion rechecks invalidation after waiting for the upload lock` — pause completion's external storage read, leave a real invalidation uncommitted, observe completion blocked, then commit invalidation and assert typed refusal, no completion/audit, and rollback of the identity/receipt.
3. `invalidation retries preserve audit references without a second business event` — exact and fresh-ID concurrent retries; one stored invalidation/review/finding/audit event, unchanged audit sequence, stored-ID reference, and verification of the full tenant audit chain. This deliberately tests **B3a only**, not the still-open command-identity half.

## Exact migration scope needed — not implemented

**B2:** Preserve the existing immutable `app.stage_completion` and `app.stage_review_event` history and the uniqueness from `0015_proof_stage_gates.sql:5`. Add a durable replacement/resolution record that binds tenant, job, scope identity, original stage/completion, the invalidation requiring rework, the replacement verified evidence/link, actor and command identity. It needs tenant/job/scope-qualified integrity, semantic uniqueness, append-only runtime SELECT/INSERT access, migration ownership, ENABLE/FORCE RLS, and no runtime UPDATE/DELETE/TRUNCATE. Define its resolution projection so proof reads, Decisions and final-account proof gates agree that the **original** stage has been repaired. Replace the stage-wide receipt key in `proof-repository.ts` with a versioned replacement-attempt identity that preserves old completion replays. Wire original-stage completion through that additive record rather than inserting a second conflicting completion or renaming `electrical-stage`. Supply fresh/upgrade/backfill compatibility, catalog/privilege and rollback/forward-fix tests. No new migration number is claimed; the dispatcher must issue and allocate this scope.

**B3b:** An additive migration must extend the `app.watchdog_command_identity.command_type` CHECK originating at `0096_watchdog_live.sql:98` to admit `proof.invalidate`, and both the `app.proof_application_response.action` CHECK and its action/type mapping CHECK (around lines 121–129) to admit `invalidate` / `proof.invalidate`. Preserve the existing composite identity FK and tenant isolation. Accompany it with the typed command-kind union, invalidate's identity claim/request hash/result handling, and application replay/atomic response recording (the early return in `apps/api/src/proof/proof.application.ts` currently bypasses them). Test exact replay, changed evidence/reason/job/kind conflict, concurrent IDs, inactive actors, first-response preservation, atomic rollback, and old-schema upgrade compatibility. No constraint, grant, command registry or application replay behavior was changed in r1.

## Changes and preserved guarantees

Changed only `packages/db/src/proof-repository.ts`, the two new test files, this receipt and this task's compact lane entry. Widened that entry to these five exact files; all other parsed lane values are unchanged. Shared lane registration changes must serialize with the integrator. Existing tests and their expected values, refusals, counts, names and fingerprints are untouched; `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD and was not re-pinned.

Affected invariants: AGENTS §§5.4 (transaction/lock ordering), 5.7 (audit reflects a stored business effect), 5.8 (proof eligibility), BUILD_PLAN C4/C5. No migration, grant, provider action, credential, environment variable, package/lockfile, generated OpenAPI or UI change. Standard F: no access widened. Existing completion request hashes, receipts, stage identity and replay results are preserved. Invalidation's response shape remains unchanged; a duplicate no-op no longer emits a business event. Row-lock contention is intentional and needs real-PostgreSQL verification. No new operational alert was added. Reverting the code repair requires no schema rollback, but restores the audited defects; use a reviewed forward fix if database testing reveals a problem.

## Commands actually run in this repair

Supplied dependencies only; no install/download or clean-install claim. Node `v24.17.0`, pnpm `10.28.1` using its existing cached binary through `/private/tmp/jg-api-proof-r1-bin/pnpm`. Root lint and lane checks use `LANE_BASE_REF=origin/main`. Logs: `/private/tmp/jg-api-proof-r1-*.log`.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/proof-invalidation.test.ts` before fix | Vitest exit 1; both tests failed on the two expected defect assertions (`red.log`). |
| Same command after fix | Exit 0; 2/2 passed (`green.log` and final `green-final.log`), also included in the 155-test DB unit run. |
| `pnpm typecheck` | Exit 0; all 7 workspace tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; purity, lane, money/commercial boundaries and all 7 package lint tasks passed, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; checked the task branch's committed range plus all five working-tree paths. |
| `pnpm build` | Exit 0; all 7 workspace tasks successful, 2 cached; production Next build included. Existing workspace-root/autoprefixer/webpack and sandbox Turbo I/O warnings observed. |
| `pnpm openapi:check` | Exit 1; sandbox refused tsx CLI IPC pipe creation (`listen EPERM`); no OpenAPI mismatch reported. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; runs the same unmodified checker without the forbidden CLI IPC listener. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 0; 80 files, 2415 tests passed; source tests only, no generated-dist duplicates. |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1` | Exit 0; config 2, AI 80, storage 1 tests passed. AI fixture evidence only; no live model run. |
| Available API command below | Exit 0; 59 files, 1386 tests passed, including unchanged proof application and context-boundary tests. |
| `pnpm --filter @jobguard/web test` | Exit 0; 33 files, 784 unit tests passed. |
| DB unit-only command below | Exit 0; 12 files, 155 tests passed, including both new regressions. |
| `node --test` available tool suites below | Exit 0; 19 tests passed. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-api-proof-r1-test-tsconfig.json` | Supplemental strict check of both new tests and their transitive imports: exit 2, solely at unchanged `test/watchdog-command-harness.ts:164` (`string \| undefined` passed as `string`). No diagnostic in either new test. The normal repository typecheck excludes test/ and passed. The shared harness was not edited or its strictness weakened. |
| `git diff --check` | Exit 0. Read-only JSON/byte comparison also passed for other lanes and the pinned context-boundary test. |

Exact available API command (excluded suites need a local server or PostgreSQL):

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude src/recovery-message.controller.test.ts --exclude src/recovery-follow-up.controller.test.ts --exclude src/watchdog-registry.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/contractor/site-visit.http.test.ts --exclude src/contractor/site-extra-pricing.http.test.ts --exclude src/contractor/site-extra.http.test.ts --exclude src/contractor/contractor-practice-session.http.test.ts
```

Exact DB unit-only command:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src test/proof-invalidation.test.ts test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts
```

Exact tool test command:

```sh
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

No PostgreSQL or browser suite was started: the sandbox cannot bind localhost or start PostgreSQL. Root `pnpm test` was not run here because its lane fixture suites run writing Git commands and its DB suites start PostgreSQL. No Git write command (including add, commit, checkout or push) was run. Tests that require those facilities remain mandatory on the Mac/GitHub CI. Intended conventional commit message is at `/private/tmp/jg-msg-audit-fix-api-proof.txt`, for the dispatcher to commit.

## Dispatcher: Mac / GitHub CI commands and remaining gates

Use at most **2 Vitest/Playwright workers**; DB package scripts already use one. Execute the three new PostgreSQL tests first, then the existing proof/replay and lock-order regressions:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/proof-invalidation.integration.test.ts test/evidence.integration.test.ts test/proof-replay.integration.test.ts test/proof-application-records.integration.test.ts test/watchdog-lock-order.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
pnpm --filter @jobguard/web test:e2e --workers=2 --project=mobile-360 --project=desktop UIWIRE-7.spec.ts CH-2.spec.ts proof-capture.spec.ts
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
pnpm build
pnpm openapi:check
```

`pnpm test:migrations` remains a preservation check; r1 has no migration. Full pinned-install CI, the real PostgreSQL/browser results, a fresh independent verdict bound to the dispatcher's exact repair commit, and separate technical acceptance remain release/acceptance gates. The earlier Opus REPAIR applies to `32c4134`, not this working-tree fix. B2's `replacement proof clears rework on the original stage` and B3b's command-identity acceptance tests belong to their future issued migration scope; neither was implemented or relabelled passed here.

## Later findings unchanged

- Finding 4: adopted-job inherited ownership can pass PracticeAccess but fail the synthetic storage check during proof finalization.
- Finding 5: Nest does not translate proof application typed client errors to the Next transport's 400/422 responses.
- The audit's five suggested test strengthenings remain outside this repair. The new B1/B3a tests supply evidence only for the two issued code defects.


## CI repair round r1 — 14 October 2026 — PR #200

Builder implementation/run receipt; no independent verdict or technical acceptance. Starting and final local HEAD: `b54ee2c17ba6a3635a0128a23ff5199492bce8b4`, branch `codex/sandbox/audit-fix-api-proof`, clean before this repair. Read-only Git inspection confirmed its parents are remote piece head `ea5ad607c5301da4b42d00663522f31e1752380d` and catch-up main `2df37c1af5a35b0d5654d57cf2c735770f1d7e67`. Worktree alias `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/audit-fix-api-proof` resolves to `.worktrees/sv-3-barrier`. The sandbox executor initially refused to start because the writable root is symlinked (no process/exit code); automatic review allowed the authorized commands outside that executor sandbox. No Git write, install, package download, PostgreSQL start or browser server was performed.

Read AGENTS, BUILD_PLAN §§2.4, 5.3, 5.6 and CH-2, the existing receipt and supplied filtered CI failure log for run `38528120095`. The first broad instruction search returned exit **2** because optional `.agents`/`.codex` paths were absent; narrowed repository reads succeeded. Repository/runtime/script inspection returned exit **0**: Node `v24.17.0`, installed pnpm `10.28.1`. These checks use supplied dependencies and do not prove a clean install.

**The two reported failures are repaired without editing any merged test or pin.** In `proof-repository.ts`, the separate upload-lock statement now starts with the existing tenant-scoped evidence lookup (`SELECT id FROM app.evidence_object`) and obtains `FOR UPDATE OF u` in its correlated `EXISTS` subquery. It still locks the exact upload belonging to that evidence, in both completion and invalidation, before completion's separate READ COMMITTED eligibility snapshot. There is no moved eligibility predicate, combined lock/eligibility snapshot, removed lock, catch-and-ignore path or runtime privilege change. This query shape is accepted by the unmodified merged final-account SQL double; its application can invalidate the proof and persist the blocked revision again.

The only test edit is three fixture lines in this piece's `proof-invalidation.test.ts`: explicitly answer the merged lifecycle/locked-source queries with no locked final account for this live-job fixture. The real guards still run. Its race schedule, upload-lock behavior and all existing assertions are unchanged. No change to `audit-api-file-final-account.test.ts` is needed.

**Genuine mutation red → restored green:** with the corrected piece-owned double in place, temporarily remove only `invalidate`'s call to `lockProofUpload`, leaving completion's locks and all assertions intact. The race test returns exit **1** at `proof-invalidation.test.ts:94`: `reviews` is empty while one persisted invalidation is expected. It fails the business invariant, not an unexpected SQL or timeout. A `finally` block restores the product file byte-for-byte; the two complete regression files then return exit **0**, five passing tests and no unhandled errors. The mutation is absent from the final diff. This is application orchestration evidence, not proof of PostgreSQL snapshots or contention.

### Commands and results for this round

Logs are `/private/tmp/jg-api-proof-ci-r1-*.log`; exact command/exit manifests are `jg-api-proof-ci-r1-checks.json` and `jg-api-proof-ci-r1-units.json` in that directory.

| Command/check | Exit | Evidence |
| --- | --- | --- |
| `git rev-parse HEAD`, `git status --short`, `git branch --show-current`, read-only parent/base inspection | 0 | Correct head/branch, initial clean tree; no Git mutation. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/proof-invalidation.test.ts test/audit-api-file-final-account.test.ts` before repair | 1 | Both CI failures reproduced: `PROOF_INVALID` and lifecycle-query rejection causing a timeout/unhandled rejection; 3 passed / 2 failed (`before.log`). |
| Same two-file command after repair | 0 | 5/5 passed (`green.log`). |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/proof-invalidation.test.ts -t 'completion cannot clear a concurrent evidence invalidation'` with invalidation-lock mutation | 1 | Intended review-event assertion fails; other test unselected (`mutation.log`). Mutation/restoration Python wrapper exit 0. |
| Same two-file command after mutation restoration | 0 | 5/5 passed (`restored.log`). |
| `pnpm typecheck` | 0 | 7 workspace tasks passed; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Root boundary/purity/money checks and 7 workspace lint tasks passed; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Existing proof lane passed. `origin/main` resolved to `cef7538c2361450fd7847e8548970a122e5b42ee`; merge-base with HEAD is `2df37c1af5a35b0d5654d57cf2c735770f1d7e67`. |
| `pnpm build` | 0 | 7 workspace tasks passed; 4 cached, production Next build included. |
| `pnpm openapi:check` | 0 | Standard unmodified checker passed; no generated diff. |
| DB unit command below | 0 | 20 files / 226 tests, including unmodified merged scripted regressions. |
| API unit command below | 0 | 70 files / 1,574 tests, including proof, lifecycle, watchdog-registry and context-boundary tests. |
| Core unit command below | 0 | 82 files / 2,456 tests. |
| Config/AI/storage unit command below | 0 | Config 2, AI 80, storage 1 tests; fixtures only, no live model/provider call. |
| Web unit command below | 0 | 33 files / 784 tests. |
| Tool unit command below | 0 | 19 tests; Git-writing fixture suites excluded. |
| Read-only protected-file byte/hash comparison against HEAD and authorized-diff allowlist | 0 | Merged final-account test, PostgreSQL proof tests, context-boundary pin, lockfile, lane registry and OpenAPI unchanged. |
| `git diff --check` | 0 | Passed before receipt; final receipt-inclusive check recorded below. |

Exact unit commands (all Vitest runs use one worker):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src test/audit-api-capture.test.ts test/audit-api-file-final-account.test.ts test/audit-api-file-supplier-document.test.ts test/audit-api-variation.test.ts test/contractor-session-context.test.ts test/job-work-state-syntax.test.ts test/proof-invalidation.test.ts test/purchase-order-audit.test.ts test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts test/recovery-message-repository.test.ts test/site-extra-evidence-compatibility.test.ts test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts
```

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/contractor/site-visit.http.test.ts --exclude src/contractor/site-extra-pricing.http.test.ts --exclude src/contractor/site-extra.http.test.ts --exclude src/contractor/contractor-practice-session.http.test.ts
```

```sh
pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1
```

```sh
pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1
```

```sh
pnpm --filter @jobguard/web exec vitest run --maxWorkers=1
```

```sh
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

Unit/tool total: **5,142 passing**, excluding the separately repeated targeted runs. Warnings: installed pnpm reports the existing package.json overrides placement, and Next reports existing workspace-root/autoprefixer/webpack-cache warnings. No package/config/pin was changed to suppress them.

`pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites were **NOT RUN** locally: the dispatcher reserves PostgreSQL/browser execution for CI, and the root tool test glob includes Git-writing fixture suites. DB `free-port.test.ts` and API health, shadow isolation, final-account-lock isolation, SSO action paths and four contractor HTTP suites require PostgreSQL or a local listener and are excluded from these local unit commands. Root `pnpm test` and every earlier mandatory CI suite remain mandatory and unchanged; no exclusion was added to repository scripts/configuration.

### Preservation, scope and remaining gates

Merged final-account test SHA-256 (equal to HEAD): `0f565afe7d3384bbedd5b6cab31423a3e37f2dc2032536b90a2ad11ecd89b342`. Existing proof PostgreSQL test SHA-256: `abf6e29e82fe6942b3f903810e51443c4be50989e673c65de3cec204d768c31e`. Context-boundary pin SHA-256: `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. Read-only diff inspection limits this round to the product lock query, this piece's fixture and this receipt. Every merged test, migration, assertion, pin, grant, lockfile, lane and generated artifact is preserved.

Affected invariants remain AGENTS §§5.4, 5.7, 5.8 and BUILD_PLAN C4/C5: serialize proof eligibility/invalidation, retain append-only rework history and keep no-op retries from creating false business audit events. No schema/data migration or rollback step is introduced; no response/request hash/command identity/UI/provider/environment/alert contract changed. Revert needs no schema rollback but can reintroduce the scripted-query incompatibility. Actual correlated-subquery lock acquisition still requires PostgreSQL evidence.

Dispatcher must run the existing `test/proof-invalidation.integration.test.ts` (all three cases, both contention directions and audit retry), unchanged `test/audit-api-file-final-account.integration.test.ts`, proof/evidence/replay/application-records/lock-order suites listed above, full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and the mandatory browser projects on the exact dispatched commit. Local scripted green does not replace these checks. B2 and B3b remain **OPEN BLOCKING**, with their exact future migration scope in the earlier section; this CI repair neither builds nor closes them. A fresh independent verdict and separate technical acceptance remain pending. No merge/release approval is inferred.

Intended conventional commit message is `/private/tmp/jg-msg-audit-fix-api-proof.txt` (overwritten for this round). The dispatcher owns commit/re-parent/push and subsequent CI. No commit was made here.

Final receipt-inclusive verification: `LANE_BASE_REF=origin/main pnpm lint:lanes` exit **0** (`lanes-final.log`); protected-file byte comparison / three-path diff allowlist / unchanged HEAD inspection exit **0**; `git diff --check` exit **0**.
