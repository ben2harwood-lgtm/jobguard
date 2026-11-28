# RT-05 Accents, dialect, trade slang, mis-hearings, no punctuation

**Attack:** what browser speech-to-text really produces for UK builders, not tidy typed sentences.
**Invariants:** S1, S3, M1, M2. **Cases:** at least 200.

## How to make realistic transcripts
Write them as Chrome / Safari Web Speech would output them: mostly lower case, little or no punctuation,
numbers sometimes as digits and sometimes as words, filler words kept. Mark each with its pattern.
No audio is uploaded and no paid speech API is called.

## Angles
- Accents and dialect (write the words the recogniser would produce): Scouse, Geordie, Glaswegian, Brummie,
  Cockney, Mancunian, West Country, Welsh, Northern Irish, and builders whose first language is Polish, Romanian,
  Lithuanian, Portuguese or Urdu. Examples: "we'll do the kitchen like", "gonna", "innit", "aye", "dead easy",
  "the back kitchen", "the scullery", "the press" (cupboard, Irish/Scots), "a wee bit of plastering".
- Fillers: "er", "um", "erm", "like", "you know", "right then", "so yeah", "basically".
- Mis-hearings: fifteen / fifty, thirteen / thirty, "for" / "four", "to" / "two", "ate" / "eight",
  "won" / "one", "pounds" / "pound" / "pond", "quid" / "squid" / "quit", "grand" / "gran", "VAT" / "vat" / "fat",
  "skirting" / "squirting", "plaster" / "plastic", "tiles" / "styles", "boiler" / "boil a".
  Expectation: an amount whose number could be a mis-hearing is still kept as said (the reader can't know), but a
  word that isn't a number ("pond", "quit") must never become a price.
- Trade slang mapped to trades: first fix, second fix, sparky, sparks, chippy, spark, plumb in, CU / consumer unit,
  dot and dab, skim, bonding, noggins, stud wall, RSJ, lintel, pointing, screed, latex, grout, mastic,
  making good, snagging, rip out, strip out, gut it, P-trap, combi, rads.
- No punctuation at all for a 25-item quote; all caps; Title Case; numbers glued to words ("150quid", "2doors").

## Seed cases
| Transcript | Expected |
| --- | --- |
| right then er the kitchen we'll rip it all out like and fit the new units for er three grand | Kitchen; strip-out line; units line 300000; no price on the strip-out |
| aye so the wee bathroom needs a new suite twelve hundred and tiling four hundred | Bathroom; 2 lines 120000 and 40000 |
| second fix sparks in the extension six hundred | Electrics, 60000 |
| plaster the ceiling for fifty pond | null; never 5000 |
| fit four doors for forty each | quantity 4, 4000 each; never 44 doors |
| dot and dab the lounge walls four fifty | Plastering; null (one-fifty pattern) or question |

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-05.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
