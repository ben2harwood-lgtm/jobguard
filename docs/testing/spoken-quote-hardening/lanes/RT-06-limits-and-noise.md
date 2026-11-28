# RT-06 Silence, noise, very long recordings, unicode, regex blow-up

**Attack:** inputs at and past the edges. **Invariants:** P1, S4, D1, S1. **Cases:** at least 60 plus a perf suite.

## Angles
- Empty, spaces only, one word, only fillers ("um er um"), only "[inaudible]", only punctuation, only numbers.
- Recogniser noise markers and junk: "[music]", "(inaudible)", repeated words x200, a phone ringtone as words.
- Very long recordings: 10, 30 and 60 minute transcripts (about 1,500, 4,500 and 9,000 words), the 50,000 character
  limit exactly, and 50,001 (must be refused cleanly with a message, not crash or truncate silently).
- 100 items (the cap) and 101 items: what does the builder see? Must not lose items silently.
- Unicode: emoji, zero-width spaces/joiners inside numbers ("£1​50"), right-to-left override, combining marks,
  Windows line endings, tabs, NUL, lone surrogates, Welsh and Polish letters in names.
- **Regex blow-up (ReDoS):** the parser is regex-heavy (`priceLiteral`, `spokenAmount`, `fractionOrRange`,
  `rangeAfter`, `roomMention`, `trailingRoomWords`). Fuzz each with crafted inputs (long runs of number words,
  "and and and", digits with commas, "between ... and" chains) and time them.

## Expected
- Empty or noise-only: one open line or a clear "nothing to quote" state; no invented line, no price.
- Every case under 1 s for both readers on CI; any regex over 50 ms on a 50,000-char input is a P1 finding.
- The stored transcript equals the input byte for byte (S4), including unicode.

## Deliver also
A perf test `packages/ai/src/redteam/perf.test.ts` that times both readers on the long and crafted inputs with a
CI budget, and a list of the slowest regexes with timings in the finding rows.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-06.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
