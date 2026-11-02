BEGIN;
-- Separate storage executor credentials; runtime must never be a member of this role.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_worm_executor') THEN
 CREATE ROLE jobguard_worm_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT jobguard_runtime TO jobguard_worm_executor;
-- DARK fixture admission is migration-owned; runtime cannot label real evidence synthetic.
CREATE TABLE app.worm_synthetic_version (
 tenant_id uuid NOT NULL, evidence_id uuid NOT NULL, job_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.evidence_object(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.worm_command (
 tenant_id uuid NOT NULL, id uuid NOT NULL, idempotency_key uuid NOT NULL,
 actor_id uuid NOT NULL, identity_user_id uuid NOT NULL,
 evidence_id uuid NOT NULL, job_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('apply_hold','release_hold','request_anchor')),
 payload jsonb NOT NULL, release_of uuid,
 object_key text NOT NULL, object_version_id text NOT NULL, imprint text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','executing','applied','pending','outcome_unknown','refused','cancelled')),
 result jsonb, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.worm_synthetic_version(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,release_of) REFERENCES app.worm_command(tenant_id,id),
 CHECK((action='release_hold')=(release_of IS NOT NULL))
);
CREATE TABLE app.worm_attempt (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, attempt integer NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('executing','applied','pending','outcome_unknown','refused')), result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id,attempt),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.worm_command(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['worm_synthetic_version','worm_command','worm_attempt'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;

CREATE FUNCTION app.worm_submit(c jsonb) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 m app.membership; e app.evidence_object; prior app.worm_command; h app.worm_command; answer app.worm_command;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||'/worm',0));
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR
 c - ARRAY['version','policyVersion','commandId','idempotencyKey','actorMembershipId','jobId','evidenceId','action'] -
 (CASE c->>'action' WHEN 'release_hold' THEN ARRAY['releaseOf'] WHEN 'request_anchor' THEN ARRAY['subject'] ELSE ARRAY[]::text[] END) <> '{}'::jsonb
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'version' IS DISTINCT FROM 'worm.command.v1' OR c->>'policyVersion' IS DISTINCT FROM 'synthetic_d07_v1'
 OR c->>'action' IS NULL OR c->>'action' NOT IN ('apply_hold','release_hold','request_anchor') THEN
 RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=(c->>'actorMembershipId')::uuid
 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM app.contractor_membership_revocation WHERE tenant_id=t AND membership_id=m.id)
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 -- The tenant-scoped lock also serializes same-key/different-command races.
 SELECT * INTO prior FROM app.worm_command WHERE tenant_id=t
 AND (id=(c->>'commandId')::uuid OR idempotency_key=(c->>'idempotencyKey')::uuid);
 IF FOUND THEN
 IF prior.payload<>c THEN RAISE EXCEPTION 'WORM_REPLAY_CONFLICT'; END IF;
 RETURN prior;
 END IF;
 SELECT o.* INTO e FROM app.evidence_object o JOIN app.worm_synthetic_version f
 ON (f.tenant_id,f.evidence_id,f.job_id)=(o.tenant_id,o.id,o.job_id)
 WHERE o.tenant_id=t AND o.id=(c->>'evidenceId')::uuid AND o.job_id=(c->>'jobId')::uuid;
 IF NOT FOUND OR e.object_key NOT LIKE 'synthetic/tenants/'||t::text||'/%'
 OR e.object_version_id IN ('','null') OR e.object_key ~ '(^|/)\.\.?(/|$)'
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='request_anchor' AND (e.evidence_type NOT IN ('manifest','checkpoint') OR c->>'subject' IS DISTINCT FROM e.evidence_type)
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='apply_hold' AND EXISTS(
 SELECT 1 FROM app.worm_command a WHERE a.tenant_id=t AND a.evidence_id=e.id AND a.action='apply_hold'
 AND a.status NOT IN ('cancelled','refused') AND NOT EXISTS(SELECT 1 FROM app.worm_command r
 WHERE r.tenant_id=t AND r.release_of=a.id AND r.status='applied'))
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='release_hold' THEN
 SELECT * INTO h FROM app.worm_command WHERE tenant_id=t AND id=(c->>'releaseOf')::uuid
 AND evidence_id=e.id AND job_id=e.job_id AND action='apply_hold' AND status='applied';
 IF NOT FOUND OR h.identity_user_id=m.identity_user_id OR EXISTS(SELECT 1 FROM app.worm_command
 WHERE tenant_id=t AND release_of=h.id AND status NOT IN ('cancelled','refused')) THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 END IF;
 INSERT INTO app.worm_command(tenant_id,id,idempotency_key,actor_id,identity_user_id,evidence_id,job_id,action,payload,release_of,object_key,object_version_id,imprint)
 VALUES(t,(c->>'commandId')::uuid,(c->>'idempotencyKey')::uuid,m.id,m.identity_user_id,e.id,e.job_id,c->>'action',c,
 (c->>'releaseOf')::uuid,e.object_key,e.object_version_id,e.sha256) RETURNING * INTO answer;
 RETURN answer;
END $$;

CREATE FUNCTION app.worm_claim(cid uuid) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.worm_command;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||'/worm',0));
 SELECT * INTO c FROM app.worm_command WHERE tenant_id=t AND id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c.status NOT IN ('queued','pending') THEN RETURN c; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=c.actor_id
 AND m.identity_user_id=c.identity_user_id AND m.role='owner' AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id) FOR SHARE;
 IF NOT FOUND THEN UPDATE app.worm_command SET status='cancelled' WHERE tenant_id=t AND id=cid RETURNING * INTO c;
 RETURN c; END IF;
 UPDATE app.worm_command SET status='executing',attempts=attempts+1 WHERE tenant_id=t AND id=cid RETURNING * INTO c;
 INSERT INTO app.worm_attempt(tenant_id,command_id,attempt,outcome,result) VALUES(t,cid,c.attempts,'executing','{}'::jsonb);
 RETURN c;
END $$;

CREATE FUNCTION app.worm_finish(cid uuid, n integer, outcome text, material jsonb) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.worm_command;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||'/worm',0));
 SELECT * INTO c FROM app.worm_command WHERE tenant_id=t AND id=cid FOR UPDATE;
 IF NOT FOUND OR c.status<>'executing' OR c.attempts<>n THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF outcome IS NULL OR material IS NULL OR outcome NOT IN ('applied','pending','outcome_unknown','refused') OR
 (c.action<>'request_anchor' AND outcome='pending') OR
 (c.action='request_anchor' AND outcome='applied' AND
 (material->>'status' IS DISTINCT FROM 'anchored' OR material->>'token' IS NULL OR material->>'query' IS NULL
 OR material->>'certificatePem' IS NULL OR material->>'caCertificatePem' IS NULL))
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 UPDATE app.worm_attempt SET outcome=worm_finish.outcome,result=material WHERE tenant_id=t AND command_id=cid AND attempt=n;
 UPDATE app.worm_command SET status=outcome,result=material WHERE tenant_id=t AND id=cid RETURNING * INTO c;
 RETURN c;
END $$;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['app.worm_submit(jsonb)','app.worm_claim(uuid)','app.worm_finish(uuid,integer,text,jsonb)'] LOOP
 EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO jobguard_migration';
 EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO '||
 (CASE WHEN signature='app.worm_submit(jsonb)' THEN 'jobguard_runtime' ELSE 'jobguard_worm_executor' END);
 END LOOP;
END $$;
-- No deletion/expiry API exists for admitted verified versions. Existing registered
-- evidence is immutable and orphan cleanup excludes it. D07 conflict resolution refused.
COMMIT;
