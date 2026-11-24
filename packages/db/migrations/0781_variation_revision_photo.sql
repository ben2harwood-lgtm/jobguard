-- QW-1: photos on variations. A priced revision freezes the extra's verified
-- photos; the customer sees and approves exactly that set.
BEGIN;

-- Lets a link name one revision of one variation on one scope item, all at once.
ALTER TABLE app.variation_revision ADD CONSTRAINT variation_revision_photo_identity_uq UNIQUE(tenant_id,job_id,variation_id,id,scope_item_id);

CREATE TABLE app.variation_revision_photo (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 variation_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 scope_item_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 position smallint NOT NULL CHECK(position BETWEEN 1 AND 6),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,revision_id,evidence_id),
 UNIQUE(tenant_id,revision_id,position),
 -- The revision, its variation and its scope item travel together; the photo must sit on the same job and scope item.
 FOREIGN KEY(tenant_id,job_id,variation_id,revision_id,scope_item_id)
  REFERENCES app.variation_revision(tenant_id,job_id,variation_id,id,scope_item_id),
 FOREIGN KEY(tenant_id,evidence_id,job_id,scope_item_id) REFERENCES app.evidence_object(tenant_id,id,job_id,scope_item_id)
);
ALTER TABLE app.variation_revision_photo OWNER TO jobguard_migration;
ALTER TABLE app.variation_revision_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.variation_revision_photo FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.variation_revision_photo FOR ALL TO jobguard_migration,jobguard_runtime
 USING (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'')::uuid)
 WITH CHECK (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'')::uuid);
-- The checked customer variation reads only its exact portal job.
CREATE POLICY lp11_customer_variation_read ON app.variation_revision_photo FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('variation_job',job_id));
REVOKE ALL ON app.variation_revision_photo FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
-- Only the pricing trigger (SECURITY DEFINER, migration-owned) writes links.
GRANT SELECT ON app.variation_revision_photo TO jobguard_runtime;
CREATE TRIGGER variation_revision_photo_immutable BEFORE UPDATE OR DELETE ON app.variation_revision_photo
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER variation_revision_photo_no_truncate BEFORE TRUNCATE ON app.variation_revision_photo
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- The customer may read the stored object only for a photo linked to a revision
-- of a variation on its own portal job.
CREATE POLICY lp11_customer_variation_photo_read ON app.evidence_object FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('variation_job',job_id) AND EXISTS(
  SELECT 1 FROM app.variation_revision_photo p
  WHERE (p.tenant_id,p.job_id,p.evidence_id)=(evidence_object.tenant_id,evidence_object.job_id,evidence_object.id)));
-- ...and whether that linked photo has since been invalidated, so a withdrawn
-- photo is marked in the view and refused for download.
CREATE POLICY lp11_customer_variation_photo_invalidation ON app.evidence_invalidation FOR SELECT TO jobguard_migration
 USING (EXISTS(SELECT 1 FROM app.variation_revision_photo p
  WHERE (p.tenant_id,p.evidence_id)=(evidence_invalidation.tenant_id,evidence_invalidation.evidence_id)
   AND p.tenant_id=app.lp11_customer_tenant('variation_job',p.job_id)));

-- Runs as the migration owner on every priced revision. Links the extra's verified, uninvalidated photos
-- in received order, at most six. Later photos appear only on a later revision.
CREATE FUNCTION app.link_variation_revision_photos() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO app.variation_revision_photo(tenant_id,job_id,variation_id,revision_id,scope_item_id,evidence_id,position,sha256,received_at)
 SELECT NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.id,NEW.scope_item_id,x.id,x.n,x.sha256,x.server_verified_at FROM (
  SELECT e.id,btrim(e.sha256) sha256,e.server_verified_at,row_number() OVER(ORDER BY e.server_verified_at,e.id)::smallint n
  FROM app.evidence_object e
  JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
  WHERE (e.tenant_id,e.job_id)=(NEW.tenant_id,NEW.job_id) AND e.scope_item_id=NEW.scope_item_id
   AND e.kind='original' AND e.evidence_type='variation_photo'
   AND u.state='verified' AND u.object_version_id=e.object_version_id
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))
 ) x WHERE x.n<=6;
 RETURN NULL;
END $$;
ALTER FUNCTION app.link_variation_revision_photos() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.link_variation_revision_photos() FROM PUBLIC;
CREATE TRIGGER variation_revision_photo_link AFTER INSERT ON app.variation_revision
 FOR EACH ROW EXECUTE FUNCTION app.link_variation_revision_photos();

-- Customer download target: the same checked portal session as the read. Only a
-- variation photo of that variation's scope item, frozen on its current revision,
-- and never one that has since been invalidated.
CREATE FUNCTION identity.customer_variation_photo(t uuid,j uuid,c uuid,digest text,evidence uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o app.evidence_object;
BEGIN
 IF evidence IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp11_customer_operation('variation');
 SELECT e.* INTO o FROM app.evidence_object e
 WHERE (e.tenant_id,e.job_id,e.id)=(t,j,evidence) AND e.kind='original' AND e.evidence_type='variation_photo'
  AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))
  AND EXISTS(SELECT 1 FROM app.variation_revision_photo p
  JOIN app.variation v ON (v.tenant_id,v.job_id,v.id,v.current_revision_id,v.scope_item_id)=(p.tenant_id,p.job_id,p.variation_id,p.revision_id,p.scope_item_id)
  WHERE (p.tenant_id,p.job_id,p.evidence_id,p.scope_item_id)=(e.tenant_id,e.job_id,e.id,e.scope_item_id) AND v.state IN('priced','approved'));
 IF o.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_close_customer_scope();
 RETURN jsonb_build_object('version','customer-variation-photo.v1','objectKey',o.object_key,'objectVersionId',o.object_version_id,'contentType',o.content_type);
END $$;
ALTER FUNCTION identity.customer_variation_photo(uuid,uuid,uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.customer_variation_photo(uuid,uuid,uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.customer_variation_photo(uuid,uuid,uuid,text,uuid) TO jobguard_identity;

CREATE OR REPLACE FUNCTION identity.customer_variation(t uuid,j uuid,c uuid,digest text,command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.customer_portal_session; v app.variation; r app.variation_revision; a app.variation_approval;
 job app.job; provenance app.customer_variation_approval; target jsonb; request_hash text; result jsonb; cmd uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp11_customer_operation('variation');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j;
 IF command IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',var.id,'revision',rev.revision,'hash',rev.content_hash,'description',rev.description,
   'amount',jsonb_build_object('pence',rev.signed_delta_pence,'currency','GBP'),'approved',approval.id IS NOT NULL,'method',approval.method,
   'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('evidenceId',p.evidence_id,'sha256',p.sha256,'receivedAt',to_char(p.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'withdrawn',EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(p.tenant_id,p.evidence_id))) ORDER BY p.position),'[]'::jsonb)
    FROM app.variation_revision_photo p WHERE (p.tenant_id,p.job_id,p.revision_id)=(rev.tenant_id,rev.job_id,rev.id))) ORDER BY var.id),'[]'::jsonb) INTO result
  FROM app.variation var JOIN app.variation_revision rev ON(rev.tenant_id,rev.job_id,rev.variation_id,rev.id)=(var.tenant_id,var.job_id,var.id,var.current_revision_id)
  LEFT JOIN app.variation_approval approval ON(approval.tenant_id,approval.revision_id)=(rev.tenant_id,rev.id)
  WHERE var.tenant_id=t AND var.job_id=j AND var.state IN('priced','approved');
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-variations.v2','jobId',j,'jobRevision',job.revision,'variations',result);
 END IF;
 target:=(command->'target');
 -- Revalidate the strict envelope at the SQL boundary; the identity role cannot bypass HTTP validation.
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR (command-ARRAY['version','commandId','jobId','expectedJobRevision','target'])<>'{}'::jsonb
  OR (command->>'version') IS DISTINCT FROM 'customer-portal-approval.v1' OR (command->>'jobId')::uuid IS DISTINCT FROM j
  OR jsonb_typeof(command->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(command->'jobId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(command->'expectedJobRevision') IS DISTINCT FROM 'number' OR (command->>'expectedJobRevision') !~ '^(0|[1-9][0-9]*)$'
  OR jsonb_typeof(target) IS DISTINCT FROM 'object' OR (target-ARRAY['kind','id','revision','hash','amount','photos'])<>'{}'::jsonb
  OR (target ? 'photos' AND CASE WHEN jsonb_typeof(target->'photos')='array' THEN jsonb_array_length(target->'photos')>6
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(target->'photos') e WHERE jsonb_typeof(e) IS DISTINCT FROM 'string' OR (e#>>'{}') !~ '^[a-f0-9]{64}$') ELSE true END)
  OR (target->>'kind') IS DISTINCT FROM 'variation' OR jsonb_typeof(target->'id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(target->'revision') IS DISTINCT FROM 'number' OR (target->>'revision') !~ '^[1-9][0-9]*$'
  OR jsonb_typeof(target->'hash') IS DISTINCT FROM 'string' OR (target->>'hash') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(target->'amount') IS DISTINCT FROM 'object' OR ((target->'amount')-ARRAY['pence','currency'])<>'{}'::jsonb
  OR (target->'amount'->>'currency') IS DISTINCT FROM 'GBP' OR jsonb_typeof(target->'amount'->'pence') IS DISTINCT FROM 'number'
  OR (target->'amount'->>'pence') !~ '^-?(0|[1-9][0-9]*)$' OR abs((target->'amount'->>'pence')::numeric)>1000000000000
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 cmd:=(command->>'commandId')::uuid;
 IF cmd IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_customer_command(cmd);
 PERFORM app.lp11_customer_variation_target((target->>'id')::uuid);
 request_hash:=app.final_lock_hash(command);
 SELECT * INTO v FROM app.variation WHERE tenant_id=t AND job_id=j AND id=(target->>'id')::uuid FOR UPDATE;
 -- Source triggers take this lock on insert; acquire it before the final session clock check.
 PERFORM app.lock_recovery_message_sources(t);
 -- Refresh after the variation lock; a concurrent approval/pricing writer may have committed during the wait.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO a FROM app.variation_approval WHERE tenant_id=t AND id=cmd;
 IF a.id IS NOT NULL THEN
  SELECT * INTO provenance FROM app.customer_variation_approval WHERE tenant_id=t AND variation_approval_id=a.id;
  IF a.job_id<>j OR provenance.customer_session_id IS DISTINCT FROM s.id OR provenance.customer_command_hash IS DISTINCT FROM request_hash
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',a.id,'method',a.method);
 END IF;
 IF v.id IS NULL OR v.state<>'priced' OR job.status<>'live' OR job.revision<>(command->>'expectedJobRevision')::integer
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.variation_revision WHERE tenant_id=t AND job_id=j AND variation_id=v.id AND id=v.current_revision_id;
 IF r.id IS NULL OR r.revision<>(target->>'revision')::integer OR r.content_hash<>(target->>'hash')
  OR r.signed_delta_pence<>(target->'amount'->>'pence')::bigint
  OR EXISTS(SELECT 1 FROM app.variation_approval WHERE tenant_id=t AND revision_id=r.id)
  OR EXISTS(SELECT 1 FROM app.variation_rejection WHERE tenant_id=t AND revision_id=r.id)
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- QW-1: the customer approves the exact photos frozen on this revision, in order.
 IF coalesce(target->'photos','[]'::jsonb) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(p.sha256) ORDER BY p.position),'[]'::jsonb)
   FROM app.variation_revision_photo p WHERE (p.tenant_id,p.job_id,p.revision_id)=(t,j,r.id))
 THEN RAISE EXCEPTION 'PHOTOS_CHANGED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_customer_variation_target(v.id,v.scope_item_id);
 INSERT INTO app.customer_variation_approval(tenant_id,variation_approval_id,customer_session_id,customer_command_hash)
 VALUES(t,cmd,s.id,request_hash);
 INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,evidence_id,approved_at)
 VALUES(cmd,t,j,v.id,r.id,r.revision,r.content_hash,r.signed_delta_pence,'customer_authenticated',NULL,NULL,clock_timestamp());
 INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) SELECT t,j,v.scope_item_id WHERE v.existing_scope_item_id IS NULL ON CONFLICT DO NOTHING;
 UPDATE app.variation SET state='approved' WHERE tenant_id=t AND id=v.id;
 PERFORM app.customer_portal_audit(t,cmd,'variation_approved');
 PERFORM app.lp11_close_customer_scope();
 RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',cmd,'method','customer_authenticated');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;

COMMIT;
