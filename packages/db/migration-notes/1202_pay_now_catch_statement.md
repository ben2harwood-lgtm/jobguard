# LATER-SAFETY-8: pay-now refusals and catch statement

Forward replacement of the latest main routine in 0598 only. No table shape,
owner, privilege, RLS policy, trigger, function signature or stored row changes.
1202 is the reserved stem; the router renumbers it at landing.

Invalid, expired or revoked company sessions now raise PAY_NOW_UNAUTHENTICATED
(28000), before the existing mon1_company_actor owner/admin gate. Both checks
repeat after command/invoice lock waits and before replay. METER_FORBIDDEN
remains the membership/role refusal and maps to FORBIDDEN (403); session
refusals map to UNAUTHENTICATED (401). Unexpected faults and snapshot integrity
failures remain UNAVAILABLE (503). The same classifier serves repository calls
and GET's direct prepare. History's existing verified-context boundary stays
unchanged. No private helper grant was added.

New projections derive only includesCatch, using the tenant/job-qualified
final_account_line -> variation_revision -> extra_origin join from 0413.
The invoice's own final-account revision binds the lookup; line_kind=variation,
source_id=revision.id and kind=jobguard_catch are required. No shadow tables are
read by this lookup. Prices, options and fee rules are unchanged.

Replay returns the prior record before evaluating the new projection. The
source fingerprint still hashes only the same invoice, credit, payment and
reversal identities; neither includesCatch nor projection bytes enter it.
There is no UPDATE/backfill: previous false statements and their record_hash,
snapshot_hash and replay bytes are preserved. Their fingerprint remains spent.

Proof sections lp0, upgrade and tenancy are explicitly empty because the
catalogue metadata tracked by those suites is unchanged: same definer posture,
search_path, ACLs, static app calls and writes; no new object or policy.
The lifecycle upgrade's predecessor inventory predates 0598, so this replaces
no routine in that inventory and needs no exception/pin edit.

Verification: failing unit tests were written and observed before the refusal
fix; PostgreSQL regressions were authored before the forward migration but
cannot execute in this sandbox. Added source fixtures retain all origin/FK/
approval/lock guards; they do not claim an end-to-end detector or confirmation
journey. Tests cover true/false at equal invoice totals and fees, old-routine
records, byte/hash preservation across replacement, original-result replay,
consumed fingerprints, role/session refusals through the routine, and refusals
on replay after revocation/expiry. Existing isolation, concurrency, balance
changes, immutability and browser journey remain.

CI must execute both pay-now integration files, PostgreSQL fresh/upgrade,
catalogue/privilege/RLS and migration suites, and the unchanged
MON-6-stored-pay-now-preview.spec.ts at phone and desktop widths (headless,
at most two workers). Independent RED review binds the committed head.
MON-6 and every release/decision gate remain open/closed as before; this
finishes no plan piece.

Forward-fix strategy: replace only this exact routine in a later migration
while preserving prior records and hashes. Emergency rollback may restore
0598's routine body (and preserve ACLs) at the cost of reverting the corrected
refusal/statement behavior; never rewrite or delete stored attempts.
