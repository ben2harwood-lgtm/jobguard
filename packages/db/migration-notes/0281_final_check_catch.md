# 0254 — SV-5 catch confirmation

Ben, 28 Oct (SV-5 Q2): "Yes, this was extra work" creates only an unpriced `jobguard_catch` variation.
`app.confirm_final_check_catch(uuid,uuid,text,jsonb)` follows `record_final_check_disposition`'s authority
and lock order, records the `confirmed_extra` disposition and binding, writes the variation and its
`jobguard_catch` extra origin tied to the source signal (the variation id is the command id, as the
extra-origin check requires), and audits identifiers only. The binding's answer list gains exactly
`confirmed_extra`. No case, price, approval, claim or money effect: the recovery case waits for the
builder's priced approval (separate change). Rollback/forward-fix: revoke runtime EXECUTE; records stay.
