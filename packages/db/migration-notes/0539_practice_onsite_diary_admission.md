# 0541 — SV-7A practice on-site diary admission (RED)

An on-site practice diary note reached `ch4_admit_place`, whose intentional
practice-session refusal became `JOB_SOURCE_UNAVAILABLE` (503). Skip that call
only for practice jobs at the intake and diary capture call sites. Both checks
bind tenant and job and require a null practice-session digest for admission.
Company diary notes still compete for a place; `ch4_admit_place` stays unchanged.

Patch the installed routine definitions rather than restoring older bodies:
main's latest intake is 0522 (LP-5 command lifecycle), and latest capture is 0505.
Each exact replacement refuses an unexpected predecessor. All other statements,
replay/authorization/lifecycle checks, tenant/job locks, evidence, events, audit,
command completion, security modes, owners and ACLs remain intact. No data
backfill, new privilege, table or policy. The proof has empty deltas because LP-0
routine identities/static calls, upgrade metadata and tenancy posture do not
change; definition hashes remain held under the existing LP-0 gate.

Forward-fix only through a later migration; retain all recorded notes and events.
Existing SV-7A browser tests exercise practice on-site saves and lost-response
replay. Existing on-site admission and upgrade suites retain company capacity,
rollback, replay, lock, isolation and upgrade coverage. PostgreSQL/browser CI and
a fresh independent RED check at the router's new head remain required. Local
validation and its limits are recorded in the existing builder receipt.
