-- CC-I1 (Enterprise R1, F1): rate-list import v2 with an optional per-item "what this rate includes" text.
-- The text is the contractor's own, typed from its contract, at most 1,000 characters (the bound of the
-- contract inclusion clause, ENTERPRISE-R1-F §4.2). It is stored once, against one rate item of one
-- rate-list version, in a tenant table under row-level security; audit payloads carry only its hash.
-- v1 (app.import_sor_version, 'sor-version-record.v1') is not changed. Existing rate items have no row
-- here and so read as having no includes text. Forward-only; no backfill.
BEGIN;

CREATE TABLE app.sor_item_includes (
 tenant_id uuid NOT NULL,
 version_id uuid NOT NULL,
 code text NOT NULL,
 includes_text text NOT NULL CHECK(char_length(includes_text) BETWEEN 1 AND 1000 AND includes_text=btrim(includes_text)
  AND includes_text !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
 includes_sha256 char(64) NOT NULL CHECK(includes_sha256=encode(public.digest(convert_to(includes_text,'UTF8'),'sha256'),'hex')),
 PRIMARY KEY(tenant_id,version_id,code),
 FOREIGN KEY(tenant_id,version_id,code) REFERENCES app.sor_item(tenant_id,version_id,code)
);
ALTER TABLE app.sor_item_includes OWNER TO jobguard_migration;
ALTER TABLE app.sor_item_includes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sor_item_includes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.sor_item_includes FOR ALL TO jobguard_migration,jobguard_runtime
 USING (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'')::uuid)
 WITH CHECK (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'')::uuid);
REVOKE ALL ON app.sor_item_includes FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT SELECT ON app.sor_item_includes TO jobguard_runtime;
-- Immutable, like the rate item it describes.
CREATE TRIGGER sor_item_includes_immutable BEFORE UPDATE OR DELETE ON app.sor_item_includes FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER sor_item_includes_no_truncate BEFORE TRUNCATE ON app.sor_item_includes FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- sor-version-record.v2: the v1 import (latest body, 0749) plus each item's optional includes text.
-- Same authority, mode, MON-8 feature, lock, replay and conflict rules; v1 and v2 share one command namespace,
-- so a command id first used by one version is a conflict under the other.
CREATE FUNCTION app.import_sor_version_v2(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; items jsonb:=coalesce(payload->'items','[]'::jsonb); prior app.sor_version; version uuid:=(payload->>'versionId')::uuid; schedule uuid:=(payload->>'scheduleId')::uuid; with_text integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.sor_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF payload->>'version' IS DISTINCT FROM 'sor-version-record.v2' OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 -- An includes value, when present, is a string; absent and JSON null both mean no text.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) i WHERE jsonb_typeof(i)<>'object' OR coalesce(jsonb_typeof(i->'includes'),'null') NOT IN('null','string')) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM app.sor_version WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>payload->>'requestHash' OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT count(*) INTO with_text FROM app.sor_item_includes WHERE tenant_id=t AND version_id=prior.id;
  RETURN jsonb_build_object('versionId',prior.id,'scheduleId',prior.schedule_id,'itemCount',prior.item_count,'includesCount',with_text,'effectiveFrom',prior.effective_from,'replayed',true);
 END IF;
 INSERT INTO app.schedule_of_rates(tenant_id,id,reference,actor_membership_id) VALUES(t,schedule,payload->>'scheduleReference',actor) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.sor_version(tenant_id,id,schedule_id,reference,effective_from,item_count,content_hash,command_id,request_hash,actor_membership_id)
 VALUES(t,version,schedule,payload->>'reference',(payload->>'effectiveFrom')::date,jsonb_array_length(items),payload->>'contentHash',(payload->>'commandId')::uuid,payload->>'requestHash',actor);
 INSERT INTO app.sor_item(tenant_id,version_id,code,description,unit,rate_pence,standard_minutes)
 SELECT t,version,i->>'code',i->>'description',i->>'unit',(i->>'ratePence')::bigint,nullif(i->>'standardMinutes','')::integer FROM jsonb_array_elements(items) i;
 -- The hash is computed here, never taken from the caller.
 INSERT INTO app.sor_item_includes(tenant_id,version_id,code,includes_text,includes_sha256)
 SELECT t,version,i->>'code',i->>'includes',encode(public.digest(convert_to(i->>'includes','UTF8'),'sha256'),'hex')
 FROM jsonb_array_elements(items) i WHERE jsonb_typeof(i->'includes')='string';
 GET DIAGNOSTICS with_text = ROW_COUNT;
 RETURN jsonb_build_object('versionId',version,'scheduleId',schedule,'itemCount',jsonb_array_length(items),'includesCount',with_text,'effectiveFrom',(payload->>'effectiveFrom')::date,'replayed',false);
END;
END
$$;
ALTER FUNCTION app.import_sor_version_v2(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.import_sor_version_v2(uuid,jsonb) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.import_sor_version_v2(uuid,jsonb) TO jobguard_runtime;

COMMIT;
