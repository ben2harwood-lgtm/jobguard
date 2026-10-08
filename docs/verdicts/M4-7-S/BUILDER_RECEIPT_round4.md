# M4-7-S — round 4 builder receipt

Date: 7 October 2026. PR #108, branch `codex/sandbox/m4-7-s-r3`, supplied worktree. Starting HEAD: `feb957af0034f34cb8e389f3ff3b6906aec108cb`, incorporating main `3395d343fd50d979c734daf4946ba293ee2ed836` and merged SBOX-SESSION-1 (#109 / 0094). This receipt describes uncommitted working-tree repairs. The dispatcher must bind the subsequent independent verdict to its resulting commit. Builder evidence is not independent review or acceptance.

**Status: repairs implemented; technical acceptance remains HOLD for CI and a fresh independent verdict.** No push, merge, PR creation, git write, live provider, real send, spend, production activation or decision approval occurred. Earlier implementation and historical receipts are retained. `BUILD_PLAN.md` was not edited in this round.

## Repair

- Renamed the unmerged feed migration from `0046_practice_feed.sql` to `0101_practice_feed.sql`, following Ben's 5 October merge-ahead ruling. `MIGRATION_URLS` now contains 47 existing files in filename order, ending at 0101 after main's 0094. Reserved 0095–0100 remain unused. Updated active migration references and `MIGRATIONS.md`.
- Feed application authorization now calls SBOX's `PracticeAccess.job()` before repository access. SBOX authenticates the persisted session and checks immutable `app.job.practice_session_digest`. Another creator's job and an old unbound job receive the same 404 as a nonexistent job; missing, malformed and unissued sessions receive 401. Both Nest and Next use this application boundary. Next now awaits the merged request-scoped `workspaceApplication()` factory.
- Repository authorization checks the creator digest and authenticates the session again within the tenant transaction, before a snapshot, feed registration or connect. The 0101 trigger checks the same immutable binding and server-issued session before every feed insert, including raw runtime owner/account inserts. Insertion order cannot assign ownership. The existing owner row and claim audit register the job's creator; they retain append-only history and idempotency.
- Existing fixed movement amounts, exact settlement effects, receipt-match checks, deferred effect/audit assertions, RLS, grants, locks, consent/disconnect history and zero allocation/fee effects remain. No financial posting path, provider destination or operational alert was added.

## Regressions and merge compatibility repairs

`packages/db/test/practice-feed.integration.test.ts` now captures a job through the real `CaptureRepository`, with an issued creator session and a separate issued stranger session. Before the creator touches the feed, the stranger attempts snapshot, direct runtime SQL claim and connect. Each must refuse; all five feed tables and the job's feed audit remain empty, and money-table counts stay unchanged. The creator then reads/connects normally; later stranger attempts cannot change that state. A separate test refuses snapshot/claim/connect on the unbound pre-upgrade job. Existing fixtures now use issued sessions and creation-bound jobs. The race test also asserts that the creator, specifically, wins.

`apps/web/e2e/M4-7-S.spec.ts` adds the same stranger-first journey before scope confirmation or workspace/feed loading: capture in A, issue a NEW session in B, refuse B's GET and connect with exact 404 bodies, then verify A's untouched feed and successful connection. GET exercises the former implicit claim path. A second persistence context reuses A's `storageState`. Existing browser isolation tests use actual issued stranger sessions, retain a separate forged UUID cookie check (401), and retain the missing-session check. The regression is listed in both `mobile-360` and `desktop` projects.

Merge-stale expectations repaired within the lane:

- UIWIRE-12 and demo-bootstrap totals now derive from `MIGRATION_URLS`; UIWIRE-12's range ends at the registry's last filename (0101 here), and filename order is asserted.
- The feed upgrade assertion now checks the full registry and its 0094 predecessor, retaining the prior job and reserved-number assertions.
- Feed database/browser fixtures and refusal expectations now follow persisted SBOX sessions and creator ownership.
- Next feed routes await the now-async shared factory.
- OpenAPI was regenerated with the feed controller and documented 401/404 responses. The existing generator and byte-for-byte stale-document assertion are unchanged. Its scripts now use `node --import tsx` because the `tsx` CLI's IPC listener is denied by this sandbox.

No assertion was removed, weakened or made optional; no timeout was added or lengthened. These compatibility findings are source-inspected unless a run result is stated below.

## Fail-first evidence and its limits

The application-boundary regression was executed against the original application from starting HEAD, with SBOX's access rejection and the repository explicitly represented by unit doubles. It failed with exit 1:

```text
refuses a stranger before snapshot or connect even when no feed owner exists
AssertionError: promise resolved "{ …(15) }" instead of rejecting
```

The repaired application/controller suite subsequently passed all 47 tests. This is **unit fail-first evidence**, not PostgreSQL or browser verification. The initial attempt encountered stale compiled DB exports; the recorded behavioral failure above followed rebuilding dependencies.

**The requested PostgreSQL and browser fail-first/green execution evidence is still outstanding.** The dispatcher explicitly disallows PostgreSQL startup and localhost binding here, so those suites were prepared and collected, not executed. To obtain the behavioral red runs in a disposable synthetic CI checkout, retain the new tests and 0101 registration but restore the original application, repository and original 0046 SQL content from `feb957a` (load that SQL as 0101). The new captured-job tests should then fail because B's first snapshot succeeds. Run the repaired commit's suites separately for green evidence. No database/browser behavioral pass is claimed by this receipt.

## Commands actually run

Node `v24.17.0`; pinned pnpm `10.28.1` used from its existing Corepack cache via a temporary PATH shim. Dependencies were already installed; no install/download was requested. The default pnpm launcher stalled before running checks and was stopped. Logs are `/private/tmp/m4-7-s-round4-*.log`.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS, all 7 workspace tasks; final run repeated after repairs |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, boundary checks and all 7 workspace lint tasks; comparison was against actual main, not self-comparison |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS; final receipt-inclusive run recorded below |
| `pnpm build` | PASS, all 7 workspace tasks; final run after all source repairs recorded below |
| `pnpm --filter @jobguard/api openapi:generate` and `pnpm openapi:check` | PASS with the socket-free launcher; earlier CLI invocation failed with IPC `listen EPERM` |
| `pnpm --filter @jobguard/api test` | **BLOCKED full-suite pass:** 388 tests passed; unchanged `src/health.test.ts` failed because Supertest's socket bind raises `listen EPERM: operation not permitted 0.0.0.0`. Assertion retained; no longer timeout or exclusion |
| API feed application/controller focused suite | PASS, 47 tests (2 files), including ownership, persisted authentication and HTTP error mapping |
| `pnpm --filter @jobguard/web test` | PASS, 111 tests (12 files) |
| `pnpm --filter @jobguard/core test` | PASS, 2,914 tests (106 files) |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/verify-evidence-pack-cli.test.ts` | PASS, 4 database-package offline unit tests |
| AI/storage unit suites | PASS, 72 AI fixture/fake tests and 4 storage adapter tests; no live evaluation/provider |
| `node --test tools/*.test.mjs` | PASS, 42 tests, zero skipped |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/M4-7-S.spec.ts` | PASS, 10 journeys listed: 5 per project, including the new stranger-first regression |
| DB Vitest collection of practice-feed, UIWIRE-12 and demo-bootstrap suites | PASS collection only; no database hooks executed |
| Registry file/count/order inspection; `git diff --check` | PASS; 47 migrations ending at 0101; no whitespace errors |

The full API suite's only remaining executed failure is the unchanged socket-bound health test. PostgreSQL integration/migration and browser suites, including their fail-first demonstrations, still require CI. Root `pnpm test` was not invoked because it would start the prohibited database suites; the individual runnable unit suites are recorded above. No missing suite is described as passing.

## Lane, migration and remaining gates

Only the compact `m4-7-s` line of `config/agent-lane-assignments.json` changed. Its executable migration allow-list entry is replaced by 0101. Two exact-path exceptions are documented there: the requested `BUILDER_RECEIPT_round4.md`, and the deleted 0046 source path. The latter is necessary because the lane checker uses `--no-renames` and checks both rename endpoints; its initial failure named only that deleted path. No other lane or broader wildcard was changed.

No migration was applied locally. Supported upgrade is from main through 0094; fresh-install and upgrade/catalog/grant/RLS checks remain mandatory in CI. Renumbering an unmerged migration does not migrate an already-applied private 0046 database. Forward fixes must preserve immutable job bindings, feed history and audit; no destructive rollback, owner backfill or data reset was performed. Legacy unbound jobs intentionally stay inaccessible, matching SBOX. RLS still relies on an authenticated tenant context and does not defend against compromised database credentials.

Required before acceptance: dispatcher commit, full CI including API health, `pnpm test:db`, `pnpm test:migrations`, browser execution in both projects, the PostgreSQL/browser red evidence described above, and a fresh different-model verdict bound to the resulting commit. Separate technical acceptance, founder merge and all existing production/commercial release gates remain pending. This builder does not accept its own work.

Final verification: final `pnpm typecheck` and lane-aware `pnpm lint` both exited 0 with 7/7 tasks successful. Final `pnpm build` exited 0 with 7/7 tasks successful (1m51.577s). Regeneration followed by final `pnpm openapi:check` exited 0. Receipt-inclusive `lint:lanes` exited 0; only the M4-7-S compact lane line changed, and `BUILD_PLAN.md` matches starting HEAD. Final `git diff --check` exited 0. Non-fatal build notices concern the existing workspace-root inference, CSS `end` compatibility and restricted shared-cache writes; they did not fail the build. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-m4-7-s-r3.txt` for the dispatcher.
