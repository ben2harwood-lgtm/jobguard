# TESTS-CUSTOMER-RECEIPT-INPUT-1

Issued 17 October 2026; base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.
Branch: `codex/sandbox/tests-customer-receipt-input-1`.

Added only the three authorized receipt-input test files and task registration/evidence. Product contracts, parser, money rules, existing tests, permissions, prices, policies and pins stay unchanged. No migrations or grants; standard F unchanged. No web workflow change.

- RI1: exact single-digit fractions and both audit near-limit amounts survive parsing and record validation.
- RI2: valid integer pence is preserved; other representations, nonfinite, negative, fractional, over-limit and unsafe values fail without coercion.
- RI3: each record/reversal version and command/invoice/payment identity is independently required and validated.

Separate scratch mutations were killed by intended assertions: `padEnd` to `padStart` (4 failures), numeric coercion (5 failures), and UUID validation removal (15 failures). The unchanged source passes all 83 additions and all 121 tests with the existing receipt suite. These are input-contract checks, not settlement, posting, authorization, replay or database proof.

See [builder receipt](../verdicts/TESTS-CUSTOMER-RECEIPT-INPUT-1/BUILDER_RECEIPT.md) for commands, limitations and review evidence. Logs and retained scratch copies: `/private/tmp/jg-test-tests-customer-receipt-input-1/`.

BUILD-DON’T-MERGE: RED; PARK. Opus review and exact-commit independent verdicts, separate acceptance, CI and Ben’s button remain required. No commit, push, merge, enablement or deployment performed.
