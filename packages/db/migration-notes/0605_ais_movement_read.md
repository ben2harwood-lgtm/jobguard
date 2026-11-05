M4-7 RED synthetic practice screen: the existing dark_ais inspect routine returns
status only, so ais_movement_read adds a read-only, session-checked projection.
No table or existing routine changes. Only runtime EXECUTE is added; no new role.
The routine uses the existing synthetic database, session actor and tenant lock
checks, scopes connections and observations to their owner, and returns only the
latest movement revision. No tokens, state hashes, codes or account refs return.
Fresh install and upgrade/catalogue checks must run in CI. Forward fix by replacing
this routine or ceasing calls; retain existing observations and consent history.
