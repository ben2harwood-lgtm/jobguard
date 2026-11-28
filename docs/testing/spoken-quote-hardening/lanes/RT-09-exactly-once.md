# RT-09 Double-submit, retry, offline, reload, two tabs

**Attack:** the builder is on a phone on a site with bad signal. **Invariants:** D3, S1, S4.
**Kind:** integration tests and browser tests (practice firm, preview or local).

## Angles
- Double-tap "Use this" / submit capture; double-tap Save; double-tap Confirm (same and different `commandId`).
- Network drop after the server saved but before the phone got the answer, then retry (`offline-capture.ts`).
- Offline dictation: record with no signal, come back online, replay; replay twice.
- Reload mid-review with unsaved edits; back button after confirm; two tabs editing the same review
  (`REVIEW_REVISION_CONFLICT` must show, and no edit is lost silently).
- Stale tab: confirm from a tab whose revision is old.
- Slow server: 10 s response; the builder taps again.
- Mic stops mid-sentence (permission revoked, screen locks, call comes in): the partial transcript is kept, not lost.

## Expected
One capture and one job per recording; one confirmed review; a conflict message where two edits meet; no lost
transcript text.

## Deliver
Integration tests for the API and a browser spec `apps/web/e2e/RT-09-exactly-once.spec.ts` using route
interception for the network cases.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-09.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
