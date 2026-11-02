# 0255 — SV-5 catch case on the builder's priced approval

Ben, 28 Oct (SV-5 Q2): the `missed_variation_final_account` case is created only when the builder confirms
a positive price for a `jobguard_catch` variation (AFTER INSERT on `variation_revision`): state `identified`,
an `opened` event, source refs to the variation, revision and signal, and no claim revision. The customer's
approval of that variation (AFTER INSERT on `variation_approval`) adds claim revision 1 for the approved
amount. `final_check_refuse_held_case` is restated to admit only the catch-case trigger's own marked insert;
every other insert of that case type is still refused. Rollback/forward-fix: drop both triggers; records stay.
