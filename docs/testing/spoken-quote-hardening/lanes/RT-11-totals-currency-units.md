# RT-11 Totals that don't add up, currency and unit confusion

**Attack:** the money is all there but doesn't add up, or is in the wrong currency or unit.
**Invariants:** M4, M1, M2, S3. **Cases:** at least 100, plus pricing unit tests.

## Angles
- Said total differs from the line sum: lines £150 + £80, "that's £300 all in". Expected: lines kept, total kept as
  said, question that they differ. Never a line changed to fit, never the total replaced by the sum.
- Room totals that differ from their lines; room totals that add up to more than the whole-job total.
- Line total arithmetic in `review-pricing.ts`: quantity x rate with decimals (2.5 m x £25.50), rounding to pence,
  very large values (Number safety above 2^53 pence), zero and empty quantities, the "incomplete total" label
  when any line is open.
- Currency: "€2000", "$2000", "2000 euros", "dollars", "USD", "GBP", "sterling". Anything not pounds stays open
  with a question.
- Units: "square metres" vs "square feet", "m2", "m²", "sq m", "linear metres", "metres" vs "meters", "yards",
  "feet and inches", "per m²" on a line counted in items, "a metre" on a line measured in square metres.
- Quantity confusion: "two coats" (not a count of the item), "two-storey", "3 bed house", "15mm pipe", "2x4".

## Seed cases
| Transcript | Expected |
| --- | --- |
| Fit door £150, paint skirting £80, that's £300 all in | lines 15000 and 8000; wholeJob 30000; question that 23000 differs |
| Rewire the house for €2000 | null, currency question |
| Lay laminate 20 square feet at £25 a square metre | null, unit question |
| Paint the lounge two coats £300 | quantity not 2; 30000 line price |
| Run 15mm pipe to the rad £120 | quantity not 15; 12000 |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-11.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
