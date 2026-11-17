# TESTS-CUSTOMER-RECEIPT-INPUT-2

Issued 17 October 2026; RED lane; decision 74 BUILD-DON'T-MERGE, then PARK.
Base: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.

Adds two new API input-contract test files for audit proposals 4–5. RR1 independently refuses invented tenant, job, actor, permission, environment, amount and settlement/proof fields, requiring rejection rather than silent stripping. RR2 accepts exact reason lengths 3 and 240, normalizes padded reasons, and rejects trimmed lengths below 3 or above 240. RR3 checks exact command/invoice/payment preservation and input immutability during normalization. No INPUT-1 UUID/version matrix is repeated.

Scratch copies under `/private/tmp/jg-test-tests-customer-receipt-input-2/` remove only reversal strictness or reason trimming. The actual new tests run unchanged against each copied schema: no-strict fails 8/9 cases; no-trim fails 8/13 cases. The unchanged repository schema passes all 22 tests. Repository product code and existing tests remain unchanged.

Authority: BUILD_PLAN §2.4 C5, §7.2 M1-12; AGENTS §5.5 and §5.13. These are parsing tests only: no authentication, persisted reversal, ledger, tenant-isolation database or provider execution claim. C1: no web workflow, so no new browser spec. No migration, grant, new alert, compatibility or commercial-policy change; standard F unchanged.

The builder receipt records remaining check results and limitations. Independent Opus and Sol-high verdicts must be recorded against the dispatcher's eventual commit, followed by separate acceptance. No builder acceptance; CI remains mandatory. PARK; no commit, push, merge, enablement or deployment authorized here.
