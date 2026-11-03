# 0743 connector materials staging — ENT-13a (RED)

Adds materials_issue to connector.input_event.kind and replaces connector.intake with
0554's latest main body, widening only kind validation and the document-label branch.
Materials uses the same strict six-field envelope as work_order. No table, schema,
role, grant, domain write, origin, approval, price, prompt or statement access is added.
All kinds still return staged with domainEffects 0. Existing identities, receipts,
audits, binding checks, locks and replay conflicts are preserved.

The proof's explicit lp0, upgrade and tenancy arrays are empty because the reviewed
catalogue attributes they describe do not change: signature, owner, security-definer,
search path, grants, static writes/calls, relations and policies stay identical. The
kind CHECK and validation body change is tested separately. Expectations are source
reviewed, never derived from a database. No baseline or legacy list is changed.

CI must execute connector-intake.integration.test.ts, including a populated immediate
predecessor upgrade applying 0743 alone, and the mandatory full PostgreSQL migration,
tenancy and effective-privilege suites. Local source/proof tests do not establish SQL
execution. No database or browser is available in the build sandbox.

Forward fix: preserve immutable source facts and receipts. If materials intake must
be disabled, a later migration should refuse new materials events in intake while
retaining the widened CHECK and existing rows. Do not drop facts or rewrite 0743.
No data backfill or application activation. Q2/H1, Q3, Q4, Q7 and G5 remain held;
ENT-13a stays open and requires independent exact-head RED review.
