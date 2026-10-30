BEGIN;
-- Operator credentials are provisioned separately. Neither runtime nor storage
-- executors inherit this role. It grants no storage-write or command-executor rights.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_worm_operator') THEN
 CREATE ROLE jobguard_worm_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
 END IF;
END $$;
-- Recovery needs no direct table reads: both routines return the scoped receipt.
GRANT USAGE ON SCHEMA app TO jobguard_worm_operator;
-- PUBLIC execute would otherwise expose unrelated routines through app USAGE.
-- Preserve access for the existing app-schema roles, without granting it to operators.
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'app.assert_journal_balanced()',
  'app.guard_authorization_revocation()',
  'app.guard_fixed_baseline()',
  'app.guard_imported_job()',
  'app.half_even_ratio(bigint,bigint,bigint)',
  'app.reference_recovery_cap(bigint)',
  'app.reject_audit_mutation()',
  'app.reject_capture_mutation()',
  'app.reject_evidence_object_mutation()',
  'app.reject_immutable_authorization_record()',
  'app.reject_immutable_commercial_mutation()',
  'app.reject_ledger_mutation()',
  'app.reject_mandatory_finding_suppression()',
  'app.reject_recovery_mutation()',
  'app.require_approved_resolution()',
  'app.review_invalidated_recovery_evidence()',
  'app.signal_outbox()'] LOOP
 EXECUTE 'REVOKE EXECUTE ON FUNCTION '||signature||' FROM PUBLIC';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_meter,jobguard_meter_owner,jobguard_migration';
 END LOOP;
END $$;

CREATE FUNCTION app.worm_recovery_target(cid uuid) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.worm_command;
BEGIN
 SELECT * INTO c FROM app.worm_command WHERE tenant_id=t AND id=cid;
 IF NOT FOUND OR c.action NOT IN ('apply_hold','release_hold')
 OR c.status NOT IN ('executing','outcome_unknown','applied') OR c.attempts<1
 OR c.object_key NOT LIKE 'synthetic/tenants/'||t::text||'/%'
 OR c.object_version_id IN ('','null')
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 RETURN c;
END $$;

CREATE FUNCTION app.worm_reconcile(cid uuid, n integer, observed_held boolean) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.worm_command;
 outcome text; material jsonb; seq bigint; prev text; ts timestamptz;
 payload jsonb; ph text; eh text; operator_ref text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||'/worm',0));
 SELECT * INTO c FROM app.worm_command WHERE tenant_id=t AND id=cid FOR UPDATE;
 IF NOT FOUND OR c.action NOT IN ('apply_hold','release_hold') OR n IS NULL OR c.attempts<>n
 OR c.status NOT IN ('executing','outcome_unknown','applied') OR c.attempts<1
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c.status='applied' THEN RETURN c; END IF;
 -- Readback can confirm only this exact command's intended hold state. Absence,
 -- failure or mismatch never queues another mutation, release, overwrite or delete.
 outcome := CASE WHEN observed_held IS NOT NULL AND observed_held=(c.action='apply_hold')
 THEN 'applied' ELSE 'outcome_unknown' END;
 material := jsonb_build_object('status',outcome,'reason',
 CASE WHEN outcome='applied' THEN 'operator_readback_confirmed' ELSE 'operator_readback_unresolved' END);
 UPDATE app.worm_attempt SET outcome=worm_reconcile.outcome,result=material
 WHERE tenant_id=t AND command_id=cid AND attempt=n;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 UPDATE app.worm_command SET status=outcome,result=material WHERE tenant_id=t AND id=cid RETURNING * INTO c;
 -- Domain rows are locked/updated before taking the audit head lock.
 operator_ref:='worm-operator:'||encode(sha256(convert_to(session_user::text,'UTF8')),'hex');
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('command',c.id,'action',c.action,'status',c.status),
  'hashes',jsonb_build_object('imprint',trim(c.imprint)));
 ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,operator_ref,
  'worm.reconciled','evidence',c.evidence_id::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,
  occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1',operator_ref,'worm.reconciled','evidence',c.evidence_id::text,
  ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN c;
END $$;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['app.worm_recovery_target(uuid)','app.worm_reconcile(uuid,integer,boolean)'] LOOP
 EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO jobguard_migration';
 EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO jobguard_worm_operator';
 END LOOP;
END $$;
-- Forward fix only: unresolved commands remain blocked. Never roll back by deleting
-- WORM receipts, reversing storage protection or weakening the existing executor.
COMMIT;
