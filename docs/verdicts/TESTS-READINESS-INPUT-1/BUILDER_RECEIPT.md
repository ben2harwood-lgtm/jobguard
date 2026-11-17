Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-READINESS-INPUT-1 builder receipt

Base 1bcd8db8. Test-only; no product code changed. Decision 74: RED two-model check, then PARK.

## Changed
- apps/api/src/readiness.payload-preservation.test.ts (new): RP1 (true/false accepted; "true","false","",1,0,null,[],{} refused), RP2 (omitted `resolved` stays absent, false stays present, omitted vs false serialise differently), RP3 (commandId and timestamp spelling `...000Z` vs `...Z` preserved exactly; plan and advance inputs unchanged).
- config/lanes/tests-readiness-input-1.json (new, as quoted in the order).
- docs/ledger/TESTS-READINESS-INPUT-1.md (new, one-line ledger).

## Run
- vitest on the new file against unchanged source: 18 passed.
- Scratch RED (source restored afterwards, git diff on contracts empty): `z.coerce.boolean()` -> 8 failed (RP1 string/number/null/array cases); `.default(false)` -> 2 failed (RP2 omitted-absent, omitted-vs-false).
- turbo typecheck --force, lint --force (LANE_BASE_REF=origin/main), pnpm build --force: all 7/7 successful.
- git diff --check clean. Disk free 52 GB at start.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). No claim of persisted replay, scheduling or provider behaviour. No new timestamp-format rule asserted beyond two spellings the unchanged schema accepts.
