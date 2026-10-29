BEGIN;
-- MON-8-P-B slice 1. No data backfill and no changes to retained-read predicates.
CREATE FUNCTION app.mon8_require_operative_agreement(t uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE assignment app.commercial_track_assignment; agreement_status text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Lock first; subsequent queries use a fresh READ COMMITTED snapshot after any wait.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 SELECT status INTO agreement_status FROM app.contractor_agreement_status_revision
 WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
 IF assignment.commercial_track IS DISTINCT FROM 'contractor' OR agreement_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
END $$;
ALTER FUNCTION app.mon8_require_operative_agreement(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_require_operative_agreement(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.mon8_operative_write_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='extra_origin' THEN
  IF NEW.kind IN('site_user','jobguard_surfaced_confirmed') THEN
   PERFORM app.mon8_require_operative_agreement(NEW.tenant_id);
  END IF;
 ELSIF NEW.role='operative' THEN
  IF TG_OP='UPDATE' THEN
   -- Revocation/expiry updates and historical reads still work after agreement loss.
   IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN RETURN NEW; END IF;
  END IF;
  PERFORM app.mon8_require_operative_agreement(NEW.tenant_id);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon8_operative_write_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_operative_write_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER mon8_operative_membership BEFORE INSERT OR UPDATE ON app.membership FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
CREATE TRIGGER mon8_operative_grant BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
CREATE TRIGGER mon8_operative_invitation BEFORE INSERT ON identity.invitation FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
-- Run before existing provenance triggers, including for a forged job_track value.
CREATE TRIGGER extra_origin_00_entitlement BEFORE INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();

-- All status writers, including fixture owners, serialize with admitted writes.
CREATE OR REPLACE FUNCTION app.mon8_agreement_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AGREEMENT_STATUS_IMMUTABLE'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,54));
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.start_contractor_practice(s uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; u uuid; a uuid; m uuid; r uuid; b uuid; team_id uuid; assignment uuid; digest char(64); reading timestamptz; home timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s::text,55));
 SELECT x.tenant_id INTO t FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s);
 IF t IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM app.contractor_practice_session_live(s)) THEN RETURN t; END IF;
  RETURN '00000000-0000-0000-0000-000000000000'::uuid;
 END IF;
 digest:=app.contractor_practice_session_digest(s); reading:=clock_timestamp(); home:=app.contractor_practice_home_deadline(digest,reading);
 IF home='-infinity'::timestamptz THEN RETURN '00000000-0000-0000-0000-000000000000'::uuid; END IF;
 t:=gen_random_uuid(); u:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid(); r:=gen_random_uuid(); b:=gen_random_uuid(); team_id:=gen_random_uuid(); assignment:=gen_random_uuid();
 PERFORM set_config('app.tenant_id',t::text,true);
 INSERT INTO control_plane.tenant(id) VALUES(t); INSERT INTO identity.identity_user(id) VALUES(u);
 INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'Fictional contractor');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
 INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES(gen_random_uuid(),t,m,u,digest,reading,LEAST(home,reading+interval '7 days'));
 PERFORM app.assign_commercial_track(t,assignment,'contractor','synthetic-agreement:'||t,0,'operations:synthetic-generator');
 -- An explicit fictional agreement fact for NEW generated practice organisations only.
 INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
 VALUES(t,gen_random_uuid(),assignment,1,'active','contractor-agreement-status.v1','synthetic_demo','fictional-fixture:'||t);
 INSERT INTO app.contractor_member VALUES(t,m,NULL,'owner@fictional.invalid');
 INSERT INTO app.org_unit VALUES(t,t,'tenant',NULL,NULL,'Fictional contractor'),(t,r,'region',t,'tenant','Fictional region'),(t,b,'branch',r,'region','Fictional branch');
 INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,team_id,b,'Fictional team');
 INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),m,'owner','tenant',t,NULL);
 RETURN t;
END $$;

COMMIT;
