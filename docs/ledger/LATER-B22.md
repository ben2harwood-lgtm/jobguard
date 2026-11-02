# LATER-B22 — Audit export membership proof

- Built on `codex/sandbox/later-b22`, HEAD `4c407a6c81bd714a6875b7adf995812381d0fe57`; uncommitted.
- RED check lane; decision 74 PARK applies. No merge, enablement, deployment or acceptance recorded.
- Adds only `packages/db/test/later-audit-export-membership.integration.test.ts`, this ledger and the builder receipt.
- L133 / `api-audit-export#1`: three PostgreSQL tests cover the exact membership FK, the same-tenant positive twin, and discrimination using the same assertion against catalog-derived scratch copies.
- PostgreSQL tests and first failing run: NOT RUN (sandbox cannot start PostgreSQL; dispatch expressly forbids running here). Assertions are source-inspected only.
- Typecheck, lint, build and OpenAPI: NOT RUN after the default pnpm launcher's signature-verification refusal; no bypass attempted after that refusal was observed.
- Lane lint: exit 1, branch has no registered lane. STOP: `config/lanes/later-b22.json:1` is absent; coordinator must supply registration. No existing test, pin, count or production schema changed.
- `git diff --check`: exit 0. No migration; no new GRANT; Standard F introduces no runtime write privilege.
- Current `origin/main` moved during work from `4c407a6c81bd714a6875b7adf995812381d0fe57` to `7ff452eeec1c523345d34715adfa3f8310062013`. Cited plan/test lines still agree; main wins.
- Independent RED verdicts, dispatcher CI on the committed head and separate acceptance remain outstanding. Receipt: `docs/verdicts/LATER-B22/BUILDER_RECEIPT.md`.
