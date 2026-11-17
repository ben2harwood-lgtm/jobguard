# AUDIT-FIX-API-QUOTE builder receipt, round 3 (Opus REPAIR B1 on head 433e17ff)

Builder: Claude Sonnet 5.5. **Not independently verified, not accepted.**

## B1 fix
- `0155_quote_reacceptance.sql` now also `CREATE OR REPLACE`s `app.recovery_message_sources_current` (body copied from 0107; same signature, owner, ACL). Only change: the accepted-quote CTE joins `app.quote_acceptance_sequence` and orders by `coalesce(acceptance_sequence,1) DESC,recorded_at DESC,id DESC` instead of `accepted_at DESC`. Single-acceptance jobs resolve identically.
- `packages/db/src/evidence-pack-sources.ts`: ordering changed from `accepted_at DESC,recorded_at DESC,id DESC` to `recorded_at DESC,id DESC`. Deliberately NOT the side table: the TS runs against schemas older than 0155 in existing upgrade tests (CH-1, recovery-case-terms, recovery-follow-up), which failed with "relation does not exist" when I tried the join. `recorded_at` is transaction time and the job lock serialises acceptances, so it equals sequence order. Same for the repository view (later item 1, also changed to `recorded_at DESC,id DESC`; no `accepted_at` ordering remains).
- No existing expectation or pin changed; the 0107 replacement needed none (fallback not used).
- Later items: 1 done. 2 (`commercial-integrity-repository` `won_at=min(accepted_at)` counts cancelled acceptances) NOT done, not trivial (changes commercial semantics); 3, 4, 5 not done (low risk, noted by reviewer).

## Evidence
- New `test/quote-reacceptance-evidence.integration.test.ts` (2 tests). RED first with the old TS ordering: `expected [...] to include 'quote_acceptance:<second>'` (second acceptance with the EARLIER stated date lost). Log: `red-evidence/red-b1-earlier-date.log`. GREEN after the fix.
- Limit to state plainly: the 0107 function is proven by catalog test (definition orders by sequence, not `accepted_at`; owner jobguard_migration; EXECUTE for runtime; no PUBLIC) and by the existing recovery-messages suite, not by a behavioural early-date case (it needs a full proof/case fixture).
- Runs (heavy-slot, vitest --maxWorkers=1, 3 files each), all exit 0: reaccept evidence+main+upgrade 11/11; evidence-pack-sources + recovery-case-terms-upgrade + recovery-follow-up-upgrade 12/12; job-activation-terms + practice-session + recovery-message-upgrade 25/25; recovery-messages + migfix-4 + migfix-4-upgrade 112/112; tenancy + demo-bootstrap + fingerprinted-row-shape 26/26.
- Intermediate failure fixed (not weakened): side-table join in TS broke three historic-schema tests; replaced with `recorded_at` ordering as above.
- Not run: full pnpm test:db / test / build / e2e / CI.
