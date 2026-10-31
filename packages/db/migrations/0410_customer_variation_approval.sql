BEGIN;
-- Additive customer provenance; historical member approvals retain their original fields.
ALTER TABLE app.variation_approval ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE app.variation_approval ADD COLUMN customer_session_id uuid,
 ADD COLUMN customer_command_hash text,
 ADD FOREIGN KEY(tenant_id,customer_session_id) REFERENCES app.customer_portal_session(tenant_id,id);
ALTER TABLE app.variation_approval DROP CONSTRAINT variation_approval_method_check;
ALTER TABLE app.variation_approval DROP CONSTRAINT variation_approval_check;
ALTER TABLE app.variation_approval ADD CONSTRAINT variation_approval_method_check
 CHECK(method IN('customer_evidence','builder_attestation','customer_authenticated'));
ALTER TABLE app.variation_approval ADD CONSTRAINT variation_approval_check CHECK(
 (method='customer_authenticated' AND actor_membership_id IS NULL AND evidence_id IS NULL
  AND customer_session_id IS NOT NULL AND customer_command_hash IS NOT NULL AND customer_command_hash ~ '^[a-f0-9]{64}$') OR
 (method IN('customer_evidence','builder_attestation') AND actor_membership_id IS NOT NULL
  AND customer_session_id IS NULL AND customer_command_hash IS NULL
  AND ((method='customer_evidence' AND evidence_id IS NOT NULL) OR (method='builder_attestation' AND evidence_id IS NULL))));

-- Runtime INSERT remains available for legacy member approvals, never for customer provenance.
CREATE FUNCTION app.customer_variation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.method='customer_authenticated' THEN
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.customer_portal_session s WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.customer_session_id AND s.job_id=NEW.job_id)
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_variation_guard BEFORE INSERT ON app.variation_approval FOR EACH ROW EXECUTE FUNCTION app.customer_variation_guard();

-- Latest definition is 0282. Only the reviewer reference changes: customer sessions are not memberships.
CREATE OR REPLACE FUNCTION app.final_check_claim_catch_case() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE o app.extra_origin;c app.recovery_case;
BEGIN
 SELECT * INTO o FROM app.extra_origin WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id=NEW.variation_id;
 IF o.kind IS DISTINCT FROM 'jobguard_catch' OR NEW.signed_delta_pence<=0 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM app.recovery_case WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_type='missed_variation_final_account' AND source_refs ? ('variation:'||NEW.variation_id::text);
 IF c.id IS NULL OR EXISTS(SELECT 1 FROM app.recovery_claim_revision WHERE tenant_id=NEW.tenant_id AND case_id=c.id) THEN RETURN NULL; END IF;
 INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)
 VALUES(gen_random_uuid(),NEW.tenant_id,NEW.job_id,c.id,1,NEW.signed_delta_pence,'GBP',
  CASE WHEN NEW.method='customer_authenticated' THEN 'customer-session:'||NEW.customer_session_id::text ELSE 'membership:'||NEW.actor_membership_id::text END,
  app.final_lock_hash(jsonb_build_object('caseId',c.id,'revision',1,'claimedNetPence',NEW.signed_delta_pence,'variationApprovalId',NEW.id)));
 RETURN NULL;
END $$;

-- A NULL command reads current priced/approved revisions only. No hidden sources are queried.
-- Every invocation authenticates via 0387, including replay. Locks precede the final clock check and audit.
CREATE FUNCTION identity.customer_variation(t uuid,j uuid,c uuid,digest text,command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.customer_portal_session; v app.variation; r app.variation_revision; a app.variation_approval;
 job app.job; target jsonb; request_hash text; result jsonb; cmd uuid;
BEGIN
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j;
 IF command IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',var.id,'revision',rev.revision,'hash',rev.content_hash,'description',rev.description,
   'amount',jsonb_build_object('pence',rev.signed_delta_pence,'currency','GBP'),'approved',approval.id IS NOT NULL,'method',approval.method) ORDER BY var.id),'[]'::jsonb) INTO result
  FROM app.variation var JOIN app.variation_revision rev ON(rev.tenant_id,rev.job_id,rev.variation_id,rev.id)=(var.tenant_id,var.job_id,var.id,var.current_revision_id)
  LEFT JOIN app.variation_approval approval ON(approval.tenant_id,approval.revision_id)=(rev.tenant_id,rev.id)
  WHERE var.tenant_id=t AND var.job_id=j AND var.state IN('priced','approved');
  RETURN jsonb_build_object('version','customer-variations.v1','jobId',j,'jobRevision',job.revision,'variations',result);
 END IF;
 target:=command->'target';
 -- Revalidate the strict envelope at the SQL boundary; the identity role cannot bypass HTTP validation.
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR command-ARRAY['version','commandId','jobId','expectedJobRevision','target']<>'{}'::jsonb
  OR command->>'version' IS DISTINCT FROM 'customer-portal-approval.v1' OR (command->>'jobId')::uuid IS DISTINCT FROM j
  OR jsonb_typeof(command->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(command->'jobId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(command->'expectedJobRevision') IS DISTINCT FROM 'number' OR command->>'expectedJobRevision' !~ '^(0|[1-9][0-9]*)$'
  OR jsonb_typeof(target) IS DISTINCT FROM 'object' OR target-ARRAY['kind','id','revision','hash','amount']<>'{}'::jsonb
  OR target->>'kind' IS DISTINCT FROM 'variation' OR jsonb_typeof(target->'id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(target->'revision') IS DISTINCT FROM 'number' OR target->>'revision' !~ '^[1-9][0-9]*$'
  OR jsonb_typeof(target->'hash') IS DISTINCT FROM 'string' OR target->>'hash' !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(target->'amount') IS DISTINCT FROM 'object' OR (target->'amount')-ARRAY['pence','currency']<>'{}'::jsonb
  OR target->'amount'->>'currency' IS DISTINCT FROM 'GBP' OR jsonb_typeof(target->'amount'->'pence') IS DISTINCT FROM 'number'
  OR target->'amount'->>'pence' !~ '^-?(0|[1-9][0-9]*)$' OR abs((target->'amount'->>'pence')::numeric)>1000000000000
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 cmd:=(command->>'commandId')::uuid;
 IF cmd IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 request_hash:=app.final_lock_hash(command);
 SELECT * INTO v FROM app.variation WHERE tenant_id=t AND job_id=j AND id=(target->>'id')::uuid FOR UPDATE;
 -- Source triggers take this lock on insert; acquire it before the final session clock check.
 PERFORM app.lock_recovery_message_sources(t);
 -- Refresh after the variation lock; a concurrent approval/pricing writer may have committed during the wait.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO a FROM app.variation_approval WHERE tenant_id=t AND id=cmd;
 IF a.id IS NOT NULL THEN
  IF a.job_id<>j OR a.customer_session_id IS DISTINCT FROM s.id OR a.customer_command_hash IS DISTINCT FROM request_hash
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',a.id,'method',a.method);
 END IF;
 IF v.id IS NULL OR v.state<>'priced' OR job.status<>'live' OR job.revision<>(command->>'expectedJobRevision')::integer
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.variation_revision WHERE tenant_id=t AND job_id=j AND variation_id=v.id AND id=v.current_revision_id;
 IF r.id IS NULL OR r.revision<>(target->>'revision')::integer OR r.content_hash<>target->>'hash'
  OR r.signed_delta_pence<>(target->'amount'->>'pence')::bigint
  OR EXISTS(SELECT 1 FROM app.variation_approval WHERE tenant_id=t AND revision_id=r.id)
  OR EXISTS(SELECT 1 FROM app.variation_rejection WHERE tenant_id=t AND revision_id=r.id)
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,evidence_id,approved_at,customer_session_id,customer_command_hash)
 VALUES(cmd,t,j,v.id,r.id,r.revision,r.content_hash,r.signed_delta_pence,'customer_authenticated',NULL,NULL,clock_timestamp(),s.id,request_hash);
 INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) SELECT t,j,v.scope_item_id WHERE v.existing_scope_item_id IS NULL ON CONFLICT DO NOTHING;
 UPDATE app.variation SET state='approved' WHERE tenant_id=t AND id=v.id;
 PERFORM app.customer_portal_audit(t,cmd,'variation_approved');
 RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',cmd,'method','customer_authenticated');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;
ALTER FUNCTION app.customer_variation_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.customer_variation_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
ALTER FUNCTION identity.customer_variation(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.customer_variation(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.customer_variation(uuid,uuid,uuid,text,jsonb) TO jobguard_identity;
COMMIT;
