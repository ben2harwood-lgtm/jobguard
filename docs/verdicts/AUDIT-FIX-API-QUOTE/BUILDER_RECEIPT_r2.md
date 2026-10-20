# AUDIT-FIX-API-QUOTE builder receipt, round 2 (re-acceptance, finding 5 only)

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/audit-fix-api-quote`. Lane RED (money). **Not independently verified, not accepted.**
Authority: Ben, 14 Oct, coordinator chat, decisions 21 (same unchanged quote may be accepted again after its acceptance was cancelled), 22 (fresh customer details, nothing copied), 23 (refused once any customer invoice, deposit/receipt or credit note exists on the job). Spec: `QUOTE-REACCEPT-DESIGN-20261014.md` Technical annex.
Scope: finding 5 only. Findings 1-4 and LATER 6-8 are not in this piece (round 1 receipt unchanged).

## What changed
- `packages/db/migrations/0155_quote_reacceptance.sql` (0155 confirmed free on origin/main; 0152 = PR #206, 0154 = PR #210; no renumbering). Never edits 0011/0153.
  - Drops `UNIQUE(tenant_id,job_id,document_id)` on `app.quote_acceptance`.
  - NEW immutable RLS-forced table `app.quote_acceptance_sequence` (owner jobguard_migration, SELECT only to jobguard_runtime): `acceptance_sequence`, `replaces_acceptance_id`, UNIQUE (tenant,job,document,sequence) and UNIQUE (tenant,replaces).
  - Deviation from the annex, on purpose: the annex adds columns to `app.quote_acceptance`. That table's whole rows are fingerprinted into evidence packs and pinned by `fingerprinted-row-shape.integration.test.ts`, so adding columns would change approved packs and need a changed pinned expectation. A side table avoids both. Existing rows count as sequence 1, no backfill.
  - `CREATE OR REPLACE` of `record_builder_attested_acceptance` (re-accept only when the latest acceptance has a bound `acceptance_cancelled` event and no customer_invoice/customer_credit_note/customer_payment row exists; quote_version inserted only when absent; sequence = latest+1 with replaces link) and `record_quote_disposition` (cancel binds the latest acceptance). Same signatures, owners, ACLs.
  - `switch_job_live` / `switch_job_live_v3` NOT replaced (annex suggested it): both already require job status `accepted` and pointer = document, which only an uncancelled acceptance sets; the live test shows it works after re-acceptance.
- `packages/db/src/migrate.ts` registers 0155. `packages/db/MIGRATIONS.md` entry added.
- `packages/db/src/acceptance-repository.ts`: semantic key unchanged for first accept/cancel, `:<n>` suffix for later ones (n from `acceptance_event`, so it works on older schemas); a retry with a known command id reuses its recorded key (so idempotent replay still works); active-acceptance view reads the latest row.
- Tests (new): `quote-reacceptance.integration.test.ts` (8), `quote-reacceptance-upgrade.integration.test.ts` (1).
- `config/agent-lane-assignments.json`: own lane row updated (exact allow list, one line).

## Catalogue rows added (standing rule: new row for a NEW thing), `packages/db/test/tenancy.integration.test.ts`
- before: no `quote_acceptance_sequence` entry in the RLS list (line ~307) or the ownership list (line ~552). After: one new entry in each (`relrowsecurity/relforcerowsecurity/guarded` true; owner `jobguard_migration`). No existing entry changed.
- `context-boundary.test.ts` and its pinned lists untouched. No existing expectation, refusal, count, fingerprint or timeout changed.

## Evidence (all PostgreSQL via heavy-slot ent-3c, vitest --maxWorkers 1-2, at most 3 files per run)
- RED first: audit test `reaccepts unchanged terms after explicit cancellation` against the ORIGINAL repository and without 0155: failed `expected 'quoting' to be 'accepted'` (silent success, job stays quoting), the audit's reason. Log: `docs/verdicts/AUDIT-FIX-API-QUOTE/red-evidence/red-reaccept.log`.
- GREEN: `quote-reacceptance.integration.test.ts` 8/8 exit 0: audit test; fresh details not copied and first row byte-identical, sequence rows 1,2 with replaces link, side table immutable and runtime cannot insert (42501); second cancel + third accept and duplicate accept while accepted refused; two concurrent re-accepts exactly one wins (2 acceptance rows, 2 accepted events); replay of an old command id after re-accept returns the original, changed replay is COMMAND_CONFLICT; accept->cancel->accept->start live succeeds (activation on the document, view shows the second customer), then cancel and re-accept refused once live; refusal with a customer invoice, a credit note, a payment (message "customer billing exists", nothing written) plus clean control; catalog: routine owner/SECURITY DEFINER/search_path/ACL, side table owner/RLS/force/SELECT-only, old unique key gone, `quote_acceptance` column list unchanged.
- Upgrade: `quote-reacceptance-upgrade.integration.test.ts` 1/1: DB at 0153 with an accepted+cancelled quote (old routine rejects a second accept), apply 0155 alone, old acceptance/event rows byte-identical, then re-accept as sequence 2.
- Regression runs, all exit 0: migfix-4 (+upgrade) + quote.integration (17 tests); fingerprinted-row-shape + evidence-pack-sources + final-account-lock-upgrade (20); job-work-state-upgrade + activation + recovery-case-terms-upgrade (7); site-extra-pricing-upgrade + shared-money-origin + recovery-follow-up-upgrade (24); tenancy + demo-bootstrap (= `pnpm test:migrations` file set) + quote-reacceptance (21); job-activation-terms + practice-session + quote-reacceptance-upgrade (23).
- Static: `tsc --noEmit` packages/db and apps/api exit 0; `LANE_BASE_REF=origin/main node tools/lint.mjs` exit 0 (core purity, lane boundary, money arithmetic).
- Intermediate failures, fixed not weakened: tenancy catalogue lists (new table, rows added above); a historic-schema test failed because my first repository draft read the new table (changed to read `acceptance_event`); practice-session failed on a stale built core (`tsc -p packages/core` rebuilt, generated ignored output only).

## Not run
`pnpm test:migrations` via the pnpm script itself (its two files were run directly with the same options); full `pnpm test:db`, `pnpm test`, `pnpm build`, e2e/browser, openapi check, root `pnpm typecheck`/`pnpm lint` (turbo). Full 40-minute CI not awaited. No Nest/e2e change.

## Open
- `0107` `recovery_message_sources_current` picks the latest acceptance by `accepted_at`; a re-acceptance whose stated time is earlier than the first would not be picked. Out of scope, not changed.
- `app.quote_version.status` stays `accepted` after a cancel (immutable; job pointer is truth).

Not independently verified, not accepted.
