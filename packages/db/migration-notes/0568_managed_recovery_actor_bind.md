# MON-9 actor binding (RED)

Migration 0568 adds a session-digest overload of `app.mon9_elect`. It resolves the
actor through the existing `mon9_session` bridge within the election call, before
calling the unchanged prior implementation. Runtime EXECUTE on the prior signature
is revoked. Session-to-membership mismatch, missing/invalid/revoked/expired session
and SSO restrictions fail closed. The repository retains its pre-replay session
check and passes the digest to the database mutation as well.

No stored rows, terms, fee derivation, principal allocation or pursuit guards change.
Existing elections remain readable. Deploy migration before the updated repository;
old writers fail closed once the old grant is revoked. Forward-fix with a later
migration; do not restore runtime access to the unauthenticated signature.

The proof loader needs exact sequential transitions because 0566 already claims
the old routine and its grant. A later proof must match the full previous `after`
record as its `before`; independent duplicate claims and within-file duplicates
still fail. The 0566 proof and migration are unchanged. The new fragment describes
only the grant removal, private routine posture and new overload; no tenancy change.

Verification and outstanding CI/independent-review gates are recorded in the
router commit-message handoff for this piece. All fixtures are fictional and
synthetic; G0–G5 remain closed.
