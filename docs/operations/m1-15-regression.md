# M1-15 automated regression receipt

This is a synthetic code gate only. It does **not** represent the two founder-observed
builder trials or Gate G1 approval; both remain operational holds.

`pnpm test:regression` runs the complete browser journey at both configured viewports
and the real-PostgreSQL integration suites. The adversarial cases map as follows:

| Guard | PostgreSQL regression |
| --- | --- |
| double activation | `activation.integration.test.ts` concurrent activation |
| stale send approval | `quote.integration.test.ts` exact immutable send approval |
| cross-tenant relationships | `tenancy.integration.test.ts` and quote relationship constraints |
| unfinished proof | `evidence.integration.test.ts` finalization and stage gates |
| partial payment | `final-account.integration.test.ts` immutable receipt allocation |
| missing fee proof | `recovery.integration.test.ts` evidence qualification |
| cap/credit races | `recovery.integration.test.ts` competing allocations |
| crash after external request | `outbox.integration.test.ts` unknown-outcome reconciliation |

The demo seed is a deterministic command stream for the reserved synthetic tenant.
The command-boundary adapter owns persistence; replaying semantic keys is a no-op.
`JOBGUARD_ENV=production pnpm seed:demo` and pilot mode refuse before the adapter is
called. No provider, AI, transcription, message, payment, charge, or spend is used.
