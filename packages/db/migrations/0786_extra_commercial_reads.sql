BEGIN;
-- EP-CC-R1: permission-scoped, read-only commercial reads over contractor extras. Additions only: three read routines.
-- No table, column, policy, trigger, row or grant on any existing object changes. Nothing here writes a business row,
-- appends audit, claims a command receipt, or makes any outbound call.
--
-- Plus two SELECT-only policies for the migration owner inside the existing delegated extra-customer scope (section 4).
-- Why a migration: the runtime role can SELECT the extra, approval and billing tables (RLS by tenant), but every grant
-- predicate (app.xa_covers, app.contractor_member_active, app.contractor_job_team) is private to the migration owner, and
-- the fee tables and the customer session are not runtime-readable. A reader must not re-implement grant coverage in
-- application SQL, so the coverage decision is made once here, by the same predicate the approval chain uses.
--
-- 1. app.cr_read_scope(session): the session-derived actor, the contractor jobs its current grants cover, and each job's
--    unresolved duplicate groups (app.extra_duplicate_unresolved, the export gate's own reading).
--    Fixed internal matrix, no caller-supplied permission name: supervisor, surveyor and commercial manager need a current,
--    unrevoked grant covering the job for its own role with job.read (xa_covers: tenant, region, branch or team scope);
--    finance needs the existing tenant-wide finance grant (the cb_authority rule) and then covers every contractor job.
--    Every other role (owner, admin, operative, read_only, client_approver) is refused. The client never reaches it:
--    a client session is not a contractor practice session.
-- 2. app.cr_fee_trail(session, job, extra): the stored fee contributions and statement references of one extra, for the
--    existing retained fee reader only (app.mon8_retained_fee_actor: tenant-wide finance). Figures are the stored ones.
-- 3. identity.extra_customer_entitlement(...): the client's narrow projection through the existing customer-portal extra
--    session. Same authority path as the history action of identity.extra_customer_approval (resolve the session, then
--    the current client grant for the link's request and for every earlier decision returned). Returns order lines against
--    claimed, the rate item, and that client's own earlier decisions on the extra. Inclusion rule and entitlement decision
--    are not recorded until CC-S2; no rationale, basis note, fee, statement, other client or other extra is read.
--
-- Lock order: shared tenant lock (seed 54) first; the customer read then takes the job lock (seed 417), exactly as the
-- existing customer history read. No row lock, no exclusive tenant lock. Forward-fix only: replace a routine body.

CREATE FUNCTION app.cr_read_scope(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; r text; jobs jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE OR p_session IS NULL THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 -- The effective member of the persisted session, read again after the lock wait; never a caller-supplied actor.
 SELECT m.id,m.role INTO a,r FROM app.contractor_session(p_session) x
  JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(x.tenant_id,x.membership_id,x.identity_user_id)
  WHERE x.tenant_id=t AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND coalesce(app.contractor_member_active(m.id),false);
 IF a IS NULL OR r IS NULL OR r NOT IN('supervisor','surveyor','commercial_manager','finance') THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 -- Retained-read availability, as the billing reader applies it; the role and job checks below still decide disclosure.
 PERFORM app.mon8_feature_decision(a,'approval_chains','retained_read');
 IF r='finance' THEN
  IF NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE(g.tenant_id,g.membership_id)=(t,a) AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE(v.tenant_id,v.grant_id)=(t,g.id))) THEN
   RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_agg(jsonb_build_object('jobId',j.id,'teamId',app.contractor_job_team(j.id),
    'duplicateGroups',coalesce((SELECT jsonb_agg(jsonb_build_object('groupId',u.group_id,'extras',u.extras) ORDER BY u.group_id) FROM app.extra_duplicate_unresolved(t,j.id) u),'[]'::jsonb)) ORDER BY j.id) INTO jobs
   FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
   WHERE j.tenant_id=t AND j.provenance='work_order' AND c.job_track='contractor' AND c.environment='synthetic_demo';
 ELSE
  SELECT jsonb_agg(jsonb_build_object('jobId',j.id,'teamId',app.contractor_job_team(j.id),
    'duplicateGroups',coalesce((SELECT jsonb_agg(jsonb_build_object('groupId',u.group_id,'extras',u.extras) ORDER BY u.group_id) FROM app.extra_duplicate_unresolved(t,j.id) u),'[]'::jsonb)) ORDER BY j.id) INTO jobs
   FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
   WHERE j.tenant_id=t AND j.provenance='work_order' AND c.job_track='contractor' AND c.environment='synthetic_demo'
    AND app.xa_covers(a,ARRAY[r],j.id,'job.read') IS NOT NULL;
 END IF;
 RETURN jsonb_build_object('version','extra-commercial-read-scope.v1','membershipId',a,'role',r,'feeReader',r='finance','jobs',coalesce(jobs,'[]'::jsonb));
END $$;

CREATE FUNCTION app.cr_fee_trail(p_session uuid, p_job uuid, p_extra uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_job IS NULL OR p_extra IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 -- The existing retained fee reader (tenant-wide finance, current session and membership); it raises otherwise.
 PERFORM app.mon8_retained_fee_actor(p_session);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(j.tenant_id,j.id,p_extra)
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND c.job_track='contractor' AND c.environment='synthetic_demo') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('derivationId',d.id,'period',d.period,'allocationId',c.allocation_id,'exportLineId',c.export_line_id,'rule',c.rule,
   'recordedAt',to_char(d.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'qualifyingPrincipal',jsonb_build_object('numerator',c.qualifying_numerator::text,'denominator',c.qualifying_denominator::text),
   'statements',coalesce((SELECT jsonb_agg(jsonb_build_object('statementId',st.id,'revision',st.revision,
     'superseded',EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id)) ORDER BY st.id)
    FROM app.enterprise_fee_statement_section x JOIN app.enterprise_fee_statement st ON(st.tenant_id,st.id)=(x.tenant_id,x.statement_id)
    WHERE x.tenant_id=t AND x.derivation_id=d.id),'[]'::jsonb)) ORDER BY d.server_recorded_at,d.id,c.allocation_id),'[]'::jsonb) INTO result
  FROM app.enterprise_fee_contribution c JOIN app.enterprise_fee_derivation d ON(d.tenant_id,d.id)=(c.tenant_id,c.derivation_id)
  WHERE c.tenant_id=t AND c.job_id=p_job AND c.extra_id=p_extra;
 RETURN jsonb_build_object('version','extra-fee-trail.v1','contributions',result);
END $$;

CREATE FUNCTION identity.extra_customer_entitlement(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.extra_client_session; k app.extra_client_link; q app.extra_approval_request; o app.extra_origin; v app.variation;
 sr app.extra_sor_revision; prior record; own jsonb:='[]'::jsonb; lines jsonb; claimed jsonb; rate jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,417));
 IF app.lp11_open_extra_customer(t,j,c,digest,'resolve') IS NOT TRUE
  OR identity.extra_customer_use(t,j,c,digest,NULL,'resolve') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
 SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 -- Exactly the four keys; the request is the session's own link request, never another one.
 IF k.id IS NULL OR input IS NULL OR jsonb_typeof(input)<>'object' OR input->>'version' IS DISTINCT FROM 'extra-customer.v1' OR input->>'action' IS DISTINCT FROM 'entitlement'
  OR input->>'jobId' IS DISTINCT FROM j::text OR input->>'requestId' IS DISTINCT FROM k.request_id::text
  OR (input-ARRAY['version','jobId','action','requestId'])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Current authority for the link's request (client grant, contract binding, current issuer), as the history read applies it.
 PERFORM app.lp6d_client_view_authority(j,k.request_id,c,k.recipient);
 SELECT * INTO q FROM app.extra_approval_request WHERE tenant_id=t AND job_id=j AND id=k.request_id;
 SELECT * INTO o FROM app.extra_origin WHERE tenant_id=t AND job_id=j AND variation_id=q.variation_id;
 SELECT * INTO v FROM app.variation WHERE tenant_id=t AND job_id=j AND id=q.variation_id;
 IF q.id IS NULL OR o.variation_id IS NULL OR v.id IS NULL OR o.work_order_revision_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('position',l.position,'clientLineReference',l.client_line_reference,'rateCode',l.sor_code,'unit',l.unit,'quantity',l.quantity) ORDER BY l.position),'[]'::jsonb)
  INTO lines FROM app.work_order_line l WHERE l.tenant_id=t AND l.job_id=j AND l.revision_id=o.work_order_revision_id;
 SELECT x.* INTO sr FROM app.extra_approval_revision_binding b JOIN app.extra_sor_revision x ON(x.tenant_id,x.id)=(b.tenant_id,b.sor_revision_id)
  WHERE b.tenant_id=t AND b.job_id=j AND b.id=q.binding_id AND b.source_kind='server_sor';
 claimed:=CASE WHEN sr.id IS NULL THEN jsonb_build_object('status','not_recorded','source','CC-S1') ELSE jsonb_build_object('coverage',sr.coverage,'rateCode',sr.sor_code,'unit',sr.unit,
  'instructedQuantity',sr.instructed_quantity,'claimedQuantity',sr.claimed_quantity,'pricedQuantity',sr.quantity) END;
 -- The rate item is the one the server priced from (code, unit, stored rate of the bound rate-list version).
 rate:=CASE WHEN sr.id IS NULL THEN jsonb_build_object('status','not_recorded','source','CC-S1') ELSE jsonb_build_object('code',sr.sor_code,'unit',sr.unit,'ratePence',sr.rate_pence) END;
 -- That client's own earlier decisions on this extra, each under current authority for its own request.
 FOR prior IN SELECT f.request_id,r.request_revision,'approve' decision,f.approved_net_pence net,NULL::text reason,f.server_recorded_at at FROM app.extra_approval_step_fact f
   JOIN app.extra_approval_request r ON(r.tenant_id,r.id)=(f.tenant_id,f.request_id)
   WHERE f.tenant_id=t AND f.job_id=j AND f.variation_id=q.variation_id AND f.actor_membership_id=c AND f.actor_kind='client_approver'
  UNION ALL SELECT x.request_id,r.request_revision,'reject',r.net_pence,x.reason_code,x.server_recorded_at FROM app.extra_approval_outcome x
   JOIN app.extra_approval_request r ON(r.tenant_id,r.id)=(x.tenant_id,x.request_id)
   WHERE x.tenant_id=t AND x.job_id=j AND x.variation_id=q.variation_id AND x.actor_membership_id=c AND x.actor_kind='client_approver' AND x.kind='rejected'
  ORDER BY 6,1 LOOP
  PERFORM app.lp6d_client_view_authority(j,prior.request_id,c,k.recipient);
  own:=own||jsonb_build_array(jsonb_build_object('requestId',prior.request_id,'requestRevision',prior.request_revision,'decision',prior.decision,'netPence',prior.net,
   'reasonCode',prior.reason,'recordedAt',to_char(prior.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 END LOOP;
 PERFORM app.lp11_close_extra_customer();
 RETURN jsonb_build_object('version','extra-client-entitlement.v1','requestId',q.id,'requestRevision',q.request_revision,'orderLines',lines,'claimed',claimed,'rateItem',rate,
  'inclusionRule',jsonb_build_object('status','not_recorded','source','CC-S2'),'decision',jsonb_build_object('status','not_recorded','source','CC-S2'),'ownDecisions',own);
END $$;

-- 4. The delegated extra-customer scope (LP-11) already exposes the link's job, request, binding, origin and variation to the
--    migration-owned customer routines. These two SELECT policies add only the order lines of that same job and the server-priced
--    revision of that same issued variation, so identity.extra_customer_entitlement can show order lines against claimed.
--    Scoped by app.lp11_extra_customer_tenant exactly like the existing lp11_extra_customer_read policies; no other role or command.
CREATE POLICY lp11_extra_customer_read ON app.work_order_line FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_extra_customer_tenant('job',job_id));
CREATE POLICY lp11_extra_customer_read ON app.extra_sor_revision FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_extra_customer_tenant('issued_variation',variation_id));

ALTER FUNCTION app.cr_read_scope(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.cr_fee_trail(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION identity.extra_customer_entitlement(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.cr_read_scope(uuid),app.cr_fee_trail(uuid,uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
REVOKE ALL ON FUNCTION identity.extra_customer_entitlement(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.cr_read_scope(uuid),app.cr_fee_trail(uuid,uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION identity.extra_customer_entitlement(uuid,uuid,uuid,text,jsonb) TO jobguard_identity;
COMMIT;
