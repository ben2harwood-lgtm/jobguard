-- Q12 / V2-F6. Local practice only; no change to the existing approval command.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'jobguard_v2_local' THEN RAISE EXCEPTION 'V2_DATABASE_REQUIRED'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS app.v2_customer_extra_link (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL,
 firm_key text NOT NULL, firm_digest text NOT NULL CHECK(firm_digest ~ '^[a-f0-9]{64}$'),
 variation_id uuid NOT NULL, revision_id uuid NOT NULL, variation_version integer NOT NULL,
 amount text NOT NULL CHECK(amount ~ '^-?(0|[1-9][0-9]*)\.[0-9]{2}$'),
 content_hash text NOT NULL, description text NOT NULL, photos jsonb NOT NULL DEFAULT '[]',
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_membership_id uuid NOT NULL, create_fingerprint text NOT NULL,
 link_version integer NOT NULL DEFAULT 1 CHECK(link_version IN(1,2)),
 cancelled_at timestamptz, cancel_command_id uuid, cancel_fingerprint text,
 agreed_at timestamptz, agreed_by text, agree_command_id uuid, agree_fingerprint text,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(NOT(cancelled_at IS NOT NULL AND agreed_at IS NOT NULL)),
 CHECK((agreed_at IS NULL)=(agreed_by IS NULL))
);
ALTER TABLE app.v2_customer_extra_link OWNER TO jobguard_migration;
ALTER TABLE app.v2_customer_extra_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.v2_customer_extra_link FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='app.v2_customer_extra_link'::regclass AND polname='v2_f6_runtime') THEN
 CREATE POLICY v2_f6_runtime ON app.v2_customer_extra_link TO jobguard_runtime
 USING(tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key()
  AND EXISTS(SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_customer_extra_link.tenant_id,v2_customer_extra_link.job_id)))
 WITH CHECK(tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key()
  AND EXISTS(SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_customer_extra_link.tenant_id,v2_customer_extra_link.job_id)));
 -- The narrow token functions below must locate one capability before tenant binding.
 CREATE POLICY v2_f6_owner ON app.v2_customer_extra_link TO jobguard_migration USING(true) WITH CHECK(true);
 END IF;
END $$;
REVOKE ALL ON app.v2_customer_extra_link FROM PUBLIC,jobguard_identity,jobguard_worker,jobguard_shadow;
GRANT SELECT,INSERT,UPDATE ON app.v2_customer_extra_link TO jobguard_runtime;

-- Runtime may only cancel a pending link. Agreement is written by the narrow
-- migration-owner capability function; all saved commercial content is immutable.
CREATE OR REPLACE FUNCTION app.v2_f6_guard_update() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_user='jobguard_runtime' AND (
  OLD.cancelled_at IS NOT NULL OR OLD.agreed_at IS NOT NULL OR OLD.link_version<>1
  OR NEW.cancelled_at IS NULL OR NEW.cancel_command_id IS NULL OR NEW.cancel_fingerprint IS NULL
  OR NEW.link_version<>2
  OR (to_jsonb(NEW)-ARRAY['cancelled_at','cancel_command_id','cancel_fingerprint','link_version'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cancelled_at','cancel_command_id','cancel_fingerprint','link_version'])
 ) THEN RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.v2_f6_guard_update() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_guard_update() FROM PUBLIC;
CREATE OR REPLACE TRIGGER v2_f6_guard_update BEFORE UPDATE ON app.v2_customer_extra_link
 FOR EACH ROW EXECUTE FUNCTION app.v2_f6_guard_update();

-- A new link is always pending: no insert may arrive already agreed or cancelled,
-- so agreement only ever comes through app.v2_f6_agree and its checks and audit.
CREATE OR REPLACE FUNCTION app.v2_f6_guard_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.link_version<>1 OR NEW.cancelled_at IS NOT NULL OR NEW.cancel_command_id IS NOT NULL
  OR NEW.cancel_fingerprint IS NOT NULL OR NEW.agreed_at IS NOT NULL OR NEW.agreed_by IS NOT NULL
  OR NEW.agree_command_id IS NOT NULL OR NEW.agree_fingerprint IS NOT NULL
 THEN RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 -- Every saved photo locator must be this job's own verified, valid image evidence,
 -- copied exactly, so the anonymous photo endpoint can never read another job's object.
 IF jsonb_typeof(NEW.photos)<>'array' OR EXISTS(
  SELECT FROM jsonb_array_elements(NEW.photos) p
  WHERE jsonb_typeof(p)<>'object'
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k)
      <>ARRAY['contentType','id','objectKey','objectVersionId','sha256']
   OR NOT EXISTS(SELECT FROM app.evidence_object e
    WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id::text=p->>'id' AND e.kind='original'
     AND e.object_key=p->>'objectKey' AND e.object_version_id=p->>'objectVersionId'
     AND e.sha256=p->>'sha256' AND e.content_type=p->>'contentType'
     AND e.content_type IN('image/jpeg','image/png','image/webp') AND e.server_verified_at IS NOT NULL
     AND NOT EXISTS(SELECT FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))))
  OR (SELECT count(*) FROM jsonb_array_elements(NEW.photos))
     <>(SELECT count(DISTINCT p->>'id') FROM jsonb_array_elements(NEW.photos) p)
 THEN RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.v2_f6_guard_insert() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_guard_insert() FROM PUBLIC;
CREATE OR REPLACE TRIGGER v2_f6_guard_insert BEFORE INSERT ON app.v2_customer_extra_link
 FOR EACH ROW EXECUTE FUNCTION app.v2_f6_guard_insert();

-- LP-11 has removed GUC-only tenant authority. These policies give only the
-- private migration-owner functions token-scoped reads; runtime gains no access
-- to any existing business table. The capability hash is never a tenant selector.
CREATE OR REPLACE FUNCTION app.v2_f6_scope(t uuid,j uuid,v uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT current_database()='jobguard_v2_local' AND EXISTS(
  SELECT FROM app.v2_customer_extra_link l WHERE l.tenant_id=t AND l.job_id=j
  AND (v IS NULL OR l.variation_id=v) AND l.token_hash=current_setting('app.v2_f6_hash',true)
  AND l.firm_digest=current_setting('app.v2_f6_firm',true))
$$;
ALTER FUNCTION app.v2_f6_scope(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_scope(uuid,uuid,uuid) FROM PUBLIC;
DO $$ DECLARE rel text; BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_f6_capability_read') THEN
 CREATE POLICY v2_f6_capability_read ON app.job FOR SELECT TO jobguard_migration
 USING(app.v2_f6_scope(tenant_id,id));
 FOREACH rel IN ARRAY ARRAY['variation','variation_revision','variation_rejection','evidence_object','synthetic_evidence_original'] LOOP
  EXECUTE format('CREATE POLICY v2_f6_capability_read ON app.%I FOR SELECT TO jobguard_migration
   USING(app.v2_f6_scope(tenant_id,job_id))',rel);
 END LOOP;
 CREATE POLICY v2_f6_capability_read ON app.evidence_invalidation FOR SELECT TO jobguard_migration
 USING(EXISTS(SELECT FROM app.evidence_object e WHERE (e.tenant_id,e.id)=(evidence_invalidation.tenant_id,evidence_invalidation.evidence_id)
  AND app.v2_f6_scope(e.tenant_id,e.job_id)));
 -- SELECT FOR UPDATE checks USING. WITH CHECK false disallows writes here.
 CREATE POLICY v2_f6_capability_lock ON app.variation FOR UPDATE TO jobguard_migration
 USING(app.v2_f6_scope(tenant_id,job_id,id)) WITH CHECK(false);
 END IF;
END $$;

-- Capability lookup exposes only the saved version. No customer session or builder
-- impersonation is created. The agreement is a claim, never a commercial approval.
CREATE OR REPLACE FUNCTION app.v2_f6_open(f text,h text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE l app.v2_customer_extra_link; v app.variation; r app.variation_revision;
BEGIN
 IF current_database()<>'jobguard_v2_local' OR f !~ '^[a-f0-9]{64}$' OR h !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM app.v2_customer_extra_link WHERE token_hash=h AND firm_digest=f;
 IF NOT FOUND OR l.cancelled_at IS NOT NULL OR l.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',l.tenant_id::text,true);
 PERFORM set_config('app.v2_f6_hash',h,true);
 PERFORM set_config('app.v2_f6_firm',f,true);
 SELECT * INTO v FROM app.variation WHERE tenant_id=l.tenant_id AND job_id=l.job_id AND id=l.variation_id;
 SELECT * INTO r FROM app.variation_revision WHERE tenant_id=l.tenant_id AND job_id=l.job_id AND id=l.revision_id AND variation_id=l.variation_id;
 IF v.current_revision_id IS DISTINCT FROM l.revision_id OR v.state NOT IN('priced','approved')
  OR r.content_hash IS DISTINCT FROM l.content_hash OR r.revision IS DISTINCT FROM l.variation_version
  OR to_char(r.signed_delta_pence::numeric/100,'FM999999999999999990.00') IS DISTINCT FROM l.amount
  OR NOT EXISTS(SELECT FROM app.job WHERE tenant_id=l.tenant_id AND id=l.job_id AND status='live')
  OR EXISTS(SELECT FROM app.variation_rejection WHERE tenant_id=l.tenant_id AND revision_id=l.revision_id)
  OR EXISTS(SELECT FROM jsonb_array_elements(l.photos) p JOIN app.evidence_invalidation i
    ON i.tenant_id=l.tenant_id AND i.evidence_id=(p->>'id')::uuid)
 THEN RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(l);
END $$;
ALTER FUNCTION app.v2_f6_open(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_open(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.v2_f6_open(text,text) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.v2_f6_agree(f text,h text,c uuid,fp text,n text,expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE l app.v2_customer_extra_link; result jsonb;
BEGIN
 result:=app.v2_f6_open(f,h);
 -- Same lock order as the builder: variation, then link. Re-read after waiting.
 PERFORM 1 FROM app.variation WHERE tenant_id=(result->>'tenant_id')::uuid AND id=(result->>'variation_id')::uuid FOR UPDATE;
 SELECT * INTO l FROM app.v2_customer_extra_link WHERE token_hash=h AND firm_digest=f FOR UPDATE;
 result:=app.v2_f6_open(f,h);
 IF l.agree_command_id=c THEN
  IF l.agree_fingerprint<>fp THEN RAISE EXCEPTION 'LINK_COMMAND_CONFLICT'; END IF;
  RETURN result || '{"replayed":true}'::jsonb;
 END IF;
 IF l.link_version<>expected OR l.agreed_at IS NOT NULL OR expected<>1 OR length(btrim(n)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE app.v2_customer_extra_link SET agreed_at=clock_timestamp(),agreed_by=n,
  agree_command_id=c,agree_fingerprint=fp,link_version=2 WHERE tenant_id=l.tenant_id AND id=l.id RETURNING * INTO l;
 PERFORM set_config('app.v2_f6_command',c::text,true);
 RETURN to_jsonb(l) || '{"replayed":false}'::jsonb;
END $$;
ALTER FUNCTION app.v2_f6_agree(text,text,uuid,text,text,integer) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_agree(text,text,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.v2_f6_agree(text,text,uuid,text,text,integer) TO jobguard_runtime;
-- Anonymous claims have no request binding. Allow the existing audit sealer
-- only this capability's recorded agreement and tenant head, not arbitrary rows.
CREATE OR REPLACE FUNCTION app.v2_f6_audit_scope(t uuid,subject text DEFAULT NULL,command text DEFAULT NULL) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT current_database()='jobguard_v2_local' AND EXISTS(
  SELECT FROM app.v2_customer_extra_link l WHERE l.tenant_id=t
  AND l.token_hash=current_setting('app.v2_f6_hash',true) AND l.firm_digest=current_setting('app.v2_f6_firm',true)
  AND l.agreed_at IS NOT NULL AND l.agree_command_id::text=current_setting('app.v2_f6_command',true)
  AND (subject IS NULL OR l.id::text=subject) AND (command IS NULL OR l.agree_command_id::text=command))
$$;
ALTER FUNCTION app.v2_f6_audit_scope(uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_audit_scope(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.v2_f6_audit_scope(uuid,text,text) TO jobguard_audit_writer;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='audit_control.audit_head'::regclass AND polname='v2_f6_claim_head') THEN
 CREATE POLICY v2_f6_claim_head ON audit_control.audit_head TO jobguard_audit_writer
 USING(app.v2_f6_audit_scope(tenant_id)) WITH CHECK(app.v2_f6_audit_scope(tenant_id));
 CREATE POLICY v2_f6_claim_event ON app.audit_event TO jobguard_audit_writer
 USING(event_type='v2.customer_extra_link.agreed' AND subject_type='customer_extra_link'
  AND app.v2_f6_audit_scope(tenant_id,subject_ref,payload->'references'->>'commandId'))
 WITH CHECK(event_type='v2.customer_extra_link.agreed' AND subject_type='customer_extra_link'
  AND app.v2_f6_audit_scope(tenant_id,subject_ref,payload->'references'->>'commandId'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION app.v2_f6_photo(f text,h text,p uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE l jsonb; photo jsonb; result jsonb;
BEGIN
 l:=app.v2_f6_open(f,h);
 SELECT value INTO photo FROM jsonb_array_elements(l->'photos') WHERE value->>'id'=p::text;
 IF photo IS NULL THEN RAISE EXCEPTION 'LINK_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('bytes',encode(o.bytes,'base64'),'contentType',o.content_type) INTO result
 FROM app.synthetic_evidence_original o WHERE o.tenant_id=(l->>'tenant_id')::uuid AND o.job_id=(l->>'job_id')::uuid
 AND o.object_key=photo->>'objectKey' AND o.object_version_id=photo->>'objectVersionId';
 RETURN result;
END $$;
ALTER FUNCTION app.v2_f6_photo(text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_f6_photo(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.v2_f6_photo(text,text,uuid) TO jobguard_runtime;
COMMIT;
