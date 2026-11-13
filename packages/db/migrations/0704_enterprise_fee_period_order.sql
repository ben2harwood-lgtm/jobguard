BEGIN;
-- LATER-SAFETY-76: refuse older periods once the agreement has a later posted fee.
CREATE OR REPLACE FUNCTION app.ef_prepare_statement(p_session uuid,p_command uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; req text; existing app.enterprise_fee_statement; latest app.enterprise_fee_statement; sections jsonb; sh text;
 total bigint; s uuid:=gen_random_uuid(); rev integer; content jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 a:=app.ef_statement_begin(p_session,p_period); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF p_command IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 req:=app.final_lock_hash(jsonb_build_object('command','PrepareEnterpriseFeeStatement','period',p_period));
 SELECT * INTO existing FROM app.enterprise_fee_statement WHERE tenant_id=t AND command_id=p_command;
 IF existing.id IS NOT NULL THEN
  IF existing.request_hash<>req THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('statementId',existing.id,'replayed',true);
 END IF;
 sections:=app.ef_statement_sections(t,p_period);
 IF EXISTS(SELECT 1 FROM app.platform_enterprise_fee f
  JOIN app.enterprise_fee_statement posted ON posted.tenant_id=f.tenant_id AND posted.id=f.statement_id
  WHERE f.tenant_id=t AND posted.period>p_period
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(sections) x WHERE (x->>'agreementVersionId')::uuid=f.agreement_version_id)) THEN
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF jsonb_array_length(sections)=0 THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 sh:=app.final_lock_hash(sections);
 SELECT * INTO latest FROM app.enterprise_fee_statement WHERE tenant_id=t AND period=p_period ORDER BY revision DESC LIMIT 1;
 IF latest.id IS NOT NULL THEN
  -- An approved month is closed: later changes are compensated on a later statement (ENT-7c), never by revising it.
  IF EXISTS(SELECT 1 FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=latest.id) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  IF latest.sections_hash=sh AND NOT EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=latest.id) THEN
   RETURN jsonb_build_object('statementId',latest.id,'replayed',true);
  END IF;
 END IF;
 rev:=coalesce(latest.revision,0)+1;
 SELECT sum((x->>'deltaPence')::bigint) INTO total FROM jsonb_array_elements(sections) x;
 content:=jsonb_build_object('version','enterprise-fee-statement.v1','period',p_period,'revision',rev,'predecessorId',latest.id,'sections',sections,'totalDeltaPence',total);
 INSERT INTO app.enterprise_fee_statement(tenant_id,id,command_id,request_hash,period,revision,predecessor_id,sections_hash,content_hash,total_delta_pence,actor_membership_id)
 VALUES(t,s,p_command,req,p_period,rev,latest.id,sh,app.final_lock_hash(content),total,a);
 INSERT INTO app.enterprise_fee_statement_section(tenant_id,statement_id,agreement_version_id,derivation_id,input_hash,cumulative_fee_pence,prior_net_posted_pence,delta_pence)
 SELECT t,s,x."agreementVersionId",x."derivationId",x."inputHash",x."cumulativeFeePence",x."priorNetPostedPence",x."deltaPence"
 FROM jsonb_to_recordset(sections) AS x("agreementVersionId" uuid,"derivationId" uuid,"inputHash" text,"cumulativeFeePence" bigint,"priorNetPostedPence" bigint,"deltaPence" bigint);
 PERFORM app.ef_audit(a,'enterprise_fee.statement_prepared','enterprise_fee_statement',s,
  jsonb_build_object('references',jsonb_build_object('statement',s::text,'period',p_period,'revision',rev,'environment','synthetic_demo'),'hashes',jsonb_build_object('content',app.final_lock_hash(content))));
 RETURN jsonb_build_object('statementId',s,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION app.ef_post_statement(p_session uuid,p_command uuid,p_statement uuid,p_authorization uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; st app.enterprise_fee_statement; ap app.enterprise_fee_statement_approval; z app.action_authorization;
 sec record; ag app.enterprise_agreement_version; f uuid; prior uuid; posted integer:=0; remaining bigint; portion bigint; accrual record;
 req text; receipt app.command_receipt; outcome jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; PERFORM app.ef_actor(p_session);
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 a:=app.ef_statement_begin(p_session,st.period);
 IF p_command IS NULL OR p_authorization IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 req:=app.final_lock_hash(jsonb_build_object('command','PostEnterpriseFeeStatement','statement',st.id,'authorization',p_authorization,'actor',a));
 SELECT * INTO receipt FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF receipt.command_id IS NOT NULL THEN
  IF receipt.command_type<>'PostEnterpriseFeeStatement' OR receipt.request_hash<>req OR receipt.status<>'succeeded' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=t AND event_type='enterprise_fee.statement_posted' AND subject_type='enterprise_fee_statement' AND subject_ref=st.id::text) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Legacy runtime result-column grants cannot rewrite an authoritative replay outcome.
  RETURN jsonb_build_object('statementId',st.id,'replayed',true,'journals',(SELECT count(*) FROM app.platform_enterprise_fee WHERE tenant_id=t AND statement_id=st.id));
 END IF;
 IF EXISTS(SELECT 1 FROM app.platform_enterprise_fee WHERE tenant_id=t AND command_id=p_command
  AND (statement_id<>st.id OR authorization_id<>p_authorization OR actor_membership_id<>a)) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO ap FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=st.id;
 SELECT * INTO z FROM app.action_authorization WHERE tenant_id=t AND id=p_authorization FOR SHARE;
 IF ap.statement_id IS NULL OR z.id IS NULL OR ap.authorization_id<>z.id OR z.action_type<>'enterprise_fee_statement'
  OR z.revoked_at IS NOT NULL OR z.expires_at<=clock_timestamp() OR z.content_hash<>st.content_hash OR z.aggregate_revision<>st.revision
  OR z.amount_pence IS DISTINCT FROM abs(st.total_delta_pence) OR z.currency<>'GBP' OR z.policy_version<>'enterprise_site_capture_policy_v1'
  OR NOT EXISTS(SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=t AND r.id=z.resolution_id AND r.decision_id=z.decision_id AND r.resolution='approved')
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id) THEN
  RAISE EXCEPTION 'STATEMENT_AUTHORITY_INVALID' USING ERRCODE='42501';
 END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,p_command,'PostEnterpriseFeeStatement','enterprise-fee-post:'||p_command::text,req,'processing',a);
 -- Even a zero-delta statement has a durable outcome; a new key cannot manufacture a second posting audit.
 IF EXISTS(SELECT 1 FROM app.platform_enterprise_fee WHERE tenant_id=t AND statement_id=st.id)
  OR EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=t AND event_type='enterprise_fee.statement_posted' AND subject_type='enterprise_fee_statement' AND subject_ref=st.id::text) THEN
  SELECT count(*) INTO posted FROM app.platform_enterprise_fee WHERE tenant_id=t AND statement_id=st.id;
  outcome:=jsonb_build_object('statementId',st.id,'replayed',true,'journals',posted);
  UPDATE app.command_receipt SET status='succeeded',result=outcome,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
  -- A fresh command replaying actual journals is auditable; an all-zero statement has no second event.
  -- Count journals rather than the statement total: opposite-sign sections can net to zero.
  IF posted>0 THEN
   PERFORM app.ef_audit(a,'enterprise_fee.statement_post_replayed','enterprise_fee_statement',st.id,
    jsonb_build_object('references',jsonb_build_object('statement',st.id::text,'command',p_command::text,'authorization',z.id::text,'environment','synthetic_demo'),
     'hashes',jsonb_build_object('content',st.content_hash)));
  END IF;
  RETURN outcome;
 END IF;
 FOR sec IN SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=t AND statement_id=st.id ORDER BY agreement_version_id LOOP
  SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=sec.agreement_version_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM app.platform_enterprise_fee f
   JOIN app.enterprise_fee_statement posted ON posted.tenant_id=f.tenant_id AND posted.id=f.statement_id
   WHERE f.tenant_id=t AND f.agreement_version_id=sec.agreement_version_id AND posted.period>st.period) THEN
   RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF app.ef_inputs(t,ag,st.period)->>'hash' IS DISTINCT FROM sec.input_hash OR app.ef_posted_net(t,sec.agreement_version_id)<>sec.prior_net_posted_pence THEN
   RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001';
  END IF;
 END LOOP;
 FOR sec IN SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=t AND statement_id=st.id AND delta_pence<>0 ORDER BY agreement_version_id LOOP
  remaining:=abs(sec.delta_pence);
  -- Latest-first allocation uses only the unoffset balance of each same-agreement accrual.
  FOR accrual IN
   SELECT original.id, original.server_recorded_at, original.amount_pence-coalesce((SELECT sum(c.amount_pence)
    FROM app.platform_enterprise_fee c WHERE c.tenant_id=t AND c.compensates_fee_id=original.id),0) available
   FROM app.platform_enterprise_fee original
   WHERE original.tenant_id=t AND original.agreement_version_id=sec.agreement_version_id AND original.kind='accrual'
    AND sec.delta_pence<0
   UNION ALL SELECT NULL::uuid,NULL::timestamptz,remaining WHERE sec.delta_pence>0
   ORDER BY server_recorded_at DESC,id DESC
  LOOP
   IF accrual.available<=0 THEN CONTINUE; END IF;
   portion:=least(remaining,accrual.available); prior:=accrual.id; f:=gen_random_uuid();
   INSERT INTO app.platform_enterprise_fee(tenant_id,id,kind,statement_id,agreement_version_id,derivation_id,authorization_id,amount_pence,compensates_fee_id,environment,command_id,actor_membership_id)
   VALUES(t,f,CASE WHEN sec.delta_pence>0 THEN 'accrual' ELSE 'compensation' END,st.id,sec.agreement_version_id,sec.derivation_id,z.id,portion,prior,'synthetic_demo',p_command,a);
   INSERT INTO app.platform_enterprise_fee_line(tenant_id,fee_id,line_no,account,debit_pence,credit_pence) VALUES
    (t,f,1,CASE WHEN sec.delta_pence>0 THEN 'contractor_fee_receivable' ELSE 'platform_fee_revenue' END,portion,0),
    (t,f,2,CASE WHEN sec.delta_pence>0 THEN 'platform_fee_revenue' ELSE 'contractor_fee_receivable' END,0,portion);
   posted:=posted+1; remaining:=remaining-portion;
   EXIT WHEN remaining=0;
  END LOOP;
  IF remaining<>0 THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 END LOOP;
 outcome:=jsonb_build_object('statementId',st.id,'replayed',false,'journals',posted);
 UPDATE app.command_receipt SET status='succeeded',result=outcome,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
 PERFORM app.ef_audit(a,'enterprise_fee.statement_posted','enterprise_fee_statement',st.id,
  jsonb_build_object('references',jsonb_build_object('statement',st.id::text,'command',p_command::text,'authorization',z.id::text,'journals',posted,'environment','synthetic_demo'),
   'hashes',jsonb_build_object('content',st.content_hash)));
 RETURN outcome;
END $$;
ALTER FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
