# 0771 Pilot identity sessions

The persisted session table accepts the new `pilot_no_charge` value. Session lookup continues to require an exact environment match.

Deploy before using the pilot session path. A forward fix can close that path in application configuration while retaining revoked or expired pilot session records. Reinstating the earlier constraint requires clearing all pilot session rows first.
