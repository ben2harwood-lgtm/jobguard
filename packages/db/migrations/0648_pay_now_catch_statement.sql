BEGIN;
-- LATER-SAFETY-8: preserve stored rows, replay, hashes, grants and money rules.
CREATE OR REPLACE FUNCTION app.pay_now_fake_attempt(t uuid,digest text,j uuid,operation text,v jsonb) RETURNS jsonb
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
 -- Invalid sessions are authentication refusals; the existing helper separately
 -- checks current company membership and owner/admin authority.
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR NOT EXISTS(
  SELECT 1 FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo'
   AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'PAY_NOW_UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
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
 -- Invalid sessions are authentication refusals; the existing helper separately
 -- checks current company membership and owner/admin authority.
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR NOT EXISTS(
  SELECT 1 FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo'
   AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'PAY_NOW_UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
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
  'balancePence',balance,'currency','GBP','includesCatch',EXISTS(
   SELECT 1 FROM app.final_account_line item
   JOIN app.variation_revision vr
    ON(vr.tenant_id,vr.job_id,vr.id)=(item.tenant_id,item.job_id,item.commercial_revision_id)
   JOIN app.extra_origin o
    ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
   WHERE item.tenant_id=t AND item.job_id=j AND item.final_account_revision_id=inv.final_account_revision_id
    AND item.line_kind='variation' AND item.source_id=vr.id AND o.kind='jobguard_catch'),'kind','final');
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
COMMIT;
