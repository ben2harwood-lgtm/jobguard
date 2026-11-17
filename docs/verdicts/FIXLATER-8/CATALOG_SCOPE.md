# FIXLATER-8 catalogue scope and evidence

Issued maintenance scope: external FIX-LATER.md line 108 only. Lines 101 and 109 belong to FIXLATER-7 and are excluded. No FIXLATER-8 product card is invented. No business-row upgrade proof, migration, product change or web workflow is introduced (C1).

At initial inspection, HEAD and origin/main both equalled the dispatch base, `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. Source line 108 was still open when inspected on 13 October 2026. The external FIXLATER-7 issued order identifies only 101 and 109. No external tracker was edited.

At final inspection, origin/main had advanced to `43a52cd957b3b41fe3fa44eb2153213b62717b39` through FIXLATER-7 / PR #177. HEAD remains the dispatched base. The intervening diff changes only the lane registry, FIXLATER-7 receipt, MIG-ORDER-3 receipt and the new `packages/db/test/small-builder-origin-rule9.integration.test.ts`. Every cited plan/catalogue anchor and imported helper above remains unchanged. The dispatcher must preserve both additive lane entries and run that companion regression separately after integration. No Git write or existing-file adjustment was made here.

The repository anchors were read at that exact main:

| Anchor | Source-inspected fact |
| --- | --- |
| BUILD_PLAN.md:90–92 | Lane registration and serialized shared-file ownership. |
| BUILD_PLAN.md:119,123 | Real PostgreSQL evidence and independent verdict requirements. |
| BUILD_PLAN.md:1050–1076 | ENT-10 audit-export scope; other ENT-10 capabilities are outside this batch. |
| BUILD_PLAN.md:1779–1805 | SV-2 persistence and access requirements; the existing tests remain unchanged. |
| BUILD_PLAN.md:3362,3373 | Existing migrations are 0121 audit-export and 0128 shadow-persistence. |
| BUILD_PLAN.md:3392; packages/db/src/migrate.ts:80 | Main already includes ENT-3c/0140; 0139 is absent. The draft's correction agrees with main. |
| packages/db/test/audit-export.integration.test.ts:26–32,44 | The existing reader omits the selected four families, as its comment states. |
| docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md:78 | The same families are explicitly outside that proof. |
| packages/db/test/shadow-catalog.integration.test.ts:42–56 | Existing role, view and sequence checks do not implement this own-step comparison. |
| packages/db/migrations/0128_shadow_persistence.sql:16 | The exact two schema USAGE additions are authorized by the unchanged migration. |
| packages/db/migrations/0121_audit_export.sql:47 | The unchanged migration states no existing grants or roles are changed. |

All cited anchors agree with the dispatch draft. These are source inspections, not executed PostgreSQL results.

The new file is `packages/db/test/catalog-fixlater-8.integration.test.ts`. Its six exact F8 titles are nested under acceptance-ID descriptions so the executable full titles contain their A IDs. A01 and A17–A23 are document, diff, tool or independent-review checks rather than invented PostgreSQL assertions.

New-file anchors: F8-01:33, F8-02:41, F8-03:51, F8-04:81, F8-05:102, F8-06:120; reader:133; permitted facts:185–194; comparator:195; own-step installer:253; fixtures:275; nonempty/NULL-ACL coverage:292; forbidden controls:327; actual access probe:405. The named NULL-ACL schema, sequence and view each verify both the underlying NULL and the expanded owner permissions.

| Assertions | Coverage |
| --- | --- |
| F8-01 / A02–A03 | Locate 0121 by complete filename, install its registry-derived prefix, check receipts, snapshot, apply 0121 alone and compare all selected facts. |
| F8-02 / A04–A06,A11 | Same stages for 0128. Raw differences must equal both specified app USAGE additions; the bounded comparator permits those only. |
| F8-03 / A05,A07–A11 | Real fixtures in each family, full view column types, relation/column ACLs, NULL defaults, PUBLIC, grantor/grantee/grant options, forbidden changes and a passing two-USAGE control. |
| F8-04 / A12–A13,A15 | Fresh pool equality; deliberately failing assertion and SQL controls both restore committed facts; refused CREATE leaves no relation. |
| F8-05 / A14–A15 | Actual SQL after SET LOCAL ROLE, verified non-superuser/no bypass posture, exact 42501 refusals, permitted fixture reads before and after each refusal, both shadow-role schema boundaries. |
| F8-06 / A16 | Both paths run migrate twice, deriving expected receipt filenames from current MIGRATION_URLS. No later-step catalogue freeze. |

The reader includes every non-system schema, sequence, ordinary view and materialized view, plus global and non-system schema-scoped default privileges. Facts include object OIDs and names, owner names, normalized ACL tuples (grantor, grantee, privilege, grantable), view definitions and column positions/names/full types. NULL ACLs expand through PostgreSQL's applicable acldefault; column defaults have no grants. SQL constructs canonical JSON text; no timestamp values or business rows are compared.

The comparator is symmetric: removed objects/facts, added objects/facts and changed ownership/identity are reported with family, qualified object and fact. A renamed fixture sequence exercises a missing captured qualified object without deleting anything. Coverage guards require every named fixture; an empty family cannot satisfy the proofs.

The permitted change is only an added ACL tuple on schema app, with grantor equal to its captured owner, grantee equal to one of the two named shadow roles, privilege USAGE and grantable false. CREATE, other schemas, other grantees and grant options remain reported. F8-02 separately requires exactly both additions.

Forbidden controls cover app CREATE, app USAGE with grant option, fixture-schema CREATE and USAGE, an extra app grantee, sequence ACL, ordinary-view ACL, view-column ACL, global/scoped default ACLs, a renamed sequence, changed sequence owner and changed view definition. Each verifies its starting condition, uses the real reader/comparator and runs inside the shared rolledBack helper on one retained client. The passing control revokes both USAGE entries inside its transaction, snapshots, restores them and compares. Every control is followed by baseline equality.

Fixture roles and defaults are isolated from product defining roles. Access probes run as the existing roles through SET LOCAL ROLE, with current_user posture asserted; no new membership or business-table grant is introduced. A successful fixture read precedes and follows each refused statement, using a savepoint to recover from the refusal.

No existing test, assertion, timeout or migration is edited. No column is added to an existing table. No source-byte/hash test is added. The lane registry receives exactly one additive entry. The dispatcher serializes its integration with other registry owners, including FIXLATER-7.

Execution evidence is in BUILDER_RECEIPT.md. PostgreSQL tests and controls are NOT RUN here because the dispatch identifies this sandbox as unable to bind sockets/start PostgreSQL. Their outcomes remain unverified pending dispatcher/GitHub execution. Default Vitest budgets are unchanged and unmeasured here.

The issued header sets check lane GREEN and overrides the draft's proposed RED lane. The requested registry note is copied exactly and therefore still contains historical draft text saying RED review; that note does not override the issued header. No lane-floor execution or independent verdict is claimed.
