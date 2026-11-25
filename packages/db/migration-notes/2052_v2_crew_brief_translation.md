# 2052 · V2-D4B practice crew brief translations (RED)

The V2 bootstrap applies this after 2001's practice-firm lock and 2007's
source briefs. As with 2002–2007, the shared runner does nothing outside
jobguard_v2_local with that policy installed. The empty shared migration proof
therefore records no shared-schema change; the real table's checks are appended
to tools/v2/seed.integration.test.mjs and must run inside the full CI1 suite.

One immutable translation per tenant, job, trade, source revision and language.
The composite foreign key uses the source table's zero-based expected_version;
the route and command use the displayed one-based brief version. No backfill.
Runtime has SELECT/INSERT only, forced RLS and the existing visible-job policy;
identity, worker and infrastructure roles receive no grants.

Only the fake provider is implemented and allowed by CHECK. The port receives
only trade, access window, task title/description/visit/proof and overall proof
text, in a fixed order. IDs, owner, quantities, units, duration and photos are
copied locally into the saved shape. No network, API key or real send exists.
The source hash is SHA-256 of JSON.stringify of that ordered text list. English
is unchanged and remains the record. UI code imports the browser-safe pure leaf,
not the database server barrel.

A new translation checks the linked builder editor and locks the quote draft
(the same first business lock as source brief generation), then refuses a stale
source revision. One transaction inserts the translation and appends
v2.crew_brief.translated with references/hashes only. The row itself is the
command receipt: exact replay returns it without writes; changed replay
conflicts. A different command for an already cached revision/language conflicts
and the UI re-reads that immutable result. This avoids another receipt table or
changing an existing command ID. A forced failure after the audit append tests
that both the row and event roll back. All persistence evidence awaits CI.

The language control lives inside the existing builder Briefs card; stale briefs
hide it. New source versions reset the control/cache. Saved translations are
read before attempting creation, so reload and language changes reuse the cache.
Use a production web build (or disable devIndicators in the test runner) for the
360/1280 HTTPS phone proofs, three fresh stacks. No browser evidence is claimed
from this sandbox. Rule 29 remains pending V2-SX on this base; append the GET to
builderGetRoutes and call assertBuilderRouteRefuses after merging SX, before
calling the packet ready. No new capability link is introduced.

Forward-fix with a separately reserved migration. Do not delete historical
briefs, translations or audit rows to roll back; use a separate checkout/database
to rehearse an older branch. A real adapter needs Ben's provider selection,
payment and the separate privacy check; this packet cannot enable it.
