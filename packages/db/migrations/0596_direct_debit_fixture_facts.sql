BEGIN;
-- Facts only. No balance, authorization, receipt, ledger or execution writes.
CREATE TABLE app.direct_debit_mandate_fact (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), mandate_id uuid NOT NULL,
 event_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
 environment text NOT NULL CHECK(environment='synthetic_demo'), account text NOT NULL CHECK(account='fake_jobguard_dd'),
 binding jsonb NOT NULL, event jsonb NOT NULL, fact_hash text NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,mandate_id,event_id), UNIQUE(tenant_id,mandate_id,sequence)
);
CREATE TABLE app.direct_debit_payment_fact (
 tenant_id uuid NOT NULL, mandate_id uuid NOT NULL, root_id uuid NOT NULL,
 event_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
 environment text NOT NULL CHECK(environment='synthetic_demo'), account text NOT NULL CHECK(account='fake_jobguard_dd'),
 binding jsonb NOT NULL, event jsonb NOT NULL, fact_hash text NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,mandate_id,sequence),
 FOREIGN KEY(tenant_id,mandate_id,root_id) REFERENCES app.direct_debit_mandate_fact(tenant_id,mandate_id,event_id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['direct_debit_mandate_fact','direct_debit_payment_fact'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_scope ON app.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER immutable_facts BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.direct_debit_fixture(t uuid, operation text, b jsonb, e jsonb, expected_head uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m uuid; eid uuid; root uuid; head uuid; seq integer; old_binding jsonb; prior jsonb;
 fingerprint text; history jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'DD_DARK'; END IF;
 -- FORCE RLS applies to the migration owner too. Never select a tenant from e.
 IF t IS NULL OR t::text IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'') THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
 IF operation IS NULL OR operation NOT IN('read','mandate','payment') OR b IS NULL OR e IS NULL
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR jsonb_typeof(e) IS DISTINCT FROM 'object'
  OR b->>'version' IS DISTINCT FROM 'direct-debit-binding.v1'
  OR b->>'environment' IS DISTINCT FROM 'synthetic_demo' OR b->>'account' IS DISTINCT FROM 'fake_jobguard_dd'
  OR coalesce(b->>'mandateId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
 m:=(b->>'mandateId')::uuid;
 IF (CASE WHEN operation='payment' THEN b-ARRAY['version','environment','account','mandateId','commandId','objectId','amountPence']
  ELSE b-ARRAY['version','environment','account','mandateId'] END)<>'{}'::jsonb THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
 -- One tenant lock orders event-ID deduplication across both tables and serializes
 -- comparison with the caller's previous head. No app.* setting is modified.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,758));
 SELECT event_id INTO root FROM app.direct_debit_mandate_fact WHERE tenant_id=t AND mandate_id=m ORDER BY sequence LIMIT 1;
 IF operation='read' THEN
  IF e<>'{}'::jsonb OR expected_head IS NOT NULL THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
  IF root IS NULL THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
 ELSE
  IF e->>'environment' IS DISTINCT FROM 'synthetic_demo' OR e->>'account' IS DISTINCT FROM 'fake_jobguard_dd'
   OR e->>'tenantId' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
  IF coalesce(e->>'eventId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
  eid:=(e->>'eventId')::uuid;
  IF operation='mandate' THEN
   IF e->>'mandateId' IS DISTINCT FROM m::text THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
   IF e->>'version' IS DISTINCT FROM 'fake-dd-mandate-event.v1'
    OR e-ARRAY['version','environment','account','tenantId','mandateId','eventId','state']<>'{}'::jsonb
    OR coalesce(e->>'state','') NOT IN('created','pending_submission','active','cancelled','failed','expired')
   THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
  ELSE
   IF root IS NULL THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
   IF e->>'commandId' IS DISTINCT FROM b->>'commandId' OR e->>'objectId' IS DISTINCT FROM b->>'objectId'
    OR e->'amountPence' IS DISTINCT FROM b->'amountPence' THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
   IF e->>'version' IS DISTINCT FROM 'fake-dd-event.v1' OR e->>'kind' IS DISTINCT FROM 'collection'
    OR e-ARRAY['version','environment','account','tenantId','commandId','objectId','eventId','state','amountPence','kind']<>'{}'::jsonb
    OR coalesce(e->>'commandId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR coalesce(e->>'objectId','') !~ '^fake_dd_[a-f0-9]{64}$'
    OR jsonb_typeof(e->'amountPence') IS DISTINCT FROM 'number'
    OR coalesce(e->>'amountPence','') !~ '^[0-9]+$'
    OR (e->>'amountPence')::numeric NOT BETWEEN 1 AND 1000000000000
    OR coalesce(e->>'state','') NOT IN('pending_submission','submitted','confirmed','paid_out','failed','cancelled','charged_back','late_failure')
   THEN RAISE EXCEPTION 'DD_INVALID_INPUT'; END IF;
   SELECT binding INTO old_binding FROM app.direct_debit_payment_fact WHERE tenant_id=t
    AND (event->>'commandId'=e->>'commandId' OR event->>'objectId'=e->>'objectId') LIMIT 1;
   IF old_binding IS NOT NULL AND old_binding<>b THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
  END IF;
  fingerprint:=app.final_lock_hash(jsonb_build_object('binding',b,'event',e));
  SELECT jsonb_build_object('hash',fact_hash,'mandateId',mandate_id) INTO prior FROM (
   SELECT fact_hash,mandate_id FROM app.direct_debit_mandate_fact WHERE tenant_id=t AND event_id=eid
   UNION ALL SELECT fact_hash,mandate_id FROM app.direct_debit_payment_fact WHERE tenant_id=t AND event_id=eid
  ) f;
  IF prior IS NOT NULL AND prior->>'mandateId'<>m::text THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
  IF prior IS NOT NULL AND prior->>'hash'<>fingerprint THEN RAISE EXCEPTION 'DD_CONFLICT'; END IF;
  IF prior IS NULL THEN
   SELECT event_id,sequence INTO head,seq FROM (
    SELECT event_id,sequence FROM app.direct_debit_mandate_fact WHERE tenant_id=t AND mandate_id=m
    UNION ALL SELECT event_id,sequence FROM app.direct_debit_payment_fact WHERE tenant_id=t AND mandate_id=m
   ) f ORDER BY sequence DESC LIMIT 1;
   IF head IS DISTINCT FROM expected_head THEN RAISE EXCEPTION 'DD_CONFLICT'; END IF;
   IF root IS NULL AND (operation<>'mandate' OR e->>'state'<>'created') THEN RAISE EXCEPTION 'DD_NOT_FOUND'; END IF;
   IF operation='mandate' THEN
    INSERT INTO app.direct_debit_mandate_fact(tenant_id,mandate_id,event_id,sequence,environment,account,binding,event,fact_hash)
     VALUES(t,m,eid,coalesce(seq,0)+1,'synthetic_demo','fake_jobguard_dd',b,e,fingerprint);
   ELSE
    INSERT INTO app.direct_debit_payment_fact(tenant_id,mandate_id,root_id,event_id,sequence,environment,account,binding,event,fact_hash)
     VALUES(t,m,root,eid,seq+1,'synthetic_demo','fake_jobguard_dd',b,e,fingerprint);
   END IF;
  END IF;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('event',event,'binding',binding,'hash',fact_hash,'sequence',sequence) ORDER BY sequence) INTO history FROM (
  SELECT event,binding,fact_hash,sequence FROM app.direct_debit_mandate_fact WHERE tenant_id=t AND mandate_id=m
  UNION ALL SELECT event,binding,fact_hash,sequence FROM app.direct_debit_payment_fact WHERE tenant_id=t AND mandate_id=m
 ) f;
 RETURN history;
END $$;
ALTER FUNCTION app.direct_debit_fixture(uuid,text,jsonb,jsonb,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.direct_debit_fixture(uuid,text,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.direct_debit_fixture(uuid,text,jsonb,jsonb,uuid) TO jobguard_runtime;
COMMIT;
