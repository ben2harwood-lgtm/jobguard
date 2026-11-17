# LATER-B13 — Readiness results and refusals

Built locally on `codex/sandbox/later-b13`, without a commit. Base/HEAD: `4c407a6c81bd714a6875b7adf995812381d0fe57`. Dispatcher cited `ca435eeb5791638c787c830d6ba717146f694539`; actual main wins. Main subsequently moved to `7ff452eeec1c523345d34715adfa3f8310062013`; the readiness files and cited plan contracts have no differences from HEAD.

- L060: added real-PostgreSQL regression using an existing plan ID, successful same-job twin and exact foreign-key refusal for the other job. No merged test edited. NOT RUN here.
- L067: controller returns typed 400 for malformed commands and sanitized 500 for unknown failures; existing access/watchdog filters retain their authority and conflict handling. Eleven isolated unit cases passed. The current readiness contract has no expected-revision field or stale-revision error: that assertion remains unverified pending a coordinator contract ruling.
- L068: only unresolved snapshots create due-review Decisions. Ready advances still persist command identity/result; prior mandatory Decisions remain recorded. Added PostgreSQL tests for replay, conflicts, concurrent duplicate commands, deduplication and transactional rollback. NOT RUN here.

No migration, application grants, real data, external effects or UI changes. RED independent verdicts and separate acceptance are outstanding. Decision 74: PARK; never merge, enable or deploy without Ben's button.

Coordinator prerequisite: `config/lanes/later-b13.json:1` is absent, and no legacy lane registers this branch. The builder has not changed the lane registry. See the receipt for exact proposed registration, command evidence and remaining checks.
