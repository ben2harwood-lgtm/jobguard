# 0452 — M4-13 dark subscription mandate persistence

Add tenant-scoped FORCE-RLS immutable terms and mandate lifecycle history. Runtime
has no direct table grants. Session-bound functions recheck active membership
under the existing tenant subscription lock (184); owner commands create exact
synthetic approvals and append receipt, history and audit in one transaction.
No locks are acquired after the audit head. Terms text and hashes are immutable;
approval actor, exact version/hash, Decision, command and server time survive
revocation. Revocation/cancellation record provider cancellation as **pending**;
no adapter runs. A cancellation after revocation remains a separate fact.

No backfill grants a mandate to existing subscription acceptances. No provider,
ledger, job, final account, shadow signal or customer data is touched. The notice
policy remains unapproved, so every replacement approval is refused with
MANDATE_NOTICE_REAUTHORISATION_REQUIRED; annual or changed schema terms fail
validation. This also prevents a worker from inventing a plan change.

`SubscriptionMandateRepository.mayInitiate` reloads the durable record and current
approval membership, uses database time, and returns specific refusal reasons.
It always returns mayInitiate=false, productionEnabled=false. A valid bounded
synthetic renewal can only be labelled eligibleForSimulation. Statement requests
require the later executor's exact locked approval/source/remaining-balance check
and are always refused here. This read reserves nothing: callers must recheck
and reserve atomically in MON-2B/M4-12; its result cannot authorise an external
executor. Current period totals are trusted server inputs, never HTTP inputs.
No public endpoint is introduced. Invalid SQL errors are mapped to fixed codes;
audit contains references/hashes, not terms text or personal information.

Forward fix only: preserve history and append a corrective migration. To disable,
revoke runtime EXECUTE on app.m413_command and app.m413_read. Never delete rows or
roll back approval facts. G4-S, D05/D09 v4 and all dependent commercial/security
approvals remain unresolved. No live path can be enabled by a flag.

Verification: focused deterministic adapter tests run locally; fresh PostgreSQL,
upgrade, real races, rollback and catalog tests are written for CI and cannot run
in this sandbox. No database guarantee is claimed from a fake.
