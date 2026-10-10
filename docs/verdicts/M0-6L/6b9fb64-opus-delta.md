VERDICT: PASS — bound to head 6b9fb64be9fff28bddf5caa404561c6b18c89e24
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** the round-9 repair does what the last REPAIR verdict asked. The identity upgrade test again starts from exactly the state before the identity migration, and it now checks the migration's real position by name instead of assuming it is last. The renumber from 0098 to 0108 is clean. The SQL is byte-identical, the lane change is only the path swap plus its note, and no live 0098 reference is left. I found nothing that 0108 shares with 0102, 0103 or 0106, so running it after them on a fresh database changes nothing. CI on this exact head is green, including the full identity suite, build and 272 browser tests. The only finding is one wrong sentence in `MIGRATIONS.md` about which numbers CH-1 and ENT-2 hold. It does not block, and it can be fixed at integration.

**Scope:** delta `55c98a5..6b9fb64`:
- `bdf80fd`: round-9 repair, judged against `M0-6L-r9-identity-fixture.txt` and the REPAIR verdict at `55c98a5` (comment 6068142282).
- `ea7bb33`: lane swap.
- `25e7ec7`: renumber.
- `90fbec6`: renumber receipt.
- `6b9fb64`: §12.2 ledger line.

I also did a whole-PR lane and reserved-area check against `origin/main` `3a06a02`. I only read code and ran a local lane lint; database and browser evidence is from CI. I made no edits, pushes or re-runs.

## Findings

**P1 (blocking):** none.

**P2:** none.

**P3-1: the number allocation in `MIGRATIONS.md` contradicts the ledger and the merge-ahead ruling.**
- **Where:**
  - `packages/db/MIGRATIONS.md:667-668` says "0104, 0105 and 0107 are allocated to CH-1, ENT-2 and M4-5-S, which may merge later in their own numeric positions".
  - `:671` says "any of 0104/0105/0107 that merges later will sit before it".
  - The same claim appears in `docs/verdicts/M0-6L/BUILDER_RECEIPT_renumber-0108.md:9-10` and in the `25e7ec7` commit message.
- **What is wrong:** CH-1 (PR #123) carries `packages/db/migrations/0109_job_activation_terms.sql`. The integrator's ledger line (`BUILD_PLAN.md:3340`) records 0109 CH-1 and 0110 ENT-2. The 0104 and 0105 numbers come from the original CH-1 and ENT-2 orders and are out of date. The ledger also restates the ruling: a PR whose number is not above every merged number renumbers again. So nothing will "sit before" 0108 after it merges.
- **Impact:** documentation only. No code or assertion depends on it, and the test's position checks hold either way (see Q3).
- **Fix:** at integration, or as a one-line follow-up in the m0-6l lane, reword `MIGRATIONS.md:666-672` to match the ledger. Suggested wording: "0107 is held by M4-5-S (#106), 0109 by CH-1 (#123) and 0110 by ENT-2; 0100 (SV-2) takes the next free number at its merge; a later merge whose number is not above 0108 renumbers." The receipt is a historical builder record and can stay as written.

**Observation, not a defect of this PR: CI attempt 1 on this head hit a known database start-up flake.** Run 37930490719 attempt 1 failed after 5m20s in `pnpm test`. The cause was `test/evidence.integration.test.ts`, which hit `ECONNREFUSED 127.0.0.1:56744` at `migrate()` in `beforeAll`. That suite is untouched by this PR, and no assertion failed (630 passed, 12 skipped, which are that suite's 12 tests). Main's own push run 37814738893 (`41d83ac`) failed the same way in a different suite (`practice-session.integration.test.ts`, `ECONNREFUSED 127.0.0.1:57082`). This is a start-up flake that already exists on main. It is worth its own TEST-STAB item.

## Answers to the questions

**1. Round 9.**
- **P1-1 is repaired as required**, in `packages/db/test/identity.integration.test.ts` at `6b9fb64`:
  - **Upgrade from exactly the pre-identity state:** `:39` applies only `MIGRATION_URLS.slice(0,identityIndex)`, and `:40` checks that the applied prefix equals exactly that slice.
  - **Real position asserted by name:** `:32-38`. The file is looked up by name. It must be found (`:35`) and sit after the found `0106_practice_feed.sql` (`:33-34,36`). The whole list must be strictly increasing by name (`:37-38`). At `bdf80fd` this was the 0097/0102 neighbour form the verdict asked for, and CI run 37843574993 on `bdf80fd` was green.
  - **Count-agnostic:** `:43` uses `MIGRATION_URLS.length` in place of the hard 45.
  - **`identity.challenge` absent before and present after:** kept at `:41` and `:45`.
  - **Full applied list equals `MIGRATION_URLS`:** added at `:44`.
- **P3-1 (stale doc) is handled.** `MIGRATIONS.md` no longer says "appends 0098 last". The new allocation sentence is wrong, as described in P3-1 above.
- **P3-2 is handled.** `apps/api/src/auth/context-boundary.test.ts:53-55` lists `id<typeof c>({tenantId} as any)` beside O11/R8/R10 and says TENANT-STAMP-1's runtime check refuses it. The change is comment-only; scanner code and approvals are unchanged.

**2. Renumber.**
- **SQL byte-identical: yes.** The SHA-256 of `55c98a5:packages/db/migrations/0098_persisted_identity.sql` equals that of `6b9fb64:…/0108_persisted_identity.sql` and the worktree file: `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0`. Git records a 100% rename.
- **Lane edit is limited.** I parsed both versions of `config/agent-lane-assignments.json`. All 98 lane keys are identical, and only `m0-6l` changed. In it, only `allow` (one path `…/0098_persisted_identity.sql` replaced by `…/0108_persisted_identity.sql`, still 35 entries) and `note` (the wording) differ.
- **No live 0098 references remain.** `git grep 0098` at `6b9fb64`, excluding `docs/verdicts/**`, finds only history text: `BUILD_PLAN.md:3332-3340` and `MIGRATIONS.md:666`. The other hit is an unrelated hex hash in a fixture. `migrate.ts:58`, the identity test, the lane line and `MIGRATIONS.md:638` all use 0108. The migrations directory contains no 0098 file.

**3. Rewritten position asserts.**
- **They are of equal strength for the test's purpose, and stronger in one respect.**
  - The old pins (`identityIndex===idx(0097)+1`, `idx(0102)===identityIndex+1`) fixed the upgrade prefix by naming two neighbours.
  - The new checks are: 0106 found, 0108 found, 0108 after 0106, and every name strictly greater than the previous one (`:34-38`). Together they fix 0108's position as "after every lower-numbered migration and before every higher-numbered one". So `slice(0,identityIndex)` is exactly the migrations numbered below 0108, the same certainty as before.
  - The strict-order loop is stronger than before: it guards the whole list. It also guarantees that the `ORDER BY migration_name` comparisons at `:40` and `:44` match runner order.
  - What is no longer asserted is a named immediate successor. None exists today because 0108 is last, and `:44` covers anything added later.
- **They stay true if 0107, 0109 or 0110 merge in numeric position.**
  - 0107 would sit between 0106 and 0108, so `:36` and `:38` still hold and the prefix simply gains 0107.
  - 0109 and 0110 would sit after 0108, so they hold too, apply on top inside `migrate()`, and are covered by `:43-44`.
  - An out-of-order or duplicate entry would fail `:38`, which is the right outcome.
  - Under the ruling, 0107 would renumber rather than land below 0108 once this PR merges. The asserts hold either way.
- **Nothing was weakened, removed without equal replacement or skipped.** A grep of the whole delta outside docs found no `.skip`, `.only`, `.todo`, `skipIf`, `runIf`, `timeout`, `retries`, `testTimeout` or `hookTimeout` change. No timeout was added or lengthened, and `.github` is untouched.

**4. Order change on a fresh database.** I verified this independently: **no shared objects.**
- **What 0108 creates or changes:**
  - role `jobguard_identity`, created only if absent
  - seven `identity.*` tables, two indexes and the trigger `invitation_immutable` on `identity.invitation`
  - four `identity.*` functions
  - the constraint `membership_identity_binding_uq` on `app.membership` (`:12`)
  - the policies `identity_provision_account` and `identity_provision_membership` on `app.account` and `app.membership`, `TO jobguard_migration` (`:57-63`)
  - grants on `identity` objects only, plus `REVOKE ALL ON SCHEMA app,control_plane FROM jobguard_identity` (`:181`)
  - no `CREATE OR REPLACE` and no `DROP`
- **What 0102, 0103 and 0106 create:** only `app.contractor_*`, `app.property_constraint_fact`, `app.counterparty_check` and `app.practice_feed_*` tables, plus `app.*` functions with different names.
  - Their triggers attach only to their own tables, plus `app.command_receipt` (0102:218), which 0108's routines never write.
  - Their grants go only to `jobguard_runtime`, and their revokes come only from PUBLIC, runtime and infrastructure.
  - They contain no schema-level grant, no `DEFAULT PRIVILEGES`, no policy or `ALTER` on `app.account`, `app.membership` or `identity.*`, and no mention of `jobguard_identity`.
  - The `identity` text in 0106:61-250 is a `practice_feed_event` column name, unrelated.
- **No behaviour depends on 0108 being absent or present.**
  - The foreign keys in 0102 and 0106 reference `app.membership(tenant_id,id)`, an existing key, not 0108's `(tenant_id,id,identity_user_id)`.
  - 0108's unique constraint is a superset of that referenced unique key, so it holds on any existing rows. CI shows this with practice-feed's seeded membership row.
  - Its schema revoke is equivalent before or after, because nothing grants `jobguard_identity` anything in between.
  - plpgsql bodies bind late.
- **CI on `6b9fb64` agrees.** The identity suite, which now upgrades from a schema that includes 0102, 0103 and 0106, passed 11/11. Practice-feed passed 27/27 and contractor-parties 19/19; both upgrade with 0108 applied on top of their seeded rows.

**5. Ledger line** (`BUILD_PLAN.md:3340`): **accurate.** I confirmed each point:
- 0102, 0103 and 0106 are on `origin/main` (`3a06a02` merge log and `migrate.ts`).
- 0107 is M4-5-S's: PR #106 carries `0107_recovery_messages.sql`.
- 0109 is CH-1's: PR #123.
- 0100 is SV-2's: PR #119 title.
- 0108 is the next number above the highest merged number (0106) that nobody holds.
- The SQL is byte-identical, and the runner lists 0108 after 0106.
- The card id `jobguard-merge-ahead-of-103-2026-10-05` matches the earlier amendments.

I could not independently confirm "0110 ENT-2": there is no open PR or branch, and its order file says 0105. I accept it as the integrator's allocation. The line sits correctly after the 7 October M0-6L amendment.

**6. Whole PR.**
- **Lane:** the lane lint, run in pull_request mode with head `6b9fb64` and base `3a06a02`, reports `Lane boundary passed` for lane `m0-6l`: 58 files, all allowed. CI's own `pnpm lint` lane step passed on the same range.
- **Reserved areas:** no `.github`, deploy or workflow file changed. The delta itself is tests, docs, one rename and the lane line. Whole-PR config changes are synthetic-only:
  - `.env.example` has comments and a blocked-recipient note.
  - `playwright.config.ts` adds local fixture identity settings.
  - `packages/db/vitest.config.ts` adds a source alias only, with no timeouts.
  - The identity environment schema (`packages/config/src/identity-environment.ts`) refuses any database credential except `jobguard_identity`.
- **Nothing touches:** a live provider or send, production mode, real data, spending, decision approvals, deployment, release or CI weakening.
- **Merge state:** the PR is `MERGEABLE/CLEAN`, and `origin/main` is an ancestor of the head.

**7. CI.** **Pass on the exact head.** Run **37930490719**, pull_request, head `6b9fb64be9fff28bddf5caa404561c6b18c89e24`, **attempt 2: success.**
- **checks:** 12:41:11 to 13:00:23 (19m12s), every step green.
  - typecheck, lint (including the lane step) and unit suites passed.
  - The DB package passed 59/59 files and 642/642 tests, including `identity.integration.test.ts` at 11/11.
  - build passed.
  - The browser step ran 272 tests, all passed (12.8 min).
- **dependency-review** and **secrets:** success.
- **Attempt 1:** a test-infrastructure failure, not a test failure and not a time-limit event (see the observation above).
- **Margin:** attempt 2 finished 48 seconds under the 20-minute limit, so it was not a time-limit event. The margin is thin.
- **Earlier run:** run 37843574993 on `bdf80fd` (the round-9 repair before the renumber) was also green.

Not done here: I made no merge, acceptance, push or CI re-run. The P3-1 doc sentence is left for the integrator.

---
_Generated by [Claude Code](https://claude.ai/code)_

