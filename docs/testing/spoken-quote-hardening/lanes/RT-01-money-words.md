# RT-01 Money words, slang money, digits and separators

**Attack:** every way a UK builder says an amount, and every way the reader could misread one.
**Invariants:** M1, M2, S1. **Cases:** at least 150.

## Angles
- Number words: "a hundred and fifty", "one fifty", "one-fifty", "hundred and fifty", "twelve hundred",
  "fifteen hundred quid", "two and a half grand" (open), "three grand", "3k", "3.5k", "a grand".
- "pound" singular ("a hundred and fifty pound", very common in speech), "quid", "notes", "squid" (mis-hearing).
- Slang that must stay open (never guessed): "a ton", "a monkey", "a pony", "a score", "a bag of sand".
- Digits: "£150", "150 pounds", "£1,500", "£1500", "£1 500", "£1.500" (European thousands, open),
  "£150.5", "£150.999" (open), "£0", "£00150", "£1,2000" (bad separator, open).
- Unicode: full-width digits "£１５０", Arabic-Indic digits, non-breaking space "£1 500", "£ 150".
- Signs: "£-150", "minus 150 pounds" (Q77 covers the basic minus; go wider: "less 150", "take off 150").
- Pence: "£20 and 50p", "twenty pounds fifty", "20 quid 50" (each either exact or open, never 2050 pounds).
- Adjacent numbers: "fit 2 doors 150" vs "fit 2 doors at 150", "6 150 pound doors", "room 4 £300", "flat 12 £300".
- Dates and times next to money: "start on the 3rd, 150 quid", "8 till 4, 150", "2 days 300".

## Seed cases (expected)
| Transcript | Line price (pence) | Never |
| --- | --- | --- |
| Fit the door for a hundred and fifty pound | 15000 | 150, 1500 |
| Fit the door for one fifty | null (open, ask) | 150, 5100 |
| Plaster the ceiling twelve hundred pounds | 120000 | 1200, 2100 |
| Fit kitchen units for three grand | 300000 | 300 |
| Fit kitchen units two and a half grand | null | 200000, 250 |
| Fit the door a ton | null | 10000 |
| Fit the door £1.500 | null | 150, 1500 |
| Fit the door £１５０ | 15000 or null, never another value | 1, 5, 10 |
| Fit 2 doors 150 | null (count next to amount is ambiguous) unless an "at" ties it | 2150 |
| Room 4 £300 for painting | 30000 on Room 4's painting line | 430000 |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-01.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
