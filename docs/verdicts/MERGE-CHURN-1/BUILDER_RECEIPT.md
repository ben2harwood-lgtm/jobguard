# MERGE-CHURN-1 builder receipt

Builder: Claude Opus (subagent of "Build coordinator (from 13 Oct)"), 14 October 2026. Branch `codex/sandbox/merge-churn-1`
from `origin/main` `ad6109ff`. Founder decision 35 ("Yes, fix it first"). Check lane: RED (changes how the checking system
reads its rules), so Opus and Sol checks.

## Why

Catch-up merges since 13 October conflicted on three files, by `git show --remerge-diff`: `config/agent-lane-assignments.json`
(almost every catch-up), and `packages/db/src/migrate.ts` + `packages/db/MIGRATIONS.md` (every migration piece: both append at
the end of one list). Migration numbers themselves were reserved ahead; the second cost was the hand "merge-ahead" renumber when
a higher number merged first. `BUILD_PLAN.md` §12.2 ledger lines collided occasionally (ENT-3b, ENT-3d).

## What changed

1. **One lane file per piece** (`tools/agent-lane-boundary-lint.mjs`). Lanes are read as the union of the legacy register and
   `config/lanes/<lane-id>.json`. With no lane directory the legacy object is returned unchanged. A lane file must be exactly
   `{"version":2,"lanes":{"<id>":{...}}}`, one lane whose id equals the file name (lowercase words joined by single hyphens),
   holding only `branches` (exact names, non-empty), `allow`, `receipt`, `note`, `test`. It may not declare `branchPrefixes`,
   `integration` or any other key; may not grant the register (`config/agent-lane-assignments.json`, `config/**`,
   `config/lanes/...`); may not reuse a legacy lane id; and each of its branches must select only that lane in the union. Any
   other entry in `config/lanes/` (non-JSON, subdirectory, symlink, wrong name) fails the whole check.
   Edit rule (`lanePathAllowed`): a path under `config/lanes/` may be added, changed or removed only by the branch whose
   selected lane is that file's id, or by an `integration` lane (the coordinator's `main-integration`, which also carries every
   merge to main). This applies in the ordinary check and in the train check (each piece and the union net). The train check
   reads lane files from the merged tree the same way it reads the legacy register.
2. **Merge-time migration numbering.** `packages/db/src/migrate.ts` keeps its 85 explicit lines byte for byte (renamed constant
   `LISTED_MIGRATION_URLS`, closed) and discovers newer `NNNN_lowercase_name.sql` files from `migrations/`, run after the listed
   ones in name order. Discovery fails closed (stray entry, missing listed file, new file at or below 0155, repeated number);
   the failure is held at import, because the bundled web server imports this module where the directory cannot be read (a
   first version threw there and broke `next build`: "Received an instance of URL"), and `migrate()` refuses to run while it is
   held. The lane check now also refuses any pull request, push to main, train or local change whose added migration is not
   numbered above every migration on its base, or that repeats a number. `tools/migration-renumber.mjs` (check by default,
   `--write` to stage) renames only the branch's own added migrations to the next free numbers with `git mv` (SQL bytes
   unchanged), rewrites exact old file stems in files the branch added or changed, and renames files whose name carries the
   stem (a migration note). Merged files are never touched.
3. **Ledger and notes.** One §12.2 amendment records the new rule. From now on a piece's ledger amendment goes in
   `docs/ledger/<PIECE>.md` and its migration note in `packages/db/migration-notes/<file stem>.md` (short section added to
   `MIGRATIONS.md`); neither is a shared file.
4. This piece's own lane is registered the new way: `config/lanes/merge-churn-1.json` (first real use). The legacy register is
   untouched.

## Migration choice and trade-offs

Chosen: (c) directory-discovered list + base-ordering guard + (a) renumber tool at catch-up. Rejected (b) per-piece reserved
numbers: that is today's ledger and still needs a renumber whenever a higher number merges first. Directory discovery removes the
shared-list conflict entirely; the guard turns the ordering rule (always above everything merged, so fresh and upgraded
databases run the same order) from a remembered ruling into a check; the tool makes the renumber mechanical.
Trade-offs: two pieces that both picked the same next number still need one mechanical renumber commit at catch-up (no git
conflict, but CI says "Migration order FAILED" until the tool runs); the renumber changes file names after review, so the
reviewer's identity binding must accept a rename-only delta (SQL bytes identical; the tool's printed list is the evidence). The
tool does not rewrite the SQL file's own text or bare-number mentions such as `startsWith('0156_')`; tests catch those. Open PRs
reserved below 0155 (SV-5 #181 at 0145, SV5PRE #189 at 0147) will fail the new guard until renumbered at their catch-up; that is
the existing merge-ahead ruling, now enforced.

## Why each guard is as strong as before

- Exactly-one-lane, no default lane, exact allow paths, no blanket grants, integration lanes refused to pull requests:
  unchanged code paths, now over the union; lane files are additionally barred from prefixes and integration.
- The lane register itself: before, any lane listing the legacy file could edit every entry (self-service, reviewed). That is
  unchanged for the legacy file. The new directory is strictly tighter: a lane file can be touched only by its own branch or the
  coordinator, cannot grant the register, cannot replace a legacy lane, and cannot capture another lane's branch.
- Every existing lane: MC-5 proves each of the 187 legacy lanes is deep-equal in the union and every declared branch and prefix
  selects the same lane. No legacy lane gains `config/lanes/` rights (only `main-integration` matched `config/**`, and it is the
  integration lane).
- Migrations: same 85 names, same order, same SQL; new ones can only run after them, and only in strictly increasing numbers.
- No existing test expectation, pinned list or fingerprint changed (diff touches no existing test file).

## Test evidence (worktree, commit 1a142866 plus this receipt)

- `node --test tools/merge-churn.test.mjs`: 8/8 pass. MC-1 reproduces today's conflict (two pieces from one main, second merge
  conflicts on the shared lane line/list). MC-2: same two pieces the new way merge with no conflict; the clashing number is
  caught, renumbered 0002 to 0003 with identical SQL hash, lane file and test reference rewritten, both push-to-main checks pass.
  MC-3 another lane's file cannot be added, edited or removed; own file and coordinator can. MC-4 file shape rules. MC-5 existing
  lanes unchanged + this lane registered. MC-6/MC-7 order rule incl. pull request and untracked local files. MC-8 train.
- `node --test tools/*.test.mjs`: 93/93 pass (includes the unchanged lane, train and shared-money-origin tests).
- `pnpm typecheck` exit 0; `pnpm lint` exit 0 (runs the lane check); `pnpm lint:lanes` passed, lane `merge-churn-1`.
- `packages/db`: `vitest run --maxWorkers=2 src/` 8 files, 100/100 pass (includes new `src/migrate-discovery.test.ts`, 3/3).
- DB via `~/.local/bin/heavy-slot`, `vitest run --maxWorkers=2 test/tenancy.integration.test.ts
  test/demo-bootstrap.integration.test.ts test/contractor-practice-session-upgrade.integration.test.ts`: 3 files, 24/24, exit 0.
  (First attempt failed in setup only: fresh worktree lacked embedded-postgres dylib symlinks; fixed by the package's own
  `scripts/hydrate-symlinks.js`, then rerun.)
- `pnpm turbo run build --filter=@jobguard/web...` (via heavy-slot): 7/7 tasks succeed.

## How a builder adds a lane or a migration now

- Lane: create only `config/lanes/<lane-id>.json` = `{"version":2,"lanes":{"<lane-id>":{"branches":["codex/sandbox/<lane-id>"],
  "receipt":"...","note":"...","allow":[exact paths]}}}`. Do not list `config/agent-lane-assignments.json`; do not edit any other
  lane file. Your own file is always editable by your branch.
- Migration: add `packages/db/migrations/NNNN_name.sql` with NNNN = highest number on main + 1, and a note at
  `packages/db/migration-notes/NNNN_name.md`. Do not edit `migrate.ts` or `MIGRATIONS.md`. Ledger line: `docs/ledger/<PIECE>.md`.
- At catch-up: merge main, then `node tools/migration-renumber.mjs` (exit 1 means a renumber is needed) and
  `node tools/migration-renumber.mjs --write`; review the staged rename, commit it, rerun the lane check and tests.
