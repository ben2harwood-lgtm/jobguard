# RT-04 Several rooms or jobs in one recording, run-on speech, unpriced items

**Attack:** the shape of a real walk-round: rooms switch, rooms come back, jobs mix, prices come at the end.
**Invariants:** S1, S2, S3, M1, M4. **Cases:** at least 120.

## Angles
- Rooms in sequence and back again ("kitchen ... bathroom ... back in the kitchen").
- Numbered and named rooms after Q75: "bedroom two", "bedroom 2", "second bedroom", "the back bedroom", "box room",
  "Bedroom two five hundred pounds all in" (never 250000).
- Room totals and whole-job totals together; a room total with priced lines inside it.
- Two customers or two addresses in one recording ("Mrs Jones job ... Mr Smith job"): must be flagged, never merged
  silently into one quote.
- Run-on speech with no punctuation and "and then" chains of 20+ items.
- Items with no price, then one price at the end for "the lot".
- Lists: "doors, skirting and architrave, £600" (one line or a question, never a price on one of the three only).
- Outside areas: garden, front, back, roof, drive, side return.
- Prices said before the item ("£300 for the hall, painting").

## Seed cases
| Transcript | Expected |
| --- | --- |
| Bathroom: tile walls £600. Kitchen: tile splashback £200. Back in the bathroom, fit extractor £150 | extractor in Bathroom, 3 lines, prices kept |
| In bedroom two paint the walls. Bedroom two £500 all in | Bedroom two price 50000 |
| Mrs Jones, paint the lounge £300. Mr Smith, paint the hall £200 | question that two customers were named |
| Paint the hall, the landing and the stairs, £900 the lot | wholeJob or one price 90000, no line gets 90000 alone |
| £300 for the hall, painting | 30000 on the hall painting line or a question; never lost |
| Kitchen strip out fit units tile splashback paint ceiling bathroom new suite tile floor | 7 lines, rooms Kitchen x4 Bathroom x3 |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-04.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
