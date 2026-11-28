Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-CONFIG-1 builder receipt

Test-only. No parser, default or existing test changed. Base 1bcd8db8. Decision 74: RED two-model check, then PARK.

## Changed
- packages/config/src/api-environment.boundaries.test.ts (CF1: ports 1/3001/65535 and omitted default pass; 0, 65536, -1, 1.5, non-numeric refuse)
- packages/config/src/identity-environment.database-boundary.test.ts (CF2: postgres/postgresql with jobguard_identity pass; mysql/http/redis and wrong users refuse)
- packages/config/src/identity-environment.required-settings.test.ts (CF3: each of the four settings omitted independently refuses)
- packages/config/src/identity-environment.secret-boundary.test.ts (CF4: 31 refuses; 32, 33, 64 pass)
- config/lanes/tests-config-1.json (lane as given in the order)
- docs/ledger/TESTS-CONFIG-1.md
All URLs and secrets are fictional, built at runtime; no real environment read.

## Scratch mutations (source restored after each; source diff is empty)
- remove .max(65535): fails "refuses explicit invalid port 65536"
- remove URL refinement: 7 failures (protocol and username refusals)
- make AUTH_ALLOWED_ORIGIN optional: fails "refuses when AUTH_ALLOWED_ORIGIN is omitted"
- min(32) to min(30): fails "refuses a 31-character synthetic secret"

## Commands run
- vitest (2 workers) on files 1+2: 18 passed; files 3+4: 9 passed
- turbo typecheck, lint (LANE_BASE_REF=origin/main), pnpm build, all --force --concurrency=2: 7/7 successful each
- git diff --check: clean. Disk about 51 GB free.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). Opus and Sol-high RED checks pending.
