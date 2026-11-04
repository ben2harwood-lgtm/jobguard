# M4-7 fictional bank practice screen v1

RED; synthetic_demo only. M4-7 stays open: real route, vault and approvals remain
held under G1, D04 and D10. No provider endpoint, SDK, credential or network call.

The company session and verified membership bind every operation. The browser
supplies only ais-practice-command.v1 and start, approve-fake-consent, pull, revoke
or unlink (with a connectionId except start). POST requires the trusted Origin
and session CSRF token. GET/POST are no-store. Practice-session cookies alone do
not authorize access. Tenant selection is checked against session membership;
SQL rechecks the normal owner/admin session and connection owner.

Consent lasts one hour. Nonces, fake codes and tokens remain process-local.
Consent approval is bound to the initiating session and connection, consumed once;
restart requires starting fresh consent. A linked connection whose vault entry
is lost becomes token_revoked on read or pull, never silently reconnects.
Reconnect appends a new connection, retaining historical data. The fixed October
2026 page contains pending, settled and reversed fictional movements. Pull replay
is durable and deduplicated; the read projection returns latest stable movements,
including the same owned account's history across reconnects. No bank observation
lands a case, allocates cash, starts a fee or writes a receipt.

Migration 0763 is required because dark_ais inspect exposes no movements. It adds
one read-only routine and runtime EXECUTE only. CI must prove PostgreSQL session,
ownership, expiry, replay, migration/catalogue and financial non-effect boundaries,
and the headless phone/desktop journey. Local mocks prove orchestration only.
