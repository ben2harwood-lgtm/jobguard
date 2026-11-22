# 0772 Pilot identity invitations

The previous checked invitation routines required `synthetic_demo` sessions.
Keep their tenant binding, current-owner checks, role restrictions and SSO gate.
Derive the accepted session environment from the same pilot database naming
boundary as the resource configuration. This replaces two routine bodies and
adds no privileges or data backfill.

Apply before opening pilot enrollment. To close issuance, disable the pilot
identity entry point or forward-fix the two session predicates to the previous
practice-only values. Existing invitation history and accepted memberships stay
in place.
