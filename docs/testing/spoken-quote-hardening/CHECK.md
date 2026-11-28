# Full check before Tommy gets the spoken quote

Run once all fix PRs have landed and the preview is redeployed, at the final deployed head. Codex runs it;
Claude records the result on the tracking issue. Any "no" means not ready.

## A. Automated (Codex, one run, results pasted with the head sha)
1. Every corpus case RT-01 to RT-13 passes; zero `open-finding` with severity P0 or P1.
2. Existing suites unchanged: `packages/ai` and `packages/core` vitest, `pnpm eval` floors, held-out sets 1 and 2,
   the typed-rooms fixtures, Q77's `capture-qualified-price.test.ts`, Q75's tests.
3. Fuzz (RT-13): 100,000 generated quotes, zero M1 breaks, zero exact-price misses on clean items.
4. Perf (RT-06): every input up to 50,000 chars under 1 s; slowest regex under 50 ms.
5. Tenant (RT-08) and exactly-once (RT-09) integration suites pass.
6. CI green on the head; every fix PR had a Codex review from a separate task and is clean at its head.

## B. On the deployed preview (Codex, hosted browser run)
7. RT-12's 20 journeys pass at 360 and 1280, including save, reload, reopen and confirm.
8. RT-10: no horizontal scroll, 44 px targets, mic-denied fallback works.
9. RT-07: no injected HTML renders, no dialog fires.
10. Two practice firms at once: neither sees the other's capture.

## C. Human voice check (Ben, about 10 minutes on his phone; optional but recommended)
Ben reads 10 short scripts (in `voice-check-scripts.md`, written by Codex from the corpus: one per main lane,
including a correction, a credit, two rooms, a "plus VAT" and a total that doesn't add up) into the preview's
microphone, and ticks for each: lines right, prices right, questions make sense. Any wrong price is a stop.

## D. Sign-off
- Claude writes the result table on the tracking issue: lane, cases, pass, open (by severity), head sha.
- Ready for Tommy when A and B are all yes and C (if done) has no wrong price.
- Release or sharing the link with Tommy stays Ben's own call.
