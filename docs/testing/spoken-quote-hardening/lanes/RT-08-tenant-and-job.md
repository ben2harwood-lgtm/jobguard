# RT-08 Another firm's data, wrong client or job attached

**Attack:** a capture or review reaching the wrong firm, the wrong job or the wrong customer.
**Invariants:** D2, D3, S4. **Kind:** integration tests against the practice database, plus a code review.

## Angles
- Two practice firms in two browser sessions. Firm B tries: `view`, `save`, `confirm`, `discard` on firm A's
  `jobId`; reusing firm A's `captureId`; guessing ids; replaying firm A's request body with B's cookie;
  setting `requested_tenant_id` to A's or to another value; an expired or forged practice session.
- `captureRequestV1` accepts `requested_tenant_id`: confirm the server never trusts it beyond the DEMO check,
  and that the practice session, not the body, decides the firm.
- Wrong job: start a capture on job 1, switch to job 2 in another tab, submit; does the transcript land on job 2?
- Wrong customer: a transcript that names another customer (see RT-04) must not change the job's customer.
- Cache and shared state: anything module-level in the readers or the route (a cached last transcript, a Map keyed
  without the tenant) that could leak between requests on one Worker.
- Error messages and logs: does any error echo another firm's text?
- Database row locks: confirm every capture and review table read and write is firm-scoped (V2 FL rules).

## Expected
Every cross-firm attempt is refused with the same not-found answer, nothing is written, and no text from firm A is
ever returned to firm B.

## Deliver
Integration tests in `apps/api/src/capture/` (practice data only) and a written review of the route,
`practice-access.ts` and the repositories in `../FINDINGS.md`. Security-sensitive: any finding here is P0, and
the fix PR also gets a "desktop-review-please @ <sha>" security re-check on Ben's Mac.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-08.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
