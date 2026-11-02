# M4-23 policy and payment rail inventory

`config/release-inventory.v1.json` records all D01–D16 decision documents, their exact current versions, statuses and gates, and each planned payment rail's production enablement. All entries are disabled. This is the inventory slice of M4-23, not completion of M4-23's outcome acceptance or production release.

`packages/config/src/release-inventory.ts` declares the rail scopes and validates the inventory and `release-record.v1` format with strict, versioned Zod schemas. Stripe subscriptions, Stripe and GoCardless fee collection for each track, and MON-6 customer pay-now links are independently declared. Customer payments go to the builder's own provider account. Bank ingestion is settlement evidence, not an outgoing payment rail. Subscription and fee collection remain separate scopes even when they share a provider.

The existing root `node --test tools/*.test.mjs` CI step validates the checked-in inventory against every decision document. The config package's existing Vitest suite attacks undeclared/missing/duplicate rails, approval versions, revoked gates, track mismatches and incomplete release scopes. A new rail requires an explicit declaration, inventory entry and applicable policy/gate requirements. The inventory does not discover arbitrary new network calls; new adapters still require the existing commercial command boundary and review.

A release record includes:

- Exact source commit, record ID, production environment, track and bounded-smoke/general phase.
- Explicit tenant IDs and jurisdictions; no wildcard tenant population.
- Exactly the rail IDs enabled by that record, with matching inventory references.
- Exact policy IDs/versions and gate approvals, each with status, named approver, timestamp and evidence reference.
- Consent and sandbox acceptance references, and a rollback/disable plan. General rollout additionally requires the reconciled live smoke review.
- An explicit false value for retroactive pilot billing.

Schema-valid references are claims to be independently reviewed, not verification that approval evidence exists or is genuine. Proposed/superseded policies, revoked approvals, missing required policies and missing/wrong track gates fail validation. The checked-in inventory additionally fails CI for any enablement: this piece enables nothing. The validator is not imported by the application and grants no runtime authority. Existing server gates remain authoritative.

This format covers core payment release scopes only. Expanded construction billing still requires M4-18–M4-22's separate approved jurisdiction/treatment support matrix and review; naming a jurisdiction here cannot enable a tax treatment. Live smoke procedures, integrated outcome acceptance, independent approvals and releases remain outside this slice. No migration, provider call or live data is introduced.
