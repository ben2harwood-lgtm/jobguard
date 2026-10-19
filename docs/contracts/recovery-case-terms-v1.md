# CH-7-TERMS — proposed synthetic case terms

`recovery-case-terms-command.v1` accepts only an approve action, command/case UUIDs, the three version identifiers and the canonical hash. The append-only `app.recovery_case_terms_approval` records the job/case, actor membership, command, exact authorization and server-pinned transaction time. The response is `recovery-case-terms.v1`, with `environment: synthetic_demo`, `policyStatus: proposed` and `realExternalActions: 0`. No wording, rate or money figure is stored or returned.

The four closed identifiers are `synthetic_recovery_fee_terms.v1`, `reference_fee_policy_v3`, `reference_recovery_eligibility_policy_v3` and `proposed`. The SHA-256 canonical text contains the lower-case case UUID and those four identifiers, with newline separators; SQL rebuilds it from the stored columns and checks equality.

Only an active owner may approve through the merged `UserCommandDispatcher`. `PracticeAccess.job` supplies the principal; the request supplies no tenant, membership, role or mode. The dispatcher owns the receipt, Decision, approved resolution, exact authorization, audit append and receipt completion. Under the coordinator's 12 October amendment the definer routine also joins active owner membership in its exact-authorization query, mirroring 0109, because direct runtime SQL bypasses the TypeScript gate. Command receipt precedes the shared case advisory key; all business locks precede audit. Replays use the merged semantic-key mechanism and a fixed expiry. A different owner conflicts. Approval does not create a case event or change a case revision.

Approval applies only to synthetic workbench `withheld_customer_payment` cases whose jobs bind `reference_fee_policy_v3`. The invoker helper `app.recovery_case_terms_approved` is the shared reading of that guard. An unreadable case returns false. The added ordinary insert triggers are `recovery_message_terms_guard`, `recovery_message_approval_terms_guard` and `recovery_message_sink_terms_guard`; the merged guards remain in place. Reminders are message rows and use the same guard. The trigger checks at each row write; withdrawal is absent, so approval cannot disappear between checking and delivery through any supported command.

Chasing a withheld payment on a job that is not bound to the v3 fee policy is NOT guarded by this order.

A builder's agreement to the proposed fee terms for a case is not approval of the fee policy and authorises no charge.

One immutable approval exists per case and terms version. Another version requires a reviewed migration and fresh approval. Revocation, withdrawal, re-agreement, terms wording, every screen, DW3 and the live M4-5 call to the shared helper remain HELD/owed. D01/D03 remain proposed and all real charging gates remain unchanged. The builder's implementation receipt records execution evidence and the outstanding T8 timestamp conflict; these records do not establish technical acceptance.

## DW3 continuation (decision 123)

The eligibility reader now uses this immutable record directly under the shared case key, matching tenant/job/case and pinned versions, rather than treating the pursuit helper's policy exemption as approval. SQL compares original settlement against `approved_at` without JavaScript Date conversion. Later approval cannot rescue earlier money. Approval writer and timestamp pin are unchanged. Missing approval presentation, equality/transaction-order semantics and supplier-category approval remain STOP items; no new approval authority or commercial policy is introduced.
