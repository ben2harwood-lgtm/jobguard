# 0247 — final-check reveal lists the locked lines

SV-5 reveal screen. `app.read_final_check_reveal` is restated from 0238 with one addition: a
completed check also returns `lockedLines` (id, kind, scope item, description) from the
locked final-account revision, so "Already included" and "In the original quote" answers can
name an exact locked line. These are the builder's own billed lines; no shadow fact is added
and the pre-lock branch is unchanged. Owner, SECURITY DEFINER, search path and grants are kept.

Rollback/forward-fix: restate the 0238 body in a later migration; no data changes.
