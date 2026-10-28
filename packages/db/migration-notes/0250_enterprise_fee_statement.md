# 0250 enterprise fee statements and finance approval (ENT-7b)

Adds `enterprise_fee_statement` (numbered revisions per month, each linked to its predecessor), its per-agreement
`enterprise_fee_statement_section` rows, `enterprise_fee_statement_dispute` and `enterprise_fee_statement_approval`.
All are FORCE RLS with the standard tenant policy, append-only by trigger, and give the runtime no table privilege.

Finance uses `app.ef_prepare_statement`, `ef_dispute_statement`, `ef_approve_statement` and `ef_read_statement`. They
take 0243's billing lock order plus a per-month statement lock. Preparing binds the latest derivation of each agreement
version and refuses if the stored facts moved since. A dispute closes a revision; preparing again makes the next one.
Approving checks that the revision is the latest, undisputed and unapproved, that the hash and total match, that the
expiry falls within a day, and that the facts are unchanged. It then writes a Decision, its approved resolution and one
exact `enterprise_fee_statement` action authorisation. An approved month is closed. Prior net posted is zero until
ENT-7c adds posting.

Forward fix only: new tables and functions, nothing earlier altered, synthetic database only.
