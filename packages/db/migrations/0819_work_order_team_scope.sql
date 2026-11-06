-- LATER-SAFETY-83: an import must have authority over its destination team.
-- CREATE OR REPLACE preserves the existing owner and ACL; all other checks stay intact.
CREATE OR REPLACE FUNCTION app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; wo app.work_order; cur app.work_order_revision; binding app.contractor_party_binding;
 doc jsonb; revision_no integer; revision_id uuid:=(payload->>'revisionId')::uuid; job_row app.job; first_version uuid; second_version uuid; first_date date; second_date date;
 lines jsonb:=coalesce(payload->'lines','[]'::jsonb); status_value text:=payload->>'status'; issued date:=(payload->>'issuedOn')::date; version_id uuid:=nullif(payload->>'sorVersionId','')::uuid;
 total bigint; team_value uuid:=nullif(payload->'team'->>'teamId','')::uuid; member uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF payload->>'version' IS DISTINCT FROM 'work-order-commit.v1' OR k NOT IN('create','revise') OR status_value NOT IN('ordered','cancelled') OR jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>1000
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF k='create' THEN
  SELECT * INTO binding FROM app.contractor_party_binding WHERE tenant_id=t AND job_id=(payload->>'jobId')::uuid AND work_order_id=(payload->>'workOrderId')::uuid;
  IF binding.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Defence in depth: CH-3b already checked the actor against this client when it bound the parties; the order is committed only for a member who may import for it.
  IF NOT coalesce(app.work_order_client_permitted(actor,binding.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO job_row FROM app.job WHERE tenant_id=t AND id=binding.job_id FOR UPDATE;
  IF job_row.provenance<>'work_order' OR job_row.status<>'draft' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (payload->>'expectedRevision')::integer<>0 OR status_value<>'ordered' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
  VALUES(t,binding.work_order_id,binding.job_id,binding.client_id,binding.contract_id,binding.contract_version_id,payload->>'reference') RETURNING * INTO wo;
  revision_no:=1;
 ELSE
  SELECT * INTO wo FROM app.work_order WHERE tenant_id=t AND id=(payload->>'workOrderId')::uuid FOR UPDATE;
  -- An order of a client outside the actor's scope is, to them, an order that does not exist (ENT-1): no revision, cancellation or line/team change.
  IF wo.id IS NULL OR NOT coalesce(app.work_order_client_permitted(actor,wo.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT r.* INTO cur FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id) WHERE c.tenant_id=t AND c.work_order_id=wo.id;
  IF cur.id IS NULL OR cur.revision<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  revision_no:=cur.revision+1;
 END IF;
 SELECT document INTO doc FROM app.client_contract_version WHERE tenant_id=t AND id=wo.contract_version_id;
 -- The pinned contract version's tendered adjustment is the only adjustment a price can use.
 IF doc->'tenderedAdjustment'->>'numerator' IS DISTINCT FROM payload->'adjustment'->>'numerator' OR doc->'tenderedAdjustment'->>'denominator' IS DISTINCT FROM payload->'adjustment'->>'denominator'
 THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT' USING ERRCODE='22023'; END IF;
 IF status_value='ordered' THEN
  IF jsonb_array_length(lines)=0 OR version_id IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  -- The version in force on the order's issue date: the latest version listed by the pinned contract version that took effect on or before it.
  SELECT v.id,v.effective_from INTO first_version,first_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC LIMIT 1;
  SELECT v.id,v.effective_from INTO second_version,second_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC OFFSET 1 LIMIT 1;
  IF first_version IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF second_date=first_date THEN RAISE EXCEPTION 'AMBIGUOUS_SOR_VERSION' USING ERRCODE='22023'; END IF;
  IF first_version IS DISTINCT FROM version_id THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(sum((l->>'netPence')::bigint),0) INTO total FROM jsonb_array_elements(lines) l;
 INSERT INTO app.work_order_revision(tenant_id,id,work_order_id,revision,status,issued_on,due_on,priority,content_hash,diff,batch_id,row_number,sor_version_id,adjustment_numerator,adjustment_denominator,net_total_pence)
 VALUES(t,revision_id,wo.id,revision_no,status_value,issued,nullif(payload->>'dueOn','')::date,payload->>'priority',payload->>'contentHash',payload->'diff',(payload->>'batchId')::uuid,(payload->>'rowNumber')::integer,version_id,
  (payload->'adjustment'->>'numerator')::bigint,(payload->'adjustment'->>'denominator')::bigint,total);
 -- A scope identity per line, minted into the existing registry; an unchanged line keeps the identity the caller matched.
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state)
 SELECT (l->>'scopeItemId')::uuid,t,wo.job_id,'confirmed' FROM jsonb_array_elements(lines) l ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,client_line_reference,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin)
 SELECT t,(l->>'id')::uuid,wo.id,revision_id,wo.job_id,(l->>'position')::integer,(l->>'scopeItemId')::uuid,nullif(l->>'clientLineReference',''),(l->>'sorVersionId')::uuid,l->>'sorCode',l->>'unit',(l->>'ratePence')::bigint,l->>'quantity',(l->>'netPence')::bigint,l->>'origin'
 FROM jsonb_array_elements(lines) l;
 IF team_value IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=team_value) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT coalesce(app.contractor_allowed(actor,'organisation.manage',team_value) OR app.contractor_allowed(actor,'data.import',t),false) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,NULL);
  FOR member IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'team'->'membershipIds','[]'::jsonb)) LOOP
   IF NOT coalesce(app.contractor_member_active(member),false) OR NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=team_value AND tm.active
     AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id)))
   THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
   INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,member);
  END LOOP;
 ELSIF jsonb_array_length(coalesce(payload->'team'->'membershipIds','[]'::jsonb))>0 THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023';
 END IF;
 INSERT INTO app.work_order_current(tenant_id,work_order_id,revision_id) VALUES(t,wo.id,revision_id)
 ON CONFLICT(tenant_id,work_order_id) DO UPDATE SET revision_id=excluded.revision_id;
 IF k='create' THEN
  -- Live from import (CH-2): the job already has the CH-3b binding, so the existing JOB_PARTIES_REQUIRED guard on entering live is satisfied by it.
  UPDATE app.job SET status='live',revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=t AND id=wo.job_id AND provenance='work_order' AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('workOrderId',wo.id,'jobId',wo.job_id,'revisionId',revision_id,'revision',revision_no);
END $$;
