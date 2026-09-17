# UIWIRE-14 run receipt

Implementation commit: `572b40d5d074a8e52d49a155254af8b7f91ad7b7`

## Changed contracts
- `fee-illustration-source.v1` creates only the fixed synthetic `recovery-18800` persisted source.
- `fee-illustration-response.v1` projects persisted source counts and exact candidate-policy money.
- `fee-what-if.v1` accepts safe integer pence and returns `fee-what-if-result.v1` without persistence.

## Environment and fixtures
PostgreSQL 16 embedded harness and the generated `recovery-18800`, `small-fee`, `zero-fee`, unpaid-base, original £188,000/£10,000, and half-even fixtures. No real provider, mail, bank or payment client was configured.

## Commands actually run
- `pnpm --filter @jobguard/core test -- fee-what-if.test.ts` — PASS (23 files, 120 tests).
- `pnpm --filter @jobguard/api test` — PASS (5 files, 19 tests; OpenAPI check passed).
- `pnpm test:migrations` — PASS (2 files, 11 tests).
- `LANE_BASE_REF=b108bc2 pnpm lint` — PASS, including lane, core-purity and money checks.
- `pnpm --filter @jobguard/web build` — PASS with the pre-existing CSS autoprefixer warning.
- `CI=1 pnpm --filter @jobguard/web exec playwright test --project=mobile-360 --project=desktop UIWIRE-14.spec.ts fee-statement.spec.ts --reporter=line` — BLOCKED before browser execution because the host lacks Playwright shared libraries; traces record the launch failure. Browser binaries were installed, but host dependency validation still failed. No screenshot could truthfully be captured.

## Review status and release gates
Independent verdict and technical acceptance remain **HOLD** until a different model reviews the exact implementation commit. D01/tax approval remains pending; consequently the UI makes no payable, collection, or tax-invoice claim. This receipt is builder evidence, not independent verification.
