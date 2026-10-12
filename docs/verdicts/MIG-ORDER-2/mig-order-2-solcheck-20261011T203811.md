VERDICT: REPAIR
HEAD: aa3541f69a0e607ffaa0425d66e1d51531a552a9

1. **P2 — BLOCKING: retyped 0115 columns can pass.**  
   [recovery-follow-up-upgrade.integration.test.ts:68](/private/tmp/jg-check-mig-order-2-20261011T203811/packages/db/test/recovery-follow-up-upgrade.integration.test.ts:68) records names only; line 79 compares JSON text, with no type metadata checked after migration. An integer-to-bigint conversion preserving numeric values—or a retyped NULL—can produce identical JSON. [PostgreSQL’s serialization rules](https://www.postgresql.org/docs/16/functions-json.html) support this counterexample. This exceeds the admitted relaxation: the column’s type changed, not merely `xmin`/`ctid`.

   **Required fix:** capture and compare `atttypid` and `atttypmod` for every explicitly listed column before and after the head migration step. Add real PostgreSQL negative cases for a retype preserving serialized values, including NULL.

2. **P2 — BLOCKING: a whole-row receipt table is missing from the guard.**  
   [fingerprinted-row-shape.integration.test.ts:40](/private/tmp/jg-check-mig-order-2-20261011T203811/packages/db/test/fingerprinted-row-shape.integration.test.ts:40) omits `app.discrepancy_review_outcome`. Its whole row is serialized at [discrepancy-repository.ts:23](/private/tmp/jg-check-mig-order-2-20261011T203811/packages/db/src/discrepancy-repository.ts:23), retained unchanged as `finding.outcome`, and stored by `finish` at line 16 through [watchdog.ts:115](/private/tmp/jg-check-mig-order-2-20261011T203811/packages/db/src/watchdog.ts:115). This falls within the order’s explicit receipt coverage. My targeted case confirmed that an added nullable field changes the durable receipt while the table remains unguarded.

   **Required fix:** add its exact 13-column list, already present in the upgrade test at line 276, with receipt-specific explanatory text and source evidence. Separate each site’s expected table set from the global guard list, since the two pack/message sites still serialize 11 rows. Correct the receipt’s exclusion at line 65.

**Source-inspected:** the complete diff, reshaped order, receipt, AGENTS rev 3.0, C1–C8, applicable M4-6-S card, migration registry and whole-row serialization paths. An independent static reconstruction matched all **186 tables / 1,904 columns** at 0115 and all **11 existing guard lists / 163 columns** at head. Those lists are explicit and correct, but guard coverage is incomplete.

Every unrelated byte in the existing upgrade test matched base after reversing only the authorized comparison changes. Row identity, multiplicity and missing/added rows remain enforced through exact sorted row strings. NULL versus absent, timestamp, jsonb and bytea serialization differences remain distinguishable; direct drops/renames fail the explicit SELECT.

Pure `xmin`/`ctid` churn is an **acceptable relaxation**: logical rows remain equal, legitimate later backfills may rewrite them, and the unchanged 0112/0115 step still checks physical identity.

Scope is exactly four files: two tests, one lane line and the receipt. No product code, migration, timeout increase, skipped assertion or founder-reserved change. Tracked files remain clean.

**Executed locally:**

- Pinned `pnpm typecheck`: exit **0**, seven cached tasks. The host launcher first stalled before running checks and was interrupted, exit **130**.
- `LANE_BASE_REF=origin/main pnpm lint`: exit **1**, solely because local lane checking rejects detached HEAD.
- `pnpm lint:lanes`: same detached failure; replay using an explicit PR event bound to the actual base/head exited **0**.
- Forced DB dependency build: exit **0**, three uncached builds.
- DB unit files `tenant-context`, `demo-seed`, `outbox`, with `--maxWorkers=2`: exit **0**, **29 passed**.
- `/tmp/jg-mig-order-2-check/schema_check.py`: exit **0**.
- My [five targeted cases](/tmp/jg-mig-order-2-check/claims.test.mjs), using `node --test --test-concurrency=2`: exit **0**, **5 passed**, including both counterexamples. Database transport was stubbed; these are not PostgreSQL integration proofs.

**External evidence relied on:** [CI run 38168594660](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38168594660), returned for this exact SHA, reports successful typecheck, lint, tests, build, secrets and dependency review. Browser execution remained in progress. Full job logs were unavailable.

I read the builder’s PostgreSQL logs: upgrade **3 passed**, guard **12 passed**, changed-value mutation **1 failed / 2 passed**, added-column mutation **1 failed / 11 passed**, and ENT-4b upgrade **3 passed**. I did not independently execute PostgreSQL, browser suites or those mutation runs. Full CI completion and separate acceptance remain unverified.