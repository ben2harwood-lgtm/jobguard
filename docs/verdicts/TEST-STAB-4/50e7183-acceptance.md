# Technical acceptance TEST-STAB-4 — PR #117 — verified head 50e7183 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026. It wrote the order (`ORDER.md`, copied here verbatim) and made the main-merge commit 50e7183; Codex gpt-6.1-sol built the change; a fresh Claude Opus agent reviewed it. The integrator neither built nor reviewed it.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026). Routine work: "repair a failed check without weakening it". Recorded as §14.3 "Discovered later": since ENT-4a (#110), `packages/core/src/extra-origin.test.ts:33` timed out at 5 s on GitHub runners, including main's own push run 37657498901 (5,326 ms). No migration.
- The coordinator required the reviewer to confirm explicitly that the change shortens the test's real work or fixes its cause, with no raised or added timeout, no skipping or sampling and no loosened assertion.

## 2. Verified head and verdict — PASS
- **Code head:** builder commit `00ee0f02f49cb7f7162569e28e5ad8334b732293`; main-merge `50e7183972580cf48f943c5719f971071367cee6` (main 2f986a7, lane registry in the new one-lane-per-line format plus `test-stab-4`).
- **Independent Claude verdict:** `50e7183-opus.md`, copied verbatim from PR #117 comment 6044323365: "VERDICT: PASS — bound to head 50e7183972580cf48f943c5719f971071367cee6". It answered the coordinator's questions explicitly: the cause was about 45,800 per-iteration `expect` calls; all 40,000 full-object parses and every `Date.parse` still run; no timeout raised or added anywhere; no skip, only or sampling; each iteration fails on exactly the old condition and the 2·2·24·60 count is unchanged; five mutations each fail the new test with a useful message; `receipt-allocation.test.ts` and all production code are byte-identical to main. Median file time 1,613 → 699 ms; CI 1,375 ms against main's 5,326 ms failure.
- **CI on 50e7183:** `checks`, `dependency-review` and `secrets` pass.
- **Main moved after that CI** (ENT-1 #100 merged as e77f442). ENT-1 touches no file this PR touches; the PR is mergeable without conflict; the CI run on the commit that adds this file tests the PR against main including ENT-1.
- **Only commit after 50e7183:** this one, adding record files inside `docs/verdicts/TEST-STAB-4/`, which the lane allows.

## 3. Follow-ups — not blocking, recorded for the coordinator
- The unchanged `receipt-allocation.test.ts:212` ("the working size is bounded…") still timed out once (7,323 ms) under heavy local load. Its time is in the production `sumExactPence` allocator calls (~430–720 ms each), so the order's stop rule applied correctly; it needs its own scoped order.
- The receipt says the lane file kept "the existing single line"; at the merged head it is in the LANE-FORMAT-1 one-lane-per-line form.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Order | JobGuard integrator (evening) | `ORDER.md` |
| Build | Codex gpt-6.1-sol (Gmail), dispatched by the integrator | `BUILDER_RECEIPT.md` |
| Main merge | JobGuard integrator (evening) | merge commit 50e7183 |
| Independent check | Fresh Claude Opus review agent | `50e7183-opus.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
