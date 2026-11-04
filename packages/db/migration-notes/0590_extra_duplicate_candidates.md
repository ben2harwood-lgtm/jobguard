# 0590 — duplicate candidate read (ENT-3 / ENT-5, partial)

RED: approval authority, tenant isolation and billing-export eligibility. Synthetic
practice database only; G0–G5 remain closed. No real data, provider or money.

Adds only `app.extra_duplicate_candidates(p_actor uuid, p_job uuid)`, a STABLE
SECURITY DEFINER read owned by jobguard_migration with search_path=pg_catalog.
PUBLIC and infrastructure cannot execute it; runtime receives EXECUTE only.
No tables, column shapes, policies, command registry rows or existing routines change.
The migration proof carries its exact runtime ACL, owner and protection records.

The read uses the existing xa_covers grant predicate for supervisor, surveyor and
commercial_manager. Other roles are refused before job lookup; eligible members
without a covering grant, missing/foreign jobs, and non-contractor jobs receive
NOT_FOUND. The caller supplies the actor only through the authenticated server
bridge. RLS still assumes a correctly authenticated tenant context.

The private xa_latest_kind helper prevents a direct runtime-only read. Replacing
cb_unresolved would violate this CREATE-only order, so this uses the brief's
explicit agreement-test fallback: the source test pins the identical active-link,
member and edge predicates, and PostgreSQL tests compare both installed routines
over the fixture matrix and actual jobs before/after linking and un-linking.
The export predicate is unchanged. The graph walk groups connected canonical
candidates; it never merges extras or changes the immutable link graph.

Forward fix: add a later migration for any defect. Rolling back the application
can leave this additive, unused read installed; do not edit old migrations or
remove immutable business facts. CI must prove fresh install, upgrade/catalogue
agreement, runtime privileges, grant scoping, RLS and the integration fixtures.
No PostgreSQL or browser was started in the builder sandbox.
