BEGIN;
-- LP-6c RED. Install only after LP-6b callers supply a protected binding.
-- Keep old parameters/overloads and all existing grants, permission checks,
-- resource checks, approval clocks and money arithmetic. No policy change.
-- Accessors are callable by the existing definer owners, not inherited by runtime.
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_migration,jobguard_command_writer;
GRANT EXECUTE ON FUNCTION app.bind_request(text,text,uuid) TO jobguard_migration;

-- Latest predecessor: 0004_ledger.sql.
CREATE OR REPLACE FUNCTION app.assert_financial_authorization(t uuid,a uuid,p varchar,n bigint,c char,h char) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$ DECLARE x app.financial_authorization;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() OR (SELECT lp6_auth.membership_id FROM app.financial_authorization lp6_auth WHERE lp6_auth.tenant_id=t AND lp6_auth.id=a) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT*INTO x FROM app.financial_authorization WHERE tenant_id=t AND id=a FOR UPDATE;IF NOT FOUND OR x.status<>'approved' OR x.purpose<>p OR x.amount_pence<>n OR x.currency<>c OR x.artifact_hash<>h OR(x.expires_at IS NOT NULL AND x.expires_at<=clock_timestamp())THEN RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';END IF;END $$;

-- Latest predecessor: 0151_ledger_corrections_fix.sql.
CREATE OR REPLACE FUNCTION app.post_plan_obligation(
  j uuid,b uuid,r uuid,i uuid,n bigint,c char(3),s varchar,pk varchar,
  pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() OR (SELECT lp6_auth.membership_id FROM app.financial_authorization lp6_auth WHERE lp6_auth.tenant_id=t AND lp6_auth.id=a) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR pk IS DISTINCT FROM 'synthetic_authorized_plan'
    OR n IS NULL OR n<=0 OR c IS DISTINCT FROM 'GBP' OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM app.assert_financial_authorization(t,a,'plan_obligation',n,c,h);
  IF r IS NOT DISTINCT FROM i OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=r AND currency=c AND class='receivable'
  ) OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=i AND currency=c AND class='deferred_income'
  ) THEN
    RAISE EXCEPTION 'distinct receivable and deferred income accounts in the same book required' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id)
    VALUES(j,t,b,c,'plan_obligation',s,pk,pr,h,a,au);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    VALUES(gen_random_uuid(),t,b,j,r,c,'debit',n),(gen_random_uuid(),t,b,j,i,c,'credit',n);
  RETURN j;
END $$;

-- Latest predecessor: 0151_ledger_corrections_fix.sql.
CREATE OR REPLACE FUNCTION app.post_plan_settlement(
  j uuid,b uuid,o uuid,cl uuid,r uuid,n bigint,c char(3),s varchar,
  pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; outstanding numeric;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() OR (SELECT lp6_auth.membership_id FROM app.financial_authorization lp6_auth WHERE lp6_auth.tenant_id=t AND lp6_auth.id=a) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR n IS NULL OR n<=0 OR c IS DISTINCT FROM 'GBP' OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o AND currency=c AND kind='plan_obligation' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'obligation not found' USING ERRCODE='P0002'; END IF;
  PERFORM app.assert_financial_authorization(t,a,'plan_settlement',n,c,h);
  IF cl IS NOT DISTINCT FROM r OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=cl AND currency=c AND class='provider_clearing'
  ) OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=r AND currency=c AND class='receivable'
  ) THEN
    RAISE EXCEPTION 'distinct clearing and receivable accounts in the same book required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.journal WHERE tenant_id=t AND reverses_journal_id=o) THEN
    RAISE EXCEPTION 'settlement of a reversed obligation refused' USING ERRCODE='23514';
  END IF;
  -- Positive obligation minus credits of unreversed settlements. A full reversal
  -- offsets the original settlement, restoring that capacity exactly once.
  SELECT sum(amount_pence) INTO outstanding FROM app.journal_line
    WHERE tenant_id=t AND book_id=b AND journal_id=o AND account_id=r AND side='debit';
  outstanding:=outstanding-COALESCE((
    SELECT sum(l.amount_pence) FROM app.journal x JOIN app.journal_line l
      ON (l.tenant_id,l.book_id,l.journal_id)=(x.tenant_id,x.book_id,x.id)
      WHERE x.tenant_id=t AND x.book_id=b AND x.obligation_journal_id=o AND x.kind='plan_settlement'
        AND l.account_id=r AND l.side='credit'
        AND NOT EXISTS(SELECT 1 FROM app.journal reversal WHERE reversal.tenant_id=t AND reversal.reverses_journal_id=x.id)
  ),0);
  IF outstanding IS NULL OR n>outstanding THEN
    RAISE EXCEPTION 'settlement exceeds outstanding receivable' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id,obligation_journal_id)
    VALUES(j,t,b,c,'plan_settlement',s,'authorized_settlement',pr,h,a,au,o);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    VALUES(gen_random_uuid(),t,b,j,cl,c,'debit',n),(gen_random_uuid(),t,b,j,r,c,'credit',n);
  RETURN j;
END $$;

-- Latest predecessor: 0151_ledger_corrections_fix.sql.
CREATE OR REPLACE FUNCTION app.reverse_journal(
  j uuid,b uuid,o uuid,s varchar,pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
  original app.journal; n bigint; c char(3);
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() OR (SELECT lp6_auth.membership_id FROM app.financial_authorization lp6_auth WHERE lp6_auth.tenant_id=t AND lp6_auth.id=a) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  -- Read immutable metadata first so a settlement correction can lock its parent
  -- before the original, matching the settlement path and avoiding inverse locks.
  SELECT * INTO original FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o;
  IF NOT FOUND THEN RAISE EXCEPTION 'original journal not found' USING ERRCODE='P0002'; END IF;
  IF original.kind='plan_settlement' THEN
    PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=original.obligation_journal_id FOR UPDATE;
  END IF;
  PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o FOR UPDATE;
  SELECT sum(amount_pence) FILTER(WHERE side='debit'),currency INTO n,c
    FROM app.journal_line WHERE tenant_id=t AND book_id=b AND journal_id=o GROUP BY currency;
  IF n IS NULL THEN RAISE EXCEPTION 'original journal not found' USING ERRCODE='P0002'; END IF;
  PERFORM app.assert_financial_authorization(t,a,'correction',n,c,h);
  IF EXISTS(SELECT 1 FROM app.journal WHERE tenant_id=t AND reverses_journal_id=o) THEN
    RAISE EXCEPTION 'journal already fully reversed' USING ERRCODE='23505';
  END IF;
  IF original.kind='reversal' THEN
    RAISE EXCEPTION 'a full reversal cannot itself be reversed' USING ERRCODE='23514';
  END IF;
  IF original.kind='plan_obligation' AND EXISTS (
    SELECT 1 FROM app.journal settlement WHERE settlement.tenant_id=t
      AND settlement.obligation_journal_id=o AND settlement.kind='plan_settlement'
      AND NOT EXISTS(SELECT 1 FROM app.journal reversal WHERE reversal.tenant_id=t AND reversal.reverses_journal_id=settlement.id)
  ) THEN
    RAISE EXCEPTION 'reverse active settlements before the obligation' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id,reverses_journal_id)
    VALUES(j,t,b,c,'reversal',s,'authorized_correction',pr,h,a,au,o);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    SELECT gen_random_uuid(),tenant_id,book_id,j,account_id,currency,
      CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END,amount_pence
      FROM app.journal_line WHERE tenant_id=t AND book_id=b AND journal_id=o;
  RETURN j;
END $$;

-- Latest predecessor: 0155_quote_reacceptance.sql.
CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid) RETURNS app.quote_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$ DECLARE j app.job;d app.quote_document_version;a app.quote_acceptance;prev_id uuid;prev_seq integer;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Match the command dispatcher's current active-owner boundary inside the routine,
 -- before inspecting the job. No new application write privilege is introduced.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'quoting' THEN RAISE EXCEPTION 'acceptance is not allowed' USING ERRCODE='22023';END IF;
 IF j.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document;
 IF NOT FOUND OR d.document_version<>p_version OR d.content_hash<>p_hash OR (d.snapshot->>'totalPence')::bigint<>p_total OR NOT EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=p_tenant AND s.job_id=p_job AND s.document_id=p_document AND s.content_hash=p_hash) THEN RAISE EXCEPTION 'stale or unissued exact quote' USING ERRCODE='22023';END IF;
 -- Supersession is an immutable fact. The job lock serializes this read with
 -- disposition, including facts recorded before this migration.
 IF EXISTS(SELECT 1 FROM app.acceptance_event WHERE tenant_id=p_tenant AND job_id=p_job
   AND document_id=p_document AND kind='superseded')
 THEN RAISE EXCEPTION 'superseded exact quote' USING ERRCODE='22023'; END IF;
 -- Re-acceptance (founder decisions 21-23, 14 Oct 2026): the same exact document may be accepted again only when its latest acceptance
 -- was explicitly cancelled, and never once customer billing exists. The new acceptance is a NEW immutable row with its own fresh customer facts.
 SELECT a2.id,coalesce(s.acceptance_sequence,1) INTO prev_id,prev_seq FROM app.quote_acceptance a2
  LEFT JOIN app.quote_acceptance_sequence s ON s.tenant_id=a2.tenant_id AND s.acceptance_id=a2.id
  WHERE a2.tenant_id=p_tenant AND a2.job_id=p_job AND a2.document_id=p_document
  ORDER BY coalesce(s.acceptance_sequence,1) DESC,a2.recorded_at DESC,a2.id DESC LIMIT 1;
 IF prev_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.document_id=p_document AND e.kind='acceptance_cancelled' AND e.acceptance_id=prev_id)
  THEN RAISE EXCEPTION 'acceptance is not allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note WHERE tenant_id=p_tenant AND job_id=p_job)
   OR EXISTS(SELECT 1 FROM app.customer_payment WHERE tenant_id=p_tenant AND job_id=p_job)
  THEN RAISE EXCEPTION 'reacceptance refused: customer billing exists' USING ERRCODE='22023'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_version WHERE tenant_id=p_tenant AND id=p_document) THEN
  INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES(p_document,p_tenant,p_job,p_version,p_hash,(d.snapshot->>'netPence')::bigint,'accepted');
 END IF;
 INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,evidence_id) VALUES(p_acceptance,p_tenant,p_job,p_document,p_version,p_hash,p_total,'GBP','builder_attestation',p_actor,p_customer,p_method,p_accepted_at,p_evidence) RETURNING * INTO a;
 INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id) VALUES(p_tenant,p_job,p_document,p_acceptance,coalesce(prev_seq,0)+1,prev_id);
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at) VALUES(p_event,p_tenant,p_job,p_document,p_version,p_hash,p_acceptance,'accepted',p_actor,p_accepted_at);
 UPDATE app.job SET status='accepted',revision=revision+1,accepted_quote_version_id=p_document,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;RETURN a;END $$;

-- Latest predecessor: 0155_quote_reacceptance.sql.
CREATE OR REPLACE FUNCTION app.record_quote_disposition(p_tenant uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_kind varchar,p_occurred timestamptz) RETURNS app.acceptance_event LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$ DECLARE j app.job;d app.quote_document_version;a_id uuid;e app.acceptance_event;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Match the command dispatcher's current active-owner boundary inside the routine,
 -- before inspecting the job. No new application write privilege is introduced.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;IF NOT FOUND OR j.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;IF NOT FOUND THEN RAISE EXCEPTION 'stale exact quote' USING ERRCODE='22023';END IF;
 IF p_kind='declined' AND j.status='quoting' THEN UPDATE app.job SET status='lost',revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSIF p_kind='superseded' AND j.status='quoting' THEN UPDATE app.job SET revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSIF p_kind='acceptance_cancelled' AND j.status='accepted' AND j.accepted_quote_version_id=p_document THEN SELECT a2.id INTO a_id FROM app.quote_acceptance a2 LEFT JOIN app.quote_acceptance_sequence s ON s.tenant_id=a2.tenant_id AND s.acceptance_id=a2.id WHERE a2.tenant_id=p_tenant AND a2.job_id=p_job AND a2.document_id=p_document ORDER BY coalesce(s.acceptance_sequence,1) DESC,a2.recorded_at DESC,a2.id DESC LIMIT 1;UPDATE app.job SET status='quoting',revision=revision+1,accepted_quote_version_id=NULL,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSE RAISE EXCEPTION 'disposition is not allowed' USING ERRCODE='22023';END IF;
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at) VALUES(p_event,p_tenant,p_job,p_document,p_version,p_hash,a_id,p_kind,p_actor,p_occurred) RETURNING * INTO e;RETURN e;END $$;

-- Latest predecessor: 0095_job_parties.sql.
CREATE OR REPLACE FUNCTION app.switch_job_live(p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_obligation uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_net bigint,p_cap bigint,p_mode varchar,p_terms varchar,p_policy varchar,p_actor uuid,p_activated timestamptz) RETURNS app.job_activation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;a app.job_activation;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT FOUND OR j.status<>'accepted' OR j.revision<>p_expected OR j.accepted_quote_version_id<>p_document THEN RAISE EXCEPTION 'accepted job revision required' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;
 SELECT * INTO q FROM app.quote_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND status='accepted';
 IF d.id IS NULL OR q.id IS NULL OR q.net_value_pence<>p_net OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' THEN RAISE EXCEPTION 'exact accepted terms or cap mismatch' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_acceptance x WHERE x.tenant_id=p_tenant AND x.job_id=p_job AND x.document_id=p_document AND x.document_hash=p_hash) THEN RAISE EXCEPTION 'acceptance required' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_revision r WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=d.quote_revision_id AND r.issuable AND r.tax_policy_version='candidate_m1_standard_v1') THEN RAISE EXCEPTION 'resolved price and tax fields required' USING ERRCODE='22023';END IF;
 IF (p_mode='pilot_no_charge' AND (p_terms<>'pilot_no_charge.v1' OR p_obligation IS NOT NULL)) OR (p_mode='synthetic_demo' AND (p_terms<>'synthetic_demo_illustrative.v1' OR p_obligation IS NULL)) OR p_mode NOT IN('pilot_no_charge','synthetic_demo') THEN RAISE EXCEPTION 'invalid activation mode/terms' USING ERRCODE='22023';END IF;
 INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) VALUES(p_activation,p_tenant,p_job,p_document,p_version,p_hash,p_mode,p_terms,p_policy,p_actor,p_activated) RETURNING * INTO a;
 INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative) VALUES(p_cap_snapshot,p_tenant,p_job,p_activation,p_document,p_net,'GBP',p_cap,p_policy,true);
 IF p_mode='synthetic_demo' THEN INSERT INTO app.synthetic_obligation(id,tenant_id,job_id,activation_id,principal_pence,currency,state,label) VALUES(p_obligation,p_tenant,p_job,p_activation,7900,'GBP','owed_unpaid','illustrative_only');END IF;
 UPDATE app.job SET status='live',revision=revision+1,baseline_quote_version_id=p_document,accepted_net_value_pence=p_net,fee_policy_version=p_policy,recovery_cap_pence=p_cap,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 RETURN a;END $$;

-- Latest predecessor: 0012_job_activation.sql.
CREATE OR REPLACE FUNCTION app.record_simulated_settlement(p_tenant uuid,p_id uuid,p_obligation uuid,p_provider_event varchar,p_amount bigint,p_simulated_at timestamptz) RETURNS app.simulated_settlement_event LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE o app.synthetic_obligation;e app.simulated_settlement_event;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation FOR UPDATE;IF NOT FOUND OR p_amount<>7900 THEN RAISE EXCEPTION 'synthetic obligation required' USING ERRCODE='22023';END IF;
 INSERT INTO app.simulated_settlement_event(id,tenant_id,job_id,obligation_id,provider_event_id,amount_pence,currency,label,simulated_at) VALUES(p_id,p_tenant,o.job_id,p_obligation,p_provider_event,p_amount,'GBP','simulated_not_collected',p_simulated_at) RETURNING * INTO e;RETURN e;END $$;

-- Latest predecessor: 0017_customer_billing.sql.
CREATE OR REPLACE FUNCTION app.reserve_customer_invoice_number(p_tenant uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$DECLARE n bigint;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2) ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;RETURN n;END$$;

-- Latest predecessor: 0237_final_check_prerequisites.sql.
CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(
 p_tenant uuid,p_job uuid,p_final_revision uuid,p_actor uuid,p_command uuid,p_recipient text,p_issued_on date
) RETURNS TABLE(invoice_id uuid,invoice_number text,pdf_sha256 text,total_pence bigint,source_hash text,outbox_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE existing app.customer_invoice%ROWTYPE; final_row app.final_account_revision%ROWTYPE;
 n bigint; number text; artifact text; digest text; decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_invoice uuid:=gen_random_uuid();
 request_digest text:=encode(public.digest(convert_to(p_job::text||p_final_revision::text||p_recipient||p_issued_on::text,'UTF8'),'sha256'),'hex');
 prior jsonb; party_snapshot jsonb; check_row record; lock_row app.final_account_lock; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command AND (command_type<>'customer_invoice.issue' OR actor_membership_id<>p_actor)) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
   IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT (prior->>'invoiceId')::uuid,prior->>'invoiceNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint,prior->>'sourceHash',prior->>'outboxStatus'; RETURN;
 END IF;
 IF p_recipient !~ '^[^@ ]+@example\.invalid$' THEN RAISE EXCEPTION 'SYNTHETIC_RECIPIENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
 WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=p_final_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
 SELECT * INTO existing FROM app.customer_invoice WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM app.final_account_invoice_binding binding WHERE binding.tenant_id=p_tenant AND binding.job_id=p_job AND binding.invoice_id=existing.id AND binding.invoice_kind IN ('final','supplementary')) THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
  RETURN QUERY SELECT existing.id,existing.invoice_number::text,existing.pdf_sha256::text,existing.total_pence,existing.source_hash::text,'succeeded'::text; RETURN; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 IF (SELECT count(*) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision)=0 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF final_row.net_pence IS DISTINCT FROM (SELECT sum(net_pence) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision) OR final_row.tax_pence<>(final_row.net_pence+2)/5 OR final_row.total_pence<>final_row.net_pence+final_row.tax_pence THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF p_final_revision<>lock_row.final_account_revision_id OR final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Net GBP: '||to_char(final_row.net_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(final_row.tax_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(final_row.total_pence::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg(l.description||' | Net GBP: '||to_char(l.net_pence::numeric/100,'FM999999999990.00'),chr(10) ORDER BY l.ordinal,l.id)
   FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),'')||chr(10)||
  party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(new_invoice,p_tenant,p_job,p_final_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',final_row.net_pence,final_row.tax_pence,final_row.total_pence,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,new_invoice,'final',lock_row.id,p_final_revision,check_row.check_id);
 FOR item IN WITH weights AS(SELECT to_jsonb(l) value,abs(l.net_pence::numeric) weight FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(final_row.tax_pence::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(final_row.tax_pence::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,final_row.tax_pence-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,new_invoice,(item->>'id')::uuid,p_final_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,new_invoice,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','practice-invoice:'||new_invoice,'final_account.issue',p_recipient,digest,artifact,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_invoice.issue','invoice:'||p_final_revision,request_digest,'succeeded',jsonb_build_object('invoiceId',new_invoice,'invoiceNumber',number,'pdfSha256',digest,'totalPence',final_row.total_pence,'sourceHash',final_row.source_hash,'outboxStatus','succeeded'),p_actor,transaction_timestamp());
 PERFORM app.append_final_lock_audit(gen_random_uuid(),p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',new_invoice,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN QUERY SELECT new_invoice,number,digest,final_row.total_pence,final_row.source_hash::text,'succeeded'::text;
END $$;

-- Latest predecessor: 0475_lp5a_commands.sql.
CREATE OR REPLACE FUNCTION app.switch_job_live_v3(p_tenant uuid,p_activation uuid,p_terms uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_command uuid,p_authorization uuid) RETURNS app.job_activation_terms LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;t app.job_activation_terms;highest bigint;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt c JOIN app.action_authorization a ON a.tenant_id=c.tenant_id AND a.actor_membership_id=c.actor_membership_id
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.decision x ON(x.tenant_id,x.id)=(a.tenant_id,a.decision_id)
 WHERE c.tenant_id=p_tenant AND c.command_id=p_command AND c.command_type='job.switch_live' AND c.status='processing' AND c.actor_membership_id=p_actor
 AND a.id=p_authorization AND a.action_type='job.switch_live' AND a.content_hash=p_hash AND a.aggregate_revision=p_version AND a.amount_pence IS NULL AND a.currency IS NULL AND a.recipient IS NULL
 AND a.policy_version='synthetic_demo_activation.v3' AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL AND r.resolution='approved' AND x.subject_type='job' AND x.subject_ref=p_job::text)
 THEN RAISE EXCEPTION 'EXACT_ACTIVATION_AUTHORIZATION_MISMATCH' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM app.job_activation_terms WHERE tenant_id=p_tenant AND job_id=p_job;
 IF t.id IS NOT NULL THEN
  IF t.baseline_quote_version_id IS DISTINCT FROM p_document OR t.baseline_document_version IS DISTINCT FROM p_version OR t.baseline_document_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'activation conflict' USING ERRCODE='40001'; END IF;
  PERFORM app.lp5_bind_effect(p_command,p_authorization,'activation',jsonb_build_object('activationId',t.activation_id,'termsId',t.id,'noopReason','activation_already_exists')); RETURN t;
 END IF;
 IF j.status IS DISTINCT FROM 'accepted' OR j.revision IS DISTINCT FROM p_expected OR j.accepted_quote_version_id IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'accepted job revision required' USING ERRCODE='40001'; END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;
 SELECT * INTO q FROM app.quote_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND status='accepted';
 IF d.id IS NULL OR q.id IS NULL OR q.net_value_pence NOT BETWEEN 0 AND 1000000000000 OR (d.snapshot->>'netPence')::bigint IS DISTINCT FROM q.net_value_pence THEN RAISE EXCEPTION 'exact accepted terms mismatch' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_acceptance WHERE tenant_id=p_tenant AND job_id=p_job AND document_id=p_document AND document_version=p_version AND document_hash=p_hash) THEN RAISE EXCEPTION 'acceptance required' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=d.quote_revision_id AND issuable AND tax_policy_version='candidate_m1_standard_v1') THEN RAISE EXCEPTION 'resolved price and tax fields required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(r.net_pence),0) INTO highest FROM app.quote_send s JOIN app.quote_document_version v ON(v.tenant_id,v.job_id,v.id)=(s.tenant_id,s.job_id,s.document_id)
 JOIN app.quote_revision r ON(r.tenant_id,r.job_id,r.id)=(v.tenant_id,v.job_id,v.quote_revision_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
 VALUES(p_activation,p_tenant,p_job,p_document,p_version,p_hash,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',p_actor,transaction_timestamp());
 -- SH-1's activation trigger binds the track; CH-3a's trigger freezes parties.
 INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context)
 VALUES(p_terms,p_tenant,p_job,p_activation,p_document,p_version,p_hash,q.net_value_pence,highest,greatest(q.net_value_pence,highest)<200000,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a') RETURNING * INTO t;
 UPDATE app.job SET status='live',revision=revision+1,baseline_quote_version_id=p_document,accepted_net_value_pence=q.net_value_pence,fee_policy_version='reference_fee_policy_v3',recovery_cap_pence=NULL,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 PERFORM app.lp5_bind_effect(p_command,p_authorization,'activation',jsonb_build_object('activationId',t.activation_id,'termsId',t.id)); RETURN t;
END $$;

-- Latest predecessor: 0132_final_account_lock.sql.
CREATE OR REPLACE FUNCTION app.final_lock_require_owner(p_tenant uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;

-- Latest predecessor: 0237_final_check_prerequisites.sql.
CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE lock_row app.final_account_lock; check_row record; final_row app.final_account_revision; prior app.command_receipt;
 request_digest text; party_snapshot jsonb; n bigint; number text; artifact text; digest text; invoice_id uuid:=gen_random_uuid();
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 net bigint; tax bigint; gross bigint; selected_lines jsonb; result jsonb; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF p_kind IS NULL OR p_kind NOT IN ('final','supplementary') OR p_command IS NULL OR p_issued_on IS NULL OR p_issued_on NOT BETWEEN '0001-01-01'::date AND '9999-12-31'::date OR p_recipient IS NULL OR p_recipient !~ '^[^@ ]+@example\.invalid$' OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','IssueLockBoundInvoice','job',p_job,'revision',p_revision,'actor',p_actor,'kind',p_kind,'recipient',p_recipient,'issuedOn',p_issued_on,'sourceHash',p_source_hash));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'IssueLockBoundInvoice' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor); RETURN prior.result; END IF;
 -- Preserve CH-4-C refusal order for owners; session scope still gates replay and every new issue.
 PERFORM app.ch4_require_open(p_tenant,p_job);
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 SELECT * INTO final_row FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision AND source_hash=p_source_hash AND NOT issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 IF final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND p_revision<>lock_row.final_account_revision_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 IF p_kind='supplementary' THEN
  IF p_revision=lock_row.final_account_revision_id OR NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'SUPPLEMENTARY_INVOICE_BASE_REQUIRED'; END IF;
  IF NOT EXISTS(WITH RECURSIVE ancestors AS (SELECT id,previous_revision_id FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision
   UNION ALL SELECT r.id,r.previous_revision_id FROM app.final_account_revision r JOIN ancestors a ON r.id=a.previous_revision_id WHERE r.tenant_id=p_tenant AND r.job_id=p_job) SELECT 1 FROM ancestors WHERE id=lock_row.final_account_revision_id) THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.final_account_draft WHERE tenant_id=p_tenant AND job_id=p_job AND current_revision_id=p_revision) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
  -- A replacement/removal is a correction, not a newly added catch line. Fail closed until explicitly corrected.
  IF EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
   LEFT JOIN app.final_account_invoice_binding binding ON(binding.tenant_id,binding.job_id,binding.invoice_id)=(i.tenant_id,i.job_id,i.id)
   WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(binding.invoice_kind,'final') IN ('final','supplementary')
   AND NOT EXISTS(SELECT 1 FROM app.final_account_line current_line WHERE current_line.tenant_id=p_tenant AND current_line.job_id=p_job AND current_line.final_account_revision_id=p_revision
    AND (current_line.line_kind,current_line.source_id,current_line.commercial_revision_id,current_line.scope_item_id,current_line.net_pence)=(old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence))) THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 END IF;
 -- Account lines retain immutable commercial source identity across account revisions.
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'),coalesce(sum(l.net_pence),0) INTO selected_lines,net FROM app.final_account_line l
 WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision AND (
 p_kind='final' OR (NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.line_kind=l.line_kind AND b.source_id=l.source_id AND b.commercial_revision_id=l.commercial_revision_id)
 AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
 WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id))
 AND old.line_kind=l.line_kind AND old.source_id=l.source_id AND old.commercial_revision_id=l.commercial_revision_id)));
 IF jsonb_array_length(selected_lines)=0 OR net<0 OR net>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 -- Same exact positive standard-rate candidate expression as merged 0028; no float arithmetic.
 tax:=(net+2)/5; gross:=net+tax;
 IF gross>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF p_kind='final' AND ROW(net,tax,gross) IS DISTINCT FROM ROW(final_row.net_pence,final_row.tax_pence,final_row.total_pence) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES(gen_random_uuid(),p_tenant,2) ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Lock: '||lock_row.id::text||chr(10)||'Kind: '||p_kind||chr(10)||
  'Net GBP: '||to_char(net::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(tax::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(gross::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg((l->>'description')||' | Net GBP: '||to_char((l->>'net_pence')::numeric/100,'FM999999999990.00'),chr(10) ORDER BY (l->>'ordinal')::integer,l->>'id')
   FROM jsonb_array_elements(selected_lines) l),'')||chr(10)||party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(sha256(convert_to(artifact,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(invoice_id,p_tenant,p_job,p_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',net,tax,gross,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,invoice_id,p_kind,lock_row.id,p_revision,check_row.check_id);
 -- Largest-remainder display allocation of the one group tax; tie-break by line ID, as core allocation.
 -- Display tax follows merged absolute-net weights; invoice totals use the one group calculation.
 FOR item IN WITH weights AS(SELECT value,abs((value->>'net_pence')::numeric) weight FROM jsonb_array_elements(selected_lines)),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(tax::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(tax::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,tax-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,invoice_id,(item->>'id')::uuid,p_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,invoice_id,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','lock-invoice:'||invoice_id,'final_account.issue',p_recipient,digest,artifact,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 result:=jsonb_build_object('invoiceId',invoice_id,'invoiceNumber',number,'pdfSha256',digest,'netPence',net,'taxPence',tax,'totalPence',gross,'sourceHash',p_source_hash,'invoiceKind',p_kind,'lockId',lock_row.id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'IssueLockBoundInvoice',p_revision::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 PERFORM app.append_final_lock_audit(audit_id,p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',invoice_id,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN result;
END $$;

-- Latest predecessor: 0134_recovery_case_terms.sql.
CREATE OR REPLACE FUNCTION app.approve_recovery_case_terms(p_tenant uuid,p_id uuid,p_job uuid,p_case uuid,p_actor uuid,p_command uuid,p_authorization uuid) RETURNS app.recovery_case_terms_approval LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c app.recovery_case_current; t app.recovery_case_terms_approval; h text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'RECOVERY_TERMS_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext(p_case::text));
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_case AND claim_revision IS NOT NULL;
 IF c.id IS NULL OR c.synthetic IS NOT TRUE OR c.environment IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'RECOVERY_TERMS_CASE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF c.case_type IS DISTINCT FROM 'withheld_customer_payment' THEN RAISE EXCEPTION 'RECOVERY_TERMS_NOT_APPLICABLE' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND fee_policy_version='reference_fee_policy_v3') THEN RAISE EXCEPTION 'RECOVERY_TERMS_POLICY_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM app.recovery_case_terms_approval WHERE tenant_id=p_tenant AND case_id=p_case AND terms_version='synthetic_recovery_fee_terms.v1';
 IF t.id IS NOT NULL THEN
  IF t.command_id=p_command THEN RETURN t; END IF;
  RAISE EXCEPTION 'RECOVERY_TERMS_ALREADY_APPROVED' USING ERRCODE='40001';
 END IF;
 h:=encode(sha256(convert_to('recovery-case-terms.v1'||chr(10)||'caseId='||p_case::text||chr(10)||'termsVersion=synthetic_recovery_fee_terms.v1'||chr(10)||
  'feePolicyVersion=reference_fee_policy_v3'||chr(10)||'eligibilityPolicyVersion=reference_recovery_eligibility_policy_v3'||chr(10)||'policyStatus=proposed','UTF8')),'hex');
 -- Coordinator's 12 Oct amendment: direct SQL also requires 0109's active-owner predicate.
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr
 JOIN app.membership m ON m.tenant_id=cr.tenant_id AND m.id=cr.actor_membership_id
 JOIN app.action_authorization a ON a.tenant_id=cr.tenant_id AND a.actor_membership_id=cr.actor_membership_id
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
 WHERE cr.tenant_id=p_tenant AND cr.command_id=p_command AND cr.command_type='recovery.terms.approve' AND cr.status='processing' AND cr.actor_membership_id=p_actor
 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND a.id=p_authorization AND a.action_type='recovery.terms.approve' AND a.content_hash=h AND a.aggregate_revision=1 AND a.amount_pence IS NULL AND a.currency IS NULL AND a.recipient IS NULL
 AND a.policy_version='reference_fee_policy_v3' AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL AND r.resolution='approved' AND d.subject_type='recovery_case' AND d.subject_ref=p_case::text)
 THEN RAISE EXCEPTION 'RECOVERY_TERMS_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 INSERT INTO app.recovery_case_terms_approval(id,tenant_id,job_id,case_id,terms_version,fee_policy_version,eligibility_policy_version,policy_status,environment,terms_hash,actor_membership_id,command_id,authorization_id)
 VALUES(p_id,p_tenant,p_job,p_case,'synthetic_recovery_fee_terms.v1','reference_fee_policy_v3','reference_recovery_eligibility_policy_v3','proposed','synthetic_demo',h,p_actor,p_command,p_authorization) RETURNING * INTO t;
 RETURN t;
END $$;

-- Latest predecessor: 0169_recovery_allocation_sources.sql.
CREATE OR REPLACE FUNCTION app.write_recovery_allocation(p_tenant uuid,p_job uuid,p_session text,p_command jsonb,p_artifact jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE actor record; c app.recovery_case_current; m record; inv app.customer_invoice; ev app.evidence_object;
 eligibility app.recovery_eligibility_revision; original app.recovery_case_allocation; review app.recovery_allocation_review;
 command_row app.recovery_allocation_command; cid uuid; pid uuid; aid uuid; rid uuid; did uuid; resolution_id uuid; auth_id uuid;
 action text:=p_command->>'action'; amount bigint:=(p_command->>'grossPence')::bigint;
 net bigint:=(p_artifact->>'eligibleNetPence')::bigint; tax bigint:=(p_artifact->>'taxPence')::bigint;
 recorded_remittance uuid; recorded_count integer; available bigint; source_id uuid; source_kind text; line jsonb; binding jsonb; source_binding uuid;
 lf record; prior_line app.receipt_line_allocation; remittance jsonb; remittance_ev app.evidence_object; share jsonb;
 hash text; result jsonb; used_pair numeric[]; balance_pair numeric[]; total_pair numeric[]:=ARRAY[0::numeric,1::numeric]; given_pair numeric[]:=ARRAY[0::numeric,1::numeric]; balances jsonb:='{}'; 
 gn numeric; gd numeric; nn numeric; nd numeric; direction integer; source_bytes bytea; keyword bytea:=decode('6a6f6267756172642d72656d697474616e636500','hex');
 png_prefix bytea:=decode('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63686868f80f00058402808ccd6626','hex'); content_bytes bytea; content_offset integer;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR (SELECT s.membership_id FROM app.authenticate_practice_session(p_session,p_tenant) s) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM (CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END)
 OR current_setting('app.recovery_allocation_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR p_command->>'version' IS DISTINCT FROM 'recovery-allocation-command.v1' OR p_artifact->>'version' IS DISTINCT FROM 'recovery-allocation-artifact.v1'
 OR action NOT IN('review','allocate','review_reverse','reverse') OR amount IS NULL OR amount<=0 OR amount>1000000000000 THEN
  RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Reversal lookup touches only our own allocation; the canonical case key precedes ALL job/case access.
 IF action IN('review_reverse','reverse') THEN
  SELECT * INTO original FROM app.recovery_case_allocation WHERE tenant_id=p_tenant AND job_id=p_job AND id=(p_command->>'allocationId')::uuid;
  IF original.id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23514'; END IF;
  cid:=original.case_id; pid:=original.payment_id;
 ELSE cid:=(p_command->>'caseId')::uuid;pid:=(p_command->>'paymentId')::uuid; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext(cid::text));
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,p_tenant);
 IF actor.membership_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=actor.membership_id AND identity_user_id=actor.identity_user_id
 AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO command_row FROM app.recovery_allocation_command WHERE tenant_id=p_tenant AND command_id=(p_command->>'commandId')::uuid;
 IF command_row.command_id IS NOT NULL THEN
  IF command_row.job_id<>p_job OR command_row.payload<>p_command OR command_row.actor_membership_id<>actor.membership_id THEN
   RAISE EXCEPTION 'ALLOCATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN command_row.result||jsonb_build_object('replayed',true);
 END IF;
 -- Keep the merged public caller shape: the case key precedes parent FK KEY SHARE locks.
 -- No explicit parent row lock is needed; same-case v1 callers cannot pass that key.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||pid::text,0));
 PERFORM app.lock_recovery_message_sources(p_tenant);
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=cid;
 IF c.id IS NULL OR c.state='prevented' OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.revision<>(p_command->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT p.invoice_id,e.id movement_id,e.source_hash,e.account_id,e.event_id,e.created_at,match_row.matched_pence INTO m
 FROM app.customer_payment p JOIN app.practice_feed_receipt_match match_row ON(match_row.tenant_id,match_row.job_id,match_row.payment_id)=(p.tenant_id,p.job_id,p.id)
 JOIN app.practice_feed_event e ON(e.tenant_id,e.account_id,e.event_id)=(match_row.tenant_id,match_row.account_id,match_row.settled_event_id)
 WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.id=pid AND e.job_id=p_job AND e.state='settled' AND e.identity='identified'
 AND e.gross_pence=match_row.matched_pence AND p.amount_pence=match_row.matched_pence
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.state='possible_duplicate'
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command rc WHERE rc.tenant_id=u.tenant_id AND rc.account_id=u.account_id AND rc.movement_key=u.movement_key AND rc.action='reconcile_duplicate'));
 IF m.movement_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a JOIN app.practice_feed_event e ON(e.tenant_id,e.id)=(a.tenant_id,a.movement_id) WHERE a.tenant_id=p_tenant AND a.invoice_id=m.invoice_id AND e.created_at>m.created_at) THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=m.invoice_id;
 SELECT * INTO eligibility FROM app.recovery_eligibility_revision WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid ORDER BY revision DESC LIMIT 1;
 SELECT e.* INTO ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=CASE WHEN original.id IS NULL THEN (p_command->>'evidenceId')::uuid ELSE original.evidence_id END AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified';
 IF ev.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=p_tenant AND x.evidence_id=ev.id) AND original.id IS NULL THEN
  RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL AND(eligibility.id IS NULL OR eligibility.status<>'approved' OR eligibility.classification<>'eligible_for_review') THEN RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 IF p_artifact->>'caseId' IS DISTINCT FROM cid::text OR p_artifact->>'paymentId' IS DISTINCT FROM pid::text
 OR p_artifact->>'invoiceId' IS DISTINCT FROM inv.id::text OR p_artifact->>'movementId' IS DISTINCT FROM m.movement_id::text
 OR p_artifact->>'movementHash' IS DISTINCT FROM trim(m.source_hash) OR p_artifact->>'evidenceId' IS DISTINCT FROM ev.id::text
 OR p_artifact->>'evidenceHash' IS DISTINCT FROM trim(ev.sha256) OR p_artifact->>'objectVersionId' IS DISTINCT FROM ev.object_version_id
 OR(p_artifact->>'expectedCaseRevision')::integer IS DISTINCT FROM c.revision
 OR(p_artifact->>'grossPence')::bigint IS DISTINCT FROM amount OR net IS NULL OR net<=0 OR tax IS NULL OR tax<0 OR amount<>net+tax
 OR amount::numeric*inv.net_pence<>net::numeric*inv.total_pence
 OR (original.id IS NULL AND p_artifact->>'eligibilityId' IS DISTINCT FROM eligibility.id::text)
 OR p_artifact->>'policyVersion' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN eligibility.policy_version ELSE original.policy_version END) THEN
  RAISE EXCEPTION 'INVALID_CASE_SPLIT' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL THEN
  IF NOT(c.source_refs ? inv.id::text) THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=pid) THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  SELECT m.matched_pence-coalesce(sum(a.gross_pence-(SELECT coalesce(sum(r.gross_pence),0) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=a.tenant_id AND r.allocation_id=a.id)),0)
  INTO available FROM app.recovery_case_allocation a WHERE a.tenant_id=p_tenant AND a.payment_id=pid;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF net>c.claim_pence-c.landed-c.written_off THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_CLAIM' USING ERRCODE='23514'; END IF;
  IF net>eligibility.eligible_net_pence-c.landed THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_EVIDENCE' USING ERRCODE='23514'; END IF;
  direction:=1;
 ELSE
  SELECT original.gross_pence-coalesce(sum(gross_pence),0) INTO available FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND allocation_id=original.id;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF p_command ? 'creditNoteId' THEN
   SELECT id INTO source_id FROM app.customer_credit_note WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND id=(p_command->>'creditNoteId')::uuid
   AND amount_pence>=(SELECT coalesce(sum(gross_pence),0)+amount FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND credit_note_id=(p_command->>'creditNoteId')::uuid);
   source_kind:='credit_note';
  ELSE SELECT id INTO source_id FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND job_id=p_job AND payment_id=pid;source_kind:='payment_reversal'; END IF;
  IF source_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_REVERSAL_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  direction:=-1;
 END IF;
 IF p_artifact->>'action' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END)
 OR p_artifact->>'allocationId' IS DISTINCT FROM original.id::text OR p_artifact->>'sourceId' IS DISTINCT FROM source_id::text
 OR p_artifact->>'sourceKind' IS DISTINCT FROM source_kind THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 -- Validate complete composition and immutable line bindings; arithmetic below checks kernel output by cross products.
 IF jsonb_typeof(p_artifact->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(p_artifact->'bindings') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_artifact->'bindings')<>(SELECT count(*) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id))
 OR jsonb_array_length(p_artifact->'bindings')>10000 OR jsonb_array_length(p_artifact->'lines')>jsonb_array_length(p_artifact->'bindings') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id) WHERE id=(binding->>'lineId')::uuid;
  IF lf.id IS NULL OR (binding->>'netPence')::bigint IS DISTINCT FROM lf.net_pence
  OR (binding->>'grossPence')::bigint IS DISTINCT FROM lf.gross_pence
  OR (binding->>'existedAt')::timestamptz IS DISTINCT FROM lf.existed_at THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,rule,source_ref)
  VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.id,lf.net_pence,(binding->>'grossPence')::bigint,lf.existed_at,'pro_rata',m.movement_id::text) ON CONFLICT DO NOTHING;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'bindings'))<>jsonb_array_length(p_artifact->'bindings')
 OR (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'lines'))<>jsonb_array_length(p_artifact->'lines') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF p_command ? 'remittanceEvidenceId' AND p_artifact->>'remittanceEvidenceId' IS DISTINCT FROM p_command->>'remittanceEvidenceId' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL THEN
  SELECT count(DISTINCT artifact->>'remittanceEvidenceId'),min(artifact->>'remittanceEvidenceId')::uuid INTO recorded_count,recorded_remittance
  FROM app.recovery_allocation_review WHERE tenant_id=p_tenant AND job_id=p_job AND payment_id=pid
  AND allocation_id IS NULL AND artifact->>'remittanceEvidenceId' IS NOT NULL;
  IF recorded_count>1 OR recorded_remittance IS NOT NULL AND
   (p_artifact->>'remittanceEvidenceId' IS DISTINCT FROM recorded_remittance::text OR p_artifact->>'remittanceContent' IS NULL)
  THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 -- Reliable explicit shares are verified against the finalized original's SHA-256, never trusted as an artifact flag.
 IF p_artifact->>'remittanceContent' IS NOT NULL THEN
  SELECT e.* INTO remittance_ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=(p_artifact->>'remittanceEvidenceId')::uuid AND e.kind='original' AND u.state='verified';
  IF remittance_ev.id IS NULL OR trim(remittance_ev.sha256)<>encode(sha256(decode(p_artifact->>'remittanceBytes','base64')),'hex')
  OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=p_tenant AND evidence_id=remittance_ev.id) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  source_bytes:=decode(p_artifact->>'remittanceBytes','base64');content_bytes:=convert_to(p_artifact->>'remittanceContent','UTF8');
  content_offset:=octet_length(png_prefix)+8+octet_length(keyword)+1;
  IF source_bytes IS NULL OR octet_length(source_bytes)>100000 OR substring(source_bytes FROM 1 FOR octet_length(png_prefix))<>png_prefix
  OR substring(source_bytes FROM octet_length(png_prefix)+5 FOR 4)<>decode('74455874','hex')
  OR substring(source_bytes FROM octet_length(png_prefix)+9 FOR octet_length(keyword))<>keyword
  OR substring(source_bytes FROM content_offset FOR octet_length(content_bytes))<>content_bytes
  OR octet_length(source_bytes)<>octet_length(png_prefix)+8+octet_length(keyword)+octet_length(content_bytes)+4+12
  OR substring(source_bytes FROM octet_length(source_bytes)-11)<>decode('0000000049454e44ae426082','hex') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF p_command ? 'remittanceEvidenceId' AND p_command->>'remittanceEvidenceId' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF NOT(p_command ? 'remittanceEvidenceId') AND original.id IS NULL AND recorded_remittance IS NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  remittance:=(p_artifact->>'remittanceContent')::jsonb;
  IF remittance->>'version' IS DISTINCT FROM 'recovery-remittance.v1' OR remittance->>'paymentId' IS DISTINCT FROM pid::text OR remittance->>'invoiceId' IS DISTINCT FROM inv.id::text
  OR jsonb_typeof(remittance->'shares') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END IF;
 -- Validate every balance as a fraction, including eligible lines omitted from an explicit result.
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(binding->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.gross_numerator,a.gross_denominator)),'[]')) INTO used_pair
  FROM app.receipt_line_allocation a
  JOIN app.recovery_case_allocation ca ON(ca.tenant_id,ca.id)=(a.tenant_id,a.allocation_id)
  JOIN app.practice_feed_event settled ON(settled.tenant_id,settled.id)=(ca.tenant_id,ca.movement_id)
  LEFT JOIN app.recovery_case_allocation_reversal reversal ON(reversal.tenant_id,reversal.id)=(a.tenant_id,a.reversal_id)
  LEFT JOIN app.customer_credit_note credit ON(credit.tenant_id,credit.id)=(reversal.tenant_id,reversal.credit_note_id)
  LEFT JOIN app.customer_payment_reversal refund ON(refund.tenant_id,refund.id)=(reversal.tenant_id,reversal.payment_reversal_id)
  WHERE a.tenant_id=p_tenant AND a.invoice_id=inv.id AND a.line_id=lf.line_id
  AND ((direction=-1 AND a.allocation_id=original.id) OR
   (direction=1 AND settled.created_at<=m.created_at AND (a.reversal_id IS NULL OR coalesce(credit.created_at,refund.created_at)<=m.created_at)));
  balance_pair:=CASE WHEN direction=1 THEN ARRAY[lf.gross_pence*used_pair[2]-used_pair[1],used_pair[2]] ELSE used_pair END;
  IF m.created_at<lf.existed_at THEN balance_pair:=ARRAY[0::numeric,1::numeric]; END IF;
  IF balance_pair[1]<0 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  balances:=balances||jsonb_build_object(lf.line_id::text,jsonb_build_array(balance_pair[1]::text,balance_pair[2]::text));
  total_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(total_pair),to_jsonb(balance_pair)));
 END LOOP;
 IF (SELECT sum(net_pence) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id)) IS DISTINCT FROM inv.net_pence
 OR (SELECT sum(gross_pence) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id)) IS DISTINCT FROM inv.total_pence THEN
  RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NOT NULL THEN
  IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(remittance->'shares'))<>jsonb_array_length(remittance->'shares') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  FOR share IN SELECT value FROM jsonb_array_elements(remittance->'shares') LOOP
   IF NOT(balances ? (share->>'lineId')) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 -- Separate-invoice priority requires the immutable supplementary binding; never infer it from line count.
 FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  IF lf.id IS NULL OR NOT(balances ? lf.line_id::text) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  gn:=(line->'gross'->>'numerator')::numeric;gd:=(line->'gross'->>'denominator')::numeric;
  nn:=(line->'net'->>'numerator')::numeric;nd:=(line->'net'->>'denominator')::numeric;
  IF gn IS NULL OR gd IS NULL OR nn IS NULL OR nd IS NULL OR gn<>trunc(gn) OR gd<>trunc(gd) OR nn<>trunc(nn) OR nd<>trunc(nd)
  OR gd<=0 OR nd<=0 OR gn*direction<0 OR nn*direction<0 OR nn*gd*lf.gross_pence<>gn*nd*lf.net_pence
  OR gcd(abs(gn),gd)<>1 OR gcd(abs(nn),nd)<>1 THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  balance_pair:=ARRAY[(balances->lf.line_id::text->>0)::numeric,(balances->lf.line_id::text->>1)::numeric];
  IF abs(gn)*balance_pair[2]>balance_pair[1]*gd THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF direction=-1 THEN
   SELECT * INTO prior_line FROM app.receipt_line_allocation WHERE tenant_id=p_tenant AND allocation_id=original.id AND line_id=lf.line_id AND reversal_id IS NULL;
   IF prior_line.id IS NULL OR line->>'reversesId' IS DISTINCT FROM prior_line.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  ELSIF line->>'reversesId' IS NOT NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  given_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(given_pair),jsonb_build_array(abs(gn)::text,gd::text)));
  IF remittance IS NOT NULL THEN
   SELECT value INTO share FROM jsonb_array_elements(remittance->'shares') WHERE value->>'lineId'=lf.line_id::text;
   IF line->>'rule' IS DISTINCT FROM 'explicit' OR line->>'sourceRef' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF (direction=1 OR p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric<>coalesce(share->'gross'->>'numerator','0')::numeric*gd THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF direction=-1 AND NOT(p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric*original.gross_pence<>coalesce(share->'gross'->>'numerator','0')::numeric*gd*amount THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   -- Record the reliable source alongside the immutable bound invoice line.
   IF NOT EXISTS(SELECT 1 FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=lf.line_id AND evidence_id=remittance_ev.id) THEN
    INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,evidence_id,evidence_object_version_id,evidence_hash,evidence_server_received_at,gross_numerator,gross_denominator,rule,source_ref)
    VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.line_id,lf.net_pence,lf.gross_pence,lf.existed_at,remittance_ev.id,remittance_ev.object_version_id,remittance_ev.sha256,remittance_ev.server_received_at,coalesce(share->'gross'->>'numerator','0'),coalesce(share->'gross'->>'denominator','1'),'explicit',remittance_ev.id::text);
   END IF;
  ELSIF line->>'rule' IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM app.final_account_invoice_binding b
   WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=inv.id AND b.invoice_kind='supplementary') THEN 'separate_invoice' ELSE 'pro_rata' END)
  OR line->>'sourceRef' IS DISTINCT FROM (CASE WHEN original.id IS NOT NULL THEN source_id::text
   WHEN EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.invoice_id=inv.id AND b.invoice_kind='supplementary') THEN inv.id::text ELSE m.movement_id::text END) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF given_pair[1]<>amount*given_pair[2] OR total_pair[1]<amount*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NULL THEN
  -- Check all lines, including omitted zero candidates: a positive proportional share cannot disappear.
  FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
   SELECT value INTO line FROM jsonb_array_elements(p_artifact->'lines') WHERE value->>'lineId'=binding->>'lineId';
   gn:=coalesce((line->'gross'->>'numerator')::numeric,0);gd:=coalesce((line->'gross'->>'denominator')::numeric,1);
   balance_pair:=ARRAY[(balances->(binding->>'lineId')->>0)::numeric,(balances->(binding->>'lineId')->>1)::numeric];
   IF abs(gn)*total_pair[1]*balance_pair[2]<>amount::numeric*balance_pair[1]*gd*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 hash:=encode(sha256(convert_to(p_artifact::text,'UTF8')),'hex');
 IF action IN('review','review_reverse') THEN
  did:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(did,p_tenant,'recovery_case',cid::text,'recovery_allocation.'||CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END);
  INSERT INTO app.recovery_allocation_review(id,tenant_id,job_id,case_id,payment_id,allocation_id,command_id,action,expected_case_revision,artifact,approval_hash,decision_id,reviewer_ref)
  VALUES(rid,p_tenant,p_job,cid,pid,original.id,(p_command->>'commandId')::uuid,CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,c.revision,p_artifact,hash,did,'membership:'||actor.membership_id);
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',NULL,'review',jsonb_build_object('action',CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,'caseId',cid,'paymentId',pid,'allocationId',original.id,'expectedCaseRevision',c.revision,'grossPence',amount,'eligibleNetPence',net,'taxPence',tax,'approvalHash',hash,'policyVersion',p_artifact->>'policyVersion','movementHash',m.source_hash,'evidenceHash',ev.sha256));
 ELSE
  SELECT * INTO review FROM app.recovery_allocation_review WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid AND approval_hash=p_command->>'approvalHash' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF review.id IS NULL OR review.artifact<>p_artifact OR review.expected_case_revision<>c.revision OR review.expires_at<=clock_timestamp()
  OR review.action<>action OR review.reviewer_ref<>'membership:'||actor.membership_id
  OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=p_tenant AND decision_id=review.decision_id) THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  resolution_id:=gen_random_uuid();auth_id:=gen_random_uuid();aid:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,review.decision_id,'approved',actor.membership_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
  VALUES(auth_id,p_tenant,review.decision_id,resolution_id,actor.membership_id,'recovery_allocation.'||action,cid::text,hash,c.revision,amount,'GBP',p_artifact->>'policyVersion',review.expires_at);
  IF original.id IS NULL THEN
   INSERT INTO app.recovery_case_allocation(id,tenant_id,job_id,case_id,payment_id,invoice_id,command_id,review_id,authorization_id,gross_pence,eligible_net_pence,tax_pence,evidence_id,object_version_id,evidence_hash,evidence_server_received_at,policy_version,reviewer_ref,movement_id,movement_hash,account_id,settled_event_id)
   VALUES(aid,p_tenant,p_job,cid,pid,inv.id,(p_command->>'commandId')::uuid,review.id,auth_id,amount,net,tax,ev.id,ev.object_version_id,ev.sha256,ev.server_received_at,eligibility.policy_version,'membership:'||actor.membership_id,m.movement_id,m.source_hash,m.account_id,m.event_id);
  ELSE
   aid:=original.id;
   INSERT INTO app.recovery_case_allocation_reversal(id,tenant_id,job_id,allocation_id,command_id,review_id,authorization_id,source_kind,source_id,payment_reversal_id,credit_note_id,gross_pence,eligible_net_pence,tax_pence)
   VALUES(rid,p_tenant,p_job,aid,(p_command->>'commandId')::uuid,review.id,auth_id,source_kind,source_id,CASE WHEN source_kind='payment_reversal' THEN source_id END,CASE WHEN source_kind='credit_note' THEN source_id END,amount,net,tax);
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
   SELECT id INTO source_binding FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NOT DISTINCT FROM CASE WHEN remittance IS NOT NULL THEN remittance_ev.id END AND credit_note_id IS NULL ORDER BY id LIMIT 1;
   INSERT INTO app.receipt_line_allocation(id,tenant_id,job_id,payment_id,invoice_id,line_id,allocation_id,reversal_id,reverses_id,source_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator)
   VALUES(gen_random_uuid(),p_tenant,p_job,pid,inv.id,(line->>'lineId')::uuid,aid,CASE WHEN original.id IS NOT NULL THEN rid END,CASE WHEN original.id IS NOT NULL THEN (line->>'reversesId')::uuid END,source_binding,line->>'rule',line->>'sourceRef',line->'gross'->>'numerator',line->'gross'->>'denominator',line->'net'->>'numerator',line->'net'->>'denominator');
  END LOOP;
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',aid,'review',NULL);
 END IF;
 result:=result||jsonb_build_object('payloadHash',encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),'approvalHash',hash);
 INSERT INTO app.recovery_allocation_command(command_id,tenant_id,job_id,case_id,actor_membership_id,payload,payload_hash,artifact,result)
 VALUES((p_command->>'commandId')::uuid,p_tenant,p_job,cid,actor.membership_id,p_command,encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),p_artifact,result);
 RETURN result;
END $$;

-- Latest predecessor: 0142_recovery_insurer_money.sql.
CREATE OR REPLACE FUNCTION app.lock_recovery_payer_job(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE tenant uuid; digest text:=nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 BEGIN tenant:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END;
 IF tenant IS NULL OR p_tenant IS DISTINCT FROM tenant
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- FORCE RLS inside SECURITY DEFINER still needs verified transaction-local context.
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p
  ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=p_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=digest
  AND NOT EXISTS(SELECT 1 FROM app.job_commercial_track t WHERE t.tenant_id=p_tenant AND t.job_id=p_job AND t.job_track='contractor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
END $$;

-- Latest predecessor: 0237_final_check_prerequisites.sql.
CREATE OR REPLACE FUNCTION app.final_check_require_invoice_actor(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE scoped_digest text; supplied_digest text:=nullif(current_setting('app.practice_material_digest',true),''); session_actor uuid;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF supplied_digest IS NOT NULL THEN
  SELECT membership_id INTO session_actor FROM app.authenticate_practice_session(supplied_digest,p_tenant);
  IF session_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT practice_session_digest INTO scoped_digest FROM app.job WHERE tenant_id=p_tenant AND id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF scoped_digest IS NOT NULL AND scoped_digest IS DISTINCT FROM supplied_digest THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;

-- Latest predecessor: 0258_receipt_line_source_bridge.sql.
CREATE OR REPLACE FUNCTION app.assert_receipt_fact_scope(p_tenant uuid,p_job uuid,p_session_digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE actor record;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR (SELECT s.membership_id FROM app.authenticate_practice_session(p_session_digest,p_tenant) s) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM (CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN current_setting('app.tenant_id',true)::uuid END)
 OR p_session_digest IS NULL OR p_session_digest !~ '^[a-f0-9]{64}$'
 OR current_setting('app.receipt_line_environment',true) IS DISTINCT FROM 'synthetic_demo'
 THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session_digest,p_tenant);
 IF actor.membership_id IS NULL THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m JOIN app.job j ON j.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.id=actor.membership_id AND m.identity_user_id=actor.identity_user_id
 AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND j.id=p_job AND j.practice_session_digest=p_session_digest FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;

-- Latest predecessor: 0398_receipt_line_command_producer.sql.
CREATE OR REPLACE FUNCTION app.write_receipt_allocation_facts(p_tenant uuid,p_job uuid,p_session_digest text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE t uuid:=p_tenant;j uuid:=p_job;p jsonb:=p_command; actor record; prior app.receipt_allocation_fact_command;
 review app.receipt_allocation_fact_review; doc jsonb; command uuid; review_id uuid; revision uuid; source uuid:=gen_random_uuid();
 audit uuid:=gen_random_uuid(); result jsonb; digest text; action text:=p->>'action'; expected bigint; row jsonb;
 decision uuid; resolution uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); operation text; request jsonb;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR (SELECT s.membership_id FROM app.authenticate_practice_session(p_session_digest,p_tenant) s) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RECEIPT_LINE_SYNTHETIC_ONLY' USING ERRCODE='42501'; END IF;
 PERFORM app.assert_receipt_fact_scope(t,j,p_session_digest);
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session_digest,t);
 IF p_artifact IS NOT NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR (p->>'version' IS NULL OR p->>'version' NOT IN('receipt-line-facts-command.v1','receipt-line-allocation-command.v1'))
 OR action IS NULL OR action NOT IN('review','approve','review_reverse','reverse')
 OR NOT(p ?& ARRAY['version','commandId','action','expectedSourceRevision']) OR jsonb_typeof(p->'expectedSourceRevision') IS DISTINCT FROM 'number'
 OR coalesce(p->>'expectedSourceRevision','') !~ '^[1-9][0-9]*$'
 OR (action='review' AND (NOT p ? 'paymentId' OR p-ARRAY['version','commandId','action','expectedSourceRevision','paymentId','remittanceEvidenceId']<>'{}'))
 OR (action='review_reverse' AND (NOT(p ?& ARRAY['allocationRevisionId','reversalSource']) OR p-(CASE WHEN p->>'version'='receipt-line-allocation-command.v1' THEN ARRAY['version','commandId','action','expectedSourceRevision','allocationRevisionId','reversalSource','grossPence','remittanceEvidenceId'] ELSE ARRAY['version','commandId','action','expectedSourceRevision','allocationRevisionId','reversalSource'] END)<>'{}'
  OR (p->>'version'='receipt-line-allocation-command.v1' AND (jsonb_typeof(p->'grossPence') IS DISTINCT FROM 'number' OR coalesce(p->>'grossPence','') !~ '^[1-9][0-9]*$' OR (p->>'grossPence')::numeric>1000000000000))
  OR jsonb_typeof(p->'reversalSource') IS DISTINCT FROM 'object' OR NOT(p->'reversalSource' ?& ARRAY['kind','sourceId'])
  OR (p->'reversalSource')-ARRAY['kind','sourceId']<>'{}' OR p->'reversalSource'->>'kind' IS NULL OR p->'reversalSource'->>'kind' NOT IN('payment_reversal','credit_note')))
 OR (action IN('approve','reverse') AND (NOT(p ?& ARRAY['reviewId','approvalHash']) OR p-ARRAY['version','commandId','action','expectedSourceRevision','reviewId','approvalHash']<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_RECEIPT_LINE_COMMAND' USING ERRCODE='23514'; END IF;
 IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'RECEIPT_LINE_SERIALIZABLE_REQUIRED' USING ERRCODE='25001'; END IF;
 command:=(p->>'commandId')::uuid;expected:=(p->>'expectedSourceRevision')::bigint;
 IF command IS NULL THEN RAISE EXCEPTION 'INVALID_RECEIPT_LINE_COMMAND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt-facts:'||t::text||':'||j::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt-fact-command:'||t::text||':'||command::text,0));
 SELECT * INTO prior FROM app.receipt_allocation_fact_command WHERE tenant_id=t AND command_id=command;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.payload<>p OR prior.actor_membership_id<>actor.membership_id OR prior.actor_identity_user_id<>actor.identity_user_id THEN RAISE EXCEPTION 'RECEIPT_LINE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 request:=p;
 IF action IN('approve','reverse') THEN
  SELECT * INTO review FROM app.receipt_allocation_fact_review WHERE tenant_id=t AND job_id=j AND id=(p->>'reviewId')::uuid;
  IF review.id IS NULL OR review.expires_at<=clock_timestamp() OR review.operation IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'reversal' ELSE 'receipt' END)
   OR EXISTS(SELECT 1 FROM app.receipt_allocation_fact_revision rf WHERE rf.tenant_id=t AND rf.review_id=review.id)
   OR NOT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_command c WHERE c.tenant_id=t AND c.command_id=review.command_id AND c.actor_membership_id=actor.membership_id AND c.actor_identity_user_id=actor.identity_user_id)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  SELECT payload INTO request FROM app.receipt_allocation_fact_command WHERE tenant_id=t AND command_id=review.command_id;
  IF request->>'version' IS DISTINCT FROM p->>'version'
   OR request->>'action' IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'review_reverse' ELSE 'review' END)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
 END IF;
 IF expected<>(app.receipt_fact_watermark(t,j)->>'revision')::bigint THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 doc:=app.receipt_fact_proposal(t,j,request);
 -- The v1 amount confirms the complete stored reversal; it never sizes it.
 IF request->>'version'='receipt-line-allocation-command.v1' AND request->>'action'='review_reverse'
  AND (request->>'grossPence')::numeric*(doc->'input'->'receipt'->'gross'->>'denominator')::numeric
   <> (doc->'input'->'receipt'->'gross'->>'numerator')::numeric
 THEN RAISE EXCEPTION 'RECEIPT_LINE_REVERSAL_AMOUNT_CHANGED' USING ERRCODE='23514'; END IF;
 -- Serialize against the existing case writer before accepting receipt capacity.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':receipt:'||(doc->>'paymentId'),0));
 digest:=app.final_lock_hash(doc);operation:='receipt_facts.'||(doc->>'operation');
 IF action IN('review','review_reverse') THEN
  review_id:=gen_random_uuid();decision:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'customer_invoice',doc->>'invoiceId',operation);
 ELSE
  IF review.artifact->'facts' IS DISTINCT FROM doc OR trim(review.approval_hash) IS DISTINCT FROM p->>'approvalHash' OR digest IS DISTINCT FROM p->>'approvalHash'
   OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=(review.artifact->>'decisionId')::uuid)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  review_id:=review.id;revision:=gen_random_uuid();decision:=(review.artifact->>'decisionId')::uuid;
 END IF;
 result:=jsonb_build_object('version','receipt-line-facts-result.v1','environment','synthetic_demo','realExternalActions',0,'jobId',j,'commandId',command,
  'action',action,'reviewId',review_id,'approvalHash',digest,'allocationRevisionId',revision,'sourceRevision',expected,'sourceHash',doc->'watermark'->>'sourceHash','replayed',false,'input',doc->'input','lines',doc->'lines');
 INSERT INTO app.receipt_allocation_fact_command(tenant_id,job_id,command_id,actor_membership_id,actor_identity_user_id,payload,payload_hash,result,audit_event_id)
  VALUES(t,j,command,actor.membership_id,actor.identity_user_id,p,app.final_lock_hash(p),result,audit);
 IF action IN('review','review_reverse') THEN
  INSERT INTO app.receipt_allocation_fact_review(tenant_id,job_id,id,command_id,operation,payment_id,invoice_id,source_revision,source_hash,approval_hash,artifact,expires_at)
   VALUES(t,j,review_id,command,doc->>'operation',(doc->>'paymentId')::uuid,(doc->>'invoiceId')::uuid,expected,doc->'watermark'->>'sourceHash',digest,jsonb_build_object('facts',doc,'decisionId',decision),clock_timestamp()+interval '15 minutes');
 ELSE
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.membership_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES(auth,t,decision,resolution,actor.membership_id,operation,doc->>'invoiceId',digest,expected,'receipt-line-facts.v1',review.expires_at);
  INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
   VALUES(t,j,revision,command,review_id,(doc->>'paymentId')::uuid,digest,expected,doc->>'operation');
  INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
   VALUES(t,j,source,revision,(doc->>'paymentId')::uuid,(doc->'movement'->>'id')::uuid,trim(doc->'movement'->>'source_hash'),(doc->>'invoiceId')::uuid,
    (doc->'binding'->>'revision_id')::uuid,(doc->'binding'->>'lock_id')::uuid,(doc->'binding'->>'check_id')::uuid,doc->'binding'->>'invoice_kind',
    jsonb_strip_nulls(jsonb_build_object('evidence',doc->'evidence','approvalRef',auth,'reversalSourceId',doc->'reversalSource'->>'sourceId','reversalSourceKind',doc->'reversalSource'->>'kind',
     'creditNoteId',CASE WHEN doc->'reversalSource'->>'kind'='credit_note' THEN doc->'reversalSource'->>'sourceId' END,'reversesAllocationRevisionId',doc->>'reversesAllocationRevisionId')),(doc->>'effectiveAt')::timestamptz);
  FOR row IN SELECT value FROM jsonb_array_elements(doc->'lines') LOOP
   INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at,reverses_line_allocation_id)
    VALUES(t,j,gen_random_uuid(),source,(doc->>'invoiceId')::uuid,(row->>'lineId')::uuid,(row->>'scopeItemId')::uuid,(row->>'commercialRevisionId')::uuid,row->>'rule',row->>'sourceRef',
     row->'gross'->>'numerator',row->'gross'->>'denominator',row->'net'->>'numerator',row->'net'->>'denominator',(row->>'originalLineNetPence')::bigint,(row->>'originalLineGrossPence')::bigint,(row->>'lineExistedAt')::timestamptz,(row->>'reversesLineAllocationId')::uuid);
  END LOOP;
 END IF;
 PERFORM app.append_final_check_audit(audit,'membership:'||actor.membership_id::text,j,'receipt_facts.'||action,jsonb_build_object('commandId',command,'reviewId',review_id,'allocationRevisionId',revision));
 RETURN result;
END $$;

-- Latest predecessor: 0404_lp3_activation_acceptance.sql.
CREATE OR REPLACE FUNCTION app.lp3_authorize(p_tenant uuid,p_actor uuid,p_command uuid,p_authorization uuid,
 p_command_type text,p_action text,p_subject_type text,p_subject text,p_hash text,p_version integer,
 p_amount bigint,p_currency text,p_recipient text,p_policy text,p_payload text,p_job uuid,p_expected integer) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c app.command_receipt; a app.action_authorization;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command FOR UPDATE;
 SELECT * INTO a FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.command_id IS NULL OR c.status IS DISTINCT FROM 'processing' OR c.command_type IS DISTINCT FROM p_command_type
  OR c.actor_membership_id IS DISTINCT FROM p_actor OR right(c.semantic_key,69) IS DISTINCT FROM ':lp3='||p_payload
  OR a.id IS NULL OR a.actor_membership_id IS DISTINCT FROM p_actor OR a.action_type IS DISTINCT FROM p_action
  OR a.content_hash IS DISTINCT FROM p_hash OR a.aggregate_revision IS DISTINCT FROM p_version
  OR a.amount_pence IS DISTINCT FROM p_amount OR a.currency IS DISTINCT FROM p_currency
  OR a.recipient IS DISTINCT FROM p_recipient OR a.policy_version IS DISTINCT FROM p_policy
  OR a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM app.decision_resolution r JOIN app.decision d
   ON(d.tenant_id,d.id)=(r.tenant_id,r.decision_id)
   WHERE r.tenant_id=p_tenant AND r.id=a.resolution_id AND r.decision_id=a.decision_id
   AND r.actor_membership_id=p_actor AND r.resolution='approved' AND d.action_type=p_action
   AND d.subject_type=p_subject_type AND d.subject_ref=p_subject)
  OR EXISTS(SELECT 1 FROM app.activation_acceptance_operation_use u
   WHERE u.tenant_id=p_tenant AND (u.command_id=p_command OR u.authorization_id=p_authorization))
 THEN RAISE EXCEPTION 'LP3_EXACT_AUTHORIZATION_MISMATCH' USING ERRCODE='42501'; END IF;
 INSERT INTO app.activation_acceptance_operation_use(tenant_id,command_id,authorization_id,actor_membership_id,operation,semantic_key,payload_hash,job_id,expected_job_revision)
 VALUES(p_tenant,p_command,p_authorization,p_actor,p_action,left(c.semantic_key,length(c.semantic_key)-69),p_payload,p_job,p_expected);
END $$;

-- Latest predecessor: 0404_lp3_activation_acceptance.sql.
CREATE OR REPLACE FUNCTION app.switch_job_live(p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_obligation uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_net bigint,p_cap bigint,p_mode varchar,p_terms varchar,p_policy varchar,p_actor uuid,p_activated timestamptz,p_command uuid,p_authorization uuid) RETURNS app.job_activation
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.job_activation; payload text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_net IS NULL OR p_cap IS NULL OR p_mode IS NULL OR p_terms IS NULL OR p_policy IS NULL OR p_activated IS NULL OR p_activated IS DISTINCT FROM date_trunc('milliseconds',p_activated) OR p_net NOT BETWEEN 0 AND 1000000000000 OR p_cap IS DISTINCT FROM app.reference_recovery_cap(p_net) OR NOT EXISTS(SELECT 1 FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash AND (snapshot->>'netPence')::bigint=p_net) THEN RAISE EXCEPTION 'exact accepted terms or cap mismatch' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','job.switch_live',p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_net::text,p_cap::text,p_mode,p_terms,p_policy,CASE WHEN p_mode='synthetic_demo' THEN '7900' END,CASE WHEN p_mode='synthetic_demo' THEN 'GBP' END,NULL,to_char(p_activated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'job.switch_live','job.switch_live','job',p_job::text,p_hash,p_version,CASE WHEN p_mode='synthetic_demo' THEN 7900::bigint END,CASE WHEN p_mode='synthetic_demo' THEN 'GBP' END,NULL,p_terms,payload,p_job,p_expected);
 SELECT * INTO result FROM app.switch_job_live(p_tenant,p_activation,p_cap_snapshot,p_obligation,p_job,p_document,p_version,p_hash,p_expected,p_net,p_cap,p_mode,p_terms,p_policy,p_actor,p_activated);
 RETURN result;
END $$;

-- Latest predecessor: 0404_lp3_activation_acceptance.sql.
CREATE OR REPLACE FUNCTION app.record_simulated_settlement(p_tenant uuid,p_id uuid,p_obligation uuid,p_provider_event varchar,p_amount bigint,p_simulated_at timestamptz,p_actor uuid,p_command uuid,p_authorization uuid) RETURNS app.simulated_settlement_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.simulated_settlement_event; payload text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation) FOR UPDATE;
 IF p_amount IS DISTINCT FROM 7900 OR p_provider_event IS NULL OR length(p_provider_event) NOT BETWEEN 1 AND 200 OR p_simulated_at IS NULL OR p_simulated_at IS DISTINCT FROM date_trunc('milliseconds',p_simulated_at) OR NOT EXISTS(SELECT 1 FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation AND principal_pence=7900 AND currency='GBP' AND state='owed_unpaid') OR EXISTS(SELECT 1 FROM app.simulated_settlement_event WHERE tenant_id=p_tenant AND obligation_id=p_obligation) THEN RAISE EXCEPTION 'synthetic obligation required' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','synthetic.settlement',p_tenant::text,p_actor::text,p_obligation::text,p_obligation::text,p_provider_event,p_amount::text,'GBP','synthetic_demo_illustrative.v1',to_char(p_simulated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'synthetic.settlement','synthetic_obligation.simulate_settlement','synthetic_obligation',p_obligation::text,(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization),1,p_amount,'GBP',NULL,'synthetic_demo_illustrative.v1',payload,(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation),NULL);
 SELECT * INTO result FROM app.record_simulated_settlement(p_tenant,p_id,p_obligation,p_provider_event,p_amount,p_simulated_at);
 RETURN result;
END $$;

-- Latest predecessor: 0404_lp3_activation_acceptance.sql.
CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid,p_command uuid,p_authorization uuid) RETURNS app.quote_acceptance
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.quote_acceptance; payload text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_total IS NULL OR p_total NOT BETWEEN 0 AND 1000000000000 OR p_customer IS NULL OR length(btrim(p_customer)) NOT BETWEEN 1 AND 160 OR p_customer IS DISTINCT FROM btrim(p_customer) OR p_method IS NULL OR p_method NOT IN('verbal','email','message','signed-paper') OR p_accepted_at IS NULL OR p_accepted_at IS DISTINCT FROM date_trunc('milliseconds',p_accepted_at) THEN RAISE EXCEPTION 'invalid acceptance facts' USING ERRCODE='22023'; END IF;
 IF p_evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u
  ON(u.tenant_id,u.id,u.job_id)=(e.tenant_id,e.upload_id,e.job_id)
  WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=p_evidence AND e.kind='original'
  AND u.state='verified' AND u.object_version_id=e.object_version_id
  AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id))
 THEN RAISE EXCEPTION 'invalid acceptance evidence' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'final account locked' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','quote.acceptance.attest',p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_total::text,'GBP',p_customer,p_method,to_char(p_accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),p_evidence::text,'builder-attestation.v1']);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'quote.acceptance.attest','quote.acceptance.attest','quote_document',p_document::text,p_hash,p_version,p_total,'GBP',p_customer,'builder-attestation.v1',payload,p_job,p_expected);
 SELECT * INTO result FROM app.record_builder_attested_acceptance(p_tenant,p_acceptance,p_event,p_job,p_document,p_version,p_hash,p_total,p_expected,p_actor,p_customer,p_method,p_accepted_at,p_evidence);
 RETURN result;
END $$;

-- Latest predecessor: 0404_lp3_activation_acceptance.sql.
CREATE OR REPLACE FUNCTION app.record_quote_disposition(p_tenant uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_kind varchar,p_occurred timestamptz,p_command uuid,p_authorization uuid) RETURNS app.acceptance_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.acceptance_event; payload text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN('declined','superseded','acceptance_cancelled') OR p_occurred IS NULL OR p_occurred IS DISTINCT FROM date_trunc('milliseconds',p_occurred) THEN RAISE EXCEPTION 'invalid disposition facts' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'final account locked' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','quote.'||p_kind,p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_kind,to_char(p_occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),NULL,NULL,NULL,'quote-disposition.v1']);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'quote.'||p_kind,'quote.'||p_kind,'quote_document',p_document::text,p_hash,p_version,NULL,NULL,NULL,'quote-disposition.v1',payload,p_job,p_expected);
 SELECT * INTO result FROM app.record_quote_disposition(p_tenant,p_event,p_job,p_document,p_version,p_hash,p_expected,p_actor,p_kind,p_occurred);
 RETURN result;
END $$;

-- Latest predecessor: 0496_lp5b_writers.sql.
CREATE OR REPLACE FUNCTION app.lp5_bind_effect(p_command uuid,p_authorization uuid,p_adapter text,p_reference jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt; adapter text;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL THEN RETURN; END IF; -- LP-5b unconverted callers retain their own backstops.
 IF c.actor_membership_id IS DISTINCT FROM app.current_actor() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.authorization_id IS DISTINCT FROM p_authorization OR adapter IS DISTINCT FROM p_adapter OR c.effect_ref IS NOT NULL
  OR p_adapter NOT IN('activation','review','import','site_visit','extra_chain','contractor_extra') OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=p_reference WHERE tenant_id=t AND command_id=p_command;
END $$;

-- Latest predecessor: 0496_lp5b_writers.sql.
CREATE OR REPLACE FUNCTION app.begin_command(p_version text,p_command_id uuid,p_command_type text,p_semantic_key text,
 p_resource jsonb,p_expected_revisions jsonb,p_significant_input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid;
 reg app.command_type_registry; prior app.command_receipt; found_count integer:=0;
 digest text; digest_input jsonb; legacy_digest text; legacy_input jsonb; claimed uuid; dec uuid; res uuid; auth uuid; a jsonb; existing_dec uuid;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() OR (p_resource->>'actorMembershipId')::uuid IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 actor:=(p_resource->>'actorMembershipId')::uuid;
 -- No membership lock upgrade: preserve the receipt FK KEY SHARE deadlock fix.
 IF t IS NULL OR t IS DISTINCT FROM (p_resource->>'tenantId')::uuid OR NOT EXISTS(
  SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND revoked_at IS NULL
   AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=p_command_type AND version=p_version;
 IF NOT FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL OR p_semantic_key IS NULL OR length(p_semantic_key) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(p_resource) IS DISTINCT FROM 'object' OR (p_resource-ARRAY['tenantId','actorMembershipId','subjectType','subjectRef'])<>'{}'
  OR NOT(p_resource ?& ARRAY['tenantId','actorMembershipId','subjectType','subjectRef'])
  OR jsonb_typeof(p_resource->'subjectType') IS DISTINCT FROM 'string' OR jsonb_typeof(p_resource->'subjectRef') IS DISTINCT FROM 'string'
  OR length(p_resource->>'subjectType') NOT BETWEEN 1 AND 100 OR length(p_resource->>'subjectRef') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_expected_revisions) IS DISTINCT FROM 'object' OR jsonb_typeof(p_significant_input) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF (p_significant_input->>'version') IS DISTINCT FROM p_version
  OR (p_significant_input->>'actorMembershipId')::uuid IS DISTINCT FROM actor
  OR (p_version='command.v1' AND ((p_significant_input->>'commandType') IS DISTINCT FROM p_command_type
   OR (p_significant_input->>'subjectType') IS DISTINCT FROM (p_resource->>'subjectType')
   OR (p_significant_input->>'subjectRef') IS DISTINCT FROM (p_resource->>'subjectRef'))) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 -- Pre-cutover receipts keep their exact historical digest format. No new claim
 -- is recorded with this digest. Legacy replay still checks both keys and access.
 legacy_input:=p_significant_input;
 IF p_version='repository-command.v1' THEN
  IF (p_significant_input-ARRAY['version','actorMembershipId','input','legacyJson'])<>'{}'
   OR jsonb_typeof(p_significant_input->'input') IS DISTINCT FROM 'object'
   OR jsonb_typeof(p_significant_input->'legacyJson') IS DISTINCT FROM 'string'
   OR (p_significant_input->>'legacyJson')::jsonb IS DISTINCT FROM (p_significant_input->'input')
   OR p_expected_revisions<>'{}'::jsonb THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF (p_resource->>'subjectType') IS DISTINCT FROM 'job'
   OR (p_resource->>'subjectRef')::uuid IS NULL
   OR (((p_significant_input->'input') ? 'actorMembershipId') AND (p_significant_input->'input'->>'actorMembershipId')::uuid IS DISTINCT FROM actor)
   OR (((p_significant_input->'input') ? 'membershipId') AND (p_significant_input->'input'->>'membershipId')::uuid IS DISTINCT FROM actor)
   OR (((p_significant_input->'input') ? 'tenantId') AND (p_significant_input->'input'->>'tenantId')::uuid IS DISTINCT FROM t)
   OR (((p_significant_input->'input') ? 'jobId') AND (p_significant_input->'input'->>'jobId')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (((p_significant_input->'input') ? 'job') AND (p_significant_input->'input'->>'job')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (((p_significant_input->'input') ? 'commandId') AND (p_significant_input->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id)
   OR (((p_significant_input->'input'->'input') ? 'commandId') AND (p_significant_input->'input'->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_version='command.v1' THEN
  legacy_input:=jsonb_set((legacy_input-ARRAY['commandId','decisionId','resolutionId','authorizationId']),'{action,expiresAt}','{}');
 END IF;
 legacy_digest:=encode(sha256(convert_to((CASE WHEN p_version='repository-command.v1'
  THEN (p_significant_input->>'legacyJson') ELSE app.final_lock_canonical(legacy_input) END),'UTF8')),'hex');
 -- Preserve the historical exclusion of server-generated grant expiry. It
 -- remains in the immutable authorization and is checked for fresh execution;
 -- a replay neither renews that grant nor repeats its business effect.
 digest_input:=(p_significant_input-ARRAY['commandId','decisionId','resolutionId','authorizationId']);
 IF p_version='command.v1' THEN
  digest_input:=jsonb_set(digest_input,'{action,expiresAt}','{}');
 END IF;
 -- Principal/resource and every non-generated action term remain significant.
 digest:=encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_object('version',p_version,'commandType',p_command_type,
  'semanticKey',p_semantic_key,'resource',p_resource,'expectedRevisions',p_expected_revisions,
  'input',digest_input)),'UTF8')),'hex');
 IF reg.permission_rule='contractor' THEN
  PERFORM app.lp5b_contractor_permission(p_command_type,actor,(p_resource->>'subjectRef')::uuid,(p_significant_input->'input'));
 END IF;
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(p_command_id,t,p_command_type,p_semantic_key,digest,'processing',actor) ON CONFLICT DO NOTHING RETURNING command_id INTO claimed;
 IF claimed IS NULL THEN
  -- Resolve BOTH keys, never arbitrary rows[0]. Two different receipts always conflict.
  FOR prior IN SELECT * FROM app.command_receipt WHERE tenant_id=t AND
   (command_id=p_command_id OR (command_type=p_command_type AND semantic_key=p_semantic_key)) LOOP
   found_count:=found_count+1;
   IF prior.actor_membership_id IS DISTINCT FROM actor OR prior.command_type IS DISTINCT FROM p_command_type
    OR (prior.request_hash IS DISTINCT FROM digest AND (prior.request_hash IS DISTINCT FROM legacy_digest
     OR EXISTS(SELECT 1 FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=prior.command_id)))
    OR prior.status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  END LOOP;
  IF found_count<>1 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Recheck after a uniqueness wait, too; never lock membership FOR UPDATE.
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='contractor' THEN
   PERFORM app.lp5b_contractor_permission(p_command_type,actor,(p_resource->>'subjectRef')::uuid,(p_significant_input->'input'));
  END IF;
  RETURN jsonb_build_object('kind','replay','result',prior.result);
 END IF;
 IF p_version='repository-command.v1' THEN
  NULL; -- Operational writers mint no commercial approval.
 ELSIF reg.completion_adapter='finding' THEN
  IF (p_significant_input-ARRAY['version','commandId','semanticKey','actorMembershipId','decisionId','findingFingerprint','resolution','expectedSnapshotRevision'])<>'{}'
   OR NOT(p_expected_revisions ? 'snapshotRevision') OR (p_expected_revisions-ARRAY['snapshotRevision'])<>'{}' OR (p_expected_revisions->>'snapshotRevision')::integer IS DISTINCT FROM (p_significant_input->>'expectedSnapshotRevision')::integer
   OR (p_resource->>'subjectRef') IS DISTINCT FROM (p_significant_input->>'decisionId')
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF (p_significant_input->>'resolution') IS NULL OR (p_significant_input->>'resolution') NOT IN('dismissed','rejected')
   OR NOT EXISTS(SELECT 1 FROM app.job_finding WHERE tenant_id=t AND decision_id=(p_significant_input->>'decisionId')::uuid
    AND fingerprint=(p_significant_input->>'findingFingerprint') AND snapshot_revision=(p_expected_revisions->>'snapshotRevision')::integer)
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(p_significant_input->>'decisionId')::uuid,(p_significant_input->>'resolution'),actor);
 ELSE
  IF (p_significant_input-ARRAY['version','commandId','commandType','semanticKey','actorMembershipId','subjectType','subjectRef','decisionId','resolutionId','authorizationId','action'])<>'{}'
   OR NOT(p_expected_revisions ? 'aggregateRevision') OR (p_expected_revisions-ARRAY['aggregateRevision'])<>'{}' THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  a:=(p_significant_input->'action');
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT(a ?& ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt'])
   OR (a-ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt'])<>'{}'
   OR (a->>'expiresAt')::timestamptz<=clock_timestamp() OR (a->>'expiresAt') IS NULL
   OR (a->>'contentHash') IS NULL OR (a->>'contentHash')!~'^[a-f0-9]{64}$'
   OR (a->>'aggregateRevision')::integer IS DISTINCT FROM (p_expected_revisions->>'aggregateRevision')::integer
   OR (a->>'aggregateRevision')::integer<0 OR (a->>'actionType') IS NULL OR length(a->>'actionType') NOT BETWEEN 1 AND 100
   OR length(a->>'policyVersion') NOT BETWEEN 1 AND 80 OR (a->>'policyVersion') IS NULL
   OR ((a->>'amountPence') IS NULL) IS DISTINCT FROM ((a->>'currency') IS NULL)
   OR ((a->>'amountPence') IS NOT NULL AND ((a->>'amountPence')::numeric NOT BETWEEN 0 AND 1000000000000 OR (a->>'currency')<>'GBP'))
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  -- Operational no-op probes validate the same schema but mint no grant.
  IF reg.completion_adapter<>'synthetic_lock_noop' THEN
  dec:=coalesce((p_significant_input->>'decisionId')::uuid,gen_random_uuid());
  res:=coalesce((p_significant_input->>'resolutionId')::uuid,gen_random_uuid());
  auth:=coalesce((p_significant_input->>'authorizationId')::uuid,gen_random_uuid());
  IF (p_significant_input ? 'decisionId') THEN
   SELECT id INTO existing_dec FROM app.decision WHERE tenant_id=t AND id=dec
    AND subject_type=(p_resource->>'subjectType') AND subject_ref=(p_resource->>'subjectRef') AND action_type=(a->>'actionType');
   IF existing_dec IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
    VALUES(dec,t,(p_resource->>'subjectType'),(p_resource->>'subjectRef'),(a->>'actionType'));
  END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(res,t,dec,'approved',actor);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
   VALUES(auth,t,dec,res,actor,(a->>'actionType'),(a->>'recipient'),(a->>'contentHash'),(a->>'aggregateRevision')::integer,
    (a->>'amountPence')::bigint,(a->>'currency'),(a->>'policyVersion'),(a->>'expiresAt')::timestamptz);
  END IF;
 END IF;
 INSERT INTO app.command_lifecycle_claim(tenant_id,command_id,actor_membership_id,version,resource,expected_revisions,significant_input,authorization_id)
  VALUES(t,p_command_id,actor,p_version,p_resource,p_expected_revisions,p_significant_input,auth);
 RETURN jsonb_build_object('kind','claim','decisionId',dec,'resolutionId',res,'authorizationId',auth);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR not_null_violation OR string_data_right_truncation THEN
 RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 WHEN unique_violation THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
END $$;

-- Latest predecessor: 0496_lp5b_writers.sql.
CREATE OR REPLACE FUNCTION app.complete_command(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; reg app.command_type_registry; value jsonb; refs jsonb; proof_ref jsonb;
BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR (p_outcome-ARRAY['eventId','placementId','invoiceId','locked','revision','sourceJobId','sourceBindingId','id','revisionId'])<>'{}' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 IF c.actor_membership_id IS DISTINCT FROM app.current_actor() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND (role=reg.permission_rule OR reg.permission_rule IN('active_member','contractor'))
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF reg.permission_rule='contractor' THEN
  PERFORM app.lp5b_contractor_permission(r.command_type,c.actor_membership_id,(c.resource->>'subjectRef')::uuid,(c.significant_input->'input'));
 END IF;
 IF c.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution d ON(d.tenant_id,d.id)=(a.tenant_id,a.resolution_id)
  WHERE a.tenant_id=t AND a.id=c.authorization_id AND a.actor_membership_id=c.actor_membership_id
   AND d.actor_membership_id=c.actor_membership_id AND d.resolution='approved' AND a.revoked_at IS NULL
   AND a.expires_at>(CASE WHEN r.command_type='recovery.terms.approve' THEN transaction_timestamp() ELSE clock_timestamp() END)) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.completion_adapter IN('prevention','inbox_seed') THEN
  PERFORM app.lp5b_prepare_projection(p_command_id);
  SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 IF c.actor_membership_id IS DISTINCT FROM app.current_actor() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 value:=app.lp5_command_result(p_command_id,p_outcome);
 IF reg.completion_adapter='proof' AND (value->>'decisionId') IS NOT NULL THEN
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(value->>'decisionId')::uuid,'approved',c.actor_membership_id);
 END IF;
 IF reg.completion_adapter='contractor_extra' AND ((c.significant_input->'input') ? 'clientCaptureId')
  AND EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=t AND o.job_id=(c.resource->>'subjectRef')::uuid
   AND o.variation_id=(value->>'variationId')::uuid AND o.command_id<>p_command_id
   AND o.client_capture_id=(c.significant_input->'input'->>'clientCaptureId')::uuid) THEN
  c.effect_ref:=coalesce(c.effect_ref,'{}'::jsonb)||jsonb_build_object('noopReason','client_capture_already_exists');
  UPDATE app.command_lifecycle_claim SET effect_ref=c.effect_ref WHERE tenant_id=t AND command_id=p_command_id;
 END IF;
 -- The argument is a reference hint only. Persist exclusively the adapter-derived result.
 proof_ref:=CASE reg.completion_adapter
  WHEN 'job_parties' THEN jsonb_strip_nulls(jsonb_build_object('id',(value->'id'),'revisionId',(value->'revisionId')))
  WHEN 'import' THEN (CASE WHEN (value ? 'sourceJobId') THEN jsonb_build_object('sourceJobId',(value->'sourceJobId'),'sourceBindingId',(value->'sourceBindingId')) ELSE '{}'::jsonb END)
  WHEN 'acceptance' THEN jsonb_build_object('eventId',(value->'eventId'))
  WHEN 'disposition' THEN jsonb_build_object('eventId',(value->'eventId'))
  WHEN 'purchase_order' THEN jsonb_build_object('placementId',(value->'placementId'))
  WHEN 'invoice' THEN jsonb_build_object('invoiceId',(value->'invoiceId'))
  WHEN 'synthetic_lock_noop' THEN jsonb_build_object('locked',(value->'locked'))
  WHEN 'review' THEN (CASE WHEN (value ? 'revision') THEN jsonb_build_object('revision',(value->'revision')) ELSE '{}'::jsonb END)
  ELSE '{}'::jsonb END;
 UPDATE app.command_lifecycle_claim SET outcome=proof_ref WHERE tenant_id=t AND command_id=p_command_id;
 UPDATE app.command_receipt SET status='succeeded',result=value,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command_id;
 refs:=jsonb_build_object('commandId',p_command_id::text);
 IF c.authorization_id IS NOT NULL THEN refs:=refs||jsonb_build_object('authorizationId',c.authorization_id::text); END IF;
 IF reg.completion_adapter='synthetic_lock_noop' OR (value->>'reused')='true' OR (c.effect_ref ? 'noopReason') THEN
  refs:=refs||jsonb_build_object('outcome','succeeded_noop','reason',coalesce((c.effect_ref->>'noopReason'),'adapter_verified_existing_effect')); END IF;
 -- All business writes and the terminal receipt precede the last contending lock.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||c.actor_membership_id::text,'eventType','command.succeeded','subjectType',(c.resource->>'subjectType'),
  'subjectRef',(c.resource->>'subjectRef'),'payload',jsonb_build_object('references',refs,
  'classifications',jsonb_build_object('action',reg.audit_class)))),'checked_operation');
 RETURN value;
END $$;

-- Latest predecessor: 0184_meter_persistence.sql.
CREATE OR REPLACE FUNCTION app.mon1_company_actor(t uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; s identity.session;
BEGIN
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR t='11111111-1111-4111-8111-111111111111'::uuid THEN
  RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo'
  AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF s.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.bind_request('real',digest,t);
 actor:=app.current_actor();
 IF t IS DISTINCT FROM app.current_tenant() OR NOT EXISTS(SELECT 1 FROM app.membership m
  WHERE m.tenant_id=t AND m.id=actor AND m.role IN('owner','admin') AND m.revoked_at IS NULL
   AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF actor IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;

COMMIT;
