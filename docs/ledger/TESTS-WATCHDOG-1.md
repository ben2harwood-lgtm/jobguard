# TESTS-WATCHDOG-1 — Watchdog refusal confidentiality

Test-only coverage of BUILD_PLAN §8 CH-2 and §2.4 C5/C6: WD1 checks
`JOB_NOT_FOUND` → 404; WD2 checks `JOB_NOT_LIVE` → 409; WD3 checks
`IDEMPOTENCY_CONFLICT` → 409. Each error carries fictional tenant/job IDs,
job state, money/evidence diagnostics, message, stack and cause. Each case
requires one status call and one JSON call containing exactly `{code}`.

This proves filter serialization only. It does not prove whole-application
tenant isolation, authorization, database behavior or transport registration.
The filter, existing tests and expectations remain unchanged. No migrations,
grants, commercial policies, prices, permissions, API contracts or alerts change.
No web workflow changes, so C1 introduces no browser spec.

Run evidence and remaining gates are in
`docs/verdicts/TESTS-WATCHDOG-1/BUILDER_RECEIPT.md`. Retained mutation artifacts
are under `/private/tmp/jg-test-tests-watchdog-1/`.

Decision 74: RED check (Opus plus Sol-high), then PARK. No commit, push,
merge, enablement or deployment by the builder. Technical acceptance remains
with a separate actor after independent verdicts on the dispatcher's exact commit.
