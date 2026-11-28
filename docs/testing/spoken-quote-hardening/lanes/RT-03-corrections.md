# RT-03 Corrections, repeats and restarts

**Attack:** people correct themselves while speaking. The reader must never keep the value they took back.
**Invariants:** M5, S2, S1. **Cases:** at least 100.

## Angles
- "no, make that", "actually", "sorry, I mean", "scratch that", "wait", "hang on", "not 400, 450", "or rather",
  "let's say", "call it 450 instead", "change that to", "forget the skirting".
- Correcting the count ("six doors, no, seven"), the room ("kitchen, sorry, utility"), the trade, the item.
- Removing an item: "forget the skirting", "don't bother with the ceiling", "leave the hall out".
- Repeats: the same item said twice ("paint the kitchen £500 ... yeah paint the kitchen £500") must be one line or
  a question, never two £500 lines silently. "Same again for the bedroom" (reference, asked about).
- Restarts and stammers: "fit the, fit the door", "five hun- five hundred".
- Corrections across sentences and far apart in a long recording.

## Seed cases
| Transcript | Expected |
| --- | --- |
| Paint the kitchen £400, no, make that £450 | 45000 + question, or null + question; never 40000; never two lines |
| Paint the kitchen for four hundred, actually five hundred | never 40000 |
| Hang six doors, no, seven doors, at £40 each | quantity 7 with question or null; never 6 |
| Tile the kitchen, sorry, the utility, £300 | room Utility or question; never Kitchen silently |
| Paint the hall £200. Fit skirting £150. Forget the skirting | skirting line removed or flagged; never priced silently |
| Paint the kitchen £500. Paint the kitchen £500 | 1 line, or 2 lines with a duplicate question |
| Same again for the bedroom | question; no invented line price |
| Fit the, fit the door £150 | one door line 15000 |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-03.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
