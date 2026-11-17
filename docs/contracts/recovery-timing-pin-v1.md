# Recovery timing pin v1 — STORED-TIMES-1

Migration 0127 pins `created_at` on every insert into `app.recovery_case` and `app.practice_feed_event` to `transaction_timestamp()`. These are the two stored times compared by the before-opening rule in 0119 and `RecoveryEligibilityV3Repository`. A raw writer's back-dating attempt cannot store a chosen time. Every inserting role is pinned, including `jobguard_migration` and a superuser in ordinary mode. The owner has no exemption: the merged `app.configure_recovery_demo` definer routine (0023:17–24) inserts as that owner and omits the time, like every merged product and test insert at base 4564e88.

Both ordinary BEFORE INSERT row triggers are named `a_recovery_timing_pin`. PostgreSQL orders triggers for the same event by name; this name fires before the merged guards:

| Table | Trigger inventory after 0127 | First BEFORE INSERT trigger |
| --- | --- | --- |
| app.recovery_case | a_recovery_timing_pin (INSERT); recovery_message_source_write (INSERT/UPDATE/DELETE); recovery_immutable (UPDATE/DELETE) | a_recovery_timing_pin |
| app.practice_feed_event | a_recovery_timing_pin (INSERT); practice_feed_event_guard (INSERT) | a_recovery_timing_pin |

The new SECURITY INVOKER function has `search_path=pg_catalog`, reads no table and takes no lock. PUBLIC/runtime EXECUTE is revoked; inserting roles need no EXECUTE grant for trigger execution. No existing routine, hash, grant, policy, constraint, default or column changes. The prefix follows 0096's `a_watchdog_live_before_insert` and 0110's `a_work_order_job_guard`.

The feed guard is untouched: 0106:115–221 never reads or writes `created_at`. Its hash uses thirteen named fields and omits the time (0106:200–201):

```sql
IF NEW.source_hash<>encode(sha256(convert_to(concat_ws('|',NEW.version,NEW.environment,NEW.tenant_id::text,NEW.job_id::text,NEW.account_id::text,
      NEW.event_id,NEW.event_kind,NEW.movement_key,NEW.identity,NEW.representation_id,NEW.gross_pence::text,NEW.currency,NEW.state),'UTF8')),'hex')
```

The repository uses the same fields (`practice-feed-repository.ts:248`). The case source guard only takes its existing advisory lock and returns the row (0107:247–252):

```sql
BEGIN
 PERFORM app.lock_recovery_message_sources(coalesce(NEW.tenant_id,OLD.tenant_id));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
```

A pin that assigns only `created_at` leaves both guards' inputs and effects intact.

Can the runtime role change either time after insert? No. Re-derived from every registered migration through 0122 at base 4564e88:

| Role | app.recovery_case later changes | app.practice_feed_event later changes |
| --- | --- | --- |
| jobguard_runtime | UPDATE/DELETE denied, 42501: 0018:85 and 0034:4 | UPDATE/DELETE denied, 42501: 0106:106–107 |
| jobguard_migration (owner) | recovery_immutable calls reject_recovery_mutation, 55000, `recovery history is append-only`: 0018:76,85 | Owner CAN UPDATE/DELETE; no append-only trigger |
| jobguard_infrastructure | SELECT/INSERT/UPDATE denied, 42501: no app schema access, 0000:88–89 | Same |
| jobguard_identity | SELECT/INSERT/UPDATE denied, 42501: no app schema access, 0111:181 | Same |
| PUBLIC | No app schema access, 0000:24,80 | Same; table grants also revoked by 0106:106 |

The feed's privilege-only guard is enough for the business-runtime boundary here: runtime is a non-owner, cannot grant itself privileges or assume the owner role, and the merged practice-feed catalog test (637–641) requires exactly SELECT/INSERT and rejects later mutation grants. No other non-owner application role has effective UPDATE privilege, including column grants or a definer routine exposing a time change. The owner and superuser remain privileged actors and can remove a trigger anyway. No UPDATE guard is added. RLS still requires tenant context for owner/runtime; it is not the mutation guard. This describes migration-defined privileges, not uninspected deployed grants.

The trigger is ordinary (`tgenabled='O'`), not ALWAYS: a superuser in replica mode can skip it, as with the merged guards. Existing superuser UPDATE time seeding in `recovery-eligibility-v3.integration.test.ts:193–201` remains possible; this trigger only runs on INSERT. The restore rehearsal copies the cleanly stopped whole cluster (`synthetic-restore.mjs:205–211`), so it runs no triggers and preserves stored times.

Times stored before this migration are left exactly as they are; no history is rewritten. Correction is by a later reviewed migration, preserving history. Synthetic only: no provider action, fee posting or release authorization arises from this change.

After this pin a raw writer can still back-date by as long as it keeps its own transaction open, because the stored time is the transaction's start. That is bounded, needs raw database access, and is not closed by this order.
