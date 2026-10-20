# MIGFIX-4 builder receipt: decision 5 test edit, merge, and failing-first (pre-fix) PostgreSQL evidence

Built by Claude Sonnet 5.5, Codex unavailable; dispatched 14 Oct 2026. Not independently verified, not accepted.

## Decision 5 edit (own commit, authority "Ben, 14 Oct, coordinator chat, decision 5")
`packages/db/test/quote.integration.test.ts` line 6 (one minified line), exactly two numbers:
- `await disposition("declined",2)` -> `await disposition("declined",3)` (a superseded quote now advances the job revision, so the decline uses revision 3)
- `{status:"lost",revision:3,accepted_quote_version_id:null}` -> `{status:"lost",revision:4,accepted_quote_version_id:null}`
Nothing else changed in that file (`git diff`: 1 line, 2 numbers). The file passes with them against 0153.

## Other commits this round
- Merge of origin/main keep-both: migrate.ts and MIGRATIONS.md in numeric order 0144, 0150, 0153 (no renumbering); lane registry via lane-union.py. MIGRATIONS.md last sentence of the 0153 section updated from "held edit" to "done per decision 5".
- Lane allow list: added `packages/db/test/quote.integration.test.ts` (own commit); later the three evidence paths below.
- Own-file set-up fix in `migfix-4.integration.test.ts` (own commit): the "exact ... remain" test moves a job to live; the live-entry parties guard reads a FORCE-RLS table, so the admin session now sets `app.tenant_id` in a transaction first. This file had never run on PostgreSQL (builder sandbox could not). No expectation changed.

## Failing-first evidence
Before this round NONE existed (every row in BUILDER_RECEIPT.md was NOT RUN). Now:
- Base = merge-base with origin/main `c884b138b69d65ebb494e2fb5673d9c2efdfb258`, scratch worktree `.worktrees/migfix-4-base` (detached, not removed). Only the two new test files copied in. `pnpm install --frozen-lockfile` 0, `turbo run build --filter=@jobguard/db...` 0, embedded-PostgreSQL dylib symlinks copied from a hydrated worktree.
- Command (in `packages/db`): `heavy-slot migfix-4-base pnpm exec vitest run test/migfix-4.integration.test.ts test/migfix-4-upgrade.integration.test.ts --maxWorkers=2`.

| Where | Exit | Result | Log |
| --- | --- | --- | --- |
| BASE c884b138 + new test files | 1 | 6 failed, 8 passed (14) | prefix-evidence/base-run.log |
| This branch head | 0 | 3 files, 17 passed (incl. quote.integration) | prefix-evidence/head-run.log |

Base failures (all the missing 0153): MIGFIX-4.1 and MIGFIX-4.2 (acceptance of superseded document resolved instead of rejecting), MIGFIX-4.3 serialization (got success, expected 40001), MIGFIX-4.authority (wrong refusal), upgrade proof (0153 absent from migration list) and old-supersession-facts check (resolved instead of rejecting). The 8 that pass on base are the controls (exact-term refusals remain, replay, etc.).

## Other commands on this branch
typecheck `turbo run typecheck --force` 0; lint (`turbo run lint --force`) 0; `pnpm lint:lanes` passes (before the evidence paths were added). Not run: full suite, browser spec, openapi, CI.
