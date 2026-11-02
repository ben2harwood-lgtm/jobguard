BEGIN;
-- PRACTICE-FACTS-1B: synthetic eligibility snapshots only; no commercial authority.
-- Historical rows are not rewritten. Earlier/mixed settlement capability remains HELD.
CREATE TABLE app.practice_supplier_credit_case_binding (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,
 credit_note_id uuid NOT NULL,credit_note_version_id uuid NOT NULL,
 later_invoice_id uuid NOT NULL,later_invoice_version_id uuid NOT NULL,
 credit_source_hash char(64) NOT NULL CHECK(credit_source_hash ~ '^[a-f0-9]{64}$'),
 invoice_source_hash char(64) NOT NULL CHECK(invoice_source_hash ~ '^[a-f0-9]{64}$'),
 consumed_net_pence bigint NOT NULL CHECK(consumed_net_pence=30000),
 cash_due_pence bigint NOT NULL CHECK(cash_due_pence=144000),
 currency char(3) NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 actor_membership_id uuid NOT NULL,command_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,case_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,credit_note_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,later_invoice_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,credit_note_version_id) REFERENCES app.supplier_document_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,later_invoice_version_id) REFERENCES app.supplier_document_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(credit_note_id<>later_invoice_id)
);
CREATE TABLE app.practice_supplier_credit_review_payment (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,review_id uuid NOT NULL,
 payment_event_id uuid NOT NULL,movement_key text NOT NULL CHECK(movement_key IN('supplier-payment-600','supplier-payment-840')),
 gross_pence bigint NOT NULL CHECK(gross_pence=CASE movement_key WHEN 'supplier-payment-600' THEN 60000 WHEN 'supplier-payment-840' THEN 84000 END),
 source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,review_id,movement_key),UNIQUE(tenant_id,review_id,payment_event_id),
 FOREIGN KEY(tenant_id,job_id,case_id,review_id) REFERENCES app.recovery_eligibility_v3_review(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,payment_event_id) REFERENCES app.practice_feed_event(tenant_id,job_id,id)
);
ALTER TABLE app.practice_supplier_credit_case_binding OWNER TO jobguard_migration;
ALTER TABLE app.practice_supplier_credit_case_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.practice_supplier_credit_case_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.practice_supplier_credit_case_binding FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.practice_supplier_credit_case_binding FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT ON app.practice_supplier_credit_case_binding TO jobguard_runtime;
ALTER TABLE app.practice_supplier_credit_review_payment OWNER TO jobguard_migration;
ALTER TABLE app.practice_supplier_credit_review_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.practice_supplier_credit_review_payment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.practice_supplier_credit_review_payment FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.practice_supplier_credit_review_payment FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT ON app.practice_supplier_credit_review_payment TO jobguard_runtime;

CREATE FUNCTION app.pf1b_pin_time() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.created_at:=transaction_timestamp();RETURN NEW;END $$;
ALTER FUNCTION app.pf1b_pin_time() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pf1b_pin_time() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER a_pf1b_time BEFORE INSERT ON app.practice_supplier_credit_case_binding FOR EACH ROW EXECUTE FUNCTION app.pf1b_pin_time();
CREATE TRIGGER a_pf1b_time BEFORE INSERT ON app.practice_supplier_credit_review_payment FOR EACH ROW EXECUTE FUNCTION app.pf1b_pin_time();
CREATE TRIGGER pf1b_binding_immutable BEFORE UPDATE OR DELETE ON app.practice_supplier_credit_case_binding FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();
CREATE TRIGGER pf1b_payment_immutable BEFORE UPDATE OR DELETE ON app.practice_supplier_credit_review_payment FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();

-- Private source validation; only the checked writer can execute it as the owner.
-- Shared insert guards independently validate the same sources below.
CREATE FUNCTION app.pf1b_source_bundle(t uuid,j uuid,c uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE credit record; invoice record; payments jsonb; opening timestamptz;
BEGIN
 SELECT created_at INTO opening FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c;
 SELECT d.id,d.content_hash,v.id version_id INTO credit FROM app.supplier_document d
 JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
 WHERE d.tenant_id=t AND d.job_id=j AND d.supplier_context='fictional-merchant' AND d.document_type='credit' AND d.document_number='CR-PF1B-001' AND d.status='ready'
 AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM SUPPLIER CREDIT CR-PF1B-001\nNET GBP 300.00','UTF8')),'hex')
 AND v.version=1 AND v.parent_version_id IS NULL AND v.content_hash=d.content_hash AND v.media_type='text/plain' AND v.page_count=1
 AND v.byte_length=octet_length(convert_to(E'FICTIONAL INTERIM SUPPLIER CREDIT CR-PF1B-001\nNET GBP 300.00','UTF8'));
 SELECT d.id,d.content_hash,v.id version_id INTO invoice FROM app.supplier_document d
 JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
 WHERE d.tenant_id=t AND d.job_id=j AND d.supplier_context='fictional-merchant' AND d.document_type='invoice' AND d.document_number='INV-PF1B-001' AND d.status='ready'
 AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM LATER SUPPLIER INVOICE INV-PF1B-001\nAMOUNT TO PAY GBP 1440.00','UTF8')),'hex')
 AND v.version=1 AND v.parent_version_id IS NULL AND v.content_hash=d.content_hash AND v.media_type='text/plain' AND v.page_count=1
 AND v.byte_length=octet_length(convert_to(E'FICTIONAL INTERIM LATER SUPPLIER INVOICE INV-PF1B-001\nAMOUNT TO PAY GBP 1440.00','UTF8'));
 IF credit.id IS NULL OR invoice.id IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',e.id,'movement',e.movement_key,'gross',e.gross_pence,'hash',e.source_hash) ORDER BY e.movement_key)
 INTO payments FROM app.practice_feed_event e
 JOIN app.practice_feed_account a ON(a.tenant_id,a.job_id,a.id)=(e.tenant_id,e.job_id,e.account_id)
 JOIN app.practice_feed_command k ON(k.tenant_id,k.job_id,k.account_id,k.id)=(e.tenant_id,e.job_id,e.account_id,e.command_id)
 WHERE e.tenant_id=t AND e.job_id=j AND e.movement_key IN('supplier-payment-600','supplier-payment-840')
 AND a.session_digest=current_setting('app.practice_material_digest',true) AND a.environment='synthetic_demo'
 AND a.actor_membership_id=(SELECT p.membership_id FROM app.authenticate_practice_session(current_setting('app.practice_material_digest',true),t) p) AND k.actor_membership_id=a.actor_membership_id
 AND EXISTS(SELECT 1 FROM app.practice_feed_job_owner o WHERE o.tenant_id=a.tenant_id AND o.job_id=a.job_id AND o.session_digest=a.session_digest AND o.actor_membership_id=a.actor_membership_id)
 AND e.event_kind='settled' AND e.state='settled' AND e.identity='identified' AND e.representation_id='feed'
 AND e.event_id='settled-'||e.movement_key AND e.currency='GBP' AND e.environment='synthetic_demo' AND e.version='practice-feed-event.v1'
 AND k.action='advance' AND k.step IN('settled','page_overlap','replay') AND k.movement_key=e.movement_key AND k.environment='synthetic_demo'
 AND e.gross_pence=CASE e.movement_key WHEN 'supplier-payment-600' THEN 60000 ELSE 84000 END
 AND e.source_hash=encode(sha256(convert_to(concat_ws('|',e.version,e.environment,e.tenant_id::text,e.job_id::text,e.account_id::text,e.event_id,e.event_kind,e.movement_key,e.identity,e.representation_id,e.gross_pence::text,e.currency,e.state),'UTF8')),'hex');
 IF payments IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payments) p WHERE p->>'movement'='supplier-payment-600')
 OR EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.movement_key IN('supplier-payment-600','supplier-payment-840') AND e.event_kind='settled'
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payments) p WHERE p->>'id'=e.id::text))
 THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 IF EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(payments) p) AND e.created_at<=opening)
 THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000',DETAIL='PF1B_EARLIER_PAYMENT_CAPABILITY_HELD';END IF;
 IF EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=t AND u.job_id=j AND u.identity='unidentified' AND u.movement_key IN('supplier-payment-600','supplier-payment-840')
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 RETURN jsonb_build_object('creditId',credit.id,'creditVersionId',credit.version_id,'creditHash',credit.content_hash,'invoiceId',invoice.id,'invoiceVersionId',invoice.version_id,'invoiceHash',invoice.content_hash,'payments',payments);
END $$;
ALTER FUNCTION app.pf1b_source_bundle(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pf1b_source_bundle(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION app.pf1b_review_supplier_credit(t uuid,j uuid,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE digest text:=nullif(current_setting('app.practice_material_digest',true),''); principal record; member uuid;
 cmd uuid; cid uuid; fixture text; expected_case integer; expected_review integer; payload_hash text;
 c app.recovery_case_current; prior app.recovery_eligibility_v3_review; latest app.recovery_eligibility_v3_review;
 binding app.practice_supplier_credit_case_binding; sources jsonb; p jsonb; final_event uuid; q bigint;
 result jsonb; line jsonb; reason text; rid uuid:=gen_random_uuid(); revision integer; job_status text;
BEGIN
 -- Authority comes first, including replay and unknown job paths. Settings alone never supply an actor.
 IF current_setting('app.tenant_id',true) IS NULL OR current_setting('app.tenant_id',true) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO principal FROM app.authenticate_practice_session(digest,t);
 IF principal.membership_id IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT id INTO member FROM app.membership WHERE tenant_id=t AND id=principal.membership_id AND identity_user_id=principal.identity_user_id
 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF member IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM control_plane.practice_session WHERE token_digest=digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 IF input - ARRAY['version','action','commandId','caseId','fixture','expectedCaseRevision','expectedReviewRevision'] <> '{}'::jsonb
 OR NOT(input ?& ARRAY['version','action','commandId','caseId','fixture','expectedCaseRevision','expectedReviewRevision'])
 OR input->>'version' IS DISTINCT FROM 'recovery-eligibility-command.v3' OR input->>'action' IS DISTINCT FROM 'review'
 OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'caseId') IS DISTINCT FROM 'string'
 OR input->>'commandId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR input->>'caseId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR jsonb_typeof(input->'fixture') IS DISTINCT FROM 'string' OR input->>'fixture' NOT IN('F14','F16-partial','F16-full')
 OR jsonb_typeof(input->'expectedCaseRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'expectedReviewRevision') IS DISTINCT FROM 'number'
 OR input->>'expectedCaseRevision' !~ '^[0-9]{1,10}$' OR input->>'expectedReviewRevision' !~ '^[0-9]{1,10}$'
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 IF (input->>'expectedCaseRevision')::bigint NOT BETWEEN 1 AND 2147483646 OR (input->>'expectedReviewRevision')::bigint NOT BETWEEN 0 AND 2147483646
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 cmd:=(input->>'commandId')::uuid;cid:=(input->>'caseId')::uuid;fixture:=input->>'fixture';
 expected_case:=(input->>'expectedCaseRevision')::integer;expected_review:=(input->>'expectedReviewRevision')::integer;
 -- Canonical SQL jsonb array, UUIDs normalized by PostgreSQL; hashes are never caller supplied.
 payload_hash:=encode(sha256(convert_to(jsonb_build_array('pf1b.v1',t::text,j::text,'recovery-eligibility-command.v3','review',cmd::text,cid::text,expected_case,expected_review,fixture)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('eligibility-v3:'||cmd::text));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(cid::text));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(j::text));
 -- Lock the job against lifecycle changes only after the shared feed key, before the audit head.
 SELECT status INTO job_status FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest=digest FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 -- Expiry may have passed while waiting for locks; current authority is checked again.
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t) p WHERE p.membership_id=member)
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM app.recovery_eligibility_v3_review WHERE tenant_id=t AND command_id=cmd;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'caseRevision',prior.case_revision,'sourceEventId',prior.source_event_id,'result',prior.result,'payloadHash',prior.payload_hash,'resultHash',encode(sha256(convert_to(prior.result::text,'UTF8')),'hex'),'actorMembershipId',member,'commandId',cmd,'replayed',true);
 END IF;
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=cid;
 IF NOT FOUND OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514';END IF;
 SELECT r.* INTO latest FROM app.recovery_eligibility_v3_review r WHERE r.tenant_id=t AND r.case_id=cid ORDER BY r.revision DESC LIMIT 1;
 IF c.revision<>expected_case OR coalesce(latest.revision,0)<>expected_review THEN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF job_status<>'live' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 sources:=app.pf1b_source_bundle(t,j,cid);
 IF c.case_type<>'merchant_overcharge' OR c.claim_pence<30000
 OR latest.id IS NOT NULL AND latest.fixture<>fixture AND NOT(latest.fixture='F16-partial' AND fixture='F16-full')
 OR fixture='F16-full' AND (latest.id IS NULL OR latest.fixture NOT IN('F16-partial','F16-full'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF fixture='F16-partial' AND jsonb_array_length(sources->'payments')<>1 OR fixture<>'F16-partial' AND jsonb_array_length(sources->'payments')<>2
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=t AND case_id=cid;
 IF FOUND THEN
  IF binding.job_id<>j OR binding.credit_note_id<>(sources->>'creditId')::uuid OR binding.credit_note_version_id<>(sources->>'creditVersionId')::uuid
  OR binding.later_invoice_id<>(sources->>'invoiceId')::uuid OR binding.later_invoice_version_id<>(sources->>'invoiceVersionId')::uuid
  OR binding.credit_source_hash<>sources->>'creditHash' OR binding.invoice_source_hash<>sources->>'invoiceHash'
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 ELSE
  INSERT INTO app.practice_supplier_credit_case_binding(id,tenant_id,job_id,case_id,credit_note_id,credit_note_version_id,later_invoice_id,later_invoice_version_id,credit_source_hash,invoice_source_hash,consumed_net_pence,cash_due_pence,actor_membership_id,command_id)
  VALUES(gen_random_uuid(),t,j,cid,(sources->>'creditId')::uuid,(sources->>'creditVersionId')::uuid,(sources->>'invoiceId')::uuid,(sources->>'invoiceVersionId')::uuid,sources->>'creditHash',sources->>'invoiceHash',30000,144000,member,cmd);
 END IF;
 q:=CASE WHEN fixture='F16-partial' THEN 0 ELSE 30000 END;
 reason:=CASE WHEN fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full' ELSE NULL END;
 line:=jsonb_build_object('kind','principal','debtorType','business','netPence',30000,'qualifyingPrincipal',jsonb_build_object('pence',q,'currency','GBP'),'reason',reason,'reasonHeld',false);
 result:=jsonb_build_object('version','recovery-eligibility-review.v3','policyVersion','reference_recovery_eligibility_policy_v3','fixture',fixture,'outcome',CASE WHEN q=0 THEN 'excluded' ELSE 'eligible_for_review' END,'qualifyingPrincipal',jsonb_build_object('pence',q,'currency','GBP'),'reason',reason,'reasonHeld',false,'terminal',false,'productionEnabled',false,'lines',jsonb_build_array(line));
 SELECT (pmt->>'id')::uuid INTO final_event FROM jsonb_array_elements(sources->'payments') pmt WHERE pmt->>'movement'=CASE WHEN q=0 THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END;
 revision:=coalesce(latest.revision,0)+1;
 INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)
 VALUES(rid,t,j,cid,revision,c.revision,fixture,final_event,member,cmd,payload_hash,result);
 INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence) VALUES(gen_random_uuid(),t,j,cid,rid,'principal','business',30000);
 FOR p IN SELECT value FROM jsonb_array_elements(sources->'payments') LOOP
  INSERT INTO app.practice_supplier_credit_review_payment(id,tenant_id,job_id,case_id,review_id,payment_event_id,movement_key,gross_pence,source_hash)
  VALUES(gen_random_uuid(),t,j,cid,rid,(p->>'id')::uuid,p->>'movement',(p->>'gross')::bigint,p->>'hash');
 END LOOP;
 IF q>0 THEN
  INSERT INTO app.supplier_credit_consumption(id,tenant_id,job_id,case_id,review_id,credit_note_id,later_invoice_id,settled_payment_event_id,consumed_net_pence)
  VALUES(gen_random_uuid(),t,j,cid,rid,(sources->>'creditId')::uuid,(sources->>'invoiceId')::uuid,final_event,30000);
 END IF;
 RETURN jsonb_build_object('id',rid,'revision',revision,'caseRevision',c.revision,'sourceEventId',final_event,'result',result,'payloadHash',payload_hash,'resultHash',encode(sha256(convert_to(result::text,'UTF8')),'hex'),'actorMembershipId',member,'commandId',cmd,'replayed',false);
END $$;
ALTER FUNCTION app.pf1b_review_supplier_credit(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pf1b_review_supplier_credit(uuid,uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.pf1b_review_supplier_credit(uuid,uuid,jsonb) TO jobguard_runtime;

-- Both routines start from 0186_recovery_eligibility_paid_interest.sql (latest main definitions).
-- Preserve 0142 insurer locks/exclusions and every 0186 paid-interest/F19 rule; add only F14/F16 paths.
CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; e app.practice_feed_event; r app.recovery_eligibility_v3_review;
 digest text:=nullif(current_setting('app.practice_material_digest',true),'');
 sources jsonb; expected_result jsonb; binding app.practice_supplier_credit_case_binding;
 expected_q bigint:=0; expected_reason text; expected_category text; expected_kind text;
 expected_net bigint; expected_debtor text; paid_before boolean; settled boolean; insurer_money boolean:=false; interest app.practice_feed_event; interest_reason text;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='supplier_credit_consumption' THEN
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF r.id IS NULL OR r.fixture NOT IN('F14','F16-full') OR r.created_at<>transaction_timestamp() OR binding.id IS NULL
  OR NEW.credit_note_id<>binding.credit_note_id OR NEW.later_invoice_id<>binding.later_invoice_id OR NEW.settled_payment_event_id<>r.source_event_id OR NEW.consumed_net_pence<>30000
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  sources:=app.pf1b_source_bundle(NEW.tenant_id,NEW.job_id,NEW.case_id);
  IF jsonb_array_length(sources->'payments')<>2 OR r.source_event_id IS DISTINCT FROM (SELECT (p->>'id')::uuid FROM jsonb_array_elements(sources->'payments') p WHERE p->>'movement'='supplier-payment-840')
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  NEW.created_at:=transaction_timestamp();RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='recovery_claim_line' THEN
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  IF NOT FOUND OR r.created_at<>transaction_timestamp() THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
  expected_debtor:=CASE WHEN r.fixture='F19' THEN 'individual' ELSE 'business' END;
  expected_net:=CASE NEW.kind WHEN 'statutory_interest' THEN 12000 WHEN 'fixed_compensation' THEN 7000 ELSE
   CASE r.fixture WHEN 'F14' THEN 30000 WHEN 'F16-partial' THEN 30000 WHEN 'F16-full' THEN 30000 WHEN 'F15' THEN 20000 WHEN 'F17' THEN 45000 WHEN 'F20' THEN 32000 WHEN 'F21' THEN 9000 WHEN 'F22' THEN 32000 ELSE 250000 END END;
  IF (NEW.kind<>'principal' AND r.fixture NOT IN('F18','F19')) OR NEW.debtor_type<>expected_debtor OR NEW.net_pence<>expected_net
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.case_id;
 IF NOT FOUND OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514';END IF;
 IF c.case_type='withheld_customer_payment' AND NEW.source_event_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('payer-mark:'||NEW.source_event_id::text));
  PERFORM app.lock_recovery_payer_job(NEW.tenant_id,NEW.job_id,NEW.actor_membership_id);
  insurer_money:=coalesce(app.recovery_job_payer_type(NEW.tenant_id,NEW.job_id)='insurer',false)
   AND coalesce((SELECT state FROM app.recovery_payment_payer_mark WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND source_event_id=NEW.source_event_id ORDER BY revision DESC LIMIT 1),'withdrawn')<>'customer_own';
 END IF;
 IF NEW.case_revision<>c.revision OR NEW.revision<>(SELECT coalesce(max(revision),0)+1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id)
 THEN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN
  -- Runtime's historical INSERT privilege cannot bypass the new checked writer.
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id AND status='live')
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  sources:=app.pf1b_source_bundle(NEW.tenant_id,NEW.job_id,NEW.case_id);
  IF c.case_type<>'merchant_overcharge' OR c.claim_pence<30000
  OR EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review x WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.revision=(SELECT max(y.revision) FROM app.recovery_eligibility_v3_review y WHERE y.tenant_id=NEW.tenant_id AND y.case_id=NEW.case_id)
   AND x.fixture<>NEW.fixture AND NOT(x.fixture='F16-partial' AND NEW.fixture='F16-full'))
  OR NEW.fixture='F16-full' AND NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review x WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.fixture IN('F16-partial','F16-full'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  IF NEW.fixture='F16-partial' AND jsonb_array_length(sources->'payments')<>1 OR NEW.fixture<>'F16-partial' AND jsonb_array_length(sources->'payments')<>2
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF binding.id IS NULL OR binding.credit_note_id<>(sources->>'creditId')::uuid OR binding.credit_note_version_id<>(sources->>'creditVersionId')::uuid
  OR binding.later_invoice_id<>(sources->>'invoiceId')::uuid OR binding.later_invoice_version_id<>(sources->>'invoiceVersionId')::uuid
  OR binding.credit_source_hash<>sources->>'creditHash' OR binding.invoice_source_hash<>sources->>'invoiceHash'
  OR NEW.source_event_id IS DISTINCT FROM (SELECT (p->>'id')::uuid FROM jsonb_array_elements(sources->'payments') p WHERE p->>'movement'=CASE WHEN NEW.fixture='F16-partial' THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  expected_q:=CASE WHEN NEW.fixture='F16-partial' THEN 0 ELSE 30000 END;
  expected_reason:=CASE WHEN NEW.fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full' ELSE NULL END;
  expected_result:=jsonb_build_object('version','recovery-eligibility-review.v3','policyVersion','reference_recovery_eligibility_policy_v3','fixture',NEW.fixture,'outcome',CASE WHEN expected_q=0 THEN 'excluded' ELSE 'eligible_for_review' END,'qualifyingPrincipal',jsonb_build_object('pence',expected_q,'currency','GBP'),'reason',expected_reason,'reasonHeld',false,'terminal',false,'productionEnabled',false,
   'lines',jsonb_build_array(jsonb_build_object('kind','principal','debtorType','business','netPence',30000,'qualifyingPrincipal',jsonb_build_object('pence',expected_q,'currency','GBP'),'reason',expected_reason,'reasonHeld',false)));
  IF NEW.result IS DISTINCT FROM expected_result OR NEW.policy_version<>'reference_recovery_eligibility_policy_v3' OR NEW.environment<>'synthetic_demo'
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  NEW.created_at:=transaction_timestamp();RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND fixture<>NEW.fixture)
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 expected_category:=CASE NEW.fixture WHEN 'F15' THEN 'merchant_overcharge' WHEN 'F17' THEN 'duplicate_supplier_payment' WHEN 'F21' THEN 'merchant_overcharge' WHEN 'F22' THEN 'prevention' ELSE 'withheld_customer_payment' END;
 IF c.case_type<>expected_category THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.source_event_id;
 expected_kind:=CASE NEW.fixture WHEN 'F17' THEN 'supplier-refund-540' WHEN 'F20' THEN 'receipt-384' ELSE 'receipt-3000' END;
 IF NEW.fixture NOT IN('F15','F21','F22') AND (e.id IS NULL OR e.movement_key<>expected_kind OR e.identity<>'identified' OR e.event_kind NOT IN('pending','settled'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
 IF NEW.fixture IN('F15','F21','F22') AND NEW.source_event_id IS NOT NULL THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 settled:=e.state='settled' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.action='reconcile_duplicate' AND k.movement_key=u.movement_key));
 paid_before:=e.state='settled' AND e.created_at<=c.created_at;
 IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
 ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
 ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;
 ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
 ELSIF insurer_money THEN expected_reason:='Insurer proceeds never qualify';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 262000 WHEN 'F19' THEN 250000 ELSE 0 END;
  expected_reason:=CASE WHEN NEW.fixture IN('F18','F19') THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END;
 END IF;
 -- F18's principal receipt does not settle its separate interest movement.
 IF NEW.fixture='F18' AND expected_q>0 THEN
  SELECT i.* INTO interest FROM app.practice_feed_event i
   WHERE i.tenant_id=NEW.tenant_id AND i.job_id=NEW.job_id AND i.movement_key='receipt-interest-120'
    AND i.identity='identified' AND i.event_kind IN('settled','pending')
   ORDER BY (i.event_kind='settled') DESC,i.created_at,i.id LIMIT 1;
  IF interest.state='settled' AND interest.created_at<=c.created_at THEN
   interest_reason:='Paid before you opened this case';
  ELSIF interest.id IS NULL OR interest.state<>'settled' OR EXISTS(
   SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=interest.tenant_id AND u.account_id=interest.account_id
    AND u.movement_key=interest.movement_key AND u.identity='unidentified'
    AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id
     AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate')) THEN
   interest_reason:='Pending money cannot qualify';
  END IF;
  IF interest_reason IS NOT NULL THEN expected_q:=250000;expected_reason:=interest_reason;END IF;
 END IF;
 IF expected_q>c.claim_pence+(CASE WHEN NEW.fixture='F18' THEN 12000 ELSE 0 END) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.result - ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'] IS DISTINCT FROM '{}'::jsonb
 OR NOT (NEW.result ?& ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'])
 OR coalesce(jsonb_typeof(NEW.result->'version'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'policyVersion'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'fixture'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'outcome'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'qualifyingPrincipal'),'absent')<>'object' OR coalesce(jsonb_typeof(NEW.result->'lines'),'absent')<>'array'
 OR coalesce(jsonb_typeof(NEW.result->'reason'),'absent') NOT IN('string','null')
 OR coalesce(jsonb_typeof(NEW.result->'reasonHeld'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'terminal'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'productionEnabled'),'absent')<>'boolean'
 OR NEW.result->>'version' IS DISTINCT FROM 'recovery-eligibility-review.v3' OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_version
 OR NEW.result->>'fixture' IS DISTINCT FROM NEW.fixture OR NEW.result->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('pence',expected_q,'currency','GBP')
 OR NEW.result->>'reason' IS DISTINCT FROM expected_reason OR NEW.result->>'outcome' IS DISTINCT FROM (CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END)
 OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture='F21')
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.require_recovery_eligibility_v3_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE binding app.practice_supplier_credit_case_binding; count_links integer; expected_lines jsonb; candidate_q bigint:=(NEW.result->'qualifyingPrincipal'->>'pence')::bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.case_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text AND event_type='recovery.eligibility.v3_reviewed'
  AND payload->'references'->>'reviewId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text
  AND payload->'hashes'->>'result'=encode(sha256(convert_to(NEW.result::text,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM app.recovery_claim_line WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture IN('F18','F19') THEN 3 ELSE 1 END)
 THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'kind',l.kind,'debtorType',l.debtor_type,'netPence',l.net_pence,
  'qualifyingPrincipal',jsonb_build_object('pence',CASE WHEN candidate_q=0 OR l.kind='fixed_compensation' OR l.kind='statutory_interest' AND (l.debtor_type='individual' OR NEW.fixture='F18' AND candidate_q=250000) THEN 0 ELSE l.net_pence END,'currency','GBP'),
  'reason',CASE WHEN NEW.fixture='F18' AND candidate_q=250000 THEN
     CASE l.kind WHEN 'statutory_interest' THEN NEW.result->>'reason'
      WHEN 'fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END
    WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
    WHEN NEW.result->>'reason'='Insurer proceeds never qualify' THEN 'Insurer proceeds never qualify'
    WHEN NEW.fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full'
    WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
    WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
    WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
    WHEN l.kind='statutory_interest' AND l.debtor_type='individual' THEN 'Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.'
    WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
  'reasonHeld',NEW.fixture='F21')
  ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
 INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
 IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF binding.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review first_review WHERE first_review.tenant_id=binding.tenant_id AND first_review.case_id=binding.case_id AND first_review.command_id=binding.command_id AND first_review.actor_membership_id=binding.actor_membership_id AND first_review.created_at=binding.created_at)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  -- The FK alone does not establish that a version belongs to its named document.
  IF NOT EXISTS(SELECT 1 FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
   WHERE d.tenant_id=NEW.tenant_id AND d.job_id=NEW.job_id AND d.id=binding.credit_note_id AND v.id=binding.credit_note_version_id AND d.document_type='credit' AND d.status='ready' AND d.supplier_context='fictional-merchant'
   AND d.document_number='CR-PF1B-001' AND d.content_hash=binding.credit_source_hash AND v.content_hash=binding.credit_source_hash AND v.version=1 AND v.parent_version_id IS NULL
   AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM SUPPLIER CREDIT CR-PF1B-001\nNET GBP 300.00','UTF8')),'hex'))
  OR NOT EXISTS(SELECT 1 FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
   WHERE d.tenant_id=NEW.tenant_id AND d.job_id=NEW.job_id AND d.id=binding.later_invoice_id AND v.id=binding.later_invoice_version_id AND d.document_type='invoice' AND d.status='ready' AND d.supplier_context='fictional-merchant'
   AND d.document_number='INV-PF1B-001' AND d.content_hash=binding.invoice_source_hash AND v.content_hash=binding.invoice_source_hash AND v.version=1 AND v.parent_version_id IS NULL
   AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM LATER SUPPLIER INVOICE INV-PF1B-001\nAMOUNT TO PAY GBP 1440.00','UTF8')),'hex'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  SELECT count(*) INTO count_links FROM app.practice_supplier_credit_review_payment WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id;
  IF count_links<>(CASE WHEN NEW.fixture='F16-partial' THEN 1 ELSE 2 END)
  OR (SELECT coalesce(sum(gross_pence),0) FROM app.practice_supplier_credit_review_payment WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture='F16-partial' THEN 60000 ELSE 144000 END)
  OR EXISTS(SELECT 1 FROM app.practice_supplier_credit_review_payment p
   LEFT JOIN app.practice_feed_event e ON(e.tenant_id,e.job_id,e.id)=(p.tenant_id,p.job_id,p.payment_event_id)
   LEFT JOIN app.practice_feed_account a ON(a.tenant_id,a.job_id,a.id)=(e.tenant_id,e.job_id,e.account_id)
   LEFT JOIN app.practice_feed_command k ON(k.tenant_id,k.job_id,k.account_id,k.id)=(e.tenant_id,e.job_id,e.account_id,e.command_id)
   LEFT JOIN app.recovery_case c ON(c.tenant_id,c.job_id,c.id)=(p.tenant_id,p.job_id,p.case_id)
   LEFT JOIN app.job j ON(j.tenant_id,j.id)=(p.tenant_id,p.job_id)
   WHERE p.tenant_id=NEW.tenant_id AND p.review_id=NEW.id AND (e.id IS NULL OR a.id IS NULL OR k.id IS NULL OR c.id IS NULL OR p.case_id<>NEW.case_id OR p.job_id<>NEW.job_id
    OR e.event_kind<>'settled' OR e.state<>'settled' OR e.identity<>'identified' OR e.representation_id<>'feed' OR e.event_id<>'settled-'||p.movement_key
    OR e.movement_key<>p.movement_key OR e.gross_pence<>p.gross_pence OR e.source_hash<>p.source_hash OR e.currency<>'GBP' OR e.created_at<=c.created_at
    OR a.session_digest IS DISTINCT FROM j.practice_session_digest OR a.actor_membership_id<>NEW.actor_membership_id OR k.actor_membership_id<>a.actor_membership_id OR a.environment<>'synthetic_demo' OR e.environment<>'synthetic_demo' OR k.environment<>'synthetic_demo'
    OR k.action<>'advance' OR k.step NOT IN('settled','page_overlap','replay') OR k.movement_key<>p.movement_key OR e.version<>'practice-feed-event.v1'
    OR e.source_hash<>encode(sha256(convert_to(concat_ws('|',e.version,e.environment,e.tenant_id::text,e.job_id::text,e.account_id::text,e.event_id,e.event_kind,e.movement_key,e.identity,e.representation_id,e.gross_pence::text,e.currency,e.state),'UTF8')),'hex')
    OR EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
     AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command r WHERE r.tenant_id=u.tenant_id AND r.account_id=u.account_id AND r.movement_key=u.movement_key AND r.action='reconcile_duplicate'))))
  OR NOT EXISTS(SELECT 1 FROM app.practice_supplier_credit_review_payment p WHERE p.tenant_id=NEW.tenant_id AND p.review_id=NEW.id AND p.payment_event_id=NEW.source_event_id AND p.movement_key=CASE WHEN NEW.fixture='F16-partial' THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  IF NEW.fixture='F16-partial' THEN
   IF candidate_q<>0 OR EXISTS(SELECT 1 FROM app.supplier_credit_consumption WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)
   THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  ELSE
   IF candidate_q<>30000 OR (SELECT count(*) FROM app.supplier_credit_consumption WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND review_id=NEW.id AND credit_note_id=binding.credit_note_id AND later_invoice_id=binding.later_invoice_id AND settled_payment_event_id=NEW.source_event_id AND consumed_net_pence=30000)<>1
   THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION app.pf1b_validate_side() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE digest text:=nullif(current_setting('app.practice_material_digest',true),''); member uuid; sources jsonb; r app.recovery_eligibility_v3_review;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT p.membership_id INTO member FROM app.authenticate_practice_session(digest,NEW.tenant_id) p;
 IF member IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id AND practice_session_digest=digest AND status='live')
 THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
 sources:=app.pf1b_source_bundle(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF TG_TABLE_NAME='practice_supplier_credit_case_binding' THEN
  IF NEW.actor_membership_id<>member OR NEW.credit_note_id<>(sources->>'creditId')::uuid OR NEW.credit_note_version_id<>(sources->>'creditVersionId')::uuid
  OR NEW.later_invoice_id<>(sources->>'invoiceId')::uuid OR NEW.later_invoice_version_id<>(sources->>'invoiceVersionId')::uuid
  OR NEW.credit_source_hash<>sources->>'creditHash' OR NEW.invoice_source_hash<>sources->>'invoiceHash'
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
 ELSE
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  IF r.id IS NULL OR r.created_at<>transaction_timestamp() OR r.actor_membership_id<>member OR r.fixture NOT IN('F14','F16-partial','F16-full')
  OR r.fixture='F16-partial' AND NEW.movement_key<>'supplier-payment-600'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'payments') p WHERE p->>'id'=NEW.payment_event_id::text AND p->>'movement'=NEW.movement_key AND (p->>'gross')::bigint=NEW.gross_pence AND p->>'hash'=NEW.source_hash)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.pf1b_validate_side() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pf1b_validate_side() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER pf1b_binding_guard BEFORE INSERT ON app.practice_supplier_credit_case_binding FOR EACH ROW EXECUTE FUNCTION app.pf1b_validate_side();
CREATE TRIGGER pf1b_payment_guard BEFORE INSERT ON app.practice_supplier_credit_review_payment FOR EACH ROW EXECUTE FUNCTION app.pf1b_validate_side();
CREATE FUNCTION app.pf1b_require_side_effect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- No locks after the audit head: these deferred checks only read final transaction state.
 IF TG_TABLE_NAME='practice_supplier_credit_case_binding' THEN
  IF NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review r WHERE r.tenant_id=NEW.tenant_id AND r.job_id=NEW.job_id AND r.case_id=NEW.case_id AND r.command_id=NEW.command_id AND r.actor_membership_id=NEW.actor_membership_id AND r.created_at=NEW.created_at AND r.fixture IN('F14','F16-partial'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review r WHERE r.tenant_id=NEW.tenant_id AND r.job_id=NEW.job_id AND r.case_id=NEW.case_id AND r.id=NEW.review_id AND r.created_at=NEW.created_at AND r.fixture IN('F14','F16-partial','F16-full'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.pf1b_require_side_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pf1b_require_side_effect() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER pf1b_binding_complete AFTER INSERT ON app.practice_supplier_credit_case_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.pf1b_require_side_effect();
CREATE CONSTRAINT TRIGGER pf1b_payment_complete AFTER INSERT ON app.practice_supplier_credit_review_payment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.pf1b_require_side_effect();
COMMIT;
