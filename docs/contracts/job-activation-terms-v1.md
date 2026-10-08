# CH-1 job activation terms v1 — contract preparation, implementation held

This contract and its pure-core tests are prepared for CH-1. The v3 database routine, persistence, application and UI are not implemented in this diff. CH-1 remains held on the legacy fixture conflict documented in the builder receipt.

`switch-live.v3` is a strict server-internal command binding activation and terms IDs to a job, the accepted document ID/version/hash and the expected job revision. It accepts no tenant, net value, small-job flag, policy, commercial track or trial/plan context supplied by a client. Authorization and tenant membership remain responsibilities of the existing command boundary.

`job-activation-terms.v1` records tenant/job, activation, baseline quote version, accepted net pence, highest sent net pence, small-job flag, policy, commercial track, trial/plan context and activation time. All amounts are nonnegative integer GBP pence within the application's 1,000,000,000,000-pence bound. A missing sent quote is represented by a highest sent net of zero. A sent quote means an immutable document revision with an outbound send record; status alone is insufficient.

Small-job classification is `max(acceptedNetPence, highestSentNetPence) < 200000`. The terms schema checks that the stored boolean agrees with those values. SV-1's exported success-fee schema supplies the v3 fee-policy identity; this contract does not define a second policy. Only the small-builder track is supported here.

Trial/plan context is the closed, non-null literal `none_recorded_pre_mon2a`, per the coordinator ruling of 8 October 2026, INDEX.md “Coordinator rulings, round 3”, supplied in the issued CH-1 header. MON-2A/MON-3 own its future replacement. This value is not a trial or plan entitlement.

The planned migration number is 0104, supplied by the integrator. It has not been created or registered while this leaf is held. No existing v1 rows, routines, snapshots or behavioural tests have changed.
