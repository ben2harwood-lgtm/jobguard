# TESTS-CORE-2 ledger

Test-only. Pure money-boundary tests for invoice history (CM1), allocation refusals (CM2) and the negative money limit (CM3). No product code, policy, price, fee or existing expectation changed. Check lane RED; decision 74: two-model check, then PARK (never merge, enable or deploy without Ben's button).

## Codex verification follow-up — 18 October 2026

The assigned worktree arrived clean at `6c9aa2ebf9c441df7fc91b3093250fc062517344`, with the task's six files already committed by the earlier builder/dispatcher. This follow-up preserves every test and production source byte, adds reproducible scratch evidence under `/private/tmp/jg-test-tests-core-2/`, produces `/private/tmp/jg-msg-tests-core-2.txt`, and appends a fresh run receipt without replacing the earlier record.

CM1/CM2/CM3: 20 tests pass on unchanged source. Independent scratch mutations remove only the reversal-history, duplicate-ID, or bigint lower-bound condition; they respectively trigger 2, 2, and 3 intended assertion failures. The unmutated scratch control passes all 20. No repository production file was mutated.

Sol-high independently source-reviewed the existing implementation commit with no blocking findings; its recorded response is in the receipt. Opus and final commit-bound RED review remain outstanding. PARK under decision 74; no acceptance, commit, push, merge, enablement or deployment by this follow-up.

Verification: targeted 20/20 tests, typecheck 7/7, lint 7/7, root lint, local lane check, build 7/7 and diff whitespace check pass. OpenAPI check is blocked before validation by sandbox-denied tsx IPC (`listen EPERM`); CI must run it. Full/DB/migration/browser suites remain deferred as issued. Runtime was Node 24.17.0 (repository pin 24.15.0), with cached pinned pnpm 10.28.1 and no dependency installation. See the appended receipt for exact commands and limitations.
