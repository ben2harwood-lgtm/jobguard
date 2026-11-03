# LP-0 effective-privilege inventory, version 1

**Status:** reviewed-inventory draft prepared by the LP-0 builder; not independently verified, not accepted. Machine-readable twin: `lp-0-effective-privileges-v1.json` (the file the guard reads).

## What this is, in plain words

This is a list of what the application database login (`jobguard_runtime`) can really do today, including powers it gets indirectly (PUBLIC grants, inherited or switchable roles, views, routines that write on its behalf, defaults for future objects). It records the powerful permissions that already exist as **existing exceptions**, keeps them apart from the **target state**, names the later LP card that closes each one, and gives the guard (`packages/db/test/lp-0-grant-freeze.integration.test.ts`) a fixed list to compare the real database with. Anything not on the list fails the guard. **This piece alone does not make customer data safe to load**: every exception below is still open.

## Base inspected

- Landing base: `27d1ad6b976ec3ef48d92e4fd2c7e5b1ece738c3` (merged PLAN-LPL, on `origin/main`). PostgreSQL 16.10 (embedded, disposable). Registry applied in full: 82 migrations, highest `0151_ledger_corrections_fix.sql`; LP-0 allocates no migration number.
- Profiles: migration-only NOLOGIN, and synthetic-bootstrap LOGIN (both recorded; neither grants superuser, BYPASSRLS, CREATEROLE, CREATEDB or replication).
- Measured from the actual catalogue: 242 tables, 4 views, 0 PostgreSQL sequences (none), 273 routines of which 178 are reachable by some non-owner and 86 of those are SECURITY DEFINER; 243 RLS policies and 340 non-internal triggers (recorded, not compared).
- Runtime login today: SELECT on 201 tables and 4 views; INSERT on 130 tables; UPDATE on 6 tables and 28 columns; DELETE on 6 tables; EXECUTE on 99 routines (plus 53 routines PUBLIC can execute, 36 of them pgcrypto). No TRUNCATE, TRIGGER, REFERENCES, schema CREATE, database CREATE, sequence access, role membership or explicit default privilege exists.
- 1082 capability facts compared at the base (1083 reviewed entries, the extra entry being the second role profile). These totals are measurements of this base, not acceptance totals.

## How the guard uses this file

The guard reads the live catalogue (ACLs, PUBLIC, column ACLs, inheritance and SET ROLE with PostgreSQL 16 membership flags, owners, role attributes, views, every executable overload, schema and database privileges, default privileges, PostgreSQL privilege functions) and turns it into stable text facts. Each fact must appear in the JSON `entries`. Unknown facts fail with a specific code (for example `COLUMN_GRANT_ADDED`, `PUBLIC_GRANT_ADDED`, `ROLE_SET_PATH_ADDED`). Facts that disappear are accepted as reductions without editing this file. The file is never regenerated from the database by the assertion. `recorded` in the JSON holds routine, RLS and trigger protection facts for reviewers; **no guard compares them** (held, see the end).

## Existing exceptions (temporary, not approved for production use)

Each row is a capability the application login holds **today**. Recording it does not approve it. None of them is the final allowed state.

| Group | What the login can do today | Entries | Closing card(s) | Reviewed target |
|---|---|---:|---|---|
| `x-membership-account-writes` | Runtime INSERT/UPDATE/DELETE on account and membership | 6 | LP-1, LP-7 | revoke: LP-1 revokes all three and keeps only a proven immutable lock column grant or a lock routine |
| `x-audit-event-insert` | Runtime INSERT on audit_event and audit_export | 2 | LP-4, LP-6e | revoke: LP-4 moves the append inside the database and revokes the direct INSERT; LP-6e stamps the bound actor |
| `x-audit-head-execute` | Runtime EXECUTE on lock_audit_head and advance_audit_head | 2 | LP-4 | revoke: LP-4 revokes EXECUTE; the database performs the lock and advance |
| `x-command-authority-writes` | Runtime INSERT on command_receipt, decision_resolution, action_authorization and receipt/authorization column UPDATE | 7 | LP-5a, LP-5b, LP-5c | revoke: LP-5c revokes after LP-5a/5b convert every writer |
| `x-decision-insert` | Runtime INSERT on decision | 1 | LP-5b, LP-6d | review_at_card: LP-5b converts the writers; LP-6d binds the actor |
| `x-job-insert-and-terms` | Runtime INSERT on job and job_activation_terms | 2 | LP-2, LP-3, LP-8a | replace_with_checked_routine: LP-2 refuses prohibited ordinary and imported initial state; LP-3 and LP-8a reconcile activation terms |
| `x-customer-billing-writes` | Runtime INSERT on customer invoice, evidence, credit note, payment and reversal tables | 5 | LP-8a | revoke: LP-8a revokes after converting callers and restore tooling |
| `x-invoice-number-sequences` | Runtime SELECT and INSERT on customer_invoice_sequence and customer_credit_note_sequence | 4 | LP-8a, LP-13 | revoke: LP-8a revokes the two number-sequence writes; LP-13 checks number-impact |
| `x-final-account-writes` | Runtime INSERT on final_account_draft, _line, _proof and _revision | 4 | LP-8a, LP-8b | review_at_card: LP-8a checks advance_final_account_draft and reconciles targets; LP-8b closes trusted pointer alteration |
| `x-quote-commitment-writes` | Runtime INSERT (and quote_draft column UPDATE) on quote draft, revision, line, version, document version, send and delivery tables | 10 | LP-5c, LP-6d | review_at_card: LP-6d converts each direct writer or classifies it as working data with its downstream effect |
| `x-variation-writes` | Runtime INSERT (and variation column UPDATE) on variation, approval, revision, rejection, withdrawal and rate observation | 8 | LP-5c, LP-6d | review_at_card: LP-5c inventories the approval write; LP-6d converts the remaining writers |
| `x-recovery-case-writes` | Runtime INSERT on recovery case, event, claim, eligibility and review tables | 6 | LP-6c, LP-6d | review_at_card: LP-6c/6d bind actor and tenant; LP-8a/8b cover allocation dependencies |
| `x-recovery-message-writes` | Runtime INSERT on recovery message, approval, event and sink tables and the follow-up tables | 10 | LP-5c, LP-6d | review_at_card: LP-5c inventories the message approval write; LP-6d converts the rest |
| `x-evidence-writes` | Runtime INSERT (and evidence_upload column UPDATE) on evidence tables | 13 | LP-8b | review_at_card: LP-8b adds the owner guard and checked paths |
| `x-extra-writes` | Runtime INSERT on extra origin, event and link tables | 4 | LP-5b, LP-5c, LP-8b | review_at_card: LP-5b/5c convert the receipt claim and completion; LP-8b adds event grant checks |
| `x-outbox-writes` | Runtime INSERT and column UPDATE on action_outbox, action_attempt and provider_event_inbox | 14 | LP-8b, LP-10 | replace_with_checked_routine: LP-8b checked authorized insertion; LP-10 separate worker login |
| `x-supplier-procurement-writes` | Runtime INSERT on supplier, purchase order, goods receipt, material and merchant tables | 23 | LP-6d, LP-8b | review_at_card: LP-6d/8b convert or classify |
| `x-scope-proposal-writes` | Runtime INSERT, UPDATE and DELETE on proposal review tables; INSERT and column UPDATE on proposal, scope and finding tables | 28 | LP-6d, LP-13 | review_at_card: LP-6d classifies and converts; LP-13 covers the scope-progress actor |
| `x-prevention-fact-writes` | Runtime INSERT on prevention, watchdog, inbox and capture tables | 13 | LP-8b | review_at_card: LP-8b actor on prevention facts |
| `x-exec-transition-job` | Runtime EXECUTE on app.transition_job | 1 | LP-2 | revoke: LP-2 withdraws the runtime grant; a narrowed start-quote replacement serves draft-to-quoting |
| `x-exec-legacy-activation-acceptance` | Historical v1 signatures (owner fixture access only after LP-3) | 0 | LP-3 | Runtime EXECUTE withdrawn by 0404; checked overloads are classified under `a-exec-activation-v3`. |
| `x-exec-practice-actorless` | Runtime EXECUTE on actor-less or caller-actor practice routes | 7 | LP-2, LP-8a | restrict_to_owner: LP-2 restricts the named routes to the trusted practice database |
| `x-exec-invoice-number` | Runtime EXECUTE on reserve_customer_invoice_number | 1 | LP-8a, LP-13 | review_at_card: LP-13 traces number-burning impact; LP-8a covers its callers |
| `x-exec-invoker-follow-up-engine` | Runtime EXECUTE on evaluate_recovery_follow_ups (invoker, no fixed search path) | 1 | LP-4, LP-6d | review_at_card: LP-4 moves its audit append inside the database; LP-6d reviews it |
| `x-public-definer-trigger-functions` | PUBLIC EXECUTE (PostgreSQL default) on SECURITY DEFINER trigger functions signal_outbox and review_invalidated_recovery_evidence | 2 | LP-6d | restrict_to_owner: LP-6d review of helpers: revoke PUBLIC EXECUTE |

Downstream effect of each exception (why none is called harmless):

- `x-membership-account-writes`: Forging, promoting or restoring a membership row (owner or member) and creating accounts, directly as the application login inside its own tenant. Demonstrated by lp-0-authority-paths.integration.test.ts (membership insert as the real role).
- `x-audit-event-insert`: The application login computes sequence, previous hash, event hash, time and actor text of audit records, so it can seal a false approval, payment or completion statement. audit_export rows record exported checkpoints and are written by the same login.
- `x-audit-head-execute`: Advancing the audit head directly lets the caller choose the head sequence and hash for the next record.
- `x-command-authority-writes`: A receipt records who is processing a command, a resolution records an approval and an authorization is the single-use exact approval of an operation; the login can write all three and can mark a receipt complete or revoke an authorization.
- `x-decision-insert`: A decision is the card an approval is attached to; inserting one directly is a precondition for forging an approval chain with the resolution write above.
- `x-job-insert-and-terms`: A job row carries status, accepted price and recovery cap; inserting one directly with commercial terms bypasses quote acceptance and activation.
- `x-customer-billing-writes`: Issuing an invoice, credit, payment or reversal moves money records; the login can write them without the exact-approval and same-actor receipt checks the routines apply.
- `x-invoice-number-sequences`: These are TABLES that allocate invoice and credit-note numbers, not PostgreSQL sequences: writing them burns or repeats issued numbers (numbering path). Not harmless working data.
- `x-final-account-writes`: Final account drafts, lines, proofs and revisions are the statement of what is owed; direct inserts can alter the pointer a lock later binds.
- `x-quote-commitment-writes`: Quote versions and document versions are what a customer accepts; quote_document_version is fingerprinted. Sends and delivery events feed later commercial sends (held).
- `x-variation-writes`: variation_approval records an approval of changed price; variation_revision and variation_approval are fingerprinted. Direct writes can create approval records without the approval routine.
- `x-recovery-case-writes`: Recovery case state, claim revisions and eligibility drive fee derivation; recovery_claim_revision and recovery_case_event are fingerprinted.
- `x-recovery-message-writes`: A message approval is the approval to contact a person; sink and event rows record what was sent. Commercial sends stay held; this records the direct write.
- `x-evidence-writes`: Evidence objects, links, uploads, invalidations, packs and attachment approvals decide what proof stands; direct writes can substitute evidence or invalidate another person proof. evidence_object is fingerprinted.
- `x-extra-writes`: Extras origin and links decide who raised an extra and which order line it is linked to; ENT-3a permission distinctions must be preserved.
- `x-outbox-writes`: The outbox holds approved actions awaiting execution; direct insert or status updates can add, change or complete a queued action. Fake outbound is not proof the writes are safe.
- `x-supplier-procurement-writes`: Supplier facts, match allocations, purchase orders and goods receipts feed what is owed and what is claimed; supplier_document and supplier_document_version are fingerprinted.
- `x-scope-proposal-writes`: Proposal reviews are not append-only (full UPDATE and DELETE); accepted proposal lines become scope items and findings, so a direct edit changes what the job scope is.
- `x-prevention-fact-writes`: Facts recorded by prevention checks and the watchdog are inputs to findings and gating; the database does not enforce who recorded them.
- `x-exec-transition-job`: Moves a job between lifecycle states with caller-supplied tenant, actor and reason; the executable route that the plan names as an unchecked job door. Fails on its own checks, not on permission (demonstrated).
- `x-exec-legacy-activation-acceptance`: Legacy signatures take no command or authorization id and do not carry the 0109 active-owner, processing-receipt and matching-authorization checks; saved-v1 compatibility must be preserved.
- `x-exec-practice-actorless`: Practice session issue, contractor practice start (creates tenant, account and membership rows as owner), recovery demo, fee illustration and synthetic landing routines act without a validated actor and must refuse outside the practice database.
- `x-exec-invoice-number`: Consumes the next invoice number for a tenant without issuing an invoice.
- `x-exec-invoker-follow-up-engine`: Runs with the runtime login own privileges: its audit and decision writes succeed only because of the direct audit INSERT and head EXECUTE exceptions above.
- `x-public-definer-trigger-functions`: R2 requires definer entry points to revoke PUBLIC. Both are trigger functions, so direct calls are refused (0A000, proven), but they inherit PostgreSQL default PUBLIC EXECUTE and run as owner when fired.

## Approved current capabilities (reviewed; some are re-bound by a later card)

| Group | Capability | Entries | Target |
|---|---|---:|---|
| `a-party-and-simulation-writes` | Runtime INSERT on customer, site and practice or sandbox simulation tables | 13 | rebind_at_card (LP-11): working data inside the caller tenant, rebound with the tenant at LP-11 |
| `a-exec-activation-v3` | Runtime EXECUTE on switch_job_live_v3 | 5 | rebind_at_card (LP-3, LP-6c): kept; actor and tenant compared with the binding at LP-6c |
| `a-exec-checked-billing-money` | Runtime EXECUTE on checked invoice, credit, receipt, reversal and journal routines | 8 | rebind_at_card (LP-6c, LP-8a): kept as checked routines; actor and tenant bound at LP-6c; legacy signatures withdrawn at LP-8a |
| `a-exec-final-account` | Runtime EXECUTE on final-account lock, disposition, terms and advance routines | 8 | rebind_at_card (LP-6c, LP-8a): kept; LP-8a checks advance_final_account_draft; actor and tenant bound at LP-6c |
| `a-exec-recovery-money` | Runtime EXECUTE on recovery terms, payer mark, fee, landing and allocation routines | 5 | rebind_at_card (LP-6c, LP-8a): kept as checked routines; actor and tenant bound at LP-6c; no fee rule changed |
| `a-exec-job-parties-work-orders` | Runtime EXECUTE on adoption, party binding, work order, import and contractor administration routines | 12 | rebind_at_card (LP-6d, LP-7, LP-13): kept as checked routines; actor and tenant bound at LP-6d (replay branch reviewed at LP-13) |
| `a-exec-site-extra-routines` | Runtime EXECUTE on ENT-3a/3b/3c/3d routines and helpers | 13 | rebind_at_card (LP-5b, LP-6d): kept; ENT-3a permission distinctions preserved; actor and tenant bound at LP-6d |
| `a-exec-practice-session-trusted` | Runtime EXECUTE on practice session authentication, revocation and trusted-record routines | 4 | rebind_at_card (LP-6a, LP-6d): kept; practice credentials cannot reach a real-data owner (LP-6a) |
| `a-exec-shadow-runtime` | Runtime EXECUTE on reveal_shadow_signals; shadow role routine and column grants | 5 | review_at_card (LP-4, LP-6d, LP-10): kept; LP-4, LP-6d and LP-10 review the shadow writers and composition |
| `a-exec-helper-predicates` | Runtime EXECUTE on read-only helper and predicate functions | 29 | retain: retained as read-only predicates run with the caller rights |
| `a-exec-trigger-functions-runtime` | Runtime EXECUTE on trigger function app.require_prevention_subject | 1 | retain: retained; a trigger function cannot be invoked except as a trigger |
| `a-public-trigger-and-pure-functions` | PUBLIC EXECUTE (PostgreSQL default) on invoker trigger functions and pure helpers | 15 | retain: retained: invoker trigger functions and pure arithmetic with no table access |
| `a-extension-pgcrypto-public` | PUBLIC EXECUTE (PostgreSQL default) on pgcrypto functions in schema public | 36 | retain: retained: pure cryptographic helpers (digest, gen_random_uuid, hmac, crypt, pgp_*) with no table access |
| `a-identity-role-routines` | EXECUTE for jobguard_identity on identity-schema routines | 23 | rebind_at_card (LP-7, LP-13, LP-6e): kept for the identity login; LP-7 adds removal and role change, LP-13 the SSO audit check |
| `a-identity-role-table-grants` | Table and column grants for jobguard_identity | 28 | review_at_card (LP-7): kept for the identity login; reviewed at LP-7 |
| `a-infrastructure-role-grants` | Grants for jobguard_infrastructure | 2 | review_at_card (LP-10): kept; reviewed with the worker split at LP-10 |
| `a-shadow-role-grants` | Table and column grants for jobguard_shadow | 23 | review_at_card (LP-6d, LP-10): kept; reviewed at LP-6d and with the worker split at LP-10 |
| `a-runtime-reads` | Runtime SELECT on application tables, views and permitted columns | 209 | rebind_at_card (LP-11): kept, bounded by RLS; tenant comparison rebound at LP-11 |
| `a-owner-schemas-database` | Owners of schemas and database and PUBLIC default privileges on the database, languages and types | 14 | retain: retained as PostgreSQL defaults and schema owners; no CREATE for any login |
| `a-schema-usage-grants` | USAGE on application schemas for the application roles | 5 | retain: retained; USAGE only, never CREATE |
| `a-owner-tables-views` | Ownership of application tables and views by jobguard_migration | 236 | review_at_card (LP-12): kept; LP-12 reviews protected-table ownership and migration-role inheritance |
| `a-owner-routines` | Ownership of application routines by jobguard_migration | 141 | review_at_card (LP-12): kept; LP-12 moves new chokepoints and then relevant money routines off the schema owner |
| `a-owner-extension-bootstrap` | Ownership of pgcrypto routines and the migration registry by the bootstrap superuser | 38 | retain: retained: extension objects and the registry table belong to the bootstrap role |
| `a-role-runtime-profiles` | Role attributes of jobguard_runtime in its two tested profiles | 2 | retain: retained: NOLOGIN as migrated and LOGIN as synthetic bootstrap; never superuser, BYPASSRLS, CREATEROLE, CREATEDB or replication |
| `a-role-other-application` | Role attributes of the migration, infrastructure, identity and shadow roles and the bootstrap superuser | 6 | retain: retained: all NOLOGIN NOINHERIT with no elevated attributes, except the bootstrap superuser of the disposable cluster |
| `a-builtin-defaults` | PostgreSQL built-in default privileges (not explicit default ACLs) | 5 | retain: retained as documentation of the future-object effect; no explicit object-creator default privilege exists |
| `a-system-routines` | PostgreSQL system routines executable by the application login | 4 | review_at_card (LP-9): kept; each enforces its own role check; reviewed in the final catalogue run |
| `a-views-reviewed` | Reviewed view definitions, options and dependencies | 19 | rebind_at_card (LP-11): kept; reviewed again at LP-11 |

"Approved current" means reviewed and retained for now; it is not a security claim. Working-data additions need their own downstream classification and reviewed authorisation; the guard never accepts one automatically (R1).

## Target state (separate from the exceptions)

- **ts-membership-closed** (LP-1): The application login holds no INSERT, UPDATE or DELETE on account or membership; any retained lock column grant is proven immutable for identity, authority and linked records.
- **ts-job-doors-closed** (LP-2): The application login cannot execute transition_job; ordinary and imported job inserts cannot carry prohibited initial state, price, cap or policy; actor-less practice routes refuse outside the trusted practice database.
- **ts-v3-activation-only** (LP-3): Only the command-checked activation, acceptance and settlement signatures remain executable by the application login; the v1 signatures are withdrawn and callers converted.
- **ts-audit-in-database** (LP-4, LP-6e): The application login has no INSERT on audit_event and no EXECUTE on the audit head routines; the database allocates sequence, hashes and time.
- **ts-commands-checked** (LP-5a, LP-5b, LP-5c): Receipts, resolutions and authorizations are created and completed only by checked begin and complete routines; the application login holds no direct INSERT on them and no receipt UPDATE.
- **ts-money-routines-only** (LP-8a, LP-13): Customer invoice, credit, payment, reversal and number-sequence tables are SELECT-only for the application login; money moves only through checked routines that bind actor, resource, amount, state and exact approval.
- **ts-evidence-outbox-checked** (LP-8b, LP-10): Evidence, prevention-fact and outbox writes reach the database only through checked, actor-bound paths; the worker uses its own login.
- **ts-commitments-converted** (LP-5c, LP-6d): Every remaining direct commitment writer (quotes, variations, recovery, procurement, scope and proposals) is converted to a checked routine or reviewed as working data with its downstream effect recorded.
- **ts-actor-from-session** (LP-6a, LP-6b, LP-6c, LP-6d): Checked routines compare p_actor and p_tenant with the protected session binding; the application login cannot choose another actor or tenant.
- **ts-tenant-bound-reads** (LP-11): Row-level-security tenant policies use the protected bound tenant rather than a caller-set setting; views and privileged routines are reviewed.
- **ts-narrow-owners** (LP-12): New chokepoints and relevant money routines are owned by narrow no-login roles with only the grants and helpers they need; the application login cannot assume them.
- **ts-public-definers-revoked** (LP-6d): No SECURITY DEFINER routine retains PUBLIC EXECUTE.

## Authority paths and the card that closes each

A table or routine assigned to several cards names each card's distinct responsibility.

### `ap-membership-account` Account and membership direct writes

The application login can insert, update and delete app.account and app.membership rows directly (0000_tenancy.sql:82). A membership row decides who is an owner or member of a tenant, so forging, promoting or restoring one is a permission forgery. Identity-side routines (identity.provision_verified_challenge, identity.scim_deactivate, identity.sso_complete) and runtime routines (app.start_contractor_practice, app.contractor_admin_command) also write these tables as their owner.

- **LP-1:** revoke runtime INSERT/UPDATE/DELETE on account and membership, keep legitimate row locks via a proven immutable column grant or a lock routine, move the demo seed rows to the owner connection
- **LP-7:** member removal and role change on the identity side with session-derived owner checks, last-owner protection and same-transaction audit
- Sources: `packages/db/migrations/0000_tenancy.sql:82`, `packages/db/migrations/0137_scim_deactivation.sql:78`, `packages/db/migrations/0150_membership_authority_fix.sql`
- Behavioural tests: `packages/db/test/tenancy.integration.test.ts`, `packages/db/test/identity.integration.test.ts`, `packages/db/test/contractor-owner-grant.integration.test.ts`, `packages/db/test/scim-deactivation.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`
- Open: General owner creation, removal, transfer and recovery rights remain NEEDS A RULING; this inventory decides none of them.

### `ap-audit-append` Audit append by the application login

The application login holds INSERT on app.audit_event and EXECUTE on app.lock_audit_head and app.advance_audit_head (0001_audit.sql:89,91), so it computes the sequence, previous hash, event hash and time of audit records itself. Owner-side writers (append_final_lock_audit, append_shadow_audit, identity.sso_audit_append, shadow-detection writers) are inventoried as recorded, owner-only or role-scoped routines.

- **LP-4:** append inside the database: the database locks the head, allocates the sequence, reads the clock and computes hashes; revoke runtime audit_event INSERT and head-routine EXECUTE; keep audit the last lock
- **LP-6e:** stamp the bound actor into audit and make checked operations establish the high-trust content
- Sources: `packages/db/migrations/0001_audit.sql:89`, `packages/db/migrations/0001_audit.sql:91`, `packages/db/migrations/0132_final_account_lock.sql:142`, `packages/db/migrations/0128_shadow_persistence.sql:214`
- Behavioural tests: `packages/db/test/audit.integration.test.ts`, `packages/db/test/audit-export.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`
- Open: Structural sealing alone is not evidence authenticity; legacy history is not retroactively authenticated.

### `ap-job-state` Job state, ordinary and imported job insertion

app.transition_job is executable by the runtime login (0003_job_spine.sql:121) and moves jobs between states with caller-supplied actor and reason. app.job INSERT is granted to the runtime login, and the imported-job guard (0020_job_import.sql:30-46) trusts a caller-settable setting (app.import_command) that is null-unsafe. adopt_in_flight_job (two overloads) and the work-order and import routines are checked entry points that still take caller-supplied actors.

- **LP-2:** withdraw runtime EXECUTE on transition_job, narrow start-quote replacement, null-safe guard_imported_job with a non-forgeable adoption boundary
- **LP-6c:** compare p_actor and p_tenant with the protected binding in money and commitment routines
- **LP-6d:** apply actor and tenant binding to every remaining routine in the downstream-effect inventory
- Sources: `packages/db/migrations/0003_job_spine.sql:121`, `packages/db/migrations/0020_job_import.sql:30`, `packages/db/migrations/0020_job_import.sql:32`, `packages/db/migrations/0020_job_import.sql:46`, `packages/db/migrations/0095_job_parties.sql:281`
- Behavioural tests: `packages/db/test/job.integration.test.ts`, `packages/db/test/job-import.integration.test.ts`, `packages/db/test/job-parties.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`
- Open: Caller-set flags (app.import_command) are not authority; the guard remains caller-settable until LP-2.

### `ap-practice-actorless` Actor-less practice routes

Practice-only routines that take no actor or take a caller-supplied one and can be reached by the runtime login: 0023 (configure_recovery_demo), 0024 (create_fee_illustration_source), 0018/0097 (approve_synthetic_landing, reverse_synthetic_landing) and the practice session, practice customer billing and receipt routines.

- **LP-2:** restrict the named actor-less practice routes (0023, 0097, 0018, 0024) to the trusted practice database
- **LP-8a:** practice customer invoice, credit, receipt and reversal paths enforce actor, resource, amount, state and exact approval; replacements withdraw old grants
- Sources: `packages/db/migrations/0018_recovery_outcomes.sql:41`, `packages/db/migrations/0023_recovery_demo_ui.sql:17`, `packages/db/migrations/0024_fee_illustration.sql:15`, `packages/db/migrations/0097_recovery_case_current.sql:38`
- Behavioural tests: `packages/db/test/practice-session.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`, `packages/db/test/recovery.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`

### `ap-command-receipts` Command receipts, resolutions and authorizations

The application login inserts command_receipt, decision_resolution and action_authorization rows and updates command_receipt (status, result, completed_at) and action_authorization.revoked_at (0005_commands.sql:76,79,80). UserCommandDispatcher (packages/db/src/commands.ts) creates, completes, authorizes and audits through these direct writes. A receipt plus an owner is not a distinct approval.

- **LP-5a:** begin_command and complete_command inside the database, migrate the dispatcher, enforce the per-command role rule
- **LP-5b:** convert the nine receipt-writing repositories and the demo seed, retain contractor controlled routes
- **LP-5c:** revoke runtime INSERT on command_receipt, decision_resolution and action_authorization and receipt UPDATE; inventory remaining authority-changing column grants
- Sources: `packages/db/migrations/0005_commands.sql:76`, `packages/db/migrations/0005_commands.sql:79`, `packages/db/migrations/0005_commands.sql:80`, `packages/db/src/commands.ts`
- Behavioural tests: `packages/db/test/commands.integration.test.ts`, `packages/db/test/command-replay-contract.integration.test.ts`, `packages/db/test/proof-replay.integration.test.ts`, `packages/db/test/decision-adoption.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`
- Open: Direct forged receipts, approved resolutions and fabricated completion are possible today; this inventory records that and closes nothing.

### `ap-extra-receipts` Extras origin, links and events

ExtraRepository (packages/db/src/extra-repository.ts) claims and completes receipts and writes extra origin, event and link rows directly; the runtime login holds INSERT on app.extra_origin, extra_event, extra_order_line_link and extra_duplicate_link. SiteExtraRepository.logSiteExtra and siteExtraAuthoritySeam apply ENT-3a permissions (site logging by operatives, supervisors and surveyors; office recording by finance, admins and owners; client-instruction recording by commercial managers, admins and owners), which must be preserved.

- **LP-5b:** convert the receipt claim and completion in these repositories to checked routines
- **LP-5c:** revoke the receipt writes once every caller is converted
- **LP-8b:** extras-event grant checks reusing the 0122 protections
- Sources: `packages/db/src/extra-repository.ts`, `packages/db/src/site-extra-repository.ts`, `packages/db/migrations/0135_site_extra_authority.sql`
- Behavioural tests: `packages/db/test/site-extra.integration.test.ts`, `packages/db/test/site-extra-authority.integration.test.ts`, `packages/db/test/extra-origin.integration.test.ts`, `packages/db/test/extra-links.integration.test.ts`, `packages/db/test/extra-unlink.integration.test.ts`

### `ap-site-extra-visits` Site visits, pricing basis and resident confirmation routines

Runtime-executable ENT-3b/3c/3d routines (ent3b_start_visit, ent3b_complete_visit, ent3c_record_sor_revision, ent3d_record_resident_confirmation and their helpers) apply contractor and member permission checks inside the database. Decided member and contractor permissions must be preserved, not made owner-only.

- **LP-5b:** retain the existing contractor controlled routes when other writers are converted
- **LP-6d:** bind actor and tenant to these routines and their helpers
- Sources: `packages/db/migrations/0139_site_visit_closeout.sql`, `packages/db/migrations/0140_site_extra_pricing.sql`, `packages/db/migrations/0141_site_extra_evidence.sql`
- Behavioural tests: `packages/db/test/site-visit.integration.test.ts`, `packages/db/test/site-visit-authority.integration.test.ts`, `packages/db/test/site-extra-pricing.integration.test.ts`, `packages/db/test/site-extra-evidence.integration.test.ts`

### `ap-activation-acceptance` Job activation and acceptance routes

Legacy v1 signatures switch_job_live, record_simulated_settlement, record_builder_attested_acceptance and record_quote_disposition are executable by the runtime login without command or authorization ids; switch_job_live_v3 carries the 0109 active-owner, processing-receipt and matching-unexpired-authorization checks. job_activation_terms INSERT is granted directly.

- **LP-3:** hardened v3-checked signatures, revoke the old signatures and convert callers, preserve saved-v1 compatibility
- **LP-6c:** actor and tenant compared with the protected binding in activation, acceptance and invoice routines
- Sources: `packages/db/migrations/0012_job_activation.sql:71`, `packages/db/migrations/0012_job_activation.sql:72`
- Behavioural tests: `packages/db/test/activation.integration.test.ts`, `packages/db/test/job-activation-terms.integration.test.ts`, `packages/db/test/quote.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`

### `ap-customer-billing` Customer billing tables and invoice routines

The runtime login inserts customer_invoice, customer_invoice_evidence, customer_credit_note, customer_payment, customer_payment_reversal and the two number-sequence tables directly (0017_customer_billing.sql:8, 0028_uiwire11_credit_notes.sql:14). The older issue_practice_customer_invoice (0027:52) and the lock-bound issue_lock_bound_customer_invoice both exist; reserve_customer_invoice_number consumes a number without an invoice.

- **LP-8a:** revoke direct invoice, evidence, credit, payment, reversal and number-sequence writes; retire the legacy direct-insert service; convert restore rehearsal; cover both invoice signatures
- **LP-13:** invoice-number burning: numbers cannot corrupt issued records or create unbounded service trouble
- **LP-6c:** actor and tenant bound in the invoice and money routines
- Sources: `packages/db/migrations/0017_customer_billing.sql:8`, `packages/db/migrations/0017_customer_billing.sql:14`, `packages/db/migrations/0027_uiwire10_customer_invoice.sql:52`, `packages/db/migrations/0028_uiwire11_credit_notes.sql:14`
- Behavioural tests: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/UIWIRE-11.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/practice-invoice-audit.integration.test.ts`
- Open: customer_invoice is a fingerprinted table and gains no column.

### `ap-final-account` Final account drafts, locks and pointers

The runtime login inserts final_account_draft, _line, _proof and _revision rows and executes advance_final_account_draft, lock_final_account, accept_final_check_terms, record_final_account_disposition, invalidate_stale_final_account_authorizations and prepare_final_review_extra. Lock tables are SELECT-only. append_final_lock_audit is owner-side.

- **LP-8a:** check advance_final_account_draft and reconcile job, activation and terms targets with the actual grants
- **LP-8b:** no direct insert alters a trusted allocation or final pointer
- **LP-6c:** bind actor and tenant in the lock and disposition routines
- Sources: `packages/db/migrations/0132_final_account_lock.sql:74`, `packages/db/migrations/0132_final_account_lock.sql:142`
- Behavioural tests: `packages/db/test/final-account.integration.test.ts`, `packages/db/test/final-account-lock.integration.test.ts`, `packages/db/test/final-account-lock-invoice.integration.test.ts`, `packages/db/test/final-account-lock-reveal.integration.test.ts`

### `ap-recovery-money` Recovery cases, fee derivation, landings and allocations

Recovery case, claim, eligibility and follow-up tables are inserted directly. approve_recovery_case_terms, post_recovery_fee_candidate, approve_synthetic_landing, reverse_synthetic_landing, write_recovery_payment_payer_mark and write_recovery_allocation are runtime-executable. The six M4-8-S allocation tables (receipt_line_allocation, recovery_allocation_command, recovery_allocation_line_source, recovery_allocation_review, recovery_case_allocation, recovery_case_allocation_reversal) are SELECT-only for the runtime login; that result is preserved and no outstanding direct INSERT is invented.

- **LP-6c:** money routines compare p_actor and p_tenant with the binding; fee posting is not changed here
- **LP-6d:** remaining recovery routines and follow-up engine bind actor and tenant
- **LP-8a:** allocation, reversal and fee-journal paths enforce actor, resource, amount, state and exact approval
- **LP-8b:** M4-8-S SELECT-only grants remain closed; allocation dependencies traced
- Sources: `packages/db/migrations/0136_recovery_allocation.sql:111`, `packages/db/migrations/0134_recovery_case_terms.sql:61`, `packages/db/migrations/0018_recovery_outcomes.sql:41`
- Behavioural tests: `packages/db/test/recovery-allocation.integration.test.ts`, `packages/db/test/recovery-case-terms.integration.test.ts`, `packages/db/test/recovery-cases.integration.test.ts`, `packages/db/test/recovery-insurer-money.integration.test.ts`
- Open: The FEE-BOTH-1 amendment does not authorise fee posting; this inventory changes no fee rule.

### `ap-recovery-messages` Recovery messages, approvals and follow-ups

recovery_message, recovery_message_approval, recovery_message_event, recovery_message_sink and the follow-up tables are inserted directly; evaluate_recovery_follow_ups is an invoker routine (no fixed search path) that writes audit_event and decision rows with the runtime login own privileges and so works only because of the direct audit write.

- **LP-4:** evaluate_recovery_follow_ups audit append moves inside the database
- **LP-5c:** the approval record is an authority-changing grant to inventory and close
- **LP-6d:** follow-up and message routines bind actor and tenant
- Sources: `packages/db/migrations/0134_recovery_case_terms.sql`, `packages/db/src/recovery-message-repository.ts`
- Behavioural tests: `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/test/recovery-follow-up.integration.test.ts`

### `ap-evidence` Evidence objects, links, uploads, invalidations and packs

The runtime login inserts evidence_object, evidence_link, evidence_upload (with UPDATE on five columns), evidence_invalidation, evidence_pack, evidence_pack_revision, evidence_pack_attachment_approval and synthetic_evidence_original directly. Evidence attribution is only as strong as the writer.

- **LP-8b:** owner guard on evidence_invalidation; no direct insert substitutes authoritative evidence or invalidates another person proof; preserve scoped access, immutable object version and integrity of external originals
- Sources: `packages/db/migrations/0002_evidence.sql:100`
- Behavioural tests: `packages/db/test/evidence.integration.test.ts`, `packages/db/test/evidence-packs.integration.test.ts`, `packages/db/test/evidence-pack-sources.integration.test.ts`

### `ap-outbox` Outbox, attempts and provider inbox

The runtime login inserts action_outbox, action_attempt and provider_event_inbox rows and updates their status columns; the worker (apps/api/src/worker.ts), outbox executor and shadow-detection composition share the same login. Queued claims, completion and approved outbox content are authority paths.

- **LP-8b:** checked authorized action_outbox insertion; no direct insert changes approved outbox content
- **LP-10:** separate jobguard_worker role and secret; claim and completion move to it; actor and tenant derived from the valid authorized action
- Sources: `packages/db/migrations/0005_commands.sql`, `apps/api/src/worker.ts`
- Behavioural tests: `packages/db/test/outbox.integration.test.ts`, `packages/db/test/sandbox.integration.test.ts`

### `ap-quote-variation-commitments` Quotes, variations and commitment records

Quote draft, revision, line, version, document version, send and delivery rows and variation, approval, revision, rejection and withdrawal rows are inserted directly, with UPDATE on quote_draft and variation state columns. quote_document_version, variation_revision and variation_approval are fingerprinted tables.

- **LP-5c:** variation_approval and similar approval records are authority-changing grants inventoried for closure
- **LP-6d:** each remaining direct writer is converted to a checked routine or classified working data with its downstream effect
- Sources: `packages/db/migrations/0003_job_spine.sql:113`, `packages/db/migrations/0003_job_spine.sql:114`
- Behavioural tests: `packages/db/test/quote.integration.test.ts`, `packages/db/test/variation.integration.test.ts`, `packages/db/test/fingerprinted-row-shape.integration.test.ts`
- Open: Fingerprinted tables gain no new column.

### `ap-supplier-procurement` Supplier documents, purchase orders, materials and goods receipts

Supplier documents, intake, fact proposals and revisions, match proposals, allocations and revisions, bill supersession, credit consumption, purchase orders, goods receipts, material requirements, pack conversions and rate revisions, merchants and rate-book observations are inserted directly by the runtime login.

- **LP-6d:** bind actor and tenant to the routines that replace these direct writers
- **LP-8b:** include equivalent lower-trust inputs from the inventory, not just obvious finance tables
- Sources: `packages/db/migrations/0005_commands.sql:76`
- Behavioural tests: `packages/db/test/supplier-documents.integration.test.ts`, `packages/db/test/supplier-matching.integration.test.ts`, `packages/db/test/purchase-order-audit.integration.test.ts`

### `ap-scope-proposals` Scope, proposals and reviews

proposal_review, proposal_review_line, proposal_review_line_parent and proposal_review_question carry full SELECT, INSERT, UPDATE and DELETE for the runtime login (0008_review.sql:50); proposal_line and scope_identity have column UPDATE on state; scope_progress, scope_revision, scope_lineage, job_finding, job_record_proposal, planned_work_revision, readiness and stage tables are inserted directly. Adopted proposals feed scope and commitments.

- **LP-6d:** classify actual downstream effects of the review writes and bind actor and tenant
- **LP-13:** scope-progress actor: progress cannot alter commitments or charges
- Sources: `packages/db/migrations/0008_review.sql:50`, `packages/db/migrations/0003_job_spine.sql:113`, `packages/db/migrations/0003_job_spine.sql:114`, `packages/db/migrations/0003_job_spine.sql:94`
- Behavioural tests: `packages/db/test/review.integration.test.ts`, `packages/db/test/readiness.integration.test.ts`, `packages/db/test/practice-scope.integration.test.ts`

### `ap-prevention-facts` Prevention, watchdog and inbox facts

commercial_integrity activity and value facts, watchdog command identity and result, finding suppression, counterparty checks, property constraint facts, proof application responses, inbox revisions and outcome events and capture sources are inserted directly; actor attribution on prevention facts is not enforced by the database.

- **LP-8b:** actor on prevention facts and equivalent lower-trust inputs
- Sources: `packages/db/migrations/0005_commands.sql:76`
- Behavioural tests: `packages/db/test/watchdog.integration.test.ts`, `packages/db/test/prevention-checks.integration.test.ts`, `packages/db/test/capture.integration.test.ts`, `packages/db/test/commercial-integrity.integration.test.ts`

### `ap-contractor-admin` Contractor administration, client links and work orders

contractor_admin_command writes membership, role grants, teams, client organisations and contracts as its owner; link_contractor_customer, bind_contractor_parties, work_order_begin, work_order_commit, import_batch_record and import_sor_version are runtime-executable checked routines. Decided member and contractor permissions are preserved.

- **LP-6d:** bind actor and tenant to these routines
- **LP-7:** removal and role change reuse merged deactivation paths with last-owner protection
- Sources: `packages/db/migrations/0150_membership_authority_fix.sql`
- Behavioural tests: `packages/db/test/contractor.integration.test.ts`, `packages/db/test/contractor-parties.integration.test.ts`, `packages/db/test/contractor-owner-grant.integration.test.ts`, `packages/db/test/work-order-import.integration.test.ts`

### `ap-identity-sso` Identity-side routines (jobguard_identity)

Twenty-two identity-schema SECURITY DEFINER routines are executable by jobguard_identity only (invitations, challenge provisioning, SSO administration, SCIM deactivation, SSO audit append). identity.sso_audit_append writes audit_event as owner; identity.scim_deactivate is the existing identity-only deactivation path (0137), not a missing implementation.

- **LP-7:** two identity-side member-removal and role-change routines reuse the merged deactivation paths
- **LP-13:** SSO audit connection check (0120): SSO cannot mix identity or tenant
- **LP-6e:** audit attribution from the bound actor
- Sources: `packages/db/migrations/0120_enterprise_identity.sql:238`, `packages/db/migrations/0120_enterprise_identity.sql:242`, `packages/db/migrations/0137_scim_deactivation.sql:98`
- Behavioural tests: `packages/db/test/enterprise-identity.integration.test.ts`, `packages/db/test/sso-required.integration.test.ts`, `packages/db/test/scim-deactivation-access.integration.test.ts`, `packages/db/test/identity.integration.test.ts`

### `ap-shadow` Shadow detection and emergency access roles

jobguard_shadow and jobguard_shadow_emergency_access hold narrow table, column and routine grants (signal state columns, record_shadow_disclosure, surface_shadow_signal_early, read_shadow_emergency); reveal_shadow_signals is runtime-executable; append_shadow_audit is an owner-side audit writer.

- **LP-4:** owner-side shadow audit writer moves to the in-database append
- **LP-6d:** actor and tenant binding in shadow routines
- **LP-10:** shadow-detection composition separated from the web login
- Sources: `packages/db/migrations/0128_shadow_persistence.sql:214`
- Behavioural tests: `packages/db/test/shadow-catalog.integration.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, `packages/db/test/shadow-isolation-query-log.integration.test.ts`

### `ap-worker-composition` Worker, outbox executor and shadow-detection composition

apps/api/src/worker.ts runs queue claim, completion and shadow detection with the same business login as the web process; a separate worker role does not exist yet.

- **LP-10:** separate jobguard_worker role and secret
- Sources: `apps/api/src/worker.ts`
- Behavioural tests: `packages/db/test/outbox.integration.test.ts`, `packages/db/test/shadow-detection.integration.test.ts`

### `ap-seed-restore-bootstrap` Seed, bootstrap and restore tooling

packages/db/src/demo-seed.ts writes four account and membership rows through the runtime connection; demo-bootstrap.ts makes jobguard_runtime a LOGIN role; packages/db/tools/synthetic-restore.mjs creates a rehearsal login and grants jobguard_runtime to it. These are credential and setup paths, not request paths; conversion belongs to the applicable later cards.

- **LP-1:** demo seed four rows use the owner connection
- **LP-8a:** restore rehearsal converted to checked paths and kept executable
- **LP-9:** seed and restore credential evidence in the final deployment-representative run
- Sources: `packages/db/src/demo-seed.ts`, `packages/db/src/demo-bootstrap.ts`, `packages/db/tools/synthetic-restore.mjs`
- Behavioural tests: `packages/db/test/demo-bootstrap.integration.test.ts`, `packages/db/test/restore-rehearsal.integration.test.ts`

### `ap-read-tenant-binding` Reads and RLS tenant comparison

Every runtime SELECT is bounded by row-level security whose tenant comparison uses a setting the caller sets (app.tenant_id); four views are readable, one (ledger_balance) is a security_barrier view without security_invoker. Reads of tables the runtime login cannot touch directly through any view are controlled by the view inventory.

- **LP-11:** convert tenant RLS policies from the caller-set setting to the protected bound tenant, including visibility and proposed-row checks, and review permissive alternatives, views and privileged routines
- Sources: `packages/db/src/tenant-context.ts`, `packages/db/migrations/0000_tenancy.sql:71`
- Behavioural tests: `packages/db/test/tenancy.integration.test.ts`, `packages/db/test/workspace-read.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`

### `ap-roles-owners-schema` Roles, ownership, schemas, defaults and system entry points

jobguard_migration owns every application table, view and SECURITY DEFINER routine; the runtime, identity, infrastructure and shadow roles are NOINHERIT with no memberships; PUBLIC holds PostgreSQL default privileges (database CONNECT and TEMPORARY, language and type USAGE, function EXECUTE on routines without an explicit ACL); no explicit default privileges exist; the runtime login can execute a few PostgreSQL system functions that enforce their own role checks.

- **LP-12:** new binding, command, audit and money chokepoints get narrower owners; no migration-role inheritance or unrestricted helper defeats the boundary
- **LP-9:** final deployment-representative catalogue run and bounded completion claim
- Sources: `packages/db/migrations/0000_tenancy.sql`
- Behavioural tests: `packages/db/test/lp-0-grant-freeze.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`, `packages/db/test/watchdog-migration-owner.integration.test.ts`

### `ap-journal-ledger` Ledger, journal posting and reversal routines

post_plan_obligation, post_plan_settlement and reverse_journal post journal rows as owner; assert_financial_authorization (owner-only helper) checks the exact authorization. Journal and ledger tables are SELECT-only for the runtime login.

- **LP-6c:** compare p_actor and p_tenant with the binding; same-actor, same-type processing receipt and exact approved authorization remain separate checks
- Sources: `packages/db/migrations/0012_job_activation.sql:67`
- Behavioural tests: `packages/db/test/ledger.integration.test.ts`, `packages/db/test/activation.integration.test.ts`

### `ap-lp13-invoice-number-burning` LP-13: invoice-number burning

reserve_customer_invoice_number(uuid) is executable by the runtime login and increments the per-tenant sequence without issuing an invoice (0017_customer_billing.sql:14).

- **LP-13:** numbers cannot corrupt issued records or create unbounded service trouble; any authority or money consequence retests under LP-8a
- Sources: `packages/db/migrations/0017_customer_billing.sql:14`
- Behavioural tests: `packages/db/test/UIWIRE-10.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`

### `ap-lp13-legacy-unknown-raiser` LP-13: legacy unknown raiser

record_legacy_builder_origin (0053_shared_money_origin.sql:122) records an unknown raiser for legacy variations; unknown actors and times remain explicitly unknown.

- **LP-13:** an unknown raiser is not verified attribution
- Sources: `packages/db/migrations/0053_shared_money_origin.sql:122`
- Behavioural tests: `packages/db/test/shared-money-origin.integration.test.ts`, `packages/db/test/small-builder-origin.integration.test.ts`

### `ap-lp13-scope-progress-actor` LP-13: scope progress actor

transition_scope_progress (0003_job_spine.sql:94) is runtime-executable and records progress with a caller-supplied reason.

- **LP-13:** progress cannot alter commitments or charges; cosmetic attribution is distinguished from authority
- Sources: `packages/db/migrations/0003_job_spine.sql:94`
- Behavioural tests: `packages/db/test/practice-scope.integration.test.ts`, `packages/db/test/job.integration.test.ts`

### `ap-lp13-sso-audit-connection` LP-13: SSO audit connection check

identity.sso_audit_append (0120_enterprise_identity.sql:238) appends audit rows for a connection supplied by the caller.

- **LP-13:** SSO cannot mix identity or tenant
- Sources: `packages/db/migrations/0120_enterprise_identity.sql:238`
- Behavioural tests: `packages/db/test/enterprise-identity.integration.test.ts`, `packages/db/test/sso-required.integration.test.ts`

### `ap-lp13-0095-replay-branch` LP-13: the 0095 replay branch

The replay branch of the thirteen-argument adopt_in_flight_job (0095_job_parties.sql:336) returns a previously recorded result.

- **LP-13:** replay cannot disclose results or duplicate effects
- Sources: `packages/db/migrations/0095_job_parties.sql:336`
- Behavioural tests: `packages/db/test/job-parties.integration.test.ts`, `packages/db/test/job-import.integration.test.ts`

## Source-inspected starting points and their disposition

| Starting point | Disposition in this inventory |
|---|---|
| `0000_tenancy.sql:82` account and membership direct writes | existing exception `x-membership-account-writes`; LP-1 (and LP-7) |
| `0001_audit.sql:89,91` audit head EXECUTE and audit INSERT | existing exceptions `x-audit-head-execute`, `x-audit-event-insert`; LP-4 and LP-6e |
| `0003_job_spine.sql:121` `transition_job` | existing exception `x-exec-transition-job`; LP-2 |
| ordinary `app.job` INSERT and imported-job guard (`0020_job_import.sql`) | `x-job-insert-and-terms` and path `ap-job-state`; LP-2; ordinary and imported paths and the caller-set `app.import_command` flag are named separately |
| `0005_commands.sql:76,79,80` | `x-command-authority-writes`; LP-5a/5b/5c; actor binding LP-6 |
| `UserCommandDispatcher` (`packages/db/src/commands.ts`) | path `ap-command-receipts`; creation, completion, authorization and audit writes are all direct writes today; LP-5a |
| `ExtraRepository` | path `ap-extra-receipts`, group `x-extra-writes`; LP-5b/5c and LP-8b |
| `SiteExtraRepository.logSiteExtra`, `siteExtraAuthoritySeam` | path `ap-extra-receipts` and `a-exec-site-extra-routines`; ENT-3a permission distinctions preserved (site logging by operatives, supervisors, surveyors; office recording by finance, admins, owners; client instructions by commercial managers, admins, owners) |
| legacy activation and acceptance signatures and callers | `x-exec-legacy-activation-acceptance`; LP-3; saved-v1 compatibility preserved |
| `0017_customer_billing.sql:8`, `0028_uiwire11_credit_notes.sql:14` | `x-customer-billing-writes`, `x-invoice-number-sequences`; LP-8a and LP-13 number impact |
| older `issue_practice_customer_invoice` and the lock-bound invoice route | both inventoried in `a-exec-checked-billing-money`; LP-8a |
| `0136_recovery_allocation.sql` | six allocation tables are SELECT-only for the runtime login (checked: no INSERT fact exists); `write_recovery_allocation` retained in `a-exec-recovery-money`; LP-8 |
| `identity.scim_deactivate(...)` (`0137`) | identity-only deactivation path, executable by `jobguard_identity` only; LP-7 coverage, not an invented missing implementation |
| `0138_practice_session_hardening.sql` | `a-exec-practice-session-trusted`; LP-6a/6d/10 reuse |
| owner-side audit writers (`append_final_lock_audit`, shadow-detection writers) | recorded as owner-only routines (not callable by the runtime login, proven by refusal); path `ap-audit-append` and `ap-shadow`; LP-4 and LP-6e |
| `apps/api/src/worker.ts`, outbox executor, shadow-detection composition | path `ap-worker-composition` and `x-outbox-writes`; LP-10 |
| `demo-seed.ts`, bootstrap and restore tooling | path `ap-seed-restore-bootstrap`; conversion belongs to LP-1, LP-8a and LP-9 |
| proposal-review full grants, evidence-upload UPDATE, scope and proposal column grants | `x-scope-proposal-writes`, `x-evidence-writes`; actual effects classified; LP-6d, LP-8b |
| LP-13 items: invoice-number burning, legacy unknown raiser, scope-progress actor, SSO audit connection check, 0095 replay branch | five explicit paths `ap-lp13-*` |

## Defaults, roles, views and system entry points

- **Defaults:** no explicit object-creator default privilege exists. PostgreSQL built-in defaults (functions PUBLIC EXECUTE unless revoked; types and languages PUBLIC USAGE; database PUBLIC CONNECT and TEMPORARY) are recorded separately as `default|builtin|...` facts. Defaults apply only to future objects and never repair existing ACLs (proven by a control).
- **Roles:** `jobguard_runtime`, `jobguard_migration`, `jobguard_infrastructure`, `jobguard_identity`, `jobguard_shadow`, `jobguard_shadow_emergency_access` are all NOINHERIT with no memberships and no elevated attributes; `postgres` is the disposable cluster bootstrap superuser.
- **Views:** four views (`ledger_balance` is a security_barrier view that is not security_invoker). Definition digest, options and base relations are compared facts.
- **System entry points:** the login can execute `pg_cancel_backend`, `pg_terminate_backend` and replication-slot functions by PostgreSQL default; each enforces its own role check inside. No file-reading or large-object function is executable.

## Held, open and not decided here

- **Held (Q2): LP0-13.** Detecting that a same-signature routine, helper or RLS policy changed its protection while ACLs did not, and its paired behavioural control. Not built; routine and RLS facts are recorded only.
- **Held (Q2): LP0-22.** Whole-task verdict and acceptance. This builder claims no whole-task completion.
- This inventory records what the database grants at the inspected base; it does not make customer data safe to load and is not a final least-privilege or customer-data gate.
- Held (Q2): detection of a same-signature routine, helper or RLS protection change with unchanged ACLs (LP0-13) and whole-task verdict and acceptance (LP0-22). Routine and RLS protection facts are recorded below and are NOT compared.
- PUBLIC TEMPORARY on the database lets the runtime login create temporary tables. Reachable SECURITY DEFINER routines pin search_path to pg_catalog and app without listing pg_temp last, so an unqualified relation reference inside one could resolve to a temporary table. Hypothesis from source inspection, untested here; assigned to LP-6d helper review.
- Static source scan (staticWrites, staticCalls) is a hypothesis aid, never proof of harmlessness; helpers called through dynamic SQL would not appear.
- Reads (SELECT) are not classified per table beyond RLS; their sensitivity is part of the LP-11 review.
- General owner creation, removal, transfer and recovery rights remain NEEDS A RULING; fee, tax, pricing, retention and safety policy are unchanged.
- Existing exceptions remain executable today and are reported as existing, not as refused.

## Rollback

Remove the LP-0 guard, inventory and design note through the ordinary reviewed code process. No migration, grant, role, routine, policy or trigger is installed, so there is no data rollback.
