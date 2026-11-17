# ENT-6 synthetic data tools — operational handoff

Scope: independent server data foundations only; C1 screens and all browser journeys are parked. No route, repository writer, database migration, delivery executor or worker schedule is installed. These modules have no production activation path. See `docs/contracts/contractor-billing-v1.md` and the builder receipt for holds and evidence.

Use only fictional source material. Every rendered artifact carries `Practice sandbox — synthetic data; nothing is sent or charged`. Fake destinations are `.invalid` hostnames. No credentials, real customer files, provider configuration, external services or processing routes are introduced. No environment variables or provider/data-flow register additions are needed for these pure/process-local tools. Real-data residency, retention, export/deletion, legal and commercial release gates remain unchanged.

`parseBillingImportEnvelope` can normalize an internal API object or UTF-8 CSV text into observations plus an original source hash. Parsing does not authenticate, write a fact or declare source completeness. Callers must retain raw input under their eventual approved scope and retention policy before any persisted import is enabled; this change creates no raw-input store.

`renderBillingExport` returns immutable text plus hashes from supplied synthetic line data. Encode the CSV text as UTF-8 for its byte hash. Use `verifyBillingExportArtifact` to recompute frozen JSON bindings. Nothing here performs finalisation, duplicate resolution, approval validation or persisted download. Never present renderer output as an authorized export batch.

`allocateBillingReceipt` exercises SH-1 arithmetic against complete represented invoice inputs; ordinary lines remain in denominators. `deriveUnambiguousBilling` is a one-invoice fixture evaluator only. Its `held` result is not a database quarantine. Its `BILLING_POLICY_HELD` result identifies the evaluator's limit; it does not decide the policy needed to admit or release ambiguous inputs. No automatic release mechanism exists.

Fake adapter scenarios are `success`, `retryable`, `interruption`, `unknown_accepted`, `unknown_not_accepted`, `unknown_unresolved`. Their effect map is process-local test infrastructure. Reconciliation makes no delivery call; repeated unknown calls retain the same result. Do not attach these adapters to the old `ActionExecutor` as a substitute for the held covering-grant/expiry claim boundary. A future checked executor must commit authorized work, call outside its transaction, record durable attempts separately and reconcile unknown outcomes before retry under still-valid authority.

No fee, journal, subscription obligation, customer invoice or production settlement evidence is produced. `matchedExtraNet` is a structurally matched allocation component only; ENT-7 still owns qualifying-principal integration, statements and fee posting.

Dispatch verification limits: dependencies are already installed; no package downloads, PostgreSQL/socket/browser starts, commits or pushes are authorized here. Each test run is limited to three own files and two Vitest workers; build and tests cannot overlap. Every heavy run needs at least 35% free memory and 45 GB free disk. Typecheck/lint/build require cache-off flags. Browser runs are CI only. In this run pnpm refused the pinned version signature check, so executable package checks remain NOT RUN; do not bypass that refusal. The dispatcher must supply a verified pinned runner before exact-head verification.

After the tooling prerequisite is repaired by its owner, the dispatcher can run the new core files as one batch and `billing.adapters.test.ts` as a separate API batch. These are independent unit/adapter tests, never PostgreSQL proof. Full exact-head checks, CI, an independent different-model recorded verdict and a separate acceptance actor remain required. No builder acceptance is recorded.

Migration allocation 0160 remains unused. Q2's coordinator-owned catalogue/privilege compatibility prerequisite and genuine approval/candidate interfaces must precede dependent construction. H1–H7 remain in force. No backfill or rollback is needed for this source-only change. Future database recovery uses a reviewed forward fix preserving artifacts and source history; disable new execution paths first if necessary. No new operational alerts are installed because no service is composed.

LATER: Billing and reconciliation screens remain the founder's parked work; no UI change is included.
