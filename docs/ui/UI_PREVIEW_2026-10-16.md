# JobGuard reusable interface candidate — 16 October 2026

## Scope
An additive `/preview` route in the existing web app; no second backend. The design uses the recovered 15 October screen map. The original app, API, permissions, database, provider settings and commercial policies are unchanged.

The application has six fictional roles: operative, surveyor, supervisor, finance, client and small builder. Its core design journey is work order → capture an unpriced extra → surveyor price → supervisor review → client approval. Rejection, withdrawal and revision preserve visible history. Approval does not become billing, payment or a fee.

The catalogue contains all 143 named views across 14 groups, plus 15 interface-state specimens. **Catalogue coverage is not functional completion.** These views include reusable layout specimens for workflows whose backend, native implementation or release gates are unfinished. The main workspaces have purpose-built interactions; the catalogue deliberately labels generic specimens.

## Try it
Open `/preview` on the separate branch-preview deployment. Start as the site operative. Log fictional work with fictional evidence and acknowledgement. Switch to surveyor to price it, supervisor to submit and approve the current revision, then client to decide. Finance shows approved work separately from unavailable billing/settlement facts.

The small-builder workspace provides quote, supplies, money and final-account examples. No finding is rendered in its pre-lock Final Check view. A completed example is an explicit design selection, not a server command.

Only fictional extras persist in `sessionStorage`, when available. A denial or write failure says that the change will be lost on reload. This is not encrypted offline storage, a service worker, native persistence or cross-device synchronisation. Enter fictional data only.

## Integration boundary
`model.ts` is design-only. `components.tsx` and `money.ts` are reusable presentation modules. `connected.tsx`, `practice.ts` and `transport.ts` form a separately mounted service client. The role selector never changes an authenticated role.

The service adapter was aligned to inspected Northside source at `75211e22a1b554a1bd5a1cfa6008d79b2deb1fc6` (open PR #218) and the existing practice-role endpoints (PR #225 dependency). Those integrations are **not included or automatically merged** here. The current registered UI branch begins at `c90996deb1af88be23b8b07c091a2203bb052657`.

The service client validates synthetic environment markers and the exact capture/approval receipts, obtains roles and queues from the server, binds decisions to request/revision/amount, and uses existing server operations. It creates no fixture fallback. A failed or ambiguous write cannot display success. An interruption marker must be stored before a write; uncertain outcomes block further writes, including after reload, pending reconciliation. There is no “assume failed and retry” control.

Photo capture uses the existing generated practice-evidence operation; this candidate shows its receipt and exact content, not a verified photograph of real work. Existing focused client-approval and authenticated role-switch pages remain the destination for those operations. Real database execution and resident-facing evidence review still require integrated verification.

## Deployment and verification
This route is refused on Vercel production. Vercel preview permits it. A non-Vercel production build used for isolated testing needs `JOBGUARD_UI_PREVIEW=1`; this does not override the Vercel production refusal. No configuration or environment variable was changed by this candidate.

Use the repository-pinned toolchain. Run its normal typecheck, lint, tests and web build, then `apps/web/e2e/UI-PREVIEW.spec.ts` against the built route. Run the Northside database journey separately after its prerequisite approvals and migrations are authorised. Do not run migrations simply to view the UI.

The local evidence is narrower: strict compilation of the four pure modules, 46 Node tests, 22 offline browser interaction checks and a 143-view desktop/mobile specimen sweep. Browser execution used a local React 16 compatibility harness with inspected root-layout selectors; it was not a Next 15 / React 19 application build or a physical iPhone test. The new repository Vitest and Playwright specs are authored; their execution status must come from CI, not those local counts.

## Deliberately unfinished
Actual hosted deployment; integration with the accepted Northside backend; full pinned-stack checks; real-origin reload confirmation; physical iPhone Safari checks; an independent model verdict and separate technical acceptance. Billing export/reconciliation, watchdog ingestion, full small-builder Final Check, native iOS and offline sync remain separate unfinished capabilities.

No production release, real data, external send, payment, fee collection, provider purchase or policy relaxation is authorised by this UI candidate.
