BEGIN;
-- MON-5 M5-MESSAGE: the existing checked SV-7A writer remains the only source writer.
-- Its existing actor_membership_id/actualTesterMembershipId is the synthetic grant sponsor,
-- not a customer membership. Customer provenance is separately audited by session ID.
CREATE FUNCTION app.sv7a_require_source_owner(t uuid,j uuid,digest text,source text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c uuid; d text; sponsor uuid;
BEGIN
 IF digest LIKE 'customer:%' THEN
  IF source IS DISTINCT FROM 'customer_message' OR digest !~ '^customer:[a-f0-9-]{36}:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  c:=split_part(digest,':',2)::uuid; d:=split_part(digest,':',3);
  PERFORM identity.customer_portal_use(t,j,c,d,NULL,'resolve');
  SELECT g.issuer_membership_id INTO sponsor FROM app.customer_portal_session s
   JOIN app.customer_portal_grant g ON(g.tenant_id,g.id)=(s.tenant_id,s.grant_id)
   WHERE s.tenant_id=t AND s.job_id=j AND s.customer_id=c AND s.token_digest=d;
  IF sponsor IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN sponsor;
 END IF;
 RETURN app.ch4_require_command_owner(t,j,digest);
END $$;
ALTER FUNCTION app.sv7a_require_source_owner(uuid,uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.sv7a_require_source_owner(uuid,uuid,text,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- Patch the current routine in place so LP-5 command lifecycle and later source-writer changes survive.
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)'::regprocedure);
 changed:=replace(original,'app.ch4_require_command_owner(t,j,digest)','app.sv7a_require_source_owner(t,j,digest,source)');
 IF changed=original THEN RAISE EXCEPTION 'unexpected intake authority'; END IF;
 original:=changed;
 changed:=replace(original,'WHEN source=''customer_message'' AND txt=''Please fit an outside tap.'' THEN ''job-source:request-tap.v1'' END;',
  'WHEN source=''customer_message'' AND txt=''Please fit an outside tap.'' THEN ''job-source:request-tap.v1'' WHEN source=''customer_message'' AND txt=''There are exposed live wires beside the new socket.'' THEN ''customer-message:exposed-wires.synthetic.v1'' END;');
 IF changed=original THEN RAISE EXCEPTION 'unexpected intake fixture'; END IF;
 EXECUTE changed;
END $$;

CREATE FUNCTION identity.customer_portal_message(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; sid uuid; existed boolean;
BEGIN
 -- Resolve before looking at command history. Same advisory lock as sign-in/revoke,
 -- retained through the writer, so revoke/rebind cannot race a stale successful write.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'customer-portal-message.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>4
  OR NOT input ?& ARRAY['version','jobId','commandId','text'] OR input->>'jobId' IS DISTINCT FROM j::text
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=(input->>'commandId')::uuid) INTO existed;
 result:=app.sv7a_intake_job_source(t,j,'customer:'||c::text||':'||digest,'customer_message',
  jsonb_build_object('version','customer-message-input.v1','commandId',input->>'commandId','text',input->'text',
   'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name','Fictional customer')));
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 IF NOT existed THEN
  PERFORM app.append_final_check_audit(gen_random_uuid(),'customer-session:'||sid::text,j,'customer_portal.message_recorded',
   jsonb_build_object('commandId',input->>'commandId','customerId',c,'sessionId',sid,'sourceId',result->'record'->>'id'));
 END IF;
 -- Builder storage/receipts retain the sponsor; redact only the customer result,
 -- including authorized replays of the original stored receipt.
 -- No signal access, counts, detector scheduling or inferred approval/price in this path.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN result #- '{record,actualTesterMembershipId}';
END $$;
ALTER FUNCTION identity.customer_portal_message(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.customer_portal_message(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION identity.customer_portal_message(uuid,uuid,uuid,text,jsonb) TO jobguard_identity;
COMMIT;
