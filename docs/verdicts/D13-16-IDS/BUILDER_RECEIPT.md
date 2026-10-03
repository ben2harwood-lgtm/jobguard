# D13-16-IDS builder receipt

**Builder:** Claude Sonnet 5.5 (cloud). Branch `codex/sandbox/d13-16-ids` from origin/main `3e0764b`.

## Change
- `packages/config/src/policy-gates.ts`: `DecisionId` union extended with `D13`–`D16`.
- `tools/decision-records.test.mjs`: filename filter widened to `d(?:0[1-9]|1[0-6])`; test renamed `D01-D16 exist as proposed records with every governance field`; `files.length` is 16.
- `config/agent-lane-assignments.json`: appended lane `d13-16-ids` (append-only).
- No other dependency on the old count of 12 found in code/tests. All records remain `proposed`; nothing approved. No migration.

## Commands run (all on this branch, as seen)
| Command | Exit |
|---|---|
| `pnpm install --frozen-lockfile` | 0 |
| `pnpm typecheck` | 0 |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 |
| `pnpm lint:lanes` | 0 (lane d13-16-ids; 3 files) |
| `pnpm build` | 0 |
| `pnpm test` | 0 |

`pnpm test` counts: node test runner (tools) 39 tests, 39 pass, 0 fail. Vitest tests passed (files): config 2 (2), storage 4 (2), web 56 (7), ai 72 (3), api 75 (10), core 380 (68), db 150 (34); total 739 vitest tests, 0 failed.

## Not run, and why
- `pnpm test:e2e`: not needed; pure-config leaf with no web/UI behaviour change.
- `pnpm eval`, `test:db`, `test:migrations`: no prompt/model/schema/migration change.

**Not independently verified, not accepted.**
