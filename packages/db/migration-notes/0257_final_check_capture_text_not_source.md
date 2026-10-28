# 0257 — the job's own capture text is not a Final Check source

Replaces one routine, `app.final_check_freeze_processing_inventory`, restated from 0238 with a single change: the `unlinked_capture_source` branch (the job's own walk-it capture text, joined through `job_record_proposal`) is removed from the frozen processing inventory. Owner, grants, trigger and every other inventory source (verified evidence, pending uploads, supplier documents and versions, purchase orders) are unchanged, as are the record/complete routines and their "every source processable and checked" gate.

Why: that capture text is the builder's own capture and the baseline's origin (AGENTS §5.14), not evidence. 0238 froze it as non-processable, so no job created through capture could ever complete a Final Check.

Already-frozen manifests are immutable and keep any capture-source rows; they stay incomplete, as before. Only manifests begun after this migration change. No data is rewritten.

Tests: `final-check-capture-text.integration.test.ts` (captured job completes, no capture-source row). PostgreSQL CI only. Rollback: forward-fix; restating 0238's body restores the old behaviour.
