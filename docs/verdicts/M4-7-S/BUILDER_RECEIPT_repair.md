# M4-7-S / PR #108 — repair-builder receipt, 5 October 2026

**Builder:** OpenAI GPT-6.1 Sol via Codex. **Base:** `c8e7957c9e3cc5b139a8df6f3e36f7da213e5fb7`. **Lane:** `m4-7-s`, branch `codex/sandbox/m4-7-s-r3`. The dispatcher supplies the resulting commit; this builder ran no git commands, committed nothing, reviewed nothing, accepted nothing and merged nothing.

**Repair is incomplete: P1 remains OPEN under founder-held SBOX-SESSION-1.** The evidence-access finding P2 is addressed for the supplied base head. This receipt is not a verdict or an approval: **not independently verified, not accepted**.

Read: AGENTS rev 3.0; BUILD_PLAN §2.4 C1–C8 and M4-7-S's card; the task folder's sole prior receipt `BUILDER_RECEIPT.md`; `/private/tmp/jg-m4-7-s-r3-solverdict.md`; existing `SBOX-SESSION-1.txt` and `M4-7-S-session-binding-followup.txt`. Ben's accepted C7 Jobs-list substitute and fictional source labels remain the scope rulings. No unrelated application work was added.

## Finding → regression → disposition

### P1 — stranger accesses a captured job before the creator's first feed read or connect

**Reproduced before any proposed fix.** Wrote `/private/tmp/jg-m4-7-s-r3-session-regression.mts`, then ran it against the unchanged repository source. The GET-first and POST-connect-first assertions both fail with **Missing expected rejection**, rather than a transport/setup failure. A third diagnostic passes, confirming that the stranger receives the fictional receipt and the creator is subsequently refused. Exit **1**, **2 failed / 1 passed**, **0 skipped**. This is repository control flow using a SQL-client double; it proves no PostgreSQL, RLS, trigger or concurrency guarantees.

Root cause remains at `packages/db/src/practice-feed-repository.ts:87` (first-touch claim), `:92` (owner insert), `:117` (receipt projection), and `packages/db/migrations/0046_practice_feed.sql:128` (no positive captured-job creator binding). `packages/db/src/capture-repository.ts:24` creates a captured job without a creator session; `apps/api/src/capture/capture.application.ts:13` supplies none. No authoritative persisted capture-session binding exists to reuse. UUID secrecy, workspace mount order, capture IDs and client acquisition metadata cannot establish ownership.

**→ Held follow-up, not fixed or waived.** The user's instruction places anything touching authorization across practice sessions into **SBOX-SESSION-1, held for Ben**. Its prerequisite crosses capture/shared session code outside this lane and the founder-reserved boundary. Wrote `/Users/benharwood/.local/share/full-steam/jg-orders/M4-7-S-c8e7957-session-binding-followup.txt` and appended the same text to `/Users/benharwood/.local/share/full-steam/jg-orders/SBOX-SESSION-1.txt`; both retain HELD status. This supersedes the older follow-up's unsafe first-touch legacy-backfill instruction. Existing first-touch owners must not become evidence of creation-time identity.

The order requires an immutable binding in the capture transaction, positive verification before any feed snapshot/claim/connect/replay, fail-closed handling of missing/legacy binding, and a database backstop. It specifies real-PostgreSQL stranger-first GET, POST, raw-SQL, legacy and race regressions plus both browser projects creating through the real capture API **without first mounting the creator's feed**. Creator access must still work, and every earlier mandatory assertion must be preserved. These database/browser regressions were specified in the held order, **not implemented or executed in this round**. No passing mocked test is substituted for them.

The prior receipt's “Fixed in lane” wording is incomplete and must not be used to accept C3/C5. The existing first-owner-read database/browser tests do not cover the stranger-first attack. This remains an acceptance hold even though the earlier CI is green. No disabling of existing captured-job workflows or unapproved ownership backfill was introduced to conceal the missing prerequisite.

### P2 — PR description and exact-head CI evidence unavailable to the checker

**Evidence check first.** Added `/private/tmp/jg-m4-7-s-r3-ci-evidence.test.mjs`: verifies a documented export, exact head/PR identity, artifact SHA-256 hashes, all three CI job conclusions and database/migration/build/browser log markers. Before adding the manifest it exited **1**, **2 failed / 0 passed**, with the expected `ENOENT` for the missing manifest. After adding the manifest it exited **0**, **2 passed / 0 failed**, **0 skipped**. This is a deterministic export-integrity check, not independent review or a rerun of CI.

**→ Evidence exported.** `docs/verdicts/M4-7-S/CI_EVIDENCE_c8e7957.json:1` records the base head, CI URL, exact local export paths, sizes and hashes. The full original PR body is in `/private/tmp/jg-m4-7-s-r3-pr108.json`; metadata is `/private/tmp/jg-m4-7-s-r3-ci37232278283.json`; complete logs are `/private/tmp/jg-m4-7-s-r3-ci37232278283.log`. All are available offline to the next checker. Preserve these scratch exports when handing off the manifest.

Read-only GitHub retrieval succeeded using the sandbox's network escalation, after the ordinary connection failed. No PR description, comment or external state was changed. Retrieved [PR #108](https://github.com/ben2harwood-lgtm/jobguard/pull/108) and [CI run 37232278283](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37232278283); both explicitly identify **c8e7957c9e3cc5b139a8df6f3e36f7da213e5fb7**. `checks`, `secrets`, `dependency-review` each conclude SUCCESS.

The downloaded logs report: core **252/35 files**, API **151/17**, web **74/9**, database **204/38** (including **24** practice-feed, **9** tenancy and **2** demo-bootstrap tests); root test **13/13 tasks**; build **7/7 tasks** including production Next; unfiltered browser suite **174 passed**. Both `mobile-360` and `desktop` are configured in `apps/web/playwright.config.ts:15`; CI invokes unfiltered `pnpm test:e2e`. The dot log does not identify individual browser cases or supply screenshots/traces. The two migration-suite files run within the database suite; CI did not separately invoke the `pnpm test:migrations` wrapper. Secrets logs say **no leaks found**; dependency logs say **no known vulnerabilities reported**.

These records apply **only to the supplied base head**. The dispatcher must push, then the checker must inspect new-head CI before acceptance. A changed commit requires the fresh Claude Opus verdict and separate acceptance specified by C8. This builder makes neither claim.

## Changes and invariants

Only `config/agent-lane-assignments.json` and the two new task documentation files change in the repository. Added exactly `docs/verdicts/M4-7-S/BUILDER_RECEIPT_repair.md` and `docs/verdicts/M4-7-S/CI_EVIDENCE_c8e7957.json` to **this lane only**. No runtime, test-suite, migration, timeout, retry, provider, fee, decision or deployment change. No new migration, backwards-compatibility impact or operational alert; 0046 remains the existing task migration. C3/C5 remain blocked by P1; C8 still requires new-head CI and independent review. AGENTS §5.13 independence is preserved.

## Commands actually run locally

Node **24.17.0**, installed pnpm **10.28.1**, installed dependencies; no install or intentional package download. Every command below ran in this worktree except the stated API-directory OpenAPI equivalent. Logs are `/private/tmp/jg-m4-7-s-r3-<name>.log`.

The default `pnpm` launcher is pnpm 11.8.0 and tried to resolve/verify the project's pnpm pin through an unreachable registry. Initial typecheck/build launcher commands exited **1**, before checks. Used the already installed pnpm 10.28.1 binary from `Library/pnpm/store/v11/links/@pnpm/macos-arm64/10.28.1/.../node_modules/@pnpm/macos-arm64/pnpm` through `/private/tmp/jg-m4-7-s-r3-bin/pnpm`, with that directory prepended to PATH. No pin or security configuration changed. The launcher generated `.pnpm-store/v11/index.db*`; moved that new scratch store intact to `/private/tmp/jg-m4-7-s-r3-launcher-store`, rather than adding it to the lane or ignoring it.

| Command | Exit | Result / log |
|---|---:|---|
| P1: `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test /private/tmp/jg-m4-7-s-r3-session-regression.mts` | 1 | 2 expected missing-rejection failures, 1 exposure diagnostic pass; `session-regression.log` |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, 0 cached; `typecheck-fresh.log` |
| `LANE_BASE_REF=origin/main TURBO_FORCE=true pnpm lint` | 0 | Purity/lane/money/commercial guards and 7/7 tasks, 0 cached; `lint-fresh.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Exact lane passed; final run includes both new docs; `lanes.log` |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks, 0 cached, full production Next build; `build-fresh.log` |
| `pnpm --filter @jobguard/core exec vitest run src` | 0 | 252 tests / 35 files; `core.log` |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 150 passed / 1 failed, 17 files; unchanged `health.test.ts` fails on prohibited `listen`, EPERM; `api.log`. No exclusion, skip or timeout change. |
| `pnpm --filter @jobguard/web exec vitest run app` | 0 | 74 tests / 9 files; `web.log` |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | 7 tests / 2 files, unit/CLI only; `db-unit.log` |
| `node --test tools/agent-lane-boundary.test.mjs` | 0 | 23 tests, 0 skipped; `lane-tests.log` |
| `pnpm openapi:check` | 1 | tsx CLI's IPC socket is prohibited, EPERM; `openapi.log` |
| API directory: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | 0 | Same source/committed-OpenAPI comparison without the CLI IPC server; `openapi-node.log` |
| `node --test /private/tmp/jg-m4-7-s-r3-ci-evidence.test.mjs` before/after manifest | 1 → 0 | 2 expected missing-export failures → 2 passes; `ci-evidence-red.log`, `ci-evidence-green.log` |
| `gh pr view 108 --repo ben2harwood-lgtm/jobguard --json url,title,body,headRefName,headRefOid,statusCheckRollup` | 0 | Full read-only PR export, network escalation; `pr108.json` |
| `gh run view 37232278283 --repo ben2harwood-lgtm/jobguard --json headSha,headBranch,conclusion,status,url,event,createdAt,updatedAt,jobs` | 0 | Exact-head run and step metadata, network escalation; `ci37232278283.json` |
| `gh run view 37232278283 --repo ben2harwood-lgtm/jobguard --log` | 0 | Full CI logs, network escalation; `ci37232278283.log` |

Also recorded: the ordinary-network PR lookup exited **1** (connection unavailable); the first installed-pnpm lint exited **1** because the launcher-created scratch store was correctly rejected by lane checks. After moving that scratch artifact, the full uncached lint above passed. Initial pinned typecheck/build runs returned cached success (7/7); those are not the fresh execution evidence, which is the uncached runs above. Turbo emitted sandbox I/O warnings but the uncached checks/build completed with exit 0.

**Not run locally:** PostgreSQL/database integration, migration wrappers, browser tests, full root `pnpm test` (includes PostgreSQL), fresh install, live/model eval, local secrets/dependency scans or live providers. The sandbox cannot bind localhost or start PostgreSQL; **database, migration and both browser projects run in GitHub CI after the dispatcher pushes**. Base-head CI retrieval is distinct from local execution and does not validate a future repair head. No real data, real bank facts, outbound commercial action, spend or production environment was exercised.

No prior mandatory test was weakened, skipped, retry-wrapped or given a longer timeout. P1's newly written scratch regressions remain red and are explicitly handed to the held prerequisite; no claim that the authorization repair or its database/browser acceptance tests are complete. Remaining requirements: Ben authorizes and dispatches SBOX-SESSION-1, the creator-binding prerequisite and feed checks are implemented, stranger-first regressions pass at the required levels, new-head CI runs, Claude Opus records its independent exact-commit verdict, and a separate actor records acceptance. **Not independently verified, not accepted.**
