BEGIN;

-- Reference-only fixture validation. This selects no production staleness policy.
CREATE FUNCTION app.valid_prevention_result(value jsonb,p_kind text,p_source text,p_name text,p_retrieved timestamptz)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE maximum integer; expected_source text; expected_name text; observed timestamptz; evaluated timestamptz; expected_status text; expected_reason text; fact text;
BEGIN
 expected_source:=CASE p_kind
  WHEN 'listed_building' THEN 'synthetic-listed-building.v1' WHEN 'conservation_area' THEN 'synthetic-conservation-area.v1'
  WHEN 'article_4' THEN 'synthetic-article-4.v1' WHEN 'planning_history' THEN 'synthetic-planning-history.v1'
  WHEN 'flood' THEN 'synthetic-flood.v1' WHEN 'company' THEN 'synthetic-companies-house-card.v1'
  WHEN 'companies_house_feed' THEN 'synthetic-companies-house-feed.v1' WHEN 'gazette_feed' THEN 'synthetic-gazette-feed.v1' END;
 expected_name:=CASE p_kind WHEN 'planning_history' THEN 'Generated planning history (synthetic)' WHEN 'flood' THEN 'Generated flood register (synthetic)'
  WHEN 'company' THEN 'Companies House (synthetic)' WHEN 'companies_house_feed' THEN 'Companies House (synthetic)' WHEN 'gazette_feed' THEN 'The Gazette (synthetic)'
  ELSE 'Generated property register (synthetic)' END;
 maximum:=CASE WHEN p_kind IN('flood','companies_house_feed','gazette_feed') THEN 180 ELSE 1440 END;
 IF value IS NULL OR jsonb_typeof(value)<>'object' OR expected_source IS NULL THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(value))<>13 OR NOT value ?& ARRAY['kind','source','retrievedAt','observedAt','fact','evaluatedAt','version','environment','policyVersion','referenceOnly','maximumAgeMinutes','status','reason'] THEN RETURN false; END IF;
 IF NOT coalesce(value->>'version'='prevention-result.v1' AND value->>'environment'='synthetic_demo'
  AND value->>'policyVersion'='prevention-staleness-reference.v1' AND value->'referenceOnly'='true'::jsonb
  AND value->'maximumAgeMinutes'=to_jsonb(maximum) AND value->>'kind'=p_kind
  AND value->'source'=jsonb_build_object('id',expected_source,'name',expected_name)
  AND p_source=expected_source AND p_name=expected_name
  AND value->>'retrievedAt' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$'
  AND value->>'evaluatedAt' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$'
  AND (value->>'retrievedAt')::timestamptz=p_retrieved AND isfinite(p_retrieved),false) THEN RETURN false; END IF;
 fact:=value->>'fact';evaluated:=(value->>'evaluatedAt')::timestamptz;
 IF value->'fact'<>'null'::jsonb AND (jsonb_typeof(value->'fact')<>'string' OR fact NOT IN('constraint','no_record','company_active','company_attention','feed_event','no_event')) THEN RETURN false; END IF;
 IF value->'observedAt'<>'null'::jsonb AND NOT coalesce(value->>'observedAt' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$',false) THEN RETURN false; END IF;
 observed:=(value->>'observedAt')::timestamptz;
 IF fact IS NULL OR observed IS NULL THEN expected_status:='unknown';expected_reason:='missing';
 ELSIF p_retrieved>evaluated OR observed>p_retrieved THEN expected_status:='unknown';expected_reason:='future';
 ELSIF evaluated-observed>make_interval(mins=>maximum) THEN expected_status:='unknown';expected_reason:='stale';
 ELSE expected_status:=CASE WHEN fact IN('constraint','company_attention','feed_event') THEN 'advisory' ELSE 'clear' END;expected_reason:='current'; END IF;
 RETURN coalesce(value->>'status'=expected_status AND value->>'reason'=expected_reason,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER FUNCTION app.valid_prevention_result(jsonb,text,text,text,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.valid_prevention_result(jsonb,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_prevention_result(jsonb,text,text,text,timestamptz) TO jobguard_runtime;

CREATE TABLE app.property_constraint_fact (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,binding_id uuid NOT NULL,site_revision_id uuid NOT NULL,command_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('listed_building','conservation_area','article_4','planning_history','flood')),
 source_id text NOT NULL,source_name text NOT NULL,retrieved_at timestamptz NOT NULL,result jsonb NOT NULL,audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id,kind),
 FOREIGN KEY(tenant_id,job_id,binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,site_revision_id) REFERENCES app.site_revision(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(app.valid_prevention_result(result,kind,source_id,source_name,retrieved_at))
);
CREATE TABLE app.counterparty_check (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,binding_id uuid NOT NULL,customer_revision_id uuid NOT NULL,command_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('company','companies_house_feed','gazette_feed','watch_start','watch_stop')),watch_revision integer NOT NULL CHECK(watch_revision>=0),
 source_id text NOT NULL,source_name text NOT NULL,retrieved_at timestamptz NOT NULL,result jsonb,audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id,kind),
 FOREIGN KEY(tenant_id,job_id,binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,customer_revision_id) REFERENCES app.customer_revision(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(CASE WHEN kind IN('watch_start','watch_stop') THEN result IS NULL AND watch_revision>0 AND source_id='synthetic-watch-command.v1' AND source_name='Builder command (synthetic)' AND isfinite(retrieved_at)
  ELSE result IS NOT NULL AND app.valid_prevention_result(result,kind,source_id,source_name,retrieved_at) AND (CASE WHEN kind='company' THEN watch_revision=0 ELSE watch_revision>0 END) END)
);
CREATE UNIQUE INDEX prevention_watch_revision ON app.counterparty_check(tenant_id,job_id,binding_id,watch_revision) WHERE kind IN('watch_start','watch_stop');
CREATE INDEX property_constraint_job ON app.property_constraint_fact(tenant_id,job_id,binding_id,kind,created_at DESC);
CREATE INDEX counterparty_check_job ON app.counterparty_check(tenant_id,job_id,binding_id,kind,created_at DESC);

-- Invoker only: RLS-visible binding, not a privileged bypass. No individual checks.
CREATE FUNCTION app.require_prevention_subject() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE b app.job_party_binding; c jsonb; latest uuid;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM app.job_party_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.binding_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'PREVENTION_SUBJECT_MISMATCH' USING ERRCODE='23503'; END IF;
 IF TG_TABLE_NAME='property_constraint_fact' THEN
  IF b.site_revision_id<>NEW.site_revision_id THEN RAISE EXCEPTION 'PREVENTION_SITE_MISMATCH' USING ERRCODE='23503'; END IF;
 ELSE
  IF b.customer_revision_id<>NEW.customer_revision_id THEN RAISE EXCEPTION 'PREVENTION_CUSTOMER_MISMATCH' USING ERRCODE='23503'; END IF;
  -- Q7 fails closed: "the current customer revision" is the customer's LATEST revision. The revision pinned on the
  -- binding must still be that latest revision, and the latest must be a business with a valid company number.
  SELECT id,payload INTO latest,c FROM app.customer_revision WHERE tenant_id=NEW.tenant_id AND customer_id=b.customer_id ORDER BY revision DESC LIMIT 1;
  IF latest IS DISTINCT FROM NEW.customer_revision_id OR NOT coalesce(c->>'type'='business' AND c->>'companyNumber' ~ '^(\d{8}|[A-Z]{2}\d{6})$',false) THEN RAISE EXCEPTION 'NOT_REGISTERED_COMPANY' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.require_prevention_subject() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_prevention_subject() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_prevention_subject() TO jobguard_runtime;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['property_constraint_fact','counterparty_check'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
 EXECUTE format('CREATE TRIGGER prevention_subject BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.require_prevention_subject()',n);
 EXECUTE format('CREATE TRIGGER prevention_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
END LOOP; END $$;
COMMIT;
