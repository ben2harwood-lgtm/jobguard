BEGIN;
-- M4-17 queue: verify stored invoices and recompute fake reference reports, never authoritative
-- books, settlement, recovery qualification or an executable money adjustment.
CREATE TABLE app.financial_reconciliation_run (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL,
 request jsonb NOT NULL, snapshot jsonb NOT NULL, report jsonb NOT NULL,
 trigger text NOT NULL CHECK(trigger IN('daily','on_demand')), day date NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_run_command UNIQUE(tenant_id,id), CONSTRAINT fr_run_revision UNIQUE(tenant_id,job_id,revision),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((snapshot->>'environment'='synthetic_demo' AND snapshot->>'version'='financial-reconciliation-snapshot.v1') IS TRUE),
 CHECK((snapshot->>'tenantId'=tenant_id::text AND snapshot->>'jobId'=job_id::text) IS TRUE),
 CHECK(report @> '{"version":"financial-reconciliation-report.v1","referenceOnly":true,"authoritativeSourceVerification":false,"productionEnabled":false,"realExternalActions":0}'::jsonb),
 CHECK((jsonb_typeof(report->'queue')='array') IS TRUE)
);
CREATE UNIQUE INDEX fr_daily ON app.financial_reconciliation_run(tenant_id,job_id,day) WHERE trigger='daily';
CREATE TABLE app.financial_reconciliation_difference (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, run_id uuid NOT NULL,
 difference_id text NOT NULL CHECK(difference_id~'^[a-f0-9]{64}$'), detail jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,run_id,difference_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.financial_reconciliation_run(tenant_id,job_id,id),
 CHECK((detail->>'differenceId'=difference_id) IS TRUE)
);
CREATE TABLE app.financial_reconciliation_adjustment (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, run_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_adjustment_command UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.financial_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.financial_reconciliation_approval (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, adjustment_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_approval_command UNIQUE(tenant_id,id), CONSTRAINT fr_approval_adjustment UNIQUE(tenant_id,job_id,adjustment_id),
 FOREIGN KEY(tenant_id,job_id,adjustment_id) REFERENCES app.financial_reconciliation_adjustment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
-- Retains every command identity, including daily aliases, across restarts.
CREATE TABLE app.financial_reconciliation_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, result_id uuid NOT NULL,
 actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['financial_reconciliation_run','financial_reconciliation_difference','financial_reconciliation_adjustment','financial_reconciliation_approval','financial_reconciliation_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow',n);
  EXECUTE format('CREATE TRIGGER fr_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ef_immutable()',n);
  EXECUTE format('CREATE TRIGGER fr_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.financial_reconciliation_queue(p_session uuid,p_job uuid,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; u uuid; k text; cid uuid; r app.financial_reconciliation_run;
 proposal app.financial_reconciliation_adjustment; item jsonb; next_revision integer; prior app.financial_reconciliation_command; result_id uuid;
 stored_invoices jsonb; providers jsonb; valid_provider jsonb; refs jsonb;
 issues jsonb:='[]'::jsonb; queue jsonb:='[]'::jsonb; balances jsonb; blocked text[]:=ARRAY[]::text[];
 sibling_count integer; depth integer; used_amount numeric; paid numeric; refunded numeric; fees numeric; payout numeric; bank numeric;
 clearing numeric; transit numeric; net numeric; tax numeric; gross numeric; balance_key text; balance_value jsonb;
BEGIN
 IF p_command->>'version' IS DISTINCT FROM 'financial-reconciliation-storage.v1' THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 -- Reuse the existing live session, membership and unrevoked tenant finance
 -- grant contract. Same tenant alone, a supplied actor or a practice flag is not authority.
 a:=app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT identity_user_id INTO u FROM app.membership WHERE tenant_id=t AND id=a;
 k:=p_command->>'action';
 IF (p_command - (CASE k WHEN 'run' THEN ARRAY['version','action','commandId','trigger','day','snapshot','report']
  WHEN 'read' THEN ARRAY['version','action','runId'] WHEN 'propose' THEN ARRAY['version','action','commandId','runId','adjustment','contentHash']
  ELSE ARRAY['version','action','commandId','adjustmentId','contentHash'] END))<>'{}'::jsonb THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 IF k='read' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'runId')::uuid;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=p_job AND environment='synthetic_demo') THEN
  IF k='read' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF k IS NULL OR k NOT IN('run','propose','approve') OR pg_input_is_valid(p_command->>'commandId','uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- One scheduling/adjustment owner. Audit head is always acquired last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,479));
 -- Recheck after the lock wait, including revoked/expired finance sessions.
 a:=app.ef_actor(p_session);
 SELECT * INTO prior FROM app.financial_reconciliation_command WHERE tenant_id=t AND id=cid;
 IF prior.id IS NOT NULL THEN
  IF prior.job_id<>p_job OR prior.request<>p_command OR prior.actor_identity_id<>u THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF k='run' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=prior.result_id;
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  RETURN jsonb_build_object('id',prior.result_id);
 END IF;
 result_id:=cid;
 IF k='run' THEN
  IF p_command->'snapshot'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'snapshot'->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_command->'report'->>'sourceHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'snapshot'),'UTF8')),'hex') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements((p_command->'snapshot'->'invoices')||(p_command->'snapshot'->'provider')||(p_command->'snapshot'->'journals')||(p_command->'snapshot'->'corrections')) LOOP
   IF item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
    RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
   END IF;
  END LOOP;
  -- Rebuild the complete invoice set in one statement snapshot. Caller hashes
  -- prove encoding only; neither missing invoices nor substituted revisions pass.
  SELECT coalesce(jsonb_agg(jsonb_build_object('tenantId',tenant_id,'jobId',job_id,'id',id,
   'revision',final_account_revision_id,'net',net_pence,'vat',tax_pence,'gross',total_pence)
   ORDER BY id),'[]'::jsonb) INTO stored_invoices
  FROM app.customer_invoice WHERE tenant_id=t AND job_id=p_job AND synthetic;
  IF p_command->'snapshot' IS NULL OR ((p_command->'snapshot') - ARRAY['version','environment','tenantId','jobId','invoices','provider','journals','corrections'])<>'{}'::jsonb
   OR p_command->'snapshot'->>'version' IS DISTINCT FROM 'financial-reconciliation-snapshot.v1'
   OR p_command->'snapshot'->>'environment' IS DISTINCT FROM 'synthetic_demo'
   OR p_command->'snapshot'->'invoices' IS DISTINCT FROM stored_invoices
   OR jsonb_array_length(stored_invoices)>10000
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(stored_invoices) x
    WHERE (x->>'net')::numeric NOT BETWEEN 0 AND 1000000000000
     OR (x->>'vat')::numeric NOT BETWEEN 0 AND 1000000000000
     OR (x->>'gross')::numeric NOT BETWEEN 1 AND 1000000000000)
   OR jsonb_typeof(p_command->'snapshot'->'provider') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_command->'snapshot'->'provider')>10000
   -- No accepted adapter maps app.journal's platform-book postings to these
   -- invoice-scoped reference kinds. Review proposals are not posted facts.
   -- Refuse rather than legitimise invented journals or duplicate corrections.
   OR p_command->'snapshot'->'journals' IS DISTINCT FROM '[]'::jsonb
   OR p_command->'snapshot'->'corrections' IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  providers:=p_command->'snapshot'->'provider';
  IF providers IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'id') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(providers) x) THEN
   RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
  END IF;
  -- Provider observations remain explicitly fictional, not authenticated cash.
  FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
   IF (item - ARRAY['tenantId','jobId','id','effectId','invoiceId','kind','amount','parentId','late'])<>'{}'::jsonb
    OR NOT (item ?& ARRAY['tenantId','jobId','id','effectId','invoiceId','kind','amount','parentId','late'])
    OR pg_input_is_valid(item->>'id','uuid') IS NOT TRUE
    OR pg_input_is_valid(item->>'effectId','uuid') IS NOT TRUE
    OR pg_input_is_valid(item->>'invoiceId','uuid') IS NOT TRUE
    OR item->>'kind' IS NULL OR item->>'kind' NOT IN('payment','refund','fee','payout','bank')
    OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number'
    OR (item->>'amount')::numeric NOT BETWEEN 1 AND 1000000000000
    OR trunc((item->>'amount')::numeric)<>(item->>'amount')::numeric
    OR jsonb_typeof(item->'late') IS DISTINCT FROM 'boolean'
    OR (item->>'kind'='payment') IS DISTINCT FROM (item->'parentId'='null'::jsonb)
    OR (item->>'kind'<>'payment' AND pg_input_is_valid(item->>'parentId','uuid') IS NOT TRUE)
    OR (SELECT count(*) FROM jsonb_array_elements(providers) x WHERE x->>'id'=item->>'id')<>1 THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
   END IF;
  END LOOP;
  -- Independent SQL comparison of the supported source set. Raw issues hold
  -- integer pence; canonical queue encoding is applied once at the end.
  FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
   SELECT count(*),jsonb_agg(x->>'id' ORDER BY x->>'id') INTO sibling_count,refs
    FROM jsonb_array_elements(providers) x WHERE x->>'effectId'=item->>'effectId';
   IF sibling_count>1 THEN
    blocked:=array_append(blocked,item->>'id');
    IF item->>'id'=refs->>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','DUPLICATE_PROVIDER_EFFECT','refs',refs)); END IF;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stored_invoices) x WHERE x->>'id'=item->>'invoiceId') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','ORPHAN_PROVIDER_PAYMENT','refs',jsonb_build_array(item->>'id')));
    blocked:=array_append(blocked,item->>'id');
   END IF;
   IF (item->>'late')::boolean THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','LATE_PROVIDER_EVENT','refs',jsonb_build_array(item->>'id')));
   END IF;
   IF item->>'kind'<>'payment' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(providers) x
    WHERE x->>'id'=item->>'parentId' AND x->>'invoiceId'=item->>'invoiceId'
     AND x->>'kind'=CASE WHEN item->>'kind'='bank' THEN 'payout' ELSE 'payment' END) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','MISSING_OR_WRONG_PREDECESSOR','refs',jsonb_build_array(item->>'id',item->>'parentId')));
    blocked:=array_append(blocked,item->>'id');
   END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(providers) WHERE value->>'kind' IN('payment','payout') LOOP
   SELECT coalesce(sum((x->>'amount')::numeric),0),coalesce(jsonb_agg(x->>'id'),'[]'::jsonb) INTO used_amount,refs
    FROM jsonb_array_elements(providers) x WHERE x->>'parentId'=item->>'id' AND NOT (x->>'id'=ANY(blocked))
     AND ((item->>'kind'='payout' AND x->>'kind'='bank') OR (item->>'kind'='payment' AND x->>'kind' IN('refund','fee','payout')));
   IF used_amount>(item->>'amount')::numeric THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','SOURCE_AMOUNT_EXCEEDED','refs',refs||jsonb_build_array(item->>'id'),'expected',(item->>'amount')::numeric,'observed',used_amount));
    SELECT blocked||coalesce(array_agg(x #>> '{}'),ARRAY[]::text[]) INTO blocked FROM jsonb_array_elements(refs) x;
   END IF;
  END LOOP;
  FOR depth IN 1..2 LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
    IF item->>'parentId'=ANY(blocked) AND NOT(item->>'id'=ANY(blocked)) THEN
     blocked:=array_append(blocked,item->>'id');
     issues:=issues||jsonb_build_array(jsonb_build_object('code','BLOCKED_PREDECESSOR','refs',jsonb_build_array(item->>'id',item->>'parentId')));
    END IF;
   END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO valid_provider FROM jsonb_array_elements(providers) x WHERE NOT(x->>'id'=ANY(blocked));
  FOR item IN SELECT value FROM jsonb_array_elements(valid_provider) WHERE value->>'kind'<>'bank' LOOP
   issues:=issues||jsonb_build_array(jsonb_build_object('code','MISSING_OR_DUPLICATE_JOURNAL','refs',jsonb_build_array(item->>'id'),'expected',(item->>'amount')::numeric,'observed',0));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(stored_invoices) LOOP
   SELECT coalesce(sum(CASE x->>'kind' WHEN 'payment' THEN (x->>'amount')::numeric WHEN 'refund' THEN -(x->>'amount')::numeric ELSE 0 END),0)
    INTO used_amount FROM jsonb_array_elements(valid_provider) x WHERE x->>'invoiceId'=item->>'id';
   IF used_amount>(item->>'gross')::numeric THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','INVOICE_OVERPAYMENT','refs',jsonb_build_array(item->>'id'),'expected',(item->>'gross')::numeric,'observed',used_amount));
   END IF;
  END LOOP;
  SELECT coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='payment'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='refund'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='fee'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='payout'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='bank'),0)
   INTO paid,refunded,fees,payout,bank FROM jsonb_array_elements(valid_provider) x;
  clearing:=paid-refunded-fees-payout; transit:=payout-bank;
  IF clearing<>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','OUTSTANDING_CLEARING','refs','[]'::jsonb,'expected',0,'observed',clearing)); END IF;
  IF transit<>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','PAYOUT_AWAITING_BANK','refs','[]'::jsonb,'expected',payout,'observed',bank)); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(issues) LOOP
   IF abs(coalesce((item->>'expected')::numeric,0))>1000000000000 OR abs(coalesce((item->>'observed')::numeric,0))>1000000000000 THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
   END IF;
   SELECT coalesce(jsonb_agg(v ORDER BY v COLLATE "C"),'[]'::jsonb) INTO refs FROM (SELECT DISTINCT x #>> '{}' v FROM jsonb_array_elements(item->'refs') x) rfs;
   item:=jsonb_build_object('code',item->>'code','refs',refs,
    'expected',CASE WHEN item ? 'expected' THEN jsonb_build_object('pence',item->'expected','currency','GBP') ELSE 'null'::jsonb END,
    'observed',CASE WHEN item ? 'observed' THEN jsonb_build_object('pence',item->'observed','currency','GBP') ELSE 'null'::jsonb END);
   queue:=queue||jsonb_build_array(item||jsonb_build_object('differenceId',encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(item),'UTF8')),'hex')));
  END LOOP;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'differenceId') COLLATE "C"),'[]'::jsonb) INTO queue FROM jsonb_array_elements(queue) x;
  SELECT coalesce(sum((x->>'net')::numeric),0),coalesce(sum((x->>'vat')::numeric),0),coalesce(sum((x->>'gross')::numeric),0)
   INTO net,tax,gross FROM jsonb_array_elements(stored_invoices) x;
  balances:=jsonb_build_object('invoicedGross',gross,'invoiceOutstanding',gross-paid+refunded,
   'journalPayments',0,'journalRefunds',0,'journalFees',0,'journalPayouts',0,'invoicedNet',net,'vat',tax,
   'grossCharged',paid,'refunds',refunded,'providerFees',fees,'netPayout',payout,'bankObserved',bank,
   'outstandingClearing',clearing,'payoutInTransit',transit,'allocated',0,'reserved',0);
  FOR balance_key,balance_value IN SELECT key,value FROM jsonb_each(balances) LOOP
   IF abs((balance_value #>> '{}')::numeric)>1000000000000 THEN RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023'; END IF;
   balances:=jsonb_set(balances,ARRAY[balance_key],jsonb_build_object('pence',balance_value,'currency','GBP'));
  END LOOP;
  IF p_command->'report' IS DISTINCT FROM jsonb_build_object('version','financial-reconciliation-report.v1',
   'sourceHash',encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'snapshot'),'UTF8')),'hex'),
   'productionEnabled',false,'referenceOnly',true,'authoritativeSourceVerification',false,'realExternalActions',0,'balances',balances,'queue',queue) THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND id=cid;
  IF r.id IS NULL AND p_command->>'trigger'='daily' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND trigger='daily' AND day=(p_command->>'day')::date;
  END IF;
  IF r.id IS NOT NULL THEN
   INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,r.id,u,p_command);
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  SELECT coalesce(max(revision),0)+1 INTO next_revision FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job;
  INSERT INTO app.financial_reconciliation_run(tenant_id,job_id,id,revision,actor_membership_id,actor_identity_id,request,snapshot,report,trigger,day)
   VALUES(t,p_job,cid,next_revision,a,u,p_command,p_command->'snapshot',p_command->'report',p_command->>'trigger',(p_command->>'day')::date) RETURNING * INTO r;
  FOR item IN SELECT value FROM jsonb_array_elements(r.report->'queue') LOOP
   INSERT INTO app.financial_reconciliation_difference(tenant_id,job_id,run_id,difference_id,detail) VALUES(t,p_job,cid,item->>'differenceId',item);
  END LOOP;
 ELSIF k='propose' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id IS DISTINCT FROM (p_command->>'runId')::uuid OR r.report->>'sourceHash' IS DISTINCT FROM p_command->'adjustment'->>'reportHash'
   OR p_command->'adjustment'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'adjustment'->>'jobId' IS DISTINCT FROM p_job::text
   OR p_command->'adjustment'->>'commandId' IS DISTINCT FROM cid::text THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF p_command->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'adjustment'),'UTF8')),'hex')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.snapshot->'invoices') i
    WHERE i->>'id'=coalesce(p_command->'adjustment'->'fact'->>'invoiceId',p_command->'adjustment'->'correction'->>'invoiceId')
     AND i->>'revision'=p_command->'adjustment'->>'invoiceRevision') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  item:=coalesce(p_command->'adjustment'->'fact',p_command->'adjustment'->'correction');
  IF (p_command->'adjustment' ? 'fact')=(p_command->'adjustment' ? 'correction')
   OR item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO app.financial_reconciliation_adjustment(tenant_id,job_id,id,run_id,actor_membership_id,actor_identity_id,request,content_hash)
   VALUES(t,p_job,cid,r.id,a,u,p_command,p_command->>'contentHash');
 ELSE
  SELECT * INTO proposal FROM app.financial_reconciliation_adjustment WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'adjustmentId')::uuid;
  IF proposal.id IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF proposal.actor_identity_id=u THEN RAISE EXCEPTION 'RECONCILIATION_SELF_APPROVAL' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id<>proposal.run_id OR proposal.content_hash IS DISTINCT FROM p_command->>'contentHash' THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  INSERT INTO app.financial_reconciliation_approval(tenant_id,job_id,id,adjustment_id,actor_membership_id,actor_identity_id,request)
   VALUES(t,p_job,cid,proposal.id,a,u,p_command);
 END IF;
 INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,result_id,u,p_command);
 PERFORM app.ef_audit(a,'financial_reconciliation.'||k,'job',p_job,
  jsonb_build_object('references',jsonb_build_object('commandId',cid::text,'environment','synthetic_demo')));
 IF k='run' THEN RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report); END IF;
 RETURN jsonb_build_object('id',cid);
END $$;
ALTER FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
