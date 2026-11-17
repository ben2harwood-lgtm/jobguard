# LP0-FIX-1 builder receipt

Builder: Claude Sonnet 5.5. Base: origin/main 69eb908e. Branch: codex/sandbox/lp0-fix-1.

## Problem
main CI red: `packages/db/test/lp-0-authority-paths.integration.test.ts` [LP0-17] failed at the recorded-routine identity completeness
check (`expected 273 entries to equal 274`). LP-0 (#208) and MIGFIX-8 (#210) were each green alone. Migration 0154 adds
`app.recovery_follow_up_run_fence()`, which the reviewed inventory did not record.

## Fix (one entry, additive)
`docs/contracts/lp-0-effective-privileges-v1.json`, `recorded.routines`, inserted in sorted position before `recovery_follow_up_run_tick`:
identity `function:app.recovery_follow_up_run_fence()`; owner jobguard_migration; SECURITY INVOKER; search_path pg_catalog, app; returnsTrigger true;
reachable false; runtimeExecute false; publicExecute false; otherExecute []; no static writes or calls; definitionSha256 b771622168f1...67e (read from the live catalogue).
Verified against 0154 SQL: `ALTER ... OWNER TO jobguard_migration; REVOKE ALL ... FROM PUBLIC,jobguard_runtime,jobguard_infrastructure`, trigger-only use, comment "exposes no callable capability".
No existing entry, expectation or pin was changed. Lane entry `lp0-fix-1` added to `config/agent-lane-assignments.json`.

## Other stale spots (recorded only, NOT compared by any guard, left unchanged)
- recorded.triggers lacks 2 triggers from 0154: `app.sandbox_run_event|a_recovery_follow_up_clock_fence|app.recovery_follow_up_run_fence|BEFORE INSERT|O` and `app.sandbox_adapter_receipt|a_recovery_follow_up_receipt_fence|app.recovery_follow_up_run_fence|BEFORE INSERT|O`.
- recorded definitionSha256 differs from live for 4 routines: app.evaluate_recovery_follow_ups, app.guard_recovery_follow_up (both replaced by 0154), app.record_builder_attested_acceptance, app.record_quote_disposition.
- No missing/extra reviewed facts (`entries`); no extra recorded routines.

## Commands
See the final report; all exit 0: lp-0 three files 45 tests pass; migfix-8-upgrade pass; lanes; lint; typecheck.

Not independently verified, not accepted.
