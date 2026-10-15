# AUDIT-FIX-API-QUOTE builder receipt r4 (LP-0 inventory repair)

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/audit-fix-api-quote`. **Not independently verified, not accepted.**

## Cause
CI run 38577020456 failed in `pnpm test`: LP-0 (merged as #208) compares the live migrated database with `docs/contracts/lp-0-effective-privileges-v1.json`. Migration 0155 adds `app.quote_acceptance_sequence`, which had no disposition (live diff: `OWNER_CHANGED ... -> jobguard_migration`, `TABLE_GRANT_ADDED ... SELECT -> jobguard_runtime`).

## Added (add-only; no existing entry, pin or expectation changed)
- `entries`: `acl|rel|table|app.quote_acceptance_sequence|jobguard_runtime|SELECT|-` in group `a-runtime-reads`; `owner|rel:table|app.quote_acceptance_sequence|jobguard_migration` in group `a-owner-tables-views`. Both groups already exist and are approved_current; no new group or LP card.
- `recorded` (inspected, not compared): rls, tenant_isolation policy and `quote_acceptance_sequence_immutable` trigger rows for the new table.
- `recorded.routines`: `function:app.recovery_follow_up_run_fence()` (main's 0154 helper). NEEDED for `lp-0-authority-paths` identity-completeness test to go green; the parallel lp0-fix-1 builder adds the same entry: keep ONE copy on merge.
- Not changed: recorded definitionSha256 of the three routines 0155 replaces (record_builder_attested_acceptance, record_quote_disposition, recovery_message_sources_current); same signatures, ACL and owner, existing entries still apply; digests are explicitly not compared (LP0-13 held).
- Lane file: allow list gains the JSON and this receipt.

## Commands
See the final report table; run via heavy-slot ent-3c. Not run: full CI, pnpm build/test:db whole suites, e2e. Not independently verified, not accepted.
