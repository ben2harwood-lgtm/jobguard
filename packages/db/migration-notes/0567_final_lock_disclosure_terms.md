# 0567 — SV-5 disclosure terms at lock insertion

The command already checks acceptance. A BEFORE INSERT trigger now also requires an acceptance for the lock tenant and exact onboarding terms version, recorded no later than locked_at. The trigger reads no shadow data and grants no callable runtime privilege. Existing immutable locks are unchanged; no backfill or data migration is performed.

The database regression attempts privileged direct insertion without that tenant's acceptance and with acceptance later than the claimed lock time. It also checks the normal accepted command still succeeds. The existing foreign-key negative fixture now accepts terms first so it reaches the intended key constraint.

Run the full PostgreSQL and migration suites in CI, plus SV-5 browser journeys in both projects. These cannot run in the issued sandbox. Forward-fix with a later replacement function; do not rewrite historical locks or remove accepted terms. RED independent review remains required.
