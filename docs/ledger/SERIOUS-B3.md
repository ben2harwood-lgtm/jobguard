# SERIOUS-B3 — Batch 3 quote corrections

Issued 16 October 2026, RED lane, synthetic data only. Scope is S06–S11 of the dispatcher's Batch 3 audit; other batches remain out of scope.

- S06 STOPPED: the once-rounded net required by BUILD_PLAN §5.4 contradicts existing pinned penny expectations. New explicit reproduction fails; no arithmetic or existing expectation is changed. Coordinator values are in the builder receipt.
- S07: preview computes each discounted line using the same evaluator as the saved revision and checks the net sum. A contradictory old preview is preserved and replaced with a new document version on preview. The S06 calculation hold still applies to both evaluator consumers.
- S08: save reconciles all confirmed scope identities to submitted included/excluded lines; omitted identities persist issue blockers.
- S09: immutable revision ownership is checked before writes; 0166 adds item-qualified foreign keys for quote lines and rate observations. Correct history is preserved; corrupt history blocks migration validation.
- S10: preview metadata is read by the returned document ID, including reused older recipient-specific previews.
- S11: acceptance resolves the requested exact document; the existing locked SQL routine still governs issue, supersession, job state and revision.

No money/access-policy decision, provider call, real data or spend is introduced. No existing tests, pinned lists, migration runner/list or lane register are modified. Local evidence and required CI/independent-review holds are recorded in docs/verdicts/SERIOUS-B3/BUILDER_RECEIPT.md. This note is not an independent verdict or acceptance.
