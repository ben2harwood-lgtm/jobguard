# Q33 · V2-SX-R: refusal proof for the V2 routes built before rule 29

**Tier:** T1 (tests only). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Starts when:** V2-SX (Q26) has merged into `v2/main` **and** `codex/sandbox/v2-d5b` has re-merged `v2/main`. **Base:** `codex/sandbox/v2-d5b` (#925). **Branch:** `codex/sandbox/v2-sx-r`. **PR:** draft into `codex/sandbox/v2-d5b`. **Planner:** Fable thread, 25 Nov 16:55 UK (SX rev 5 plan check, condition 5).

## Dry-check (planner, 25 Nov 16:50 UK, rule 23)
Real Next routes under `apps/web/app/api/v2-backend/jobs/[id]/`, by the branch that adds them:
- `quotes/activation/route.ts` and `work-plan/route.ts`: c4 (`codex/sandbox/v2-c4`, #903);
- `measurements/route.ts`: d5a (`codex/sandbox/v2-d5a`, #914);
- `materials/route.ts`: d5b-m (`codex/sandbox/v2-d5b`, #925), which also has all four.

Today their refusals are proven only at the **application** layer, through the second firm (seed test on d5b lines 790 to 797 for measurements, and 1353 to 1357 for materials), plus route unit tests with mocks (`materials/route.test.ts`). **Nothing proves them over HTTP through the real Next route.**

## What to build
For each of the four routes' GET handlers:
- call `assertBuilderRouteRefuses` with a positive control (the builder's 200 and expected body), cases (a), (b) and (d), and typed codes;
- append each route to `builderGetRoutes`, so SX's last test covers case (c).

Find the query each GET needs in its `route.ts`. If a GET needs a fixture the seed doesn't make, stop and report it as a planner miss. No product code changes.

## Done when
CI1 is green three times in a row with no 429, and a Codex check has been done on the frozen head. Then #903, #914 and #925 each meet rule 29 through this PR. Say so in each PR's "Rules met" list.
