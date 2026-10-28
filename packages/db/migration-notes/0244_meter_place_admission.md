# 0244 — private place-admission held boundary

Applies after 0209. Adds only `app.mon1_admit_place(uuid,uuid,text,uuid)` owned by
jobguard_migration, SECURITY INVOKER, fixed pg_catalog search path, no PUBLIC,
runtime, meter, infrastructure or shadow execution. No rows, tables, policies,
grants on existing objects, backfill or business effects. Existing tenant tables
retain RLS and FORCE RLS; runtime remains non-owner.

Role provisioning is inherited from repaired 0209: guarded jobguard_meter creation
and posture validation; demo-bootstrap pre-creates and checks that role before
running migrations as jobguard_migration (which cannot create roles). 0244 only
revokes meter execution; it creates no role and keeps migration ownership. The
parent v_revision rename and held allowance fields require no admission consumer
adaptation: this boundary consumes neither source computations nor allowances.

Positive admission is STOP pending accepted committed-membership timing, checked
pre-mutation source/authorization resolver and coordinator lock-order confirmation.
The function checks an already-held tenant lock 184 and always refuses. A later
separately reviewed forward migration must implement the actual source contract;
there is no feature toggle. Do not wire this refusal into automatic event paths.

CI proof: meter-place-admission-upgrade.integration.test.ts installs predecessors,
seeds named old rows, applies this step alone, compares rows/types/ACL/owner/RLS/
policies, runs successors/runner twice and tests a microsecond damage control.
NOT RUN locally. No mandatory shared catalogue updates in this lane. Coordinator
must add the function owner/invoker/search-path/no-execution row to the routine
inventory; no new business-table catalogue rows. Forward fix only; retain refusal
and history on failure. Previous binaries do not call this private function.
