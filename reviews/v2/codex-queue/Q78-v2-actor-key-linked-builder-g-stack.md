# Q78 · V2-ACTOR-KEY: a linked builder can save snags, handover, release, review request and aftercare (the G stack's membership keys), plus the G1 audit key

**Tier:** T2 schema repair, practice tenant only. It rides on the G branches; the RED ones (G3, G4, G8, G9) still merge on Ben's own card. **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Base:** each G branch at its head (see "Where"). **Migration:** none new; the unmerged G migrations are edited in place, the way #1059 fixed 2071. **Plan:** the G7 builder's browser run on #1066 (28 Nov 12:05 UK). **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 12:15 UK. **Decision (planner, under Ben's "you decide everything"):** fix it in place on the branch that made each table, then merge up the stack. Don't add a top-of-stack migration, because then G1 and G2 would land broken on their own.

## What it is
This is the same bug as #1059 (2071). A linked V2 builder's membership comes from `app.v2_work_plan_editor` and lives in the **identity** tenant. These tables key the actor to `app.membership` in the **practice** tenant, so every write from a real browser practice session fails the foreign key:

| Migration | Branch | Keys on `(tenant_id, actor_membership_id) → app.membership` |
| --- | --- | --- |
| 2081 `v2_snag_register` | G1 #996 (`claude/project-thread-trp08u-g1` @ f91468bfd) | lines 32 and 69 |
| 2082 `v2_handover_version` | G2 #998 (`…-g2` @ e9dbca345) | line 29 |
| 2083 `v2_handover_release` | G3, now inside G2 | line 39 |
| 2084 `v2_handover_release_stop` | G4 #1008 (`…-g4` @ 6a0a4fcb3) | line 29 |
| 2085 `v2_review_request` | G8 (`…-g8` @ 74ce0cb4a) | lines 29 and 45 |
| 2086 `v2_aftercare_offer` | G9 (`…-g9` @ 4d91590f1) | lines 32 and 49 |
| 2031 `v2_change_draft` | F3 #995 (`…-f3`) | line 35. Check this one: drop it only if F3's actor also comes from `v2_work_plan_editor` |

v2/main has none of these. The seed tests passed because they write as a practice-tenant membership, not as a linked builder. That's the same CI gap as K5B-1.

## Fix
1. In each migration, drop the actor-to-membership key only. Then add `ALTER TABLE … DROP CONSTRAINT IF EXISTS <name>;` after the `CREATE TABLE`, so a local stack that already ran the old file is repaired (the #1059 pattern). The actor stays the verified `v2_work_plan_editor` id, unkeyed, as 2012 and 2071 already do. Every other key, trigger, RLS policy, grant and firm lock stays unchanged.
2. **G1 audit key.** `v2-snag-register-repository.ts` audits under the reference key `sequence`, which `lp4_seal_audit` (0520) reserves. So every Mark fixed and Mark checked fails with AUDIT_INPUT_INVALID (503). Rename it `eventSequence` on **G1**. G7 #1066 keeps its copy until G1's fix reaches G9; then drop the duplicate from #1066.
3. Merge up: G1 → G2 → G4 → G8 → G9, then rebase G7 #1066 on the new G9. Keep each merge plain. Rerun `tools/migration-renumber.mjs --check`; no numbers change.

## Tests (the missing ones)
For every write path, add one seed test **as a linked builder session**, using the same helper #1059 used for K5B-1:
- add a snag, mark it fixed, and mark it checked by a second person;
- save a handover version;
- release it, then stop the link;
- record a review request;
- record an aftercare offer;
- F3: save a change draft, if F3 is in scope.

Each test fails before the fix. The existing G1 to G4, G8 and G9 seed tests pass unchanged. A same-tenant, different-firm session still gets 404. G7's browser spec steps for the saved version and the customer pack now run and pass.

## Done when
- A real browser practice session can do every G-stack write.
- The keys are gone only where the actor comes from `v2_work_plan_editor`.
- The G1 audit key is `eventSequence`.
- CI1 and the seed job are green on each branch, and desktop Codex is clean on each fix commit.
- Tell the merge thread that the G stack is repaired bottom-up.
