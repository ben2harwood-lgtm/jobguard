# SV-4 continuation audit — saved head cac7c15 against base 262f939

Source-inspected on 12 October 2026. BUILT means implementation and named assertions exist, not executed or accepted. No previous run evidence is inherited. The interrupted session left no receipt, no self-review and no reliable final check record.

| Criterion | Initial audit | File and named proof |
|---|---|---|
| B1 baseline/captures account | BUILT | Existing FinalAccountCommandService reused; final-account-lock.application.ts get; integration DW1 capture includes every state |
| B2 exact review prompt | BUILT | core/final-account-lock.ts; core preserves exact declaration, prompt, check text; SV-4.spec persisted completion |
| B3 final_review extras | BUILT | variation-repository.ts addFinalReviewExtra; integration DW1 capture includes every state; API final-review proposal uses server origin |
| B4 dispositions | BUILT | 0130 record_final_account_disposition; integration DW2 refuses missing dispositions |
| B5 declaration | BUILT | core strict command/fixed constants, 0130 lock_final_account; core preserves exact declaration |
| B6 atomic lock | BUILT | 0130 lock_final_account; integration DW4 replay; audit failure rolls back lock |
| B7 final/supplementary bindings | BUILT within Q1 | 0130 issue_lock_bound_customer_invoice, invoice/line side tables; invoice integration F7 main and supplementary |
| DW1 all pre-lock states/capture | BUILT | integration DW1 capture includes every state, £3,200 logged/£400 reviewed and post-lock refusal |
| DW2 disposition/terms refusals | BUILT | integration DW2 refuses missing dispositions and terms through repository and runtime routine |
| DW3 source hash reconstruction | BUILT | core/SV-1 component exports; repository verify; integration DW3 recomputes all source hashes |
| DW4 replay/double/second browser | BUILT | integration DW4 replay and concurrent commands; SV-4.spec persisted completion |
| DW5 immutable lock | BUILT | 0130 statement mutation trigger; integration DW5 runtime, shadow and migration owner cannot mutate |
| DW6 real locked reveal | BUILT | reveal integration genuinely locked job and exact EXECUTE grantees |
| DW7 guarded issue/races | BUILT within Q1 | invoice integration missing lock/no completion/pending/failed, exact cutoff, race cases, F7; browser DW7 pending/failed |
| DW8 real API isolation | MISSING | API isolation file has only scripted adapters; DB integration covers real signals on one persisted job. Needs two real database copies at the API boundary, statement tracing and lock response. |
| DW9 persisted browser state | BUILT | SV-4.spec persisted completion survives reload, Jobs and a second browser |
| C1/C2 service/Next/Nest/OpenAPI | BUILT | new application/controller and four thin Next routes, appended registrations/openapi; controller all four commands and read |
| C3 synthetic boundary | BUILT (inspect further) | PracticeAccess verifies synthetic session/job; fictional recipients, banner, no external action; no real completion writer |
| C4 minimal grants/tenant FKs | MISSING coverage | catalog posture assertions exist, but need actual denied INSERT and append-only SQL for all new tables and explicit lock/disposition FK attacks across jobs/tenants |
| C5 boundaries/audit/races | BUILT | strict core commands, integration owner authority/tenant mismatch and audit rollback, API unowned job rejection |
| C6 execution evidence | MISSING | No usable prior receipt. DB/browser cannot run here; local checks due after fixes. |
| C7 specified UI assertions | BUILT (inspect further) | browser persisted completion tests banner, overflow, focus/44px and pounds |
| C8 lane/independent acceptance | BUILT lane / HELD verdict | one SV-4 lane; Claude/Sol independent verdict and separate acceptance owed |
| Rule 9 own-migration proof | BUILT | upgrade integration installs before 0130, compares own step, later twice, canonical named columns/types/PK identities and rolled-back controls |
| Rule 11 credential-shaped strings | BUILT | new fixtures construct credentials; existing other-leaf strings remain untouched |
| Rule 12 no file freezes | BUILT | no new bytes/hash assertion on merged source files; fingerprinted-table catalog guard explicitly ordered |
| Q1 legacy path unchanged | BUILT / HELD closure | practice repository and routine untouched; older tests untouched; legacy UI branch additive wrapper requires byte-preservation inspection |
| Q2/Q3/Q4 | BUILT | check INSERT only on its new table; closed terms acceptance; three additive canonicaliser exports/tests |

HELD: older invoice-without-lock closure (SV-5); completion runs/catch command/reveal screen (SV-5); interim issue path; other terms/pilot wording (D12/D13); widened locking roles; money effects of removed/deferred; UI polish; live data/release G1. No column added to any fingerprinted table; no SV-2 allowed-routines-list or authentication pinned file changed.

## Final continuation disposition

All initially MISSING implementation/coverage items above now have added assertions. Self-review found and corrected two further draft errors: baseline rows were incorrectly included in the extras register (DW1 now asserts the whole register is exactly 360000 pence, baseline is separately bound via line/revision hashes); the DB query spy used an incompatible Pool.connect overload (static test compilation now succeeds). Existing assertions are retained. The checklist describes built source/tests, not database/browser passes. Receipt lists actual check exits and holds; database/browser execution, independent verdict and acceptance remain owed.
