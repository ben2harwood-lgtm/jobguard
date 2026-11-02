# TESTS-ERRORS-1 — Practice access-error redaction tests

Issued 17 October 2026, night queue filler round 8. Check lane **RED**.
Decision 74: **BUILD-DON'T-MERGE; PARK**. Ben's button is required for merge, enablement or deployment.

Adds PE1 in `apps/api/src/practice-errors.redaction.test.ts`: three fictional diagnostic-bearing errors must retain the existing 401/404/403 mapping, pass exactly `{code}` to JSON, serialize exactly that body and never invoke the attached `toJSON` spy.

Authority: `BUILD_PLAN.md` §2.4 C5 and §12.2 SBOX-SESSION-1; AGENTS §2.8 (secrets/diagnostics discipline). The issued header narrows this task to new tests and the named lane/receipt/ledger. No product code, permissions, existing expectations, pins, policies, migrations or grants change; standard F unchanged. No new operational alerts or backwards-compatibility changes. C1/C7 web assertions are inapplicable because this task adds no web workflow.

This proves only the directly invoked filter's response construction and serialization through a JSON-stringifying response spy. It makes no HTTP, database, membership, tenant-isolation or broader authorization claim.

Scratch copies and their one-expression mutation diff are preserved in `/private/tmp/jg-test-tests-errors-1/`. Execution evidence, review limitations and remaining gates are recorded in `docs/verdicts/TESTS-ERRORS-1/BUILDER_RECEIPT.md`.

Nothing committed, pushed, merged, enabled or deployed. Dispatcher owns the eventual commit and subsequent CI/check handoff. Required independent Opus and final commit-bound Sol-high RED checks, separate acceptance and Ben's button remain gates; a source-only review does not satisfy them.
