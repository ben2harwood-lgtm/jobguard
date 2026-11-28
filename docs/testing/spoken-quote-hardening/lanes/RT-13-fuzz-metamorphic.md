# RT-13 Generated quotes with known truth; metamorphic checks

**Attack:** thousands of quotes the reader has never seen. **Invariants:** M1, S1, S2, S3, P1.
**Kind:** property-based tests (fast-check if already a dependency, else a small seeded generator; no new
dependency without saying so in the PR).

## Generator
Build quotes from parts with known truth: rooms (incl. numbered), work verbs, objects, counts, amounts in all RT-01
forms, qualifiers from RT-02 (truth: open), fillers, connectives ("and", "then", commas, none). Each generated quote
carries its expected lines.

## Properties
- M1 on every output: every kept pence cites words that read to exactly that value.
- Each clean (unqualified) priced item comes back with its exact price, or open; never another number.
- Each qualified item comes back open.
- No line count above the number of work items said.

## Metamorphic checks (output must not change, except spans)
- Add or remove fillers ("er", "like", "right then").
- Change case; remove all punctuation; swap "£150" for "150 pounds" for "a hundred and fifty pounds".
- Reorder rooms (each room keeps its own lines and prices).
- Append an unrelated sentence with no work ("the customer's dog is called Max").

## Deliver
`packages/ai/src/redteam/fuzz.test.ts` with a fixed seed run in CI (1,000 cases, under 20 s) and a long run
(100,000 cases) reported in the PR. Every counterexample becomes a corpus case in the matching lane's file.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-13.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
