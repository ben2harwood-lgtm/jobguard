# 0190 — MON-2A-P synthetic subscription persistence

This migration creates no production collection capability. It consumes MON-1B immutable supplied meter facts, not CH-4 lifecycle events. No backfill, real job fabrication, payment provider, tax calculation, success-fee source, journal posting or track assignment is installed.

## Objects and privileges

`control_plane.subscription_plan_catalogue` is an explicit public-reference control-plane exception: immutable Solo/Builder proposed terms, monthly only. Runtime has SELECT; no INSERT/UPDATE/DELETE/TRUNCATE or acceptance capability.

New `app` business relations are `subscription_agreement_revision`, `subscription_plan_change`, `subscription_change_outcome`, `subscription_period`, `subscription_place`, `subscription_place_binding`, `subscription_period_line`, `subscription_correction_disposition`, `subscription_alert`, `platform_statement`, `platform_statement_line`, `subscription_review`, `subscription_operations_card`, `subscription_onboarding`, `subscription_simulated_work`, `subscription_simulated_attempt`, and `subscription_simulated_result`. All are migration owned, FORCE RLS, tenant-keyed and append-only. Runtime has no direct read or write grant; checked company reads preserve MON-1B shared-practice refusal. Source relationships are tenant-qualified; representative UUIDs refer to supplied fixtures and never pretend to reference `app.job`.

Runtime receives only EXECUTE on `app.mon2_command(uuid,text,uuid,jsonb)`, `app.mon2_read(uuid,text)` and `app.mon2_source(uuid,text,uuid)`. Internal helpers `mon2_correction_open`, `mon2_boundary`, `mon2_consistency`, `mon2_issue`, `mon2_review`, `mon2_approve`, `mon2_authorized` and `mon2_audit` have PUBLIC execution revoked and no runtime grant. No role, credential or worker login is created. All helpers are migration owned. Public-source reads use existing private `mon1_company_actor` and source replay uses `mon1_project`; canonical audit hashing uses existing `final_lock_hash`.

## Transactions and concurrency

All commands first authenticate through MON-1B, acquire `pg_advisory_xact_lock(hashtextextended(tenant::text,184))`, then authenticate again. The order is tenant/business lock, exact command receipt lookup, business facts/authorization/work/receipt writes, audit-head lock and audit append. No business lock is acquired after the audit head. Exact committed retries return the original result; actor, tenant, payload and command family bind the request hash. A foreign command family sharing the command UUID conflicts.

Owner terms acceptance derives actor and time from persisted session/current server time. Admin access remains company read/operational access, never terms acceptance. Exact approval expiry is bounded by the persisted accepting synthetic session expiry, rather than inventing a new subscription consent duration. Exact approval hashes bind tenant, plan, cadence, catalogue/terms versions, anchor, maximum and expected revision. Plan changes retain original anchor. Downgrade intents are never effective before boundary application and capacity/approval/revision checks; outcomes append history. Stub/reanchoring and negative settlement policies remain held.

Period issue recomputes immutable supplied inputs using accepted effective plans; fixture annual/trial/plan flags cannot change charges. Largest remainder uses canonical line keys. Stable place identity is tenant/customer/site, while representative job and source revision are separate immutable attribution. Correction identities recompute source differences under accepted terms; positive values share maximum headroom, excess alerts persist, negative facts persist without refunds or credit. MON-1B refuses new corrections after its designated receiving period closes. A new `subscription_receiving_period_open` trigger on `meter_correction` also refuses correction insertion after a subscription period has issued, even without a receiving meter baseline. It changes no existing columns or fingerprinted routines.

Statements use the `subscription.synthetic.v1` platform namespace and principal-only immutable lines. Deferred constraints verify period and statement line totals, statement source bindings, exact authorized simulated amounts, representative source identity and correction alert period identity. Review commands can raise a mandatory Decision and internal operations card before issue; persisted issue also evaluates sustained three-period use. Neither path assigns a commercial track.

Synthetic execution requires exact statement approval, matching current revision and a still-active owner authorization. One attempt identity persists before adapter execution outside the transaction. Redirect is not settlement. Unknown outcome requires reconciliation; there is no second execution attempt. Reconciliation adds an explicitly synthetic result and never posts a ledger entry.

## Upgrade and rollback

No existing migration, fingerprinted column list, authentication bridge or source-table data/columns are changed; the additive correction guard trigger is the only predecessor-table DDL. N installs after populated predecessors; the test suite separately checks N alone, later successors and repeated runner behavior. Install failure rolls back the enclosing transaction. After installation preserve all accepted/issued facts and forward-fix additively; never delete issued history as a rollback.

PostgreSQL and migration execution are **NOT RUN** in the authorized sandbox. SQL source inspection is not proof of successful PostgreSQL execution. CI must prove installation, populated predecessor preservation, catalogs/grants/RLS and adversarial routines before acceptance. RED requires two independent Claude verdicts bound to the dispatcher's final commit and separate acceptance. No release gate is opened.

A durable claimed attempt with no result (process interruption or lost result persistence) is also reconciled without another execution. A completed redirect alone is not a settlement or an unknown-outcome retry permission.

Audit payload hashes bind both the canonical request and the committed result (including the issued statement artifact hash), using the existing audit-chain format.
