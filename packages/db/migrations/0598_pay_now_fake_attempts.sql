BEGIN;
-- MON-6: fake observations, never payment facts. One row binds one balance snapshot.
CREATE TABLE app.pay_now_fake_attempt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, invoice_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_id uuid NOT NULL,
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 record jsonb NOT NULL CHECK(record->'synthetic'='true'::jsonb),
 record_hash text NOT NULL CHECK(record_hash=app.final_lock_hash(record)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT pay_now_fake_attempt_pk PRIMARY KEY(tenant_id,command_id),
 CONSTRAINT pay_now_fake_attempt_snapshot UNIQUE(tenant_id,invoice_id,snapshot_hash),
 CONSTRAINT pay_now_fake_attempt_invoice_fk FOREIGN KEY(tenant_id,job_id,invoice_id) REFERENCES app.customer_invoice(tenant_id,job_id,id),
 CONSTRAINT pay_now_fake_attempt_actor_fk FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.pay_now_fake_attempt OWNER TO jobguard_migration;
ALTER TABLE app.pay_now_fake_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pay_now_fake_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.pay_now_fake_attempt FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.pay_now_fake_attempt FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.pay_now_fake_attempt
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.pay_now_fake_attempt
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- prepare and store run in the SAME repository transaction, holding the invoice
-- lock used by credit/receipt writers. Only core calculates tariff arithmetic.
CREATE FUNCTION app.pay_now_fake_attempt(t uuid,digest text,j uuid,operation text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved_tenant text:=current_setting('app.tenant_id',true); actor uuid; iid uuid; cid uuid;
 inv app.customer_invoice; prior app.pay_now_fake_attempt; balance bigint; facts jsonb;
 fingerprint text; request_hash text; projection jsonb; result jsonb; row_value jsonb; fee bigint; invoice_revision integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS NULL
  OR t IS DISTINCT FROM nullif(saved_tenant,'')::uuid THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF operation IS NULL OR operation NOT IN('read','prepare','store') OR jsonb_typeof(v) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 iid:=(v->>'invoiceId')::uuid;
 IF iid IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF operation='read' THEN
  IF v-ARRAY['invoiceId']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j AND id=iid AND synthetic)
   THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(record ORDER BY created_at,command_id),'[]'::jsonb)
   FROM app.pay_now_fake_attempt WHERE tenant_id=t AND job_id=j AND invoice_id=iid);
 END IF;
 actor:=app.mon1_company_actor(t,digest);
 IF v->>'version' IS DISTINCT FROM 'pay-now-attempt.v1'
  OR NOT v ?& ARRAY['version','invoiceId','rail','commandId']
  OR coalesce(v->>'rail','') NOT IN('bank_transfer','card','pay_by_bank')
  OR (operation='prepare' AND v-ARRAY['version','invoiceId','rail','commandId']<>'{}'::jsonb)
  OR (operation='store' AND (v-ARRAY['version','invoiceId','rail','commandId','snapshotHash','result','options']<>'{}'::jsonb
    OR NOT v ?& ARRAY['snapshotHash','result','options'])) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 cid:=(v->>'commandId')::uuid;
 IF cid IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 -- Command first, then invoice: matches persisted receipt/credit lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||iid::text,0));
 actor:=app.mon1_company_actor(t,digest);
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=t AND job_id=j AND id=iid AND synthetic;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 request_hash:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'input',v-ARRAY['snapshotHash','result','options']));
 SELECT * INTO prior FROM app.pay_now_fake_attempt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'REPLAY_CONFLICT'; END IF;
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
  IF operation='prepare' THEN RETURN jsonb_build_object('invoice',prior.record->'invoice','snapshotHash',prior.snapshot_hash); END IF;
  RETURN prior.record;
 END IF;
 -- Include source identities, not just totals: credits, payments and reversals
 -- at the same net balance still describe a new immutable observation revision.
 SELECT jsonb_build_object('invoiceHash',inv.source_hash,'finalRevision',inv.final_account_revision_id,
  'credits',coalesce((SELECT jsonb_agg(jsonb_build_array(c.id,c.amount_pence) ORDER BY c.id) FROM app.customer_credit_note c WHERE c.tenant_id=t AND c.invoice_id=iid),'[]'::jsonb),
  'payments',coalesce((SELECT jsonb_agg(jsonb_build_array(p.id,p.amount_pence,r.id) ORDER BY p.id) FROM app.customer_payment p LEFT JOIN app.customer_payment_reversal r ON(r.tenant_id,r.payment_id)=(p.tenant_id,p.id) WHERE p.tenant_id=t AND p.invoice_id=iid),'[]'::jsonb)) INTO facts;
 SELECT greatest(0,inv.total_pence
  -coalesce((SELECT sum(c.amount_pence) FROM app.customer_credit_note c WHERE c.tenant_id=t AND c.invoice_id=iid),0)
  -coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE p.tenant_id=t AND p.invoice_id=iid AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.payment_id=p.id)),0)) INTO balance;
 IF balance NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 fingerprint:=app.final_lock_hash(facts);
 SELECT revision INTO invoice_revision FROM app.final_account_revision
  WHERE tenant_id=t AND job_id=j AND id=inv.final_account_revision_id;
 IF invoice_revision IS NULL THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 projection:=jsonb_build_object('version','pay-now.synthetic-invoice.v1','environment','synthetic_demo',
  'tenantId',t,'jobId',j,'invoiceId',iid,'revision',invoice_revision,'builderAccount','fake-builder-'||t::text,
  'balancePence',balance,'currency','GBP','includesCatch',false,'kind','final');
 IF operation='prepare' THEN
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
  RETURN jsonb_build_object('invoice',projection,'snapshotHash',fingerprint);
 END IF;
 IF v->>'snapshotHash' IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'REPLAY_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM app.pay_now_fake_attempt WHERE tenant_id=t AND invoice_id=iid AND snapshot_hash=fingerprint)
  THEN RAISE EXCEPTION 'ALREADY_ATTEMPTED'; END IF;
 -- Internal core projection is never raw command input. Check the money boundary
 -- independently here; the repository also revalidates the exact core projection.
 result:=v->'result';
 fee:=(result->'builderFeeDebit'->>'pence')::bigint;
 IF fee IS NULL OR fee NOT BETWEEN 0 AND least(600,balance)
  OR (v->>'rail'='bank_transfer' AND fee<>0)
  OR result IS DISTINCT FROM jsonb_build_object('synthetic',true,'invoiceId',iid,'invoiceRevision',invoice_revision,
   'destinationAccount','fake-builder-'||t::text,'status','fake_settled',
   'customerDebit',jsonb_build_object('pence',balance,'currency','GBP'),
   'builderCredit',jsonb_build_object('pence',balance,'currency','GBP'),
   'builderFeeDebit',jsonb_build_object('pence',fee,'currency','GBP'),
   'platformCustomerFunds',jsonb_build_object('pence',0,'currency','GBP'))
  OR jsonb_typeof(v->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'options')<>3
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 row_value:=jsonb_build_object('synthetic',true,'commandId',cid,'actorId',actor,'rail',v->>'rail',
  'invoice',projection,'snapshotHash',fingerprint,'result',result,'options',v->'options');
 INSERT INTO app.pay_now_fake_attempt(tenant_id,job_id,invoice_id,command_id,actor_id,snapshot_hash,request_hash,record,record_hash)
 VALUES(t,j,iid,cid,actor,fingerprint,request_hash,row_value,app.final_lock_hash(row_value));
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN row_value;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.pay_now_fake_attempt(uuid,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pay_now_fake_attempt(uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pay_now_fake_attempt(uuid,text,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
