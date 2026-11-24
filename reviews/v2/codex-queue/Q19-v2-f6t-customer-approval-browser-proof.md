# Q19 · V2-F6T: browser and phone proof for "approve an extra by link" (test files only)

Tier: T1 (test files only), but it proves a RED customer page. Migration: **none**. Astra: no. Usefulness **high**: F6 #923 can't merge without it. Effort **S**. Rework risk: **low**.

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `01-RULES.md` (rules 11 to 16 especially). Ben's coding-rules checklist in `/mnt/project-files/audits/` applies once it lands. **Test files only:** no app code, no migration, no change to F6's source files. If a test can only pass by changing app code, stop and report; that becomes a decision for Ben.

**Why this exists:** F6 (#923, head `d7fabdf6`) has used its one build and two repairs. The Claude re-check (jobguard#923 comment 7146268070) says the code is right and the late price change is handled. But nothing has yet rendered the customer page: the Playwright test fails in its own setup. It posts the proof action `select_generated` with fixture `completion-photo` and gets `400 INVALID_COMMAND`. Customer pages need rendered evidence before merge. This is a separate follow-up beyond F6's repair cap, and Ben is told about it in the morning.

**Starts:** now. **Base:** `codex/sandbox/v2-f6` at `d7fabdf6`. Branch `codex/sandbox/v2-f6t`; draft PR against `codex/sandbox/v2-f6`. Do not push to F6's branch.

## Scope
1. **Fix the test's setup.** Find out why `select_generated` / `completion-photo` is refused: wrong fixture ID, wrong state, or a command the base doesn't accept. Then set up the variation photo through a path the base already accepts, such as an existing seed fixture or an existing command with valid input. Change only the test and its helpers.
2. **Get the customer approval page passing at 360 px and 1280 px**, plus the phone-mode run on Ben's Mac. The run opens the link, sees exactly one variation version (description, price, photos), types a name, presses "I agree", and sees a confirmation. It also checks that no other price, margin, note, job or hidden finding appears on the page.
3. **Add a stale-page test.** Open the link, have the builder change the price (a new version) in a second context, then press "I agree" on the old page. The page must refuse plainly, offer a reload, and record no agreement for the new amount. The old version is not agreed either if it was superseded, so state which behaviour F6 has and test it.
4. Screenshots at both widths next to the matching mock state.

## Done when
- Both widths and phone mode pass on the fictional job; the stale-page test passes.
- `git diff codex/sandbox/v2-f6...` touches only test files (`*.spec.ts`, `*.test.ts`, test helpers or fixtures under a test folder) and this piece's lane file.
- Zero paid AI calls; the local catcher receives only what the test expects.
- CI green apart from the known Vercel check. A Claude session checks it. One build plus up to two repairs.
