MON-2A tidy-up (RED): new synthetic subscription approvals hash the exact
server-rendered consent paragraph alongside the selected terms and company.
0336 changes only mon2_command's terms hash expression, preserving its owner,
ACL, security mode, search path and receipt replay ordering. No row backfill.
Existing immutable approvals and matching command replays remain unchanged;
new requests using the old hash fail closed.

Forward fix: amend the consent paragraph, its matching SQL expression and tests
together in a new migration. Do not rewrite approved history or remove 0336.
The populated-predecessor integration test checks old approval/replay preservation,
new consent hashes, altered replays, company binding and function privileges.
Database/browser verification runs in CI; local sandbox cannot start PostgreSQL.
