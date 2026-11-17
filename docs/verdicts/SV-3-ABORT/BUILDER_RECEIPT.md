# SV-3-ABORT builder receipt

Issued 13 October 2026 by the JobGuard dispatcher on the coordinator's ruling. Branch: `codex/sandbox/sv-3-abort`. Base/HEAD at inspection: `1f54750cf4b8a5f499d5dcb1be9beed2add989a5` (`origin/main`). Working-tree delivery; no git writes, commits, pushes or PR actions performed. The dispatcher commits and arranges independent review and separate acceptance.

## Repair round 1

### Changes and scope

- `config/agent-lane-assignments.json:118`: first working-tree change, one compact `sv-3-abort` lane in name order, exact issued allow list, exact branch/spec/receipt and a one-sentence note. The lane registry is the shared registration overlap; this repair edits only its new line under the dispatcher's ownership.
- `apps/web/e2e/SV-3.spec.ts:102`: Q tracks the actual main-frame requests belonging to the departing document for each of its own `page.goto` calls. Requests starting while that navigation is pending are tracked until the main-frame navigation commits; destination-document requests cannot enter that set.
- `apps/web/e2e/SV-3.spec.ts:109`: only a tracked departing `GET`/`fetch` request whose entire URL is the same-origin `/api/jobs/<this jobId>/things-to-check`, and whose error text equals exactly `net::ERR_ABORTED`, is tolerated while that goto remains active. Other paths, job IDs, query strings, methods, resource types, frames, errors and requests outside that navigation still enter the existing failure list. The short comment states this limit.
- `apps/web/e2e/SV-3.spec.ts:150`: the navigation scope surrounds only the existing goto and clears in `finally`. Three added assertions require a destination response, HTTP 200, and its exact requested URL. Existing destination content assertions remain at lines 157–158: the Decision Inbox heading for `/`, and the Price the work button followed by the quote editor for `/jobs/<jobId>`.
- `apps/web/e2e/SV-3.spec.ts:138` and `:172`: attach and remove the document-navigation listener alongside the existing listeners.

No product code, schema, permissions, money logic, policies, provider calls, fixtures or other merged specs changed. No migration, rollback/backfill work, new grant, new operational alert or backwards-compatibility impact. Rule G's issued exception changes only the specified failed-request case; all existing assertions, titles and timeouts are preserved. There is no new timeout, retry wrapper or sleep. The existing response-body capture failure path remains strict.

### Environment and command results

Existing dependencies were used; no installation or download was performed. Node is `v24.17.0`. The default pnpm launcher was `11.8.0` and stalled attempting package-manager selection; three exploratory invocations were interrupted (exit 130). The already installed Corepack cache contains the repository's pinned pnpm `10.28.1`. A temporary symlink `/private/tmp/jg-sv-3-abort-bin/pnpm` points to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Every pnpm verification command below used the prefix `PATH="/private/tmp/jg-sv-3-abort-bin:$PATH"`; `pnpm --version` returned `10.28.1` (exit 0). No committed configuration was changed for tooling.

| Command actually run | Exit | Result |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force` | 0 | All 7 packages successful; 0 cache hits. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | All 7 package lint checks successful; 0 cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 1 | Core purity passed, then the standard lane checker refused a self-comparison; subsequent root lint steps were run separately below. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main because the dispatcher must commit after this sandbox exits. The standard lane check is not claimed green. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary check passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `pnpm build --concurrency=2 --force` | 0 | All 7 packages successful; 0 cache hits; production Next build completed. Existing workspace-root, CSS/autoprefixer and shared-cache permission warnings were emitted. |
| `pnpm openapi:check` | 1 | The tsx CLI could not listen on its IPC socket (`EPERM`), an issued sandbox limitation. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | The same source generator/check passed via the installed loader, which needs no CLI IPC socket. |
| `node --test tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/shared-money-origin.test.mjs` | 0 | 5 tests passed across 3 files. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/ui/workspace-lifecycle.test.ts app/lib/recovery-case-requests.test.ts app/lib/recovery-case-selection.test.ts` | 0 | 96 tests passed across 3 files. One Vitest run; no concurrent test runs. |
| `node /private/tmp/jg-sv-3-abort-controls.cjs` | 0 | Scratch controls: 2 permitted cases pass; 11 forbidden/error cases fail as expected, including both required controls below. |
| `node /private/tmp/jg-sv-3-abort-preservation.mjs` | 0 | AST comparison against origin/main preserves all 41 existing assertion calls, 2 titles and 1 timeout value; exactly 3 positive assertions added. Supplemental working-tree path check passes using the real lane module's `selectLane`/`matches` and the exact issued allow list. This is not a replacement claim for standard lane lint. |
| `git diff --check` | 0 | Passed. |

The supplemental path check sees exactly the spec, lane registry and this receipt. All git inspection commands were read-only. A fresh dependency install and the full root test suite were not run; the installed dependency tree and the targeted suites above were used.

### Scratch narrowness proof (not committed)

`/private/tmp/jg-sv-3-abort-controls.cjs` reads the actual spec at run time, extracts and transpiles its request/navigation listeners, existing `drain()` failure barrier and goto/assertion block, and executes them with the installed Playwright `expect`. Request, frame and navigation events are deterministic scratch objects and the scratch clock advances without sleeping. This is source-derived control execution, not a browser journey, live transport abort, database proof or independent model verdict.

Required controls produced these failures from Q's existing barrier:

```text
EXPECTED FAIL: different route abort: Q request failed: GET http://scratch.invalid/api/jobs/scratch-job/readiness: net::ERR_ABORTED
EXPECTED FAIL: different error name: Q request failed: GET http://scratch.invalid/api/jobs/scratch-job/things-to-check: net::ERR_FAILED
```

The harness asserted that each control throws `Q request failed:`; an unexpectedly tolerated control makes the scratch command exit nonzero. The positive controls are the exact departing polling abort, including a polling request first observed while goto is pending. Additional expected failures cover a longer error text, a destination-document abort, an abort before or after goto, another frame, POST, an unexpected query string, destination HTTP 503 and the wrong destination URL. Scratch files remain outside the working tree and are not committed.

### NOT RUN and remaining gates

- **Browser suite: NOT RUN.** Per the issued order, this sandbox cannot bind localhost or start PostgreSQL, and browser execution is unavailable here. The dispatcher must run the existing `SV-3.spec.ts` in both desktop and mobile projects on Chromium and WebKit, ten times under load. No browser pass, screenshot or trace is claimed.
- **PostgreSQL integration/migration suites: NOT RUN.** PostgreSQL cannot start in this sandbox. No database changes were made; full mandatory database regressions remain for CI. No database run or heavy-slot invocation was attempted.
- **Full `pnpm test`: NOT RUN.** It includes the unavailable PostgreSQL subsystem; targeted executable checks are listed above without claiming whole-suite coverage.
- After the dispatcher commits, rerun the standard `LANE_BASE_REF=origin/main pnpm lint:lanes` and root lint against the nonempty commit range, and the normal OpenAPI wrapper in its unrestricted environment.
- Independent checker verdict, separate technical acceptance and dispatcher CI/browser evidence remain outstanding. This receipt is a builder run record, not acceptance, merge or release authorization.

Intended commit text: `/private/tmp/jg-msg-sv-3-abort.txt`. Nothing committed by the builder.
