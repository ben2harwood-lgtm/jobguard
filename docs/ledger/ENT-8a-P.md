# ENT-8A-P — persisted live prompts

Issued 18 October 2026 against main `b881f90b`; Sub-order A only. Practice on made-up data, no release permission. Migration `0189_enterprise_live_prompts.sql`; dispatcher owns merge-time renumbering (MERGE-CHURN-1).

Binding inputs: Ben's answers of 17 October (read directly), dispatcher rules in the 18 October order, AGENTS.md rev 3.0 and BUILD_PLAN.md contractor prompt/origin contracts. Merged prerequisites: ENT-8a #219 (`2a230bb5`), ENT-8B #236 (`e0ecb254`), ENT-8B-SOR #237 (`ca435eeb`), ENT-5 #215 and ENT-5b #217. ENT-6B and Sub-order B are not prerequisites of the live-prompt work and are not implemented here.

Rules: explicit same identity/unit positive materials excess only; exact positive contract factor against each completed visit; closeout yes only when no extra has ever been logged for the job. Prompt matching has no origin, duplicate-group or fee authority. Imports require active finance/owner; resolution requires scoped supervisor/surveyor/commercial manager; historical reads survive capability loss but mutations do not. All new mutations require a live job and current authority even on replay. Conflicting same-time facts quarantine the affected comparison.

STOP — optional end-check integration only: no authoritative enterprise-agreement version store or contractor completion-command seam exists on the base. Do not substitute completed visits or CH-4 small-builder storage. Owning implementations must supply both before positive end-check acceptance and whole ENT-8a row closure. Ben's active-owner-only completion rule remains binding.

Migration/grant and validation details are recorded in the migration note and builder receipt. No production gate, money permission, external action or customer setting permission is opened. RED checks and separate acceptance remain outstanding.

Implementation adds only the seven listed tables and six checked EXECUTE grants: `lp_read`, `lp_command`, `lp_finish`, `lp_visit_evaluate`, `lp_sources`, `lp_observation_prompt`. All helpers and tables deny runtime direct access. The privilege inventory additions are marked `existing_exception` pending RED independent review, not asserted approved by this builder. Existing ownership/RLS catalogue rows are retained with seven additive expected rows each.

Rule (a)'s photo path reads actual command-finalized PNG originals and explicit CRC-checked metadata tags, with no widened predecessor RLS policy. Runtime reads originals under existing RLS only after scoped session authorization; the checked command independently verifies the byte preimage against immutable evidence metadata. Text-note registration remains conditional on an existing verified note object; this change adds no note uploader. Positive photo, synonym and forged-citation PostgreSQL tests are written but NOT RUN.
