# LP-6d — remaining routine binding (RED)

Built ahead from the supplied LP-6b predecessor. LP-6c catch-up is required
before opening the PR; 0526 is reserved and must be renumbered contiguously at
merge. Synthetic data only. No scanner definition or source pin was edited.

## Changes and exact split

`test/lp6d-routines.json` lists all 74 copied routine signatures, their latest
predecessor source, and effective-actor/tenant arguments. Evidence/proof and
source intake, variations/extra approval, job parties, scope progress,
inbox/match projection, work orders, site visits, contractor administration,
builder final-check reads/dispositions, and practice switch/revocation are LP-6d.
Six worker/support-only signatures explicitly remain unavailable to the runtime
(EXECUTE revoked in this migration): `record_shadow_disclosure`,
`read_shadow_emergency`, `read_final_check_manifest`, `prepare_evidence_pack_v3`,
`complete_evidence_pack_v3_check`, `finish_evidence_pack_v3`. Their existing
separate shadow/support grants and bodies remain unchanged, preserving mandatory
must-surface background disclosure. They are not deferred callable user entry
points; their distinct worker authority remains LP-10, with ACL assertions here.
Every copied body stays unchanged inside a block preceded by binding checks.
CH4's body includes 0380's later pg_get_functiondef amendment (capacity lock,
resume admission and resumed event); tests preserve that amendment as well as
its last CREATE definition. The other pg_get_functiondef amendments are in
LP-6c's money routines or an unchanged trigger, not copied here;
existing resource, role, revision, receipt and authorization rules stay in place.
The initial review identified no separate worthwhile LATER / SIMPLICITY item.

`test/lp6d-runtime-classification.json` explicitly assigns each snapshot
runtime-executable SECURITY DEFINER signature and the binding additions. All
entries assigned LP-6c are **exclusively LP-6c**: money, activation, acceptance,
invoices, financial/entitlement readers, financial demo entry points, and the
shared `begin_command`/`complete_command` boundary. `mon1_company_actor` is also
LP-6c. Audit append attribution is exclusively LP-6e. Credential bootstrap is
LP-6a/b; existing practice confinement is retained. No conversion in LP-6d is
also assigned LP-6c. These assignments are a split, not proof that the sibling
work has been implemented. Live pg_proc is checked independently of the old
inventory snapshot and an injected unknown definer must fail classification.
`app.mon9_session` is absent on this base; if it lands, this test fails until it
is explicitly classified and converted. No name/prefix fallback admits it.

The pure invoker `ent3a_extra_authority` evaluates a **subject member**, including
an extra's stored raiser; that parameter is not the effective caller. It checks
the bound tenant, retaining the original predicate, while mutations and their
actual actor arguments check the protected actor. Equating that subject to the
caller would break later supervisor actions on an operative's extra.

`identity.invite_member` now binds its credential before locking and uses the
bound membership alongside its existing owner rule. `app.contractor_session`
likewise binds its raw practice credential before returning identity. The
original switched-session SQL is moved verbatim into one private projection,
used by both the bridge and LP-6a's authority lookup. This extra private helper
is necessary to avoid recursive binding and to select the decided effective
operative rather than the owning practice member. It has no runtime EXECUTE.
The binding lookup still checks current membership, expiry and revocation.

The inventory's remaining direct authorization-revocation column is withdrawn.
Its sole caller, recovery-message revocation, calls a new bound routine which
requires its current transaction's same-actor processing command, current owner
permission, exact job/case/message and revision, and a queued/retryable outbox
item. The existing cancellation, message event, audit and LP-5 completion stay
in the caller's transaction. No new permission policy is introduced.

## Tests and delivery limits

Local commands/results are recorded in the router commit message. New source
checks verify exact predecessor-body preservation and inventory completeness.
The integration file is collected by the actual Vitest runner, but PostgreSQL
cannot start in this sandbox, so those tests are **not executed here**. It covers
unbound/forged actors/cross-tenant context across every callable converted
entry point; ordinary worker progress; operative visit/site-extra permission,
refused owner substitution, committed visit/replay/audit; switched practice
identity; invitation credential substitution; direct revocation refusal; and
post-snapshot/unassigned pg_proc detection.

Current readiness is **do not commit**: full local lint stops at the inherited
LP-5c lane file's prohibited self-path (confirmed at HEAD), and this supplied
base's withTenant still only assigns the tenant GUC. Repair/catch up the owning
predecessors before enabling this migration. LP-6d's own lane uses implicit
self-file permission and does not change another lane.

CI must run the whole PostgreSQL/migration suite, plus normal checks and the
changed recovery-message workflow. The predecessor fixture paths need the
LP-6b/6c credential fixture cutover when those branches are caught up; this
sibling cannot claim that combined compatibility proof. No existing assertion
has been weakened or deleted. No demo journey, CI success, independent RED
review, merge or release is claimed.

HELD-FOR-BEN: any scanner-definition or source-pin refresh demanded by the
current guards needs Ben's piece-specific typed yes and its authorized owner;
none was changed here. Catch-up must reconcile shared LP-0 JSON and catalogue
expectations by union, retaining all predecessor additions. Old recorded
fingerprints have not been rewritten as implementation evidence.

Forward fix: repair the binding guard/checked routine in a new migration;
never restore direct revocation, trust a caller GUC, or grant access to the
protected binding table. This migration performs no business-row backfill.
