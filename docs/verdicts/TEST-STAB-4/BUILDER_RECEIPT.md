# TEST-STAB-4 — builder receipt

Date: 7 October 2026. Builder: Codex (work order specifies GPT-6.1 Sol, high reasoning). Branch per dispatch: `codex/sandbox/test-stab-4`. Issued by the integrator under BUILD_PLAN §2.1, routine repair without weakening checks. This is a §14.3 **Discovered later** repair, not a §12.3 card.

The exhaustive origin-offset test is faster with every case preserved. The working-size allocation test is **unchanged**, under the work order's explicit stop condition: measurement found negligible fixture cost and almost all time inside the three required production allocator calls. This receipt does not claim that both tests have been optimized or that GitHub-runner performance is verified.

## Changes and preserved guarantees

- First change: appended only `test-stab-4` to `config/agent-lane-assignments.json`, with exactly the dispatched branch and four allowed paths. Preserved the existing single line of compact JSON and one trailing newline. Supplemental structural checks confirmed every other lane is unchanged. The shared lane registry is the only registration overlap; this task's edit is complete for dispatcher integration.
- `packages/core/src/extra-origin.test.ts`: collect all acceptance/JavaScript-readability mismatches, then assert the array is empty. Diagnostics include the total mismatch count and first ten records with field, offset, expected/actual acceptance, and an unreadable accepted value where applicable.
- Preserved both timestamp fields × both signs × hours 0–99 × minutes 0–99: **40,000 full-object `extraOriginV1.safeParse` calls**. Every accepted value still goes through `Date.parse`. Preserved the final **5,760** accepted-value assertion. Every previously failing acceptance or readability case still causes failure; only per-iteration assertion construction was removed.
- `packages/core/src/receipt-allocation.test.ts` is byte-for-byte unchanged after temporary measurement instrumentation was restored. SHA-256: `7b7676a00a5b5c2dc7d0ab2a938147e37f006989f28d39ddb23770bbd1aaf630`. All 1,600 distinct hundred-digit denominators, gross values `0n` and `1n`, the complete explicit-shares path, the two-share length assertion, and `MAX_ALLOCATION_WORKING_DIGITS === 130_000` remain intact.
- No production code, schema contract, test timeout, concurrency setting, assertion coverage, skip/only marker, or test configuration changed. No migration, backwards-compatibility impact, external action, new operational alert, or decision-record change. Synthetic fixtures only; no live providers, spending, deployment or release.

## Before/after timings

Existing installed dependencies; Node **24.17.0** (repository `.nvmrc`: 24.15.0), cached pinned **pnpm 10.28.1**, Vitest **4.1.11**. No install or package download command was run. The default pnpm launcher stalled on `--version` and was interrupted; all subsequent pnpm commands used a temporary PATH shim to the already-cached 10.28.1 executable. No repository package/configuration change was needed.

Each benchmark ran serially, with default Vitest scheduling and timeouts. “Test” is Vitest's per-test elapsed time; “file” spans that file's tests; “command” is Python `perf_counter` elapsed time including pnpm/Vitest startup. No test timeouts were added or changed. Host load varied, so these single before/after runs establish local evidence, not a GitHub performance guarantee.

| Run | Before test | After test | Before file | After file | Before command | After command |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `extra-origin.test.ts` alone | 1,374.220 ms | 946.277 ms | 1,381.634 ms | 965.176 ms | 3.691 s | 2.371 s |
| `receipt-allocation.test.ts` alone, unchanged | 1,439.569 ms | 2,528.625 ms | 3,968.467 ms | 6,112.215 ms | 5.218 s | 7.429 s |
| Offset test within whole core suite | 2,987.484 ms | 1,312.837 ms | 2,998.625 ms | 1,324.167 ms | 8.908 s | 9.774 s |
| Allocation working-size test within whole core suite, unchanged | 1,850.775 ms | 2,863.202 ms | 6,642.032 ms | 6,574.835 ms | 8.908 s | 9.774 s |

The offset test improved about **31% alone** and **56% in the whole core suite**. Both target tests finished below 5 seconds in these runs. The unchanged allocator test's later measurements were slower; no improvement is claimed for it. Whole-command/file durations can exceed five seconds: the timeout applies to each test, not the whole file or command.

Exact benchmark command pattern, run both before and after:

```sh
pnpm --filter @jobguard/core exec vitest run src/extra-origin.test.ts --reporter=verbose --reporter=json --outputFile.json=/private/tmp/test-stab-4-evidence/<phase>-extra.json
pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --reporter=verbose --reporter=json --outputFile.json=/private/tmp/test-stab-4-evidence/<phase>-receipt.json
pnpm --filter @jobguard/core exec vitest run --reporter=verbose --reporter=json --outputFile.json=/private/tmp/test-stab-4-evidence/<phase>-core.json
```

Here `<phase>` was `before` or `after`. All six commands exited **0**; each complete core benchmark passed **51 files / 696 tests**. Raw logs, JSON reports and command wall times remain in `/private/tmp/test-stab-4-evidence/` as local scratch evidence.

## Allocation measurement and stop condition

Temporarily instrumented only the target test, ran the following command, then restored the original file in a Python `finally` block and checked byte equality:

```sh
pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts -t 'the working size is bounded' --reporter=verbose
```

Exit **0**; selected test **2,101 ms**, command **3.475 s**. The `-t` filter selected the measurement target; no source test was marked skip/only.

| Measured segment | Elapsed |
| --- | ---: |
| Generate all 1,600 denominators and line fixtures | 10.268 ms |
| Gross `0n`: required allocator call and throw assertion | 848.388 ms |
| Gross `1n`: required allocator call and throw assertion | 832.311 ms |
| Construct all explicit shares | 0.084 ms |
| Explicit-shares allocator call and throw assertion | 407.702 ms |

About **99.5%** of these measured segments is in the three required calls/assertions. Moving fixture construction to describe scope would save only about 10 ms while leaving the arithmetic bottleneck. Source inspection confirms each path computes the bounded common denominator; test-side assertion overhead here is only three assertions, unlike the exhaustive offset test. No clearly material test-only speedup was identified while preserving the exact fixture and all paths. Per instruction, stopped work on this test and left it unchanged; did not reduce denominator count/size, omit calls, move allocator execution outside the timed test, mock/cache results, or edit production arithmetic.

## Deliberate mutation check

Copied core sources into `/private/tmp/test-stab-4-mutation`, linked the existing core dependencies, and changed **only the scratch** `receipt-allocation.ts` `INSTANT` expression to add an alternative accepting exactly `+24:00`. Ran the newly optimized exhaustive test:

```sh
pnpm --filter @jobguard/core exec vitest run --root /private/tmp/test-stab-4-mutation src/extra-origin.test.ts -t 'accepts exactly the offsets' --reporter=verbose
```

Exit **1**, as required; selected test failed in **572 ms**, command **2.056 s**. Failure message:

```text
2 offset mismatches; first 10: [{"field":"serverRecordedAt","offset":"+24:00","expected":false,"actual":true,"unreadableValue":"2026-10-04T12:00:00+24:00"},{"field":"deviceCapturedAt","offset":"+24:00","expected":false,"actual":true,"unreadableValue":"2026-10-04T12:00:00+24:00"}]
```

This failure came from the new collected-mismatch assertion in the exhaustive test. Restored the scratch schema byte-for-byte from production, verified equality, then removed the entire scratch mutation directory. Production schema files were never patched; no mutation remains in the repository or that scratch directory. The subsequent complete core check passed.

## Checks actually run

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | All seven package tasks successful; two existing cache hits. 47.219 s wall time. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (103 TypeScript files), then lane checking refused: `Missing branch or self-comparison range; refusing a misleading pass.` Did not change the base or weaken the check. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same self-comparison refusal; must rerun after dispatcher commits. |
| `pnpm exec turbo run lint` | 0 | All seven package lint tasks successful; two existing cache hits. Supplemental check, not a root-lint pass. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| Supplemental direct registry validation | 0 | Exact requested lane and branch, no other lane changes, compact JSON plus newline; does not replace the full lane check. |
| `pnpm --filter @jobguard/core test` | 0 | Default `vitest run`: 102 files / 1,392 tests passed, no skips. 10.933 s wall time. This ran after build emitted matching test copies into `dist`; source-only before/after benchmarks above had 51 files / 696 tests. |
| `pnpm build` | 0 | All seven package tasks successful; two existing cache hits. 102.550 s wall time. Next build completed. |
| `node --test tools/*.test.mjs` | 0 | 42 tests passed, zero skips; 6.322 s wall time. |
| `pnpm openapi:check` | 1 | Sandbox rejected the `tsx` CLI's IPC socket with `listen EPERM` before the check ran. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Executed the same OpenAPI comparison through the loader without the CLI IPC socket; 3.717 s wall time. |

Turbo logged sandbox cache-write `Operation not permitted` warnings. Build also reported workspace-root/multiple-lockfile and existing CSS `end`/autoprefixer warnings; all requested build/type/package-lint tasks completed successfully. These warnings were not repaired in this test-only task.

No direct git commands were issued. The explicitly requested lane and tools scripts invoke git internally (including isolated temporary repositories in the tools tests). No add, checkout, commit, push, merge or PR operation was performed on this worktree. The dispatcher commits. Intended conventional commit subject and body are written to **`/private/tmp/jg-msg-test-stab-4.txt`**.

## §14.3 Discovered later record and remaining gates

| Date | Finding / related work | Evidence / risk | Handling / gate / invariant change |
| --- | --- | --- | --- |
| 2026-10-07 | TEST-STAB-4, SH-1 core tests slowed under parallel work after ENT-4a | Integrator reports offset failures at 5,019–5,326 ms, including main push run 37657498901, and local allocation timeout. Local measurements above reproduce substantial per-test cost, though not a timeout. Risk: recurring CI reruns. | Batch offset assertions without changing coverage; leave allocation test unchanged per measured stop condition. Record here as dispatched §14.3 work, not a §12.3 card; BUILD_PLAN itself is outside this lane and unchanged. Verify default-timeout behavior on GitHub. No engineering invariant or decision record changes. |

Database/migration and browser suites were not run: no schema, persistence or web workflow changes; dispatcher states this sandbox cannot start PostgreSQL or bind localhost. Root `pnpm test` also includes database suites, so it was not claimed as executed; the requested core and tools suites were executed. No AI schema/prompt/model change: `pnpm eval` and live evaluation are inapplicable to this test-only repair. No clean reinstall was attempted because the work order supplies installed dependencies and prohibits downloads.

Still required: dispatcher commit; full root lint/lane validation against the committed branch; GitHub mandatory database/browser/regression checks and default-timeout timings; independent checker verdict bound to that exact commit and separate technical acceptance. No independent model verdict or acceptance is claimed. The allocation performance concern remains open under the authorized stop condition; any further fix must preserve its complete workload and obtain a scope permitting the relevant bottleneck change.
