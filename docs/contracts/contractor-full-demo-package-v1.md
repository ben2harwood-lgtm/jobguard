# Contractor demonstration package v1 — ENT-11B-P-A

Practice sandbox — synthetic data; nothing is sent or charged

Internal composition only; no HTTP/controller/web route, public export barrel or new access grant.

`FullDemoPackageApplication(pool).read(principal, query)` accepts exactly `{ sessionId: UUID }` and `{ version: 'full-demo-package-query.v1', dashboard: <enterprise-dashboard-query.v1> }`. Nested filters, intervals and pagination retain the dependency schema. Extra tenant, actor, mode, permission, price and settlement fields refuse. Server `JOBGUARD_ENV` must equal `synthetic_demo`. Invalid mode/query/principal uses the existing typed EnterpriseDashboardError. Session and current covering grants are resolved afresh by EnterpriseDashboardApplication; errors propagate, with no cache/fallback. Owner/client roles gain no summary access.

The `full-demo-package.v1` result labels `observations` as `persisted_observation`, retaining the dependency report, contribution job/extra/source IDs, method and hashes, and advisory signals unchanged. This classification describes the repository source of facts, not a claim that the builder executed PostgreSQL tests. No tenant-wide Northside owner facts or other actors' attribution are added.

`held` is a typed list: export/billing/payment → ENT-6B; statement → ENT-7-P. Dependency billed/paid totals remain null. No synthetic settlement fact, provider, executor, fee calculation or money override exists. Baseline export preparation is distinct from the held finance billing export operation.

`prepareFullDemoBaseline` is a separate internal, non-authenticated fictional-preparation function. It accepts strict `full-demo-baseline-example.v1` with nested `baseline-prepare.v1`, checks server synthetic mode and delegates unchanged preparation with an empty process-local batch list on each call. The packaged fixture has six months (January–June 2026), explicit fictional pilot/rest team IDs, known and unknown extras, and zero-extra jobs. JSON and CSV inputs are bundled in the fixture. No live IDs are inferred or mapped. Results are `reference_example`, persistence `none`, historicalAuthority `not_granted`; they retain source/method/input/output hashes, exact dependency ratios and all source drill-downs. Both export formats have a sandbox-labelled envelope; their content preserves the existing export grammar. Consumers must retain the envelope label.

The function checks the declared synthetic contract, not the real-world provenance of arbitrary bytes. It has no route; callers must use fictional inputs. It is not permission to import real history. Durable historical import/read authority remains an ENT-9 prerequisite gap.

Sales claims are source-only evidence, held capabilities or proposed terms. The claim register binds exact merged commits, paths and source excerpts; A09 checks ancestry and source existence, not implementation execution. A10/A11 reject fabricated proof and unsupported promises. A does not close the parent paid-to-statement journey.
