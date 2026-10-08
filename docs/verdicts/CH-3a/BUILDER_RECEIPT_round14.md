# CH-3a round 14 builder receipt

7 October 2026 · `codex/sandbox/ch-3a` · existing PR #98.
Starting HEAD: `3543cbb1b5d7463f3c060daafbbd492401add2d3` (round 13).
Source: independent Claude Opus verdict REPAIR at `3543cbb` (PR #98 comment 6047005201) and CI run
`37683586054`, which failed in `pnpm test` with 17 failures (9 + 8). This receipt is builder evidence only,
not an independent verdict or technical acceptance. No push, merge, PR or other-worktree operation was made.

## What changed (test environment and test route only)

No migration, lane file, source file or assertion was touched. 0095 stays byte-identical to round 13.

1. **P1-1, `packages/db/test/practice-session.integration.test.ts` line 18.** `initdbFlags` changed from
   `["--lc-messages=C"]` to `["--lc-messages=C","--encoding=UTF8"]`. Round 13's issuance trigger writes a
   generated `site_revision`, whose `compute_site_match_key()` uses NFKC `normalize()`, which PostgreSQL only
   allows in a UTF8 database. The embedded cluster defaulted to SQL_ASCII, so 9 of 10 SBOX cases failed with
   "Unicode normalization can only be performed if server encoding is UTF8". This is the same environment-only
   change merge `e988e2c` made to the sandbox suite. No other line of that file changed.
   `packages/db/MIGRATIONS.md` (encoding note) gains one sentence naming this suite.
2. **P2-2 follow-up, `packages/db/test/job-parties.integration.test.ts` (whitespace correction-reason test).**
   Its direct-INSERT branch ran as the runtime login `ch3a_login`, which 0095:190 denies INSERT on
   `app.job_party_binding`, so the CHECK constraint was never evaluated (SQLSTATE 42501, 8 failures). The helper
   `bindWithFlag` now takes a route instead of a boolean:
   - `routine`: unchanged (runtime login calls `bind_job_parties`, expects 22023 `CORRECTION_REASON_REQUIRED`).
   - `runtime-insert`: new, a separate assertion that a direct INSERT as the runtime login is denied with 42501.
   - `owner-insert`: runs on the admin pool inside the usual tenant transaction. The receipt row is claimed, then
     `SET LOCAL ROLE jobguard_migration` is applied for the binding INSERT alone (the pattern already used at
     the 0094 forged-promotion case), `current_user` is asserted to be `jobguard_migration`, and the INSERT must
     fail with 23514 and constraint `job_party_binding_correction_reason_check`. `RESET ROLE` follows the INSERT
     so, were the constraint ever defective, the receipt completion and matching correction audit would still
     succeed and the rejection could not be blamed on the deferred record protocol.
   Every reason case is kept (tab, line feed, carriage return, NBSP, BOM, empty, spaces, overlong UTF-16) and
   after every route the full state comparison still runs: audit head, binding count, job revision, current
   pointer, receipt count and audit count all equal the pre-attempt state. The runtime login was not given the
   ability to assume the migration role.

## Commands and exit codes (worktree `.worktrees/ch-3a`)

| Command | Exit | Result |
|---|---|---|
| `git rev-parse HEAD`; `git status --porcelain` before edits | 0 | `3543cbb1…`; empty |
| `pnpm typecheck` (first run; db, api, web re-executed) | 0 | 7 of 7 tasks successful |
| `pnpm typecheck` (repeat, cached) | 0 | 7 of 7 successful, 7 cached |
| `pnpm --filter @jobguard/db exec vitest run src test/verify-evidence-pack-cli.test.ts` | 0 | 3 files, 12 tests passed (unit only) |
| `pnpm --filter @jobguard/db exec vitest run test/practice-session.integration.test.ts` (one attempt) | 1 | Not run: embedded PostgreSQL `initdb` exited 1 before any test; all 10 cases skipped |

`pnpm install` was not needed (`node_modules` present, lockfile untouched).

**Local PostgreSQL could not run.** `ipcs -m` showed 32 of 32 System V shared-memory segments in use
(`kern.sysv.shmmni: 32`), the same condition the reviewer saw. I made a single attempt and did not retry. So
the 42501, 23514 and UTF8 behaviour is **unverified locally** and rests on CI. The only evidence from CI on the
previous head is the failing output itself: 42501 for the direct INSERT (which is why the owner role is needed),
and the exact encoding error for the practice-session suite.

Lane lint with simulated pull-request metadata runs against the committed head (a receipt cannot contain the
hash of the commit that contains it); its head SHA and exit code are in the builder's hand-off message.

## What CI must show at the new head

1. `@jobguard/db#test`: `practice-session.integration.test.ts` 10/10 with every original SBOX assertion intact on a
   UTF8 cluster; `job-parties.integration.test.ts` 86/86, in particular the eight whitespace-reason cases now
   passing all three routes (22023 routine, 42501 runtime direct INSERT, 23514 + constraint name via the owner
   role) with unchanged-state assertions.
2. Then `pnpm build`, the browser install, and both browser projects (mobile and desktop) of the production web
   build: CH-3a.spec (42 cases), SBOX-SESSION-1, VALUE-1, SBOX-1/2/resume. None of these has run at any head
   since round 11 (P1-3), so a green `checks` job is required before any PASS.

## Known limits

Unverified locally: all PostgreSQL behaviour (shared memory), and every browser journey. Not independent review.
