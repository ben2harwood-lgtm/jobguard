BEGIN;
-- Operator credentials are provisioned separately. Neither runtime nor storage
-- executors inherit this role. It grants no storage-write or command-executor rights.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_worm_operator') THEN
 CREATE ROLE jobguard_worm_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT jobguard_runtime TO jobguard_worm_operator;

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
 outcome text; material jsonb;
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
