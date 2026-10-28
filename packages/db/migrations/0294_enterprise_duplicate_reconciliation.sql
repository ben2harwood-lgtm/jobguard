BEGIN;
-- ENT-7 leftovers. A durable synthetic correction instruction, not a claim that a provider issued a credit.
-- Existing issued exports, billing facts, origins and journals stay immutable. Statement approval remains separate.
CREATE TABLE app.enterprise_duplicate_correction (
 tenant_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL, link_id uuid NOT NULL,
 job_id uuid NOT NULL, duplicate_id uuid NOT NULL, canonical_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, authorization_id uuid NOT NULL,
 corrections jsonb NOT NULL CHECK(jsonb_typeof(corrections)='array'), content_hash char(64) NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,link_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,link_id) REFERENCES app.extra_duplicate_link(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,job_id,duplicate_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,canonical_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CHECK(duplicate_id<>canonical_id), CHECK(content_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE app.enterprise_duplicate_correction OWNER TO jobguard_migration;
ALTER TABLE app.enterprise_duplicate_correction ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.enterprise_duplicate_correction FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.enterprise_duplicate_correction FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.enterprise_duplicate_correction FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER ef_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.enterprise_duplicate_correction FOR EACH ROW EXECUTE FUNCTION app.ef_immutable();
CREATE TRIGGER ef_no_truncate BEFORE TRUNCATE ON app.enterprise_duplicate_correction FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable();

-- Only the private correction record allows the exported-link exception. A fabricated receipt is insufficient.
CREATE OR REPLACE FUNCTION app.ent4b_fact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; origin_row app.extra_origin; prior_link app.extra_duplicate_link; origin_revision integer; instructed_revision integer; reconciliation boolean:=false;
BEGIN
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 IF command.command_id IS NULL OR command.status<>'processing' OR command.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Serialises the active-link graph and event sequences even for direct runtime SQL.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,417));
 NEW.server_recorded_at:=transaction_timestamp();
 IF TG_TABLE_NAME='extra_event' THEN
  IF EXISTS(SELECT 1 FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND job_track<>'contractor') THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  IF NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.variation_revision WHERE (tenant_id,job_id,variation_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.revision_id)) THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  NEW.sequence:=coalesce((SELECT max(sequence) FROM app.extra_event WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)),0)+1;
  IF (NEW.sequence=1) IS DISTINCT FROM (NEW.kind='logged') OR (NEW.kind='logged' AND NEW.command_id IS DISTINCT FROM origin_row.command_id) THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='extra_duplicate_link' THEN
  IF command.command_type='ReconcileExportedDuplicate' THEN
   reconciliation:=command.command_type='ReconcileExportedDuplicate' AND NEW.kind='link' AND EXISTS(
   SELECT 1 FROM app.enterprise_duplicate_correction c WHERE (c.tenant_id,c.command_id,c.link_id,c.job_id,c.duplicate_id,c.canonical_id,c.actor_membership_id)=
    (NEW.tenant_id,NEW.command_id,NEW.id,NEW.job_id,NEW.duplicate_id,NEW.canonical_id,NEW.actor_membership_id));
  END IF;
  IF EXISTS(SELECT 1 FROM app.variation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id IN(NEW.duplicate_id,NEW.canonical_id) AND job_track<>'contractor') THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.extra_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id IN(NEW.duplicate_id,NEW.canonical_id) AND kind='exported') AND NOT reconciliation THEN
   RAISE EXCEPTION 'EXTRA_EXPORTED' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='link' THEN
   IF NOT reconciliation AND (command.command_type<>'MarkDuplicate' OR command.semantic_key<>('extra-duplicate:'||NEW.job_id::text||':'||NEW.duplicate_id::text||':'||NEW.canonical_id::text||':'||NEW.command_id::text)) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id AND l.kind='link'
    AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE (u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))
    AND (l.duplicate_id=NEW.duplicate_id OR l.duplicate_id=NEW.canonical_id OR l.canonical_id=NEW.duplicate_id)) THEN
    RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514';
   END IF;
  ELSE
   -- Row guards only; no unlink receipt type, repository function or authorization rule in this leaf.
   SELECT * INTO prior_link FROM app.extra_duplicate_link WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.reverses_link_id);
   IF prior_link.id IS NOT NULL AND (prior_link.kind<>'link' OR prior_link.duplicate_id<>NEW.duplicate_id OR prior_link.canonical_id<>NEW.canonical_id) THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF command.command_type<>'RecordClientInstruction' OR command.semantic_key<>('extra-order-line:'||NEW.job_id::text||':'||NEW.variation_id::text) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  -- Let the composite FKs produce 23503 on missing/foreign rows, before comparing revision numbers.
  IF EXISTS(SELECT 1 FROM app.work_order WHERE (tenant_id,id,job_id)=(NEW.tenant_id,NEW.work_order_id,NEW.job_id))
   AND EXISTS(SELECT 1 FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id)) THEN
   IF origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.work_order_id IS DISTINCT FROM NEW.work_order_id THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
   SELECT revision INTO origin_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,origin_row.work_order_revision_id);
   SELECT revision INTO instructed_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id);
   IF origin_revision IS NULL OR instructed_revision<=origin_revision THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Preserve the original version and fee eligibility even when finance selects a later canonical member.
CREATE OR REPLACE FUNCTION app.ef_inputs(t uuid,ag app.enterprise_agreement_version,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE cutoff timestamptz; qrows jsonb; inputs jsonb; p_agreement uuid:=ag.id;
BEGIN
 -- Calendar month in Europe/London; cumulative principal is everything recorded before the cut-off.
 cutoff:=((p_period||'-01 00:00:00')::timestamp+interval '1 month') AT TIME ZONE 'Europe/London';
 IF ag.effective_from>=cutoff THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;

 -- Qualifying: contractor site-originated extras (site user, or surfaced and confirmed) recorded before the cut-off,
 -- whose origin time selects this agreement version, that are not linked as a duplicate, on a synthetic contractor job,
 -- exported, and carrying payment-allocated extra principal on the allocation run current at the cut-off.
 -- Office, client-instructed and order-line amounts, duplicates, unexported and unpaid amounts never appear here.
 SELECT coalesce(jsonb_agg(jsonb_build_object('allocation_id',q.allocation_id,'run_id',q.run_id,'rule',q.rule,'n',q.n::text,'dd',q.dd::text,
  'export_line_id',q.export_line_id,'job_id',q.job_id,'extra_id',q.extra_id,'origin_kind',q.origin_kind) ORDER BY q.allocation_id),'[]'::jsonb) INTO qrows FROM(
 SELECT al.id allocation_id, al.run_id, al.rule, al.matched_extra_numerator n, al.matched_extra_denominator dd,
  l.id export_line_id, l.job_id, o.variation_id extra_id, effective.kind origin_kind
 FROM app.extra_origin o
 -- Canonical commercial identity and effective origin are distinct: use the earliest group member at this cutoff.
 JOIN LATERAL (
  SELECT src.kind,src.server_recorded_at FROM app.extra_origin src
  WHERE src.tenant_id=o.tenant_id AND src.job_id=o.job_id AND src.server_recorded_at<cutoff
   AND (src.variation_id=o.variation_id OR EXISTS(
    SELECT 1 FROM app.extra_duplicate_link k WHERE k.tenant_id=src.tenant_id AND k.job_id=src.job_id
     AND k.duplicate_id=src.variation_id AND k.canonical_id=o.variation_id AND k.kind='link' AND k.server_recorded_at<cutoff
     AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE u.tenant_id=k.tenant_id AND u.reverses_link_id=k.id AND u.kind='unlink' AND u.server_recorded_at<cutoff)))
  ORDER BY src.server_recorded_at,src.variation_id LIMIT 1
 ) effective ON true
 JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(o.tenant_id,o.job_id) AND ct.job_track='contractor' AND ct.environment='synthetic_demo'
 JOIN app.billing_export_line l ON(l.tenant_id,l.job_id,l.extra_id)=(o.tenant_id,o.job_id,o.variation_id)
 JOIN app.billing_export_batch b ON(b.tenant_id,b.id)=(l.tenant_id,l.batch_id) AND b.server_recorded_at<cutoff
 JOIN app.contractor_receipt_line_allocation al ON(al.tenant_id,al.line_job_id,al.export_line_id)=(l.tenant_id,l.job_id,l.id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.id)=(al.tenant_id,al.job_id,al.run_id) AND r.server_recorded_at<cutoff
 WHERE o.tenant_id=t AND o.job_track='contractor' AND effective.kind IN('site_user','jobguard_surfaced_confirmed') AND o.server_recorded_at<cutoff
  AND (SELECT v.id FROM app.enterprise_agreement_version v WHERE v.tenant_id=t AND v.effective_from<=effective.server_recorded_at ORDER BY v.effective_from DESC LIMIT 1)=p_agreement
  AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=r.tenant_id AND nx.predecessor_id=r.id AND nx.server_recorded_at<cutoff)
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link k WHERE k.tenant_id=t AND k.duplicate_id=o.variation_id AND k.kind='link' AND k.server_recorded_at<cutoff
   AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE u.tenant_id=t AND u.reverses_link_id=k.id AND u.kind='unlink' AND u.server_recorded_at<cutoff))
  AND al.matched_extra_numerator<>0) q;

 inputs:=jsonb_build_object('agreement',ag.id,'agreementHash',ag.content_hash,'period',p_period,
  'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'allocation_id',x->>'n',x->>'dd')),'[]'::jsonb) FROM jsonb_array_elements(qrows) x));
 RETURN jsonb_build_object('rows',qrows,'hash',app.final_lock_hash(inputs),'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
ALTER FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;


CREATE FUNCTION app.ef_reconcile_exported_duplicate(p_session uuid,p_command uuid,p_job uuid,p_duplicate uuid,p_canonical uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; req text; prior app.command_receipt; correction uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
 dec uuid:=gen_random_uuid(); res uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); fixes jsonb; content jsonb; h text;
 seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb; outcome jsonb;
BEGIN
 a:=app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF p_command IS NULL OR p_job IS NULL OR p_duplicate IS NULL OR p_canonical IS NULL OR p_duplicate=p_canonical THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 -- Organisation fence -> tenant billing lock -> job/group -> extras by ID -> actor -> audit last.
 -- Q-02 (17 October): authority is checked even for replay; non-live jobs always refuse.
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND ct.job_track='contractor' AND ct.environment='synthetic_demo') THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.cb_authority(p_session,p_job,true);
 a:=app.ef_actor(p_session);
 req:=app.final_lock_hash(jsonb_build_object('command','ReconcileExportedDuplicate','job',p_job,'duplicate',p_duplicate,'canonical',p_canonical,'actor',a));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF prior.command_id IS NOT NULL THEN
  IF prior.command_type<>'ReconcileExportedDuplicate' OR prior.request_hash<>req OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(*) FROM app.billing_export_line WHERE tenant_id=t AND job_id=p_job AND extra_id IN(p_duplicate,p_canonical))<>2 THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l WHERE l.tenant_id=t AND l.job_id=p_job AND l.kind='link'
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(t,l.id))
  AND (l.duplicate_id IN(p_duplicate,p_canonical) OR l.canonical_id=p_duplicate)) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 -- Compute the uncredited duplicate invoice balance from current stored, validated projections.
 -- Preserve exact net and gross (including each line's VAT ratio); no caller-supplied amount or payment fact.
 SELECT coalesce(jsonb_agg(jsonb_build_object('runId',r.id,'exportLineId',e.id,'source',r.source,'invoiceNumber',r.invoice_number,
  'externalInvoiceLineId',m.external_invoice_line_id,'kind','credit_instruction',
  'netPence',greatest(0,(x->'billedNet'->>'numerator')::numeric/(x->'billedNet'->>'denominator')::numeric-(x->'creditedNet'->>'numerator')::numeric/(x->'creditedNet'->>'denominator')::numeric),
  'grossPence',greatest(0,(il->>'grossPence')::numeric-coalesce((SELECT sum((z->>'grossPence')::numeric) FROM app.billing_fact cf CROSS JOIN LATERAL jsonb_array_elements(cf.payload->'lineAdjustments') z
    WHERE cf.tenant_id=t AND cf.source=r.source AND cf.invoice_number=r.invoice_number AND cf.match_valid AND cf.payload->>'factType'='credited' AND z->>'externalInvoiceLineId'=m.external_invoice_line_id),0))) ORDER BY r.id,m.external_invoice_line_id),'[]'::jsonb)
 INTO fixes FROM app.billing_export_line e JOIN app.billing_line_match m ON(m.tenant_id,m.export_line_id)=(e.tenant_id,e.id)
 JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
 CROSS JOIN LATERAL jsonb_array_elements(r.projection->'lines') x
 CROSS JOIN LATERAL jsonb_array_elements(f.payload->'composition'->'lines') il
 WHERE e.tenant_id=t AND e.job_id=p_job AND e.extra_id=p_duplicate AND x->>'lineId'=m.external_invoice_line_id AND il->>'externalInvoiceLineId'=m.external_invoice_line_id
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=t AND nx.predecessor_id=r.id);
 content:=jsonb_build_object('version','enterprise-duplicate-correction.v1','jobId',p_job,'duplicateId',p_duplicate,'canonicalId',p_canonical,'corrections',fixes);
 h:=app.final_lock_hash(content);
 -- The explicit finance command approves exactly this server-derived correction, atomically (AGENTS 5.3).
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,p_command,'ReconcileExportedDuplicate','enterprise-duplicate:'||p_job::text||':'||p_command::text,req,'processing',a);
 INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES(t,dec,'enterprise_duplicate_correction',correction::text,'ReconcileExportedDuplicate');
 INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES(t,res,dec,'approved',a);
 INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(t,auth,dec,res,a,'ReconcileExportedDuplicate',NULL,h,1,(SELECT coalesce(sum((x->>'grossPence')::bigint),0) FROM jsonb_array_elements(fixes) x),'GBP','enterprise_site_capture_policy_v1',clock_timestamp()+interval '1 day');
 INSERT INTO app.enterprise_duplicate_correction(tenant_id,id,command_id,link_id,job_id,duplicate_id,canonical_id,actor_membership_id,authorization_id,corrections,content_hash)
 VALUES(t,correction,p_command,link,p_job,p_duplicate,p_canonical,a,auth,fixes,h);
 INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id)
 VALUES(t,link,p_job,p_duplicate,p_canonical,'link',p_command,a);
 outcome:=jsonb_build_object('correctionId',correction,'linkId',link,'contentHash',h,'corrections',fixes,'replayed',false);
 UPDATE app.command_receipt SET status='succeeded',result=outcome,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
 -- Existing deferred link-audit guard requires this exact event ID and references.
 payload:=jsonb_build_object('references',jsonb_build_object('command',p_command::text,'link',link::text,'correction',correction::text,'authorization',auth::text,'environment','synthetic_demo'),'hashes',jsonb_build_object('content',h));
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,'contractor.extra.duplicate_linked','extra',p_duplicate::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(link,t,seq,'audit.v1','membership:'||a::text,'contractor.extra.duplicate_linked','extra',p_duplicate::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN outcome;
END $$;
ALTER FUNCTION app.ef_reconcile_exported_duplicate(uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_reconcile_exported_duplicate(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_reconcile_exported_duplicate(uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
