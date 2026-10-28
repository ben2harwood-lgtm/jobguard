# 0253 enterprise fee posting (ENT-7c)

Adds the `platform_enterprise_fee` book (accrual and compensation journals) and its balanced `platform_enterprise_fee_line`
pairs. Both are FORCE RLS with the standard tenant policy, append-only by trigger, and give the runtime no table privilege.

Statement sections now subtract the net already posted for each agreement version (J_v), so a later month carries only
the change. `app.ef_post_statement` posts an approved revision once. Under the statement lock it rechecks that the
authorisation is the one the approval created; that it is approved, unrevoked and unexpired; that it is bound to the
revision's hash, revision number, absolute total, GBP and policy; that the revision is neither superseded nor disputed;
and that the facts and the posted net are unchanged. A positive delta accrues (Dr receivable, Cr revenue). A negative
delta posts a compensation linked to the latest accrual (the reverse lines). Zero posts nothing. Mixed-sign statements
need finance and are always recorded (Ben, 17 Oct, Q-04).

Only the synthetic database posts. The pilot and production databases refuse with `FEE_GATE_CLOSED`, and no repository
decision is approved. Forward fix only; no backfill.
