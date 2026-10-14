# TEST-TIMEBOMB-1 builder receipt (AMBER, test-only)

Problem: CH4-A06 stamped the marker with the real DB clock but inserted the photo at a hard-coded
2026-10-14T10:00:00.000001Z. From that moment the marker is later than the photo, migration 0144
refuses the cancel row, and the test sees ['finished_on_site','first_site_evidence'].

## Changed line (packages/db/test/job-work-state-races.integration.test.ts, line 11, set-up only)
Before: `...before=(await workEvents(f,a))[0];await insertPhoto(f,a,"2026-10-14T10:00:00.000001Z");`
After:  `...before=(await workEvents(f,a))[0];const photoAt=new Date(Date.parse(before.fact_at)+60000).toISOString();await insertPhoto(f,a,photoAt);`
No expectation changed. Lane entry test-timebomb-1 added to config/agent-lane-assignments.json.

## Other time-sensitive spots (not changed)
- sources.integration.test.ts:14,17 and races:6,8 use 2026-10-13T10:00 with no real-clock ordering (fixed vs fixed). Safe.
- sources:77,87 use fixed 2026-10-14T10:00:00.123456Z / .123457Z for stage_completion and receipt (fixed vs fixed). Safe.
- sources:139 replaces clock_timestamp() with a fixed 2026-10-13T12:00 on purpose. Safe.
- fixtures default insertPhoto time 2026-10-13T10:00:00.000001Z is only used by tests not comparing to a clock marker (the 7 job-work-state files pass today).

## Commands (heavy-slot, maxWorkers=2, 3 files per run)
- Before fix, races file, 2026-10-14: exit 1, CH4-A06 failed (finished_cancelled missing), 3 other tests passed.
- After fix: races+sources+job-work-state: exit 0, 3 files / 25 tests passed.
- catalog+post-lock+upgrade: exit 0, 3 files / 23 tests passed.
- pnpm typecheck 0; LANE_BASE_REF=origin/main pnpm lint 0; pnpm lint:lanes 0.
Env note: packages core/storage had to be built locally, and embedded-postgres scripts/hydrate-symlinks.js run once; no committed effect.
Not run: full pnpm test/test:db, build, e2e. Not independently verified, not accepted.
