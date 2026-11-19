# Tommy demo fault coverage — 19 November 2026

Base: `896a701157ef71c81905da93bca4299d105c775a`.

Branch: `codex/sandbox/tommy-demo-fault-checks-20261119`.

This is a test-only change. It binds two bounded regression scenarios to existing commands and readers. No product code, policy, database migration, timeout in an existing test, capture-fix file, or successful application response is changed.

## Support-v01: lost customer-acceptance response

`TOMMY-demo-faults.spec.ts` runs matched fresh, source-created five-line jobs, saves £900 then £1,000 quote revisions, and uses the existing synthetic send path. It compares uninterrupted acceptance with a response lost after `route.fetch({maxRetries: 0})` has actually completed the real acceptance POST. The browser request is then aborted; there is no fabricated success body and no pre-commit abort presented as a committed loss.

The operation is the core journey's builder-recorded customer acceptance, `quote-acceptance-command.v1`. It is distinct from both authenticated customer-portal acceptance and the fake delivery executor's **Simulate timeout after acceptance**, which refers to provider acceptance of delivery.

Before any further action, the test reads the authoritative acceptance GET and uses a read-only PostgreSQL observer to bind the browser's command ID to its succeeded `command_receipt` and `activation_acceptance_operation_use`. It checks the exact document ID/hash/version, one acceptance/event/operation, identical facts and operation receipt after reload, no second acceptance POST, and unchanged activation effects. All job creation, quotes and acceptance use real application commands; no terminal-state SQL fixture is inserted.

The current acceptance click handler lacks a transport catch. Browser errors are retained in the attached diagnostic JSON. This test establishes persisted reconciliation and reload behavior if it passes; it does not claim a friendly unknown-outcome message, disabled acceptance control, or recovery of an operation ID by the UI itself. The read-only SQL observer is explicitly the operation-ID evidence binding because the public acceptance GET does not expose it.

## Concurrent confirmation and recovery opening

The second test holds the real confirm-scope and open-recovery HTTP requests until both browser actions are outstanding, then releases both to the actual server together. It does not seed success, serialize the two commands, or replace a 503 with a fake 200.

Confirmation must complete successfully with five canonical scope identities. Recovery opening must either return a valid success or the precise HTTP 503 `RECOVERY_COMMAND_OUTCOME_UNKNOWN` contract. In the latter branch, the UI must announce uncertainty and hold new case writes. After reading persisted cases, one explicit **Try again** must resend the original complete command, then succeed. Unclassified errors, confirmation failure, an unsuccessful retry, or a different retry body fail the test.

The final authoritative reads require one £2,500 identified case, £0 landed, £0 fee, one opening event for the original command ID, one succeeded confirmation receipt, five scope revisions for five identities, and the same case after reload. Actual HTTP responses, command bodies, and before/after database deadlock counters are attached. A database-wide counter is diagnostic context, not attribution of every deadlock to this job.

## Why M4-1-S changes

The existing amendment/reversal journey clicked **Confirm scope** and immediately opened a case, before the asynchronous confirmation necessarily committed. Its purpose and remaining assertions concern claim amendments, landed amounts, closure, reversals, stale revisions, and persistence. It now waits for the actual **Quote being prepared** status and five confirmed lines before that sequential journey continues.

All existing financial/state assertions and timeouts remain intact. The separate concurrent test above preserves and makes explicit the overlap that previously occurred accidentally. This synchronization is not evidence that any underlying race has been fixed.

## Verification and handoff

- `pnpm install --frozen-lockfile`: passed; no lockfile change.
- `pnpm turbo run build --filter=@jobguard/web^...`: passed; six dependency-package outputs restored from local cache.
- `pnpm --filter @jobguard/web exec playwright test --list TOMMY-demo-faults.spec.ts M4-1-S.spec.ts`: passed, discovering 20 executions across the existing desktop and mobile-360 projects, including four executions of the two new scenarios.
- `pnpm --filter @jobguard/web typecheck`: passed.
- `git diff --check`: passed.

The final-head lane-check result is reported in the branch handoff. Test discovery is not test execution. The coordinating agent owns actual PostgreSQL/browser execution and independent review. This builder started no PostgreSQL instance, Next server or browser, and performed no push, merge, CI dispatch or deployment.

The remaining recovered pack variants and timed/nontechnical rehearsals are outside this bounded change. No whole-pack or demonstration-readiness pass is claimed.
