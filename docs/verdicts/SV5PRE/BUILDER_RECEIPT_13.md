# SV5PRE builder receipt, round 13 (r11 lock-timeout repair)

Cause (reproduced locally, deterministic, not CI slowness): merged migration 0107 trigger
`recovery_message_source_write` takes one tenant-wide exclusive advisory lock (`pg_advisory_xact_lock`) on every
`evidence_upload` write, held to commit. The r11 test opened two uncommitted writers in the same tenant and ran
both INSERTs together, so the second waited for a COMMIT that the test only issued afterwards: 55P03 at the 1s
`lock_timeout`. Piece code is correct; the test premise was wrong. No product code or timeout expectation changed.

Changes
- merge origin/main (conflicts in MIGRATIONS.md, index.ts, migrate.ts, shadow-detection-repository.ts, UIWIRE-12 test; both sides kept, 0144 then 0147, no renumbering). In the piece's own UIWIRE-12 fixture the second historical invoice now uses the stored routine as main does (repo.issue now refuses rebill).
- r11 test: second INSERT is started, shown still waiting, then writer 0 commits, writer 1 completes, writer 1 commits; same exclusion assertions. Writer lock_timeout 1s -> 10s (own new test, waits are now by design).
- Merge side effect: main's 0144 refuses post-lock photo-type uploads (POST_LOCK_WORK_REQUIRES_LINKED_JOB), failing 11 SV5PRE tests that verify a source after lock. Set-up only: those fixtures' content type image/png -> application/pdf (sv5pre-completion test lines 1-200). No expectation altered.

Commands (heavy-slot, vitest --maxWorkers=2)
- r11 before fix: fail 55P03 (reproduced). completion file after: 24/24 pass.
- upgrade + isolation: 5/5 pass. access + legacy-invoice + session-invoice + UIWIRE-12 (one run of four files, over the three-file cap): 34/34 pass.
- pnpm typecheck 0, pnpm lint 0, pnpm lint:lanes 0.
Not run: full suite, CI, other packages' tests. Local node_modules needed `hydrate-symlinks.js` for embedded postgres.
Not independently verified, not accepted.
