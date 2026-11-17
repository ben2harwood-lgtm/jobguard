# CH-3a CI repair — run 37306387411

Builder receipt only; this is not an independent verdict or acceptance.

- **Base:** `d1e42af9f296ecb61041e12c977b4dd7c9689013`
- **Tested code commit:** `1a91159`
- **Before:** GitHub CI run 37306387411 failed in `job-parties.integration.test.ts` and `shared-money-origin.integration.test.ts` with `JOB_PARTIES_REQUIRED` after the SH-1 merge.
- **Repair:** CH-3a tests select migration 0051 explicitly. The SH-1 upgrade fixture is created before 0051, installs the established post-migration synthetic party fixture, and exercises adoption through the authorized party-bound command path, including rollback on an invalid party revision.
- **After:** the focused pair passed (2 files, 33 tests); `pnpm turbo run test --filter=@jobguard/db` passed (40 files, 219 tests); `pnpm turbo run lint typecheck` passed (14 tasks).

Correction (round 8, P2-1): this repair replaced the valid adoption that threw after its writes with an invalid-party refusal, weakening the post-write rollback proof. Round 8 restores that separate valid case while preserving the authorized party-bound fixture and invalid-party refusal. No guard, migration, skip, timeout, retry, migration count, or merge conflict resolution was weakened or removed. Technical acceptance remains subject to CI and independent review of the new head.
