# MON-8 slice 3 — effective subscription authority (RED)

0404 adds one synthetic-only, read-only SECURITY DEFINER entry point and its
request-scoped adapter. It reuses MON-2A's persisted company session boundary,
subscription lock (184) and track lock (54). Missing agreements fail closed;
there is no invented default plan. Pending downgrades do not take effect until
MON-2A applies them. Job checks use the immutable job track; tenant checks use
the latest explicit assignment, or the existing MON-2A small-builder track.
Contractor agreement capabilities remain with the separate contractor authority.

Trial end and simulated payment failure are deliberately absent as feature or
retained-read predicates. MON-3 on this base supplies the trial-end reducer but
no persisted end command: tests combine that actual reducer with entitlement
checks, without claiming a persisted trial-end integration. No lifecycle copy,
entitlement cache, business-table write, deletion, provider, money posting, or
read/export filtering is introduced. Existing readers retain their own session,
tenant and scope checks. This adapter admits the owner/admin company roles
supported by MON-2A; contractor roles keep their existing agreement path.

Fresh installation uses the normal directory-discovered migration runner. The
upgrade suite installs populated predecessors, adds 0404, and compares existing
rows, types, relation grants and function definitions. Forward fix: replace only
this function and adapter; emergency disable by revoking runtime EXECUTE on
app.mon8_subscription_context(uuid,text,uuid). No data backfill is required.
No existing policy, role, table grant or stored format changes. No new alert.

CI must execute the PostgreSQL lifecycle and upgrade suites, grant-freeze checks,
and all required repository checks; sandbox local tests are unit evidence only.
An independent Claude RED review against the exact final head is still required.
