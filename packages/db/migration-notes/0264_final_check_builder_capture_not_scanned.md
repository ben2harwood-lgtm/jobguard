# 0257 — the job's own walk-it text is builder capture, not scanned

Ben, 28 Oct ("Yes, builder capture"). The job's own walk-it capture text is builder capture and the baseline's origin (AGENTS §5.14), not evidence. 0238 froze it as a non-processable `unlinked_capture_source`, and completion required every source to be processable and checked, so no job created through capture could ever complete a Final Check.

Three routines are restated from 0238 with only these changes:
- `final_check_freeze_processing_inventory`: the walk-it entry keeps its frozen bytes/hash but is listed as `builder_capture_not_scanned` (still processable=false).
- `final_check_guard_fact`: the same identity check, under the new kind name.
- `complete_final_check`: the "every source processable and checked" gate exempts only `builder_capture_not_scanned`.

`record_final_check_source_result` is unchanged, so the walk-it entry can never be recorded as a zero-result or detection. Every other inventory source (verified evidence, pending uploads, supplier documents and versions, purchase orders) still blocks completion until processed. Owners, grants and triggers are unchanged.

Already-frozen manifests are immutable and keep their `unlinked_capture_source` rows; they stay incomplete, as before. No data is rewritten.

Tests: `final-check-capture-text.integration.test.ts` (listed explicitly, can't be recorded as scanned, captured job completes through the worker, completed manifest still lists it unscanned); core and worker unit tests. PostgreSQL in CI only. Rollback: forward-fix by restating 0238's bodies.
