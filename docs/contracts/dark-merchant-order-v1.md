# M2-1 dark merchant orders v1

This synthetic-only repository seam has no HTTP route, registered worker, live
provider or activation switch. Preview reports unknown stock and lead time;
prevention findings never qualify for a recovery fee.

`purchase_order.send.dark` uses the LP-5 command lifecycle with exact approved
content, recipient, amount, revision, expiry and fake merchant outbox identity.
The executor rechecks current order authority before claiming pending work.
Manual placement is a separate owner assertion, never provider confirmation.
Its actor comes only from the authenticated session digest, resolved in the
database against current company owner membership; the DTO cannot select an actor.

`purchase_order.attest_manual` remains outside the LP-5 lifecycle. Its production
activation is held until it has a reviewed lifecycle adapter. The dark seam uses
the existing stored-command identity/replay boundary, current owner membership,
job and revision checks, append-only attestation and transactional audit; this is
not lifecycle dispatch. No production authorization or release is claimed.
