# RT-10 Phone at 360 px, mic denied, long quotes on the review screen

**Attack:** Tommy uses a phone. **Invariants:** U1, S1. **Kind:** browser tests at 360x740 and 390x844, plus 1280.

## Angles
- The capture screen and review screen with 1, 10, 30 and 100 lines; very long descriptions (500 chars); long
  room names; 20 questions; prices up to £999,999.99.
- No horizontal scroll (`scrollWidth <= innerWidth`), every button, select, input and checkbox at least 44 by 44 px,
  prices and totals fully visible (not cut off), questions readable.
- Mic denied, mic not supported (iOS Safari without Web Speech, Firefox), mic stops: the typing fallback works and
  says so plainly.
- On-screen keyboard open while editing a price: the field stays visible.
- Editing a price on the phone, split and combine rows, then save and reopen.
- Landscape, browser zoom 200%, large system text.
- Screen reader labels on price fields and questions.

## Deliver
`apps/web/e2e/RT-10-mobile.spec.ts` and screenshots of each state at 360 and 1280 (scale 2) in
`/mnt/project-files/jobguard-v2/screens/rt-10/` if available, else as PR artifacts. Findings as rows.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-10.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
