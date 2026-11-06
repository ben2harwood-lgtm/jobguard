# Connector export delivery acknowledgement v1

ENT-13A-EXPORT-ACK (ENT-13a), RED connector input boundary. Synthetic staging only.

`connector-input.v1` accepts one additional strict shape:

```json
{
  "version": "connector-input.v1",
  "eventId": "fixture:export_received",
  "kind": "export_delivery",
  "subject": "fixture:export_batch",
  "revision": 1,
  "outcome": "received"
}
```

The partner asserts that it received (or rejected) export batch X revision N.
`subject` is a fixture reference representing an existing synthetic export batch;
intake validates the reference format, without resolving it or validating the assertion
against business tables. Reconciliation authority remains held. Both fixture references
use `fixture:` followed by 1–112 lowercase ASCII letters, digits, underscores or hyphens
(120 characters overall). Revision is an integer from 1 through 2147483647.
Outcome is exactly `received` or `rejected`. Exactly these six fields are permitted.
No raw content, document, money, allocation, tenant, job, bill, statement, origin or
approval fields are accepted. The existing 16,384-byte intake limit applies.

Existing signed webhook/API-push authentication and server-bound tenant/namespace
rules apply. The same event identity and identical semantic payload return the first
immutable receipt, including after transport/key rotation. Changed payloads or a
competing event for the same kind, subject and revision conflict. Reordered revisions
remain separate staged facts. Revocation and expiry still apply to retries.

The receipt remains `connector-receipt.v1`, `state: staged`, `domainEffects: 0`.
An acknowledgement never marks an export delivered, billed or paid. It grants no
approval, pricing, origin, fee, statement or domain-write authority. The existing
append-only staged audit event contains references and a hash only.

Outbound authorised `fake_sftp` delivery is unchanged. The SFTP pull stage descriptor
is unchanged because it maps existing work-order, billing-status and materials pulls,
not partner acknowledgements. The conformance kit's separate staging capability
report marks export acknowledgements synthetic only; unspecified capabilities remain
unavailable. Machine capabilities and `connector.machine_stage` are unchanged.
No promotion path is added. Promotion, reconciliation authority, a real SFTP library,
H4 and G5 remain open. No real endpoint, real data or release is enabled.

## Named holds for landing

- Machine intake explicitly refuses `export_delivery` before checking its existing
  three-kind capability list. Both acknowledgement outcomes are covered by signed
  transport refusal tests; machine capability schema and SQL remain unchanged.

- `connector.intake(uuid,text,jsonb)` is recreated from the latest `0652` body,
  preserving the machine-binding refusal, owner, `search_path=pg_catalog` and ACLs.
  This base renumbered the brief's `0761` materials migration to `0576`; only its
  staging kind constraint and the latest intake routine are widened in `0862`.
- Migration number `0862` is reserved by the router; reconcile contiguous migration
  numbering with current main before landing. Earlier migrations are unchanged.
- Any scanner/fingerprint/pin update identified by CI belongs to the router; none
  is changed here. The proof adds no privilege, routine-call or table allowances.
- PostgreSQL fresh/upgrade, privilege and connector regression suites require CI;
  the restricted builder sandbox cannot start PostgreSQL or a browser.
- RED independent review and green CI against the exact landing head remain required.

Forward fix: replace intake validation and narrow the kind constraint after dealing
explicitly with existing staged records. Preserve append-only history; do not delete
receipts or rewrite earlier migrations.
