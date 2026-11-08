BEGIN;
-- Re-create latest 0639 body, changing only the billing_status refusal branch.
CREATE OR REPLACE FUNCTION app.connector_promotion(p_session uuid,p_namespace text,p_event text,p_command uuid,p_result jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; client uuid; job uuid;
 e connector.input_event; prior app.connector_promotion; items jsonb:='[]'; item jsonb; bytes bytea; expected uuid; target uuid; expected_result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 PERFORM 1 FROM control_plane.contractor_practice_session s
 WHERE s.session_digest=app.contractor_practice_session_digest(p_session) FOR SHARE;
 IF a IS NULL OR NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a FOR SHARE;
 IF (SELECT count(*) FROM app.client_organisation WHERE tenant_id=t AND name='Fictional Housing Association')<>1 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT id INTO client FROM app.client_organisation WHERE tenant_id=t AND name='Fictional Housing Association';
 IF client IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF (p_namespace IS NULL) IS DISTINCT FROM (p_event IS NULL) OR (p_event IS NULL AND (p_result IS NOT NULL OR p_command IS NOT NULL))
 THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 FOR e IN SELECT * FROM connector.input_event ev WHERE ev.tenant_id=t
  AND (p_event IS NULL OR (ev.namespace=p_namespace AND ev.event_id=p_event)) ORDER BY ev.received_at,ev.namespace,ev.event_id FOR SHARE
 LOOP
  IF e.kind='materials_issue' THEN
   SELECT w.job_id INTO job FROM app.work_order w WHERE w.tenant_id=t AND w.client_id=client AND w.reference='WO-DEMO-0001';
   BEGIN PERFORM app.lp_authority(p_session,job,'materials');
   EXCEPTION WHEN insufficient_privilege THEN CONTINUE; END;
  ELSIF NOT coalesce(app.work_order_client_permitted(a,client),false) THEN CONTINUE;
  END IF;
  SELECT * INTO prior FROM app.connector_promotion pr WHERE pr.tenant_id=t AND pr.namespace=e.namespace AND pr.event_id=e.event_id;
  item:=jsonb_build_object('namespace',e.namespace,'eventId',e.event_id,'kind',e.kind,'subject',e.subject,'revision',e.revision,
    'document',e.payload->>'document','result',prior.result,'hold',CASE WHEN e.kind='billing_status' THEN 'BILLING_COMPOSITION_REQUIRED' ELSE NULL END);
  IF p_result IS NOT NULL THEN
   IF e.kind='billing_status' THEN
    -- Link only: ENT-6 owns every monetary fact and its completed import receipt.
    IF NOT (p_result ? 'billingImport') OR e.payload->>'status' NOT IN('invoiced','credited','paid','payment_reversed','rejected')
    THEN RAISE EXCEPTION 'BILLING_COMPOSITION_REQUIRED'; END IF;
    SELECT i.job_id INTO job FROM app.billing_status_import i
     WHERE i.tenant_id=t AND i.id=(p_result->>'billingImport')::uuid;
    IF job IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
    PERFORM app.cb_authority(p_session,job,true);
    IF NOT EXISTS(SELECT 1 FROM app.billing_status_import i JOIN app.command_receipt cr
      ON(cr.tenant_id,cr.command_id)=(i.tenant_id,i.command_id)
      WHERE i.tenant_id=t AND i.id=(p_result->>'billingImport')::uuid AND cr.command_type='ImportBillingStatus'
       AND cr.status='succeeded' AND cr.result=jsonb_build_object('importId',i.id)
       AND EXISTS(SELECT 1 FROM app.billing_fact f WHERE f.tenant_id=t AND f.import_id=i.id AND f.job_id=i.job_id
        AND f.source_event_id=e.event_id AND f.payload->>'factType'=e.payload->>'status'))
    THEN RAISE EXCEPTION 'BILLING_COMPOSITION_REQUIRED'; END IF;
    bytes:=substring(sha256(convert_to(t::text||':'||e.namespace||':'||e.event_id,'UTF8')) FROM 1 FOR 16);
    bytes:=set_byte(bytes,6,(get_byte(bytes,6)&15)|64); bytes:=set_byte(bytes,8,(get_byte(bytes,8)&63)|128);
    expected:=encode(bytes,'hex')::uuid;
    IF p_command IS DISTINCT FROM expected THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    expected_result:=jsonb_build_object('version','connector-billing-status-link.v1','billingImport',(p_result->>'billingImport')::uuid);
    IF p_result IS DISTINCT FROM expected_result THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
    IF prior.command_id IS NOT NULL THEN
     IF prior.command_id<>p_command OR prior.result<>p_result THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
     RETURN prior.result;
    END IF;
    -- The existing exclusive organisation fence serializes this cross-event claim.
    IF EXISTS(SELECT 1 FROM app.connector_promotion pr WHERE pr.tenant_id=t AND pr.result->>'billingImport'=p_result->>'billingImport')
    THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
    INSERT INTO app.connector_promotion(tenant_id,namespace,event_id,command_id,actor_membership_id,result) VALUES(t,e.namespace,e.event_id,p_command,a,p_result);
    PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,
     'eventType','connector.human_promoted','subjectType','connector-promotion','subjectRef',p_command::text,
     'payload',jsonb_build_object('references',jsonb_build_object('commandId',p_command,'sourceEvent',e.event_id,'billingImport',p_result->>'billingImport'),'hashes',jsonb_build_object('input',e.semantic_hash)))),'checked_operation');
    RETURN p_result;
   END IF;
   bytes:=substring(sha256(convert_to(t::text||':'||e.namespace||':'||e.event_id,'UTF8')) FROM 1 FOR 16);
   bytes:=set_byte(bytes,6,(get_byte(bytes,6)&15)|64); bytes:=set_byte(bytes,8,(get_byte(bytes,8)&63)|128);
   expected:=encode(bytes,'hex')::uuid;
   IF p_command IS DISTINCT FROM expected THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
   IF prior.command_id IS NOT NULL THEN
    IF prior.command_id<>p_command OR prior.result<>p_result THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
    RETURN prior.result;
   END IF;
   IF e.kind='work_order' THEN
    IF e.subject<>'fixture:demo-orders' OR NOT ((e.revision=1 AND e.payload->>'document'='fixture:starter_orders')
      OR (e.revision=2 AND e.payload->>'document'='fixture:revised_orders')) THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    -- A clean generated ENT-2 batch; no new price/origin write authority.
    SELECT b.id INTO target FROM app.import_batch b WHERE b.tenant_id=t AND b.id=(p_result->>'batchId')::uuid
     AND b.rejected_count=0 AND b.source_kind='generated'
     AND b.source_name='generated: '||substring(e.payload->>'document' FROM 9)
     AND b.source_sha256=p_result->'source'->>'sha256' AND b.command_id=(p_result->>'commandId')::uuid
     AND (b.actor_membership_id=a OR coalesce(app.contractor_allowed(a,'data.import',t) OR app.contractor_allowed(a,'organisation.manage',t),false));
    IF target IS NULL OR p_result->>'version' IS DISTINCT FROM 'work-order-import-result.v1'
     OR EXISTS(SELECT 1 FROM app.import_row_receipt r JOIN app.work_order w ON(w.tenant_id,w.id)=(r.tenant_id,r.work_order_id)
      WHERE r.tenant_id=t AND r.batch_id=target AND NOT coalesce(app.work_order_client_permitted(a,w.client_id),false))
    THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
    SELECT jsonb_build_object('version','work-order-import-result.v1','environment','synthetic_demo','batchId',b.id,'commandId',b.command_id,
     'replayed',p_result->'replayed','realExternalActions',0,
     'source',jsonb_build_object('name',b.source_name,'kind',b.source_kind,'sha256',b.source_sha256),
     'counts',jsonb_build_object('rows',b.row_count,'created',b.created_count,'revised',b.revised_count,'unchanged',b.unchanged_count,'rejected',b.rejected_count),
     'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('rowNumber',r.row_number,'outcome',r.outcome,'errorCode',r.error_code,
       'reference',r.work_order_reference,'workOrderId',r.work_order_id,'revisionId',r.revision_id) ORDER BY r.row_number),'[]'::jsonb)
       FROM app.import_row_receipt r WHERE r.tenant_id=t AND r.batch_id=b.id)) INTO expected_result
    FROM app.import_batch b WHERE b.tenant_id=t AND b.id=target;
    IF jsonb_typeof(p_result->'replayed') IS DISTINCT FROM 'boolean' OR p_result IS DISTINCT FROM expected_result THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
   ELSE
    IF e.subject<>'fixture:demo-order-1' OR e.revision<>1 OR e.payload->>'document'<>'fixture:door-materials' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    SELECT f.id INTO target FROM app.materials_issue_fact f JOIN app.command_receipt cr ON(cr.tenant_id,cr.command_id)=(f.tenant_id,f.command_id)
     WHERE f.tenant_id=t AND f.job_id=job AND f.command_id=p_command AND f.actor_membership_id=a
     AND cr.status='succeeded' AND cr.result=p_result;
    IF target IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
   END IF;
   INSERT INTO app.connector_promotion(tenant_id,namespace,event_id,command_id,actor_membership_id,result) VALUES(t,e.namespace,e.event_id,p_command,a,p_result);
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,
    'eventType','connector.human_promoted','subjectType','connector-promotion','subjectRef',p_command::text,
    'payload',jsonb_build_object('references',jsonb_build_object('commandId',p_command,'sourceEvent',e.event_id),'hashes',jsonb_build_object('input',e.semantic_hash)))),'checked_operation');
   RETURN p_result;
  END IF;
  items:=items||jsonb_build_array(item);
 END LOOP;
 IF p_event IS NOT NULL AND jsonb_array_length(items)=0 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN items;
END $$;
ALTER FUNCTION app.connector_promotion(uuid,text,text,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.connector_promotion(uuid,text,text,uuid,jsonb) FROM PUBLIC,jobguard_connector,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.connector_promotion(uuid,text,text,uuid,jsonb) TO jobguard_runtime;
COMMIT;
