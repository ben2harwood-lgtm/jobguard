# M4-3-S-R repair 3 — BUILDER RECEIPT, not an independent review

**Builder:** Claude Sonnet 5.5 (repair 3). Branch `codex/sandbox/m4-3-s-repair`, PR #101, starting head
`f6219870e1f9d033f6ef871acdffda4382aad802` (repair 2 `bad8205` merged with `origin/main` `3e0764b`).
**Specification:** the two verdicts bound to that head, copied verbatim into this folder:
`f621987-opus.md` (Claude Opus 5.5, REPAIR) and `f621987-sol.md` (GPT-6.1 Sol high, REPAIR).
**Code commit every result below is bound to: `32dc63456ca137e9320e55fbf76f6a6754cb250b`.** This receipt is a later,
documentation-only commit. Migration number unchanged: **0042** (not yet applied anywhere, so editing it is still safe).

**State: NOT independently verified, NOT technically accepted.** I built; I did not review or accept anything.

## Method

Tests first. Every new test was written and run red against `f621987` before any fix (logs in
`/private/tmp/m43r-logs/r3/red-*.log`), committed as its own commit (`ee42865`), then fixed (`c7389c4`).

| New test | Red result before the fix | Green after |
|---|---|---|
| `packages/db/test/evidence-pack-upgrade.integration.test.ts` (real 0041 database, 0042 applied as `jobguard_migration`) | 2 failed: the migration-role apply of an inconsistent row **resolved** instead of rejecting (control as superuser rejected 23503) | 2/2 |
| `evidence-packs.integration.test.ts` +2 (UUID spelling replay; one advisory lock key) | 2 failed: `EVIDENCE_PACK_COMMAND_CONFLICT`; no waiter ever appeared in `pg_locks` | 13/13 |
| `packages/core/src/evidence-pack.test.ts` +4 (extra version, extra version same content, other job's content, other job at a manifested version) | 4 failed: findings were `[]` / `Content hash mismatch` instead of `Wrong source version` | 26/26 |
| `packages/db/test/verify-evidence-pack-cli.test.ts` (real subprocess) | 2 failed: CLI exit **0** for both reproduced malformed exports | 4/4 |
| `apps/api/src/evidence-pack.controller.test.ts` | 1 failed: HTTP 400 echoing the raw error text instead of fixed 500 `INTERNAL_ERROR` | passes |
| `apps/api/src/evidence-pack.errors.test.ts` (every typed code) | suite could not load (module did not exist yet) | passes |

## Every finding

### Opus verdict (`f621987-opus.md`)
| # | Sev | Status | Where / proof |
|---|---|---|---|
| 1 | P1 0042's FK validated vacuously under `jobguard_migration` | **FIXED** | `0042_evidence_pack_repair.sql`: `NO FORCE ROW LEVEL SECURITY` on `evidence_pack` and `evidence_pack_revision` immediately before the `ADD CONSTRAINT … FOREIGN KEY`, `FORCE` restored immediately after, same transaction, exactly the reviewer's tested patch; the policy rewrite is kept. `MIGRATIONS.md` sentence corrected. Proof: upgrade test above (inconsistent row rejected 23503 as the migration role; consistent data applies, `convalidated = true`, FORCE + ownership restored on all three pack tables, existing row still visible under its tenant context); `demo-bootstrap`, `sandbox`, `tenancy` and the Playwright global-setup bootstrap still pass |
| 2 | P2 cross-PR contract conflict with #103 (M4-1-S-R) | **NOT FIXABLE IN THIS PR — coordinator/#103 action** | This PR's behaviour is the one the verdict says is right (a case's `source_refs` are recorded IDs). #103's closed catalogue rejects recorded IDs (`RECOVERY_SOURCE_NOT_RECOGNISED`), so #103 must adapt. Textual conflicts to expect when #103 and this PR meet: `packages/db/src/migrate.ts`, `MIGRATIONS.md`, migration-count assertions (UIWIRE-12 and demo-bootstrap become 44), `evidence-pack-repository.ts`, `recovery-cases.tsx`, the lane registry; #102 also touches `recovery-cases.tsx` and the registry. I changed nothing on #103 or #102 |
| 3 | P3 raw `error.message` returned as `code` with 400 | **FIXED** | new `apps/api/src/evidence-pack.errors.ts` (`evidencePackFailure`): only typed `UNAUTHENTICATED`/`FORBIDDEN`/`SYNTHETIC_MODE_REQUIRED`/`EVIDENCE_PACK_*` codes pass through; Zod and JSON errors become fixed `INVALID_COMMAND` 400; everything else fixed `INTERNAL_ERROR` 500. Used by the Nest controller and all four Next routes (through `workspaceApplication().evidencePacks.failure`). Existing e2e expectations (401 unauthenticated, 400 forged command, 409 stale approval) still pass |
| 4 | P3 advisory key uses the raw `caseId` spelling | **FIXED** | `evidence-pack-repository.ts` lower-cases case, pack and command UUIDs at its entry points, so lock keys and command hashes cannot differ by letter case. Proof: the two DB tests above |
| 5 | P3 approval requires zero omissions (a merchant case with no recorded delivery note can never be approved for attachment) | **OPEN FOR BEN (product rule; behaviour unchanged)** | Conservative and honest as built. Ben should confirm it is the intended rule, or say what a missing delivery note should allow |
| 6 | P3 merchant picker matches `40 × 2000p` | **FIXED (labelled)** | `recovery-cases.tsx` comment states it selects the supplied materials-320 fixture and is not a rule for real supplier records. No behaviour change |
| 7 | P3 lane allows broad `apps/**`, `packages/**` globs | **FIXED** | the `m4-3-s-repair` lane (only that entry; verified by JSON comparison that no other lane or top-level field changed) now lists 40 exact file paths, no wildcards. `lint:lanes` passes |

### Sol verdict (`f621987-sol.md`)
| # | Sev | Status | Where / proof |
|---|---|---|---|
| 1 | P2 verifier accepts unmanifested source versions as complete (and CLI exits 0) | **FIXED** | `packages/core/src/evidence-pack.ts`: every supplied source must match an exact manifested `sourceId` **and version** of the manifest's own `jobId`; otherwise `Wrong source version`, never complete. Duplicate/hash/lineage checks retained. Proof: the four core regressions and two CLI subprocess regressions above, both reproduced cases included |

## Commands run (worktree `…/.worktrees/m4-3-s-repair`; DB and browser commands inside `heavy-slot m43r …`)

| Command | Exit | Result |
|---|---|---|
| red runs (core, API, CLI, DB) | 1 each | see Method table |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7, 0 cached |
| `TURBO_FORCE=true LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7, 0 cached; lane `m4-3-s-repair` passes with exact paths |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7, 0 cached |
| `pnpm openapi:check` | 0 | spec matches (no API shape change) |
| direct `pnpm --filter @jobguard/{core,ai,storage,config,api,web} test` (uncached) | 0 ×6 | core 428 (68 files; includes generated `dist` duplicates), ai 72, storage 4, config 2, api 100, web 56 |
| `heavy-slot m43r pnpm test` — attempt 1 | 1 | everything passed except one suite that could not start PostgreSQL (see Environment); not counted as a pass |
| `heavy-slot m43r pnpm test:db` — attempt 1 | 1 | 37 files passed; `tenancy.integration` failed in `beforeAll` (`postgres.start()` rejected with no message), 9 tests skipped; not counted as a pass |
| `heavy-slot m43r pnpm test:db` — rerun, unchanged code | **0** | **38 files, 175 tests passed, 0 skipped** (167 before plus 2 upgrade, 2 lock/spelling, 4 CLI) |
| `heavy-slot m43r pnpm test` — rerun | **0** | 13/13 tasks, tools 39/39. Turbo replayed 12 of the 13 tasks from the cache of attempt 1; only the db task ran fresh here (38 files, 175 tests). Those same suites were also run uncached, directly, in the row above |
| `heavy-slot m43r pnpm test:migrations` | 0 | 2 files, 11 tests (includes `tenancy` and `demo-bootstrap`) |
| `heavy-slot m43r CI=1 playwright test -c <override> --project=mobile-360 --project=desktop M4-3-S.spec.ts` | 0 | **4 passed** (mobile-360 2/2, desktop 2/2) |
| same, `M4-1-S.spec.ts M4-2-S.spec.ts` (extra regression) | 0 | 6 passed |

Local browser caveat is unchanged from repair 2: the local e2e runs use an already-installed Chrome-for-Testing 151 headless shell through an untracked override config (only the executable differs). CI uses the pinned Chromium; the Opus verdict records it passed 164/164 on `f621987`, so the pinned-browser run for this head is the CI result below.

## Environment

macOS 26.4 arm64, Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10, Vitest 4.1.11, Playwright 1.55.1.

**Shared-memory exhaustion (real, still present).** `kern.sysv.shmmni` is 32. When the first full-suite attempts failed, `ipcs -m` showed 32 of 32 segments in use, 31 of them orphans (attach count 0, creator process gone, 20 minutes to an hour old, left by killed PostgreSQL runs from other sessions today) and one live. Each PostgreSQL start needs a free one, so any suite can fail to start when the table is full. This is the same cause as the "No space left on device / shmget" error Codex hit on 27 Sep. I tried to remove the orphans and the permission system denied it as interfering with other workloads, so I did not and will not pursue it; I could not capture the PostgreSQL log for the one failed start (the suite suppresses it), so the link is strong circumstantial evidence, not proof. The reruns passed with unchanged code. **An owner needs to clear the orphaned segments (or reboot) or other agents' DB suites will keep failing intermittently.**

## OPEN FOR BEN

- **Opus P3 5:** is "no attachment approval while any source is omitted" the intended product rule? Unchanged (conservative).
- **Opus P2 2 (coordination):** #103 must adapt its source catalogue to recorded IDs before both PRs can merge; textual conflicts listed above.
- **Shared-memory orphans:** someone with authority over the other sessions should clear them (see Environment).
- Carried from repair 2: C7 "open the job from Jobs" is met by a fresh navigation through the Jobs home because capture-created jobs are hidden from it; the Opus verdict's own view is to accept that.

## Not run

- A break-it (mutation) check by me beyond the red-first tests above.
- The pinned-browser run locally (CI provides it).
- A real Neon upgrade.

Nothing here is pushed to `main`, released or deployed; Ben's merge authority is unchanged.
