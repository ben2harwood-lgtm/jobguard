# M5-5 merchant conformance kit (dark, partial plan work)

`packages/core/src/merchant-conformance-kit.ts` takes a factory returning a fresh
`MerchantAdapterUnderTest` and returns a pass/fail result for each named check.
It is a synthetic test surface beside the M5-4 connector, separate from ENT-13b.
Import it directly in adapter tests; no production registry or application caller
is wired to it. Run the local suite from `packages/core` with:

```sh
./node_modules/.bin/vitest run --maxWorkers=1 src/merchant-conformance-kit.test.ts src/merchant-connectors.test.ts
```

The factory exposes capability metadata, a receive operation and an observable
snapshot. A future adapter test bridge must observe its actual stored documents,
delivery/settlement projections and audit history; returning canned expected
answers would not establish conformance. The context represents an already
verified tenant/job, not a new authentication mechanism. The kit does not prove
database RLS, authorization or durable deduplication across process restarts.

The eight checks are:

| Check | Required observation |
| --- | --- |
| `capability` | Valid M5-4 fixture metadata; read works; unavailable quote/order/acknowledgment operations are recorded and refused. |
| `tenant` | The same source in another tenant or job has a separate identity and cannot read the first document; payload tenant injection is held. |
| `identity` | A substituted supplier account is held; accepted sources retain the account and source number. |
| `deduplication` | Replay returns the same identity without a second document; changed bytes under that identity are held and the original survives. |
| `document_meanings` | Quote, acknowledgment, invoice, credit and delivery evidence retain distinct identities, types and sources, even with a shared document number. No ingestion creates delivery confirmation or settled cash. |
| `acknowledgment_not_delivery_or_settlement` | An isolated acknowledgment remains an acknowledgment, with no delivery projection and zero settled pence. |
| `outage` | An outage holds without document, delivery or cash changes; manual review and a contextual audit event remain available; intake works after recovery and keeps that history. |
| `schema_change` | Unknown version, extra fields and malformed identity are held with the same safe fallback and retained history; valid input can subsequently be received. |

The fixture-only source schema extends the M5-4 source shape for quote and
acknowledgment observations inside this kit. It does not widen M5-4 ingestion or
enable its unavailable capabilities. The fictional delivery document is evidence
for review, not automatic confirmation of goods received. Credits stay source
documents and cannot reverse cash. No monetary posting or procurement occurs.

`merchant-conformance-fakes.ts` supplies one in-memory good fake and one deliberately
bad fake. Tests require the good fake to pass and the bad fake to fail every named
check. Additional single-fault mutations check acknowledgment-to-delivery and
acknowledgment-to-cash confusion separately, and require both audit history and
manual fallback rather than an exception alone. These are deterministic checks,
not an independent review or actual partner conformance.

M5-5 remains open for people: choosing a merchant or network from an actual pilot
need, verifying its supported route and capabilities, building the actual adapter,
and running actual sandbox or approved partner conformance. Exact authorized
outbound procurement/document exchange through the common outbox remains open.
M5-6 real-data work remains open. No human choice, legal review, provider result,
approval or release is supplied or implied by fixture references. Only made-up
data and in-process fakes are used; nothing is live and gates G0–G5 remain closed.
