# RT-02 VAT, plus materials, ranges, rates, discounts and conditions (beyond Q77)

**Attack:** words around an amount that change what it means. Q77's 19 cases are done; do not repeat them.
**Invariants:** M2, M3, M1. **Cases:** at least 150.

## Angles
- VAT: "plus VAT", "+ VAT", "inc VAT", "inclusive", "ex VAT", "no VAT", "VAT on top", "I'm not VAT registered",
  "with the VAT that's 180". The number is kept as said, VAT is asked about, never added or removed.
- Materials and labour: "£1,200 plus materials", "labour only", "supply only", "£300 labour and £200 materials"
  (two amounts: two lines or one question, never £500 silently), "materials at cost", "plus skip".
- Rates: "£180 a day", "per hour", "£25 a metre", "£25 per square metre", "a day for 3 days" (never 54000 silently),
  "day rate £180, 3 days", "per room", "per coat", "£40 a door" where the line counts doors (kept) vs windows (open).
- Ranges and hedges: "between 400 and 500", "four to five hundred", "400-500", "four or five hundred",
  "ish", "give or take", "call it", "roughly", "ballpark", "should come in under 500", "no less than".
- Conditions: "£150 if they want oak, otherwise £100", "£300, or £250 if they pay cash", "£200 for one coat, £300 for two".
- Discounts and credits beyond Q77: "knock off £20", "less 10 percent", "10% off", "minus the deposit", "they've
  paid £500 already", "deposit of £500" (not a line price), "£50 back for the old boiler", "free of charge", "chuck it in".
- Percentages: any "%" or "percent" near an amount keeps it open.

## Seed cases
| Transcript | Expected |
| --- | --- |
| Tile the bathroom £1,200 plus materials | line 120000 kept, question about materials |
| Fit the boiler £2,500 inc VAT | line 250000 kept as said, VAT question |
| Labour £300 and materials £200 to tile the kitchen | never one line of 50000 without a question |
| Day rate £180, three days | no line price 54000; open or 18000 per day with quantity 3 and a question |
| Fit door £150 if oak otherwise £100 | null, question |
| Paint the hall £400 but I'll knock off £20 for cash | never 42000; 40000 with question, or null |
| Rewire 10% off £3,000 | null |
| Customer has paid a £500 deposit, fit the kitchen £4,000 | kitchen line 400000; 50000 never a line price |
| Fit skirting free of charge | price null with question, or 0 with question; never a guessed figure |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-02.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
