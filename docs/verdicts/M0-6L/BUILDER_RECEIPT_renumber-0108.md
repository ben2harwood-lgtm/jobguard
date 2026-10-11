# M0-6L builder receipt: renumber 0098 -> 0108 (merge-ahead)

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/m0-6l`, starting head `bdf80fd6ee0e354dd203258f7af9211fc30d2a3d`.
Builder receipt only — not independently verified, not accepted.

## Why

Under Ben's 5 Oct merge-ahead ruling, 0102 (CH-3b), 0103 (MON-7a) and 0106 (M4-7-S) merged on main ahead of this
PR's 0098, so the persisted-identity migration takes the next free number, **0108**. 0104 (CH-1) and 0105 (ENT-2)
are allocated, 0107 is held by M4-5-S (PR #106) and 0100 by SV-2 (#119); any of 0104/0105/0107 may merge later
and sit before 0108 in numeric order. The SQL is unchanged.

## Changes

| # | File | Change |
|---|------|--------|
| 1 | `packages/db/migrations/0098_persisted_identity.sql` -> `0108_persisted_identity.sql` | `git mv`, 100% rename, 0 insertions/deletions |
| 2 | `packages/db/src/migrate.ts` | the entry moved from after `0097_...` to after `0106_practice_feed.sql` (now last); nothing else |
| 3 | `packages/db/test/identity.integration.test.ts` (beforeAll) | looks up `/0108_persisted_identity.sql`; position asserts replaced (below); comment updated |
| 4 | `packages/db/MIGRATIONS.md` | heading `### 0098` -> `### 0108`; position paragraph rewritten (after 0106; 0104/0105/0107 allocated and may merge later; 0100 held); "through merged 0097" -> "everything listed ahead of it, merged through 0106" |
| 5 | `config/agent-lane-assignments.json` (`"m0-6l"` line only) | allow path 0098 -> 0108; note "(0098 last, after merged 0053)" -> "(0108 after 0106 under the merge-ahead renumber)" |

`grep -rn 0098` (excluding `docs/verdicts/**`, `BUILD_PLAN.md`, `node_modules`) now leaves only the intentional
history clause in MIGRATIONS.md ("earlier reservations (0052, then 0098)") and the unrelated hash
`...e0098eed22fe` in `docs/fixtures/supplier-facts/held-out-v1.json:549`, left untouched. `BUILD_PLAN.md` not edited.

## SQL identity

| | SHA-256 |
|---|---|
| `0098_persisted_identity.sql` (before) | `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0` |
| `0108_persisted_identity.sql` (after)  | `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0` |

`git diff -M --stat HEAD~1 HEAD`: `{0098_persisted_identity.sql => 0108_persisted_identity.sql} (100%)`, 0 lines changed.

## Changed assertion lines (identity.integration.test.ts, beforeAll)

These assertions pinned the migration to an exact neighbour position. After the renumber that position is false by
construction (0108 comes after 0106, and no longer immediately after 0097 or before 0102), and an exact-neighbour
assert on 0106 would also break as soon as 0104/0105/0107 merge. They are replaced by assertions that stay true
whichever of those merges later and that still prove the same two things: the file is registered in the list at
the intended place, and the list is in numeric order. This is a stale fixture, not a weakening.

| Before | After | Why equal strength |
|---|---|---|
| `const identityIndex=...endsWith("/0098_persisted_identity.sql")` | `...endsWith("/0108_persisted_identity.sql")` | name lookup follows the rename |
| `const precedingIndex=...endsWith("/0097_recovery_case_current.sql")` | `...endsWith("/0106_practice_feed.sql")` | now looks up the migration it must follow (the last one merged ahead of it) |
| `const followingIndex=...endsWith("/0102_contractor_parties.sql")` | removed (0108 is last; nothing follows it today) | the "immediately before 0102" claim is false after the renumber; ordering is covered by the strict-increase assert below |
| `expect(precedingIndex).toBeGreaterThanOrEqual(0)` | unchanged | still asserts the preceding migration is found |
| `expect(identityIndex).toBe(precedingIndex+1)` | `expect(identityIndex).toBeGreaterThanOrEqual(0)` and `expect(identityIndex).toBeGreaterThan(precedingIndex)` | adds an explicit found-check on 0108 and asserts it sits after 0106; `+1` adjacency would break when 0104/0105/0107 merge |
| `expect(followingIndex).toBe(identityIndex+1)` | `const migrationNames=MIGRATION_URLS.map(url=>url.pathname.split("/").at(-1)!);` and `for(let n=1;n<migrationNames.length;n++)expect(migrationNames[n]!>migrationNames[n-1]!).toBe(true);` | asserts the whole list is strictly increasing (ordered, no duplicates), which is stronger than one neighbour check |
| comment `(through merged 0097)` | `(everything listed before 0108, merged through 0106)` | comment only |

Unchanged: `MIGRATION_URLS.slice(0,identityIndex)` upgrade from exactly the state before 0108; the
`identity.challenge` absent-before / present-after checks; `MIGRATION_URLS.length` count; the full applied-list equality.
No other assertion in any file was changed.

## Overlap check: order change on a fresh database (integrator request)

0108 used to run before 0102, 0103 and 0106; it now runs after them. Objects 0108 creates, alters or grants:

- role `jobguard_identity` (created only if absent)
- tables `identity.user_email`, `identity.membership_locator`, `identity.invitation`, `identity.challenge`, `identity.request_window`, `identity.session`, `identity.security_event` (and their inline PK/UNIQUE/CHECK/FK constraints)
- indexes `challenge_lookup`, `request_window_lookup`
- constraint `membership_identity_binding_uq` added to `app.membership` (line 12)
- policies `identity_provision_account` on `app.account` (line 57) and `identity_provision_membership` on `app.membership` (line 60)
- functions `identity.provision_verified_challenge(uuid)`, `identity.guard_invitation()`, `identity.current_memberships(uuid)`, `identity.invite_member(char,uuid,varchar,varchar)`
- trigger `invitation_immutable` on `identity.invitation`
- owner changes, REVOKEs and GRANTs on the `identity` schema objects above and `REVOKE ALL ON SCHEMA app,control_plane FROM jobguard_identity`
- 0108 drops nothing and replaces nothing (no `CREATE OR REPLACE`, no `DROP`)

0102, 0103 and 0106 create, alter or grant only: tables `app.contractor_*`, `app.property_constraint_fact`, `app.counterparty_check`, `app.practice_feed_*`; functions `app.valid_contractor_resident`, `app.link_contractor_customer`, `app.bind_contractor_parties`, `app.read_contractor_resident`, `app.require_contractor_party_record`, `app.require_contractor_party_receipt`, `app.valid_prevention_result`, `app.require_prevention_subject`, `app.guard_practice_feed`, `app.require_practice_feed_effect`; `tenant_isolation` policies, triggers and grants on those new tables only; plus one constraint added to `app.client_contract_version` (0102:3) and one constraint trigger on `app.command_receipt` (0102:218).

Result: **no shared objects.** No object appears in both lists; no policy, trigger, constraint, grant or `ALTER` of 0102/0103/0106 targets `app.account`, `app.membership`, the `identity` schema or `jobguard_identity`; none uses `ALL TABLES IN SCHEMA` or `ALTER DEFAULT PRIVILEGES`; the loop arrays in the three files name only their own tables. Read-only dependency, not an overlap: 0102:10,23 and 0106:16,29,45 declare foreign keys to the existing `app.membership(tenant_id,id)` key and 0106's function bodies select from `app.membership`; 0108 only adds a different unique constraint (`membership_identity_binding_uq`) and a policy on that table, and those foreign keys depend on the pre-existing key, so they are unaffected by the order. The identity, tenancy, UIWIRE-12 and demo-bootstrap suites below pass on the new order.

## Commands

All run from the worktree. DB suites were run one at a time under `~/.local/bin/heavy-slot m0-6l`.

| Command | Exit | Counts |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date, done in 372ms |
| `pnpm typecheck` | 0 | 7 of 7 tasks successful (4 cached) |
| `LANE_BASE_REF=origin/main pnpm lint` (first run, rename still staged) | 1 | `Lane boundary FAILED: ... 0098_persisted_identity.sql` — the staged, uncommitted removal of the old path was judged against HEAD whose lane allow list no longer names it; ordering artefact, not a code fault |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (first run, same cause) | 1 | same message |
| `LANE_BASE_REF=origin/main pnpm lint` (after the rename was committed) | 0 | core purity passed; 7 of 7 tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (after commit) | 0 | `Lane boundary passed`, lane m0-6l, comparison merge-base, 0108 file in range |
| `heavy-slot m0-6l pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/identity.integration.test.ts` (first attempt) | 1 | embedded PostgreSQL `initdb` failed: `could not create shared memory segment: No space left on device` (kern.sysv.shmmni=32 exhausted) |
| same, after environment fix (below) | 0 | 1 file, 11 of 11 passed |
| `... test/UIWIRE-12.integration.test.ts` | 0 | 1 file, 22 of 22 passed |
| `... test/demo-bootstrap.integration.test.ts` | 0 | 1 file, 4 of 4 passed |
| `... test/tenancy.integration.test.ts` | 0 | 1 file, 9 of 9 passed |
| `heavy-slot m0-6l pnpm run test:migrations` (tenancy + demo-bootstrap) | 0 | 2 files, 13 of 13 passed |

Environment fix (not a test change): `ipcs -m -a` showed 32 leaked 56-byte SysV segments filling the 32-slot limit, every one with
NATTCH 0 and a creator pid that `ps -p` reported dead. Only those were removed with `ipcrm -m`; none were live. `db:fix-macos`
was not needed (dylib symlinks present). Disk after: 169 GB free on `/` (floor 45 GB).

## Not checked

Not run: the full `pnpm test`, web e2e, `openapi:check`, `test:regression`. No push, merge or rebase. The reviewer should
confirm independently that the renumbered chain applies on a fresh database and that no later-merging number
(0104/0105/0107) changes the strict-order assertion.

Builder receipt only — not independently verified, not accepted.
