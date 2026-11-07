# ENT-13a: human billing-status linkage v1

Synthetic demo only. This extends `connector-promotion.v1` with optional
`billingImport` (UUID), required when promoting a staged `billing_status` event.
It names the `importId` returned by the existing human ENT-6 `ImportBillingStatus`
command. The connector never carries money. A finance person supplies the full
invoice identity, amounts and effective time through ENT-6 before linking.

The unchanged five-argument SQL boundary accepts the identity in its exact result
object: `{ "version": "connector-billing-status-link.v1", "billingImport": "<uuid>" }`.
No new SQL overload, table, provider or money-writing authority is introduced.
The latest ENT-6 `cb_authority(session, job, true)` (0549) rechecks finance role,
grants, membership, feature decisions, tenant and live contractor job on every
link and replay. The import must have a succeeded `ImportBillingStatus` receipt
whose result names that import, and an immutable fact from that import must match
the staged event ID and an allowed status/fact-type pair (see Billed and reversed). Other organisations' imports are hidden.
A completed import may include quarantined facts: linkage does not resolve their
quarantine or assert that their money was applied.

No import, incomplete import, wrong source event or fact type fails closed.
Unsupported status/fact-type pairs keep `BILLING_COMPOSITION_REQUIRED`. The repository preserves its existing `INVALID_COMMAND` for a
missing billingImport; direct SQL retains `BILLING_COMPOSITION_REQUIRED`.

One import can be linked to one connector event only, serialized by the existing
exclusive organisation fence. An identical pair replays the first result after
current authorization checks. Changing either link identity refuses. The result
cannot contain extra caller-supplied fields. A billingImport on another event kind
is invalid.

Promotion appends only the existing promotion record and audit event, including
the import identity. It does not change an ENT-6 fact, receipt, allocation,
settlement, reversal or ledger row. The connector receipt remains `staged` with
`domainEffects: 0`. Machine principals cannot promote.

## Named holds for landing

- Migration 0689 re-creates `app.connector_promotion(uuid,text,text,uuid,jsonb)`
  from its latest body in 0639, replacing only its billing_status refusal branch.
  Owner, search_path, signature and grants remain identical. Roll forward by
  restoring that branch's refusal; preserve historical links and audit records.
- Real PostgreSQL execution, the negative-control database test, migration proofs,
  existing connector-promotion and ENT-6 integration suites, CI and an independent
  RED review remain required. No database/browser execution is possible here.
- Any scanner/pin or authority-map update is for landing, outside this piece's
  allowed files. The proof records the new call to the existing cb_authority.
- Export delivery promotion, SFTP, machine landing, H4 and G5 stay open.

## Billed and reversed

The fixed allowed pairs are `paid` → `paid`, `billed` → `invoiced`, and
`reversed` → `payment_reversed` or `credited`. Every other pair refuses, including
any `rejected` fact. The human ENT-6 import chooses the fact type and amounts;
the connector only links that completed import and still carries no money.
No connector field chooses between a payment reversal and an invoice credit.
All existing authority, source-event, receipt, exclusive-link and replay checks
remain in force. Export delivery promotion, SFTP, machine landing, H4 and G5
stay open.

### Named holds for landing

- Migration 0950 re-creates `app.connector_promotion(uuid,text,text,uuid,jsonb)`
  statement for statement from 0689, changing only the status allowlist (which
  otherwise rejects billed/reversed before matching) and the fixed fact-pair
  comparison. Owner, search_path, signature and grants are identical.
  Roll forward by restoring 0689's two predicates, preserving links and audit.
- Any required scanner/pin update (including migfix-7 upgrade pins) remains a
  landing task outside this piece. PostgreSQL suites, the transactional equality
  negative control, migration proof execution, green CI and independent RED
  review remain required before merge.
