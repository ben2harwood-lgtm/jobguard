# ENT-9A historical baseline preparation v1

Authority: worktree `BUILD_PLAN.md` §§2.4, 5, 9.1.2, 9.1.12–13 and ENT-9 (§9.2, lines 1030–1052); issued 16 October 2026 baseline-only order. The older 13 October draft describes a different, wider server/dashboard split. Its baseline-method hold is superseded for this synthetic reference implementation. It supplies acceptance IDs E9-16–22; database/access conjuncts remain unimplemented, not passed. ENT-7 is an unmerged build-ahead dependency; no PR before the parent merges.

This is a pure import transition, a versioned descriptive reference calculation and an internal application preparation seam. It has no HTTP/Next route, repository, durable store, session authority, worker, provider, outbox or commercial write. The seam refuses every deployment mode other than `synthetic_demo` before inspecting inputs or batch state. Its mode is a server-composition argument, absent from the request schema. A request cannot supply tenant, actor, grant or permission fields. These checks do not establish authenticated authority; any future transport must supply it separately.

## Import

`baseline-history.v1` strictly accepts only the fields in the JSON fixture. No coercion, inferred money, contact details, live IDs, or arbitrary metadata. Dataset identifiers are lower-case ASCII slugs, at most 100 characters. Months are `YYYY-MM`, 2000–2199; coverage is a half-open interval of 6–12 whole calendar months. Each job names a declared team and a month inside that interval. Teams may have no jobs, and jobs may have no extras. The declaration establishes the observation window, not proof that every month is complete.

Jobs have unique source IDs; extra IDs are unique across the batch. Every extra supplies a work identity unique within its job. Repeated underlying work is refused for source reconciliation, never guessed or counted twice. A source job belongs to one team in this format. Current organisation mappings and authority are not asserted by historical source identifiers. No operative identifiers or resident/contact fields are accepted or produced.

`reportedNet` is either `{ pence: integer, currency: "GBP" }` or `null`. Known zero and unknown differ. Each value and each reported aggregate must fit the existing Money magnitude limit. Nonnegative source-reported snapshots are accepted; no credit, tax, approval, billing or settlement treatment is inferred. A corrected snapshot requires a new source batch identity and source revision. This does not edit any live job or commercial fact.

Input text is bounded to 8,000,000 characters; up to 1,000 teams, 10,000 jobs and 20,000 extras per batch. Identical JSON properties and array sets normalize to the same representation using code-point sorting. All parsed data and output objects are detached and recursively frozen.

CSV uses the exact header in the `.csv` fixture. Common metadata repeats identically on every row. Explicit `team`, `job`, and `extra` row types preserve empty teams and zero-extra jobs. Inapplicable cells must be empty. An unknown value uses empty pence and currency cells; zero uses `0,GBP`. Canonical unsigned decimal integer cells are decoded explicitly with checked bigint before number conversion. Spaces, exponents, decimals, signs, unsupported currency, unknown headers, partial rows, duplicate headers, mixed batches and unresolved references refuse the whole input. RFC-style quoting/escaped quotes, CRLF/LF and one trailing line ending are supported. Rows can arrive in any order.

`importBaselineBatch` takes an explicit caller-owned immutable batch collection. Identity is `(sourceNamespace, sourceBatchId)`. Exact replay, including CSV/JSON equivalence and reordered rows/properties, returns the original batch and collection. Changed content or source revision under that identity raises `BASELINE_CONFLICT`; invalid input leaves the caller state untouched. Different identities append a new immutable batch. This is preparation semantics only: no cross-request durability, concurrent uniqueness, tenant binding, audit effect or crash recovery is claimed.

## Reference method

The code owns immutable `BASELINE_METHOD_V1` (`baseline-method.reference.v1`): version, exact text and SHA-256 of text. Any change to its rule/text requires a new version; unsupported versions refuse. It remains a synthetic reference, without pilot approval or causal claims. D16/ENT-14 must approve the real-pilot method separately.

The method uses all declared jobs of each explicitly selected cohort, including zero-extra jobs. Periods use supplied Europe/London calendar-month labels without timestamp conversion. Pilot/rest team lists must be nonempty, unique, disjoint and present in the history. Unselected teams remain unselected; the rest is never automatically expanded. A team list is supplied data, not an authorization grant. No permission from an unrelated scope is inferred. Integration with current covering grants is held with persistence/transport.

Count unique source-work identities within jobs. Assign jobs and their attached extras to their supplied job month. Extras per 100 jobs is exactly `100 × extras / jobs`. Value per job uses the explicitly source-reported net snapshot, with no chosen commercial stage: exact known-net subtotal divided by all jobs. Any unknown value makes this metric `incomplete`, with an explicit unknown count and a labelled known fraction. Zero jobs yields `not_computable`, with null ratios. Results use existing `exactPence`/`serializeExactPence` rational primitives and `moneyFromBigInt`; no decimal rounding or binary-float money calculations. Whole counts are bounded safe integers. Aggregate overflow returns `BASELINE_OVERFLOW`.

Each cohort includes exact totals, ratios, the contributing historical jobs, each job's extras, and known/unknown contributions. All identifiers are batch-local and bound by report source namespace/batch/revision and source hash. Counts and known money equal their complete drill-down sums. No pagination, ranking, statistical significance, improvement percentage or commercial fee is derived.

## Reproducibility and export

The canonical source hash binds the complete normalized historical input. The input hash binds it plus normalized cohort selection and the immutable method version/text/hash. The output hash binds the report excluding the output-hash field. No wall clock, random ID, process locale, platform dependency or mutable current data enters the calculation. The same canonical input and method give byte-identical canonical JSON and CSV serialization.

Both exports carry `synthetic_demo`, method version/text/hash, input/source/output hashes, source provenance, and complete cohort drill-downs/totals. CSV has one cohort per record, structured JSON cells for the source and contributions, with the full method repeated on each record. This avoids losing exact fractions or zero-extra jobs. Serialization prepares local bytes only; it grants no download/export permission and contacts nobody. A future authorized export route must recheck access on each request.

Typed failures: strict `baseline-error.v1` for invalid input, batch conflict, overflow and unsupported method; strict `baseline-preparation-error.v1` for real-history mode refusal. No input values, names or data are copied into errors/logs. No environment/provider configuration changes.

## Persistence and release holds

Migration 0182 is provisional and unused. No DDL, table, routine or GRANT is introduced. Historical writer/live-job applicability is unresolved in the supplied draft Q3; no alternative durable writer is introduced around that hold. Consequently database atomicity/concurrency, persisted current authority, RLS, source-dimension mappings, audit and stored-run restart acceptance remain owed. Any future database writer must be checked internally, role-limited and SELECT-only for the runtime on its tables under Standard F, with independent catalog/upgrade proofs.

Real history, G1, DPA/D12/D16/ENT-14 approvals, founder approval of pilot interpretation, production activation and all external actions remain held. Dashboards, signals and UI are ENT-9B/parked scope. No invariant or earlier test is weakened. This is source implementation pending executable verification, independent verdict and separate acceptance.
