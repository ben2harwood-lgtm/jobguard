VERDICT: PASS — bound to head cbd8d57176e7a4a0be7ae70976e20f6ae8006355
Reviewer: Claude Opus 5.5, same independent reviewer resumed for round 1 (fixes and regressions only; `git diff aa3541f cbd8d57`). Inspection + CI log.
Lane: RED. HEAD = PR head = cbd8d57 at start and at finish. Earlier verdict (REPAIR at aa3541f): mig-order-2-opus-aa3541f.md.

B1 (retyped column could pass) — FIXED.
- Every one of the 1904 pinned columns in all 186 tables is now "name type" (I parsed the list: 0 entries without a type; table and column names
  and order identical to aa3541f). Types carry length/precision (character varying(200), numeric(20,6), character(64)).
- Before the head step the whole list, types included, must equal the live 0115 catalogue. After it, each listed column's type is looked up again
  by name; any difference fails with "table.column: old -> new" ("(gone)" for a dropped or renamed column or a dropped table).
- So a narrowing retype that small fixture values survive (bigint -> integer, shorter varchar, numeric precision) now fails, even on an empty or
  all-NULL column. Stronger than the original test, which only noticed retypes that rewrote the table.
- Nothing else in the head step is weaker: same row query (names from the same list), same registry check, same row comparison.
B2 (receipt table missing from the guard) — FIXED.
- app.discrepancy_review_outcome is pinned with 13 ordered columns (id, tenant_id, job_id, finding_id, command_id, revision, outcome, reason,
  actor_ref, subject_ref, payload_hash, audit_event_id, created_at). Matches its CREATE TABLE (0038_things_to_check.sql:3) exactly; no later
  migration alters it. The failure message is receipt-specific and names the code path.
- The 11 pack/message lists are byte-identical to aa3541f. Each site has its own expected set (11, 11, and 1 for discrepancy-repository.ts).
- Re-done search: agrees with everything I examined; I found no other durable whole-row table. Extra checks this round: supplier-match history
  (explicit column list), supplier-document (stores only small fixed objects), readiness and inbox-relevance (named fields), the generic command
  dispatcher (acceptance, activation, purchase-order handlers return named fields even where the SQL function returns a whole row), SQL receipt
  writers (named keys) and the proof response (named fields).

THE DECIDING QUESTION, whole piece at this head — is anything that used to fail for a real reason now passing? NO.
Still failing: a changed value; an added, removed or altered pre-existing row; a dropped or renamed column or table; any retype; an added column on
any of the 12 whole-row tables; every 0112/0115 row, privilege and audit-chain check. Now passing by the coordinator's ruling: a later nullable
column on a table whose rows are not kept whole. Also now passing: a later migration that rewrites a row to the same values (xmin/ctid) — acceptable:
values, types, names and the row set are all still compared, nothing in the product reads xmin/ctid, and side effects show up as changed values or rows.
BLOCKING: none.
LATER: unchanged — guard pins names/order not types for the 12 tables; the site-count test watches three known places only; "columnsAt0115"
wording. Improved — a dropped column now reads "(gone)" instead of a raw SQL error. New, minor — the type pin does not cover nullability, defaults
or collation; the receipt's search table omits proof-application-repository.ts:43 by name (checked: named fields only).
For the coordinator: ENT-4b's 0122 adds a column to app.variation_revision, so this guard will be red there until that is decided.
Wrong money, access hole, lost or corrupted data, broken main journey? No — tests only.
Scope: since aa3541f only the two test files and the receipt changed. Whole PR vs bbca5ca: those plus the one lane line.
CI for this exact head (run 38169981466, conclusion success; `gh pr checks 137`: checks pass 26m39s, secrets pass, dependency-review pass): lane
boundary, typecheck, lint, test, build and web end-to-end all succeeded; log shows "✓ test/fingerprinted-row-shape.integration.test.ts (13 tests)"
and "✓ test/recovery-follow-up-upgrade.integration.test.ts (3 tests)"; db package 72 files / 951 tests passed; no failed test. PR MERGEABLE / CLEAN.
Not verified: I ran nothing; the builder's scratch proofs are taken from the receipt. main has since moved to dc16fd6 (FIXLATER-2; no change to
migrations, migrate.ts, pack sources or discrepancy-repository) and CI here ran against bbca5ca.
