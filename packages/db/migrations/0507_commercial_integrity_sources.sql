BEGIN;

-- Owner-loaded, versioned SYNTHETIC source assertions. These are not account surveillance
-- or financial write powers. Runtime can only read minimized, owned projections below.
CREATE TABLE app.ch6_identifier_assertion (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,session_digest text NOT NULL CHECK(session_digest~'^[a-f0-9]{64}$'),
 version text NOT NULL DEFAULT 'ch6-identifier-assertion.v1' CHECK(version='ch6-identifier-assertion.v1'),
 identifier_kind text NOT NULL CHECK(identifier_kind IN('user','phone','card')),
 subject_ref text NOT NULL CHECK(subject_ref~'^[a-f0-9]{64}$'),authority_ref text NOT NULL CHECK(authority_ref~'^synthetic_fixture[.:-][a-zA-Z0-9._:-]{1,200}$'),
 sharing text NOT NULL CHECK(sharing IN('unexplained','family','company')),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL CHECK(valid_until>=valid_from),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,session_digest,identifier_kind,subject_ref,authority_ref),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.ch6_line_correction_source (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,session_digest text NOT NULL CHECK(session_digest~'^[a-f0-9]{64}$'),
 version text NOT NULL DEFAULT 'ch6-line-correction-source.v1' CHECK(version='ch6-line-correction-source.v1'),
 correction_kind text NOT NULL CHECK(correction_kind IN('credit','writeoff')),invoice_id uuid NOT NULL,line_id uuid NOT NULL,lock_id uuid NOT NULL,
 credit_note_id uuid,evidence_id uuid,amount_pence bigint NOT NULL CHECK(amount_pence BETWEEN 1 AND 1000000000000),
 authority_ref text NOT NULL CHECK(authority_ref~'^synthetic_fixture[.:-][a-zA-Z0-9._:-]{1,200}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,correction_kind,authority_ref),
 FOREIGN KEY(tenant_id,job_id,invoice_id,line_id) REFERENCES app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id),
 FOREIGN KEY(tenant_id,job_id,credit_note_id) REFERENCES app.customer_credit_note(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,lock_id) REFERENCES app.final_account_lock(tenant_id,job_id,id),
 CHECK((correction_kind='credit' AND credit_note_id IS NOT NULL AND evidence_id IS NULL) OR (correction_kind='writeoff' AND credit_note_id IS NULL AND evidence_id IS NOT NULL))
);
CREATE FUNCTION app.ch6_guard_line_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE cap bigint;used numeric;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'INTEGRITY_RETRY_REQUIRED' USING ERRCODE='40001'; END IF;
 -- Exact duplicates still reach the primary-key refusal without re-counting their own amount.
 IF EXISTS(SELECT 1 FROM app.ch6_line_correction_source prior_source WHERE prior_source.tenant_id=NEW.tenant_id AND prior_source.id=NEW.id) THEN RETURN NEW; END IF;
 -- Serialize private correction mappings without locking the commercial job.
 -- Every line/credit allocation in this job shares this CH-6-only lock; under
 -- READ COMMITTED the conservation queries below see the prior writer's commit.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,628));
 IF NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=NEW.tenant_id AND b.job_id=NEW.job_id AND b.invoice_id=NEW.invoice_id AND b.lock_id=NEW.lock_id) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 SELECT gross_pence INTO cap FROM app.final_account_invoiced_line WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND invoice_id=NEW.invoice_id AND final_account_line_id=NEW.line_id;
 SELECT coalesce(sum(amount_pence),0) INTO used FROM app.ch6_line_correction_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND invoice_id=NEW.invoice_id AND line_id=NEW.line_id;
 IF cap IS NULL OR used+NEW.amount_pence>cap THEN RAISE EXCEPTION 'INTEGRITY_ALLOCATION_LIMIT'; END IF;
 IF NEW.correction_kind='credit' THEN
 SELECT amount_pence INTO cap FROM app.customer_credit_note WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.credit_note_id AND invoice_id=NEW.invoice_id;
 SELECT coalesce(sum(amount_pence),0) INTO used FROM app.ch6_line_correction_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND credit_note_id=NEW.credit_note_id;
 IF cap IS NULL OR used+NEW.amount_pence>cap THEN RAISE EXCEPTION 'INTEGRITY_ALLOCATION_LIMIT'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
 WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.evidence_id AND e.kind='original' AND e.evidence_type='writeoff_record' AND e.byte_length>0 AND u.state='verified'
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ch6_line_correction_bound BEFORE INSERT ON app.ch6_line_correction_source FOR EACH ROW EXECUTE FUNCTION app.ch6_guard_line_correction();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['ch6_identifier_assertion','ch6_line_correction_source'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),%L)::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),%L)::uuid)',n,'','');
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure',n);
 EXECUTE format('CREATE TRIGGER ch6_source_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

-- CH-6: synthetic advisory reads only. No pricing/meter/fee table or policy is written.
CREATE FUNCTION app.ch6_source(t uuid,j uuid,d text,i text,k text,at_time timestamptz,content jsonb,provenance text DEFAULT 'server_recorded') RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('tenantId',t,'jobId',j,'scopeId',d,'sourceId',i,'sourceType',k,'revision','1',
 'hash',encode(sha256(convert_to(app.ch6_integrity_canonical(content),'UTF8')),'hex'),
 'recordedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'provenance',provenance)
$$;

-- Private publication port. Called only AFTER the ordinary lock check by ch6_integrity_sources.
-- Only already-published proof IDs enter this projection; no raw signal description, transcript or classifier output.
CREATE FUNCTION app.ch6_integrity_published(t uuid,j uuid,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog STABLE AS $$
DECLARE l app.final_account_lock; r app.final_account_revision; reveal jsonb; catches jsonb; completions jsonb;
 receipts jsonb; corrections jsonb; allocations jsonb; missing text[]:=ARRAY['identifier_phone_source_unavailable','identifier_card_source_unavailable','writeoff_line_source_unavailable','receipt_line_source_handoff_unavailable'];
BEGIN
 PERFORM app.ch6_integrity_authority(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RETURN jsonb_build_object('published',NULL,'availability',missing); END IF;
 BEGIN
 reveal:=app.read_final_check_reveal(t,j,d);
 EXCEPTION WHEN insufficient_privilege THEN
 RETURN jsonb_build_object('published',NULL,'availability',array_append(missing,'published_final_check_unavailable'));
 END;
 IF reveal->>'state'<>'completed' OR reveal->>'lockId'<>l.id::text THEN
  RETURN jsonb_build_object('published',NULL,'availability',array_append(missing,(CASE WHEN reveal->>'state'='failed' THEN 'published_final_check_failed' ELSE 'published_final_check_pending' END)));
 END IF;
 SELECT * INTO r FROM app.final_account_revision WHERE tenant_id=t AND job_id=j AND id=l.final_account_revision_id;
 IF NOT FOUND OR r.currency<>'GBP' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 -- A catch is bound to this exact published run and this immutable locked bill.
 WITH visible AS (SELECT value item FROM jsonb_array_elements(reveal->'items'))
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'source',app.ch6_source(t,j,d,p.signal_id::text,'published_catch',coalesce(db.created_at,p.first_available_at),
 jsonb_build_object('run',p.run_id,'lock',p.lock_id,'evidence',p.evidence_set_hash,'answer',db.answer,'disposition',db.disposition_id,'line',line.id,'gross',line.gross_pence),'published_final_check'),
 'catchId',p.signal_id::text,'status',CASE db.answer WHEN 'confirmed_extra' THEN 'confirmed' WHEN 'not_completed' THEN 'dismissed_not_completed' ELSE 'dismissed_other' END,
 'includedInLockedAccount',EXISTS(SELECT 1 FROM app.final_account_line fl JOIN app.variation_revision vr ON(vr.tenant_id,vr.job_id,vr.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE fl.tenant_id=t AND fl.job_id=j AND fl.final_account_revision_id=l.final_account_revision_id AND vr.variation_id=o.variation_id),
 'value',jsonb_build_object('pence',coalesce(line.gross_pence,0),'currency','GBP','basis',CASE WHEN line.id IS NULL THEN 'unknown' ELSE 'gross' END),
 'invoiceLineId',line.id::text) ORDER BY p.signal_id),'[]') INTO catches
 FROM visible v JOIN app.final_check_reveal_proof p ON p.tenant_id=t AND p.job_id=j AND p.run_id=(reveal->>'runId')::uuid AND p.signal_id=(v.item->>'signalId')::uuid AND p.lock_id=l.id
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id,db.lock_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id,l.id)
 LEFT JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.source_signal_id)=(p.tenant_id,p.job_id,p.signal_id) AND o.kind='jobguard_catch'
 LEFT JOIN LATERAL (SELECT b.final_account_line_id id,b.gross_pence FROM app.final_account_invoiced_line b
  JOIN app.variation_revision vr ON(vr.tenant_id,vr.job_id,vr.id)=(b.tenant_id,b.job_id,b.source_id)
  JOIN app.final_account_invoice_binding ib ON(ib.tenant_id,ib.job_id,ib.invoice_id)=(b.tenant_id,b.job_id,b.invoice_id)
  WHERE b.tenant_id=t AND b.job_id=j AND vr.variation_id=o.variation_id AND ib.lock_id=l.id AND b.gross_pence BETWEEN 0 AND 1000000000000
  AND (SELECT count(*) FROM app.final_account_invoiced_line all_lines JOIN app.variation_revision all_revisions ON(all_revisions.tenant_id,all_revisions.job_id,all_revisions.id)=(all_lines.tenant_id,all_lines.job_id,all_lines.source_id) WHERE all_lines.tenant_id=t AND all_lines.job_id=j AND all_revisions.variation_id=o.variation_id)=1) line ON true;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catches) c WHERE c->>'status'='confirmed' AND c->>'invoiceLineId' IS NULL) THEN missing:=array_append(missing,'catch_line_source_unavailable'); END IF;
 -- Proof must be a published, verified original completion photograph from before this lock.
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,p.signal_id::text||':'||e.id::text,'completion_evidence',e.server_received_at,
 jsonb_build_object('id',e.id,'hash',e.sha256,'version',e.object_version_id,'bytes',e.byte_length,'lock',p.lock_id)),
 'catchId',p.signal_id::text,'state','verified','original',true,'objectVersionId',e.object_version_id,'byteLength',e.byte_length) ORDER BY p.signal_id,e.id),'[]') INTO completions
 FROM app.final_check_reveal_proof p CROSS JOIN LATERAL jsonb_array_elements(p.evidence) ev
 JOIN app.evidence_object e ON e.tenant_id=t AND e.job_id=j AND e.id=(ev->>'id')::uuid AND e.object_version_id=ev->>'objectVersionId' AND e.sha256=ev->>'sha256'
 JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id) AND u.state='verified'
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=(reveal->>'runId')::uuid AND p.lock_id=l.id
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(reveal->'items') v WHERE v->>'signalId'=p.signal_id::text)
 AND e.kind='original' AND e.evidence_type='completion_photo' AND e.byte_length>0 AND length(e.object_version_id)<=300 AND e.object_version_id~'^[ -~]+$' AND e.server_received_at<=l.locked_at
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation invalid WHERE invalid.tenant_id=t AND invalid.evidence_id=e.id);
 IF jsonb_array_length(completions)=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(catches) c WHERE c->>'status'='dismissed_not_completed') THEN missing:=array_append(missing,'completion_evidence_source_unavailable'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,p.id::text,'published_customer_payment',p.created_at,
 jsonb_build_object('id',p.id,'invoice',p.invoice_id,'pence',p.amount_pence,'reversal',rv.id),'builder_attested'),
 'value',jsonb_build_object('pence',p.amount_pence,'currency','GBP','basis','gross'),'reversed',rv.id IS NOT NULL) ORDER BY p.id),'[]') INTO receipts
 FROM app.customer_payment p LEFT JOIN app.customer_payment_reversal rv ON(rv.tenant_id,rv.job_id,rv.payment_id)=(p.tenant_id,p.job_id,p.id)
 WHERE p.tenant_id=t AND p.job_id=j;
 -- Existing credit notes are whole-invoice facts. They never acquire an invented catch-line link.
 SELECT coalesce(jsonb_agg(f ORDER BY f->'source'->>'sourceId'),'[]') INTO corrections FROM (
 SELECT jsonb_build_object('source',app.ch6_source(t,j,d,c.id::text,'customer_credit_note',c.created_at,to_jsonb(c)-'reason'-'created_at'),
 'correctionKind','credit','invoiceLineId',NULL,'value',jsonb_build_object('pence',c.amount_pence-coalesce((SELECT sum(mapped.amount_pence) FROM app.ch6_line_correction_source mapped WHERE mapped.tenant_id=t AND mapped.job_id=j AND mapped.credit_note_id=c.id AND mapped.session_digest=d),0),'currency','GBP','basis','gross'),'actual',true) f
 FROM app.customer_credit_note c WHERE c.tenant_id=t AND c.job_id=j AND c.amount_pence>coalesce((SELECT sum(mapped.amount_pence) FROM app.ch6_line_correction_source mapped WHERE mapped.tenant_id=t AND mapped.job_id=j AND mapped.credit_note_id=c.id AND mapped.session_digest=d),0)
 UNION ALL SELECT jsonb_build_object('source',app.ch6_source(t,j,d,c.id::text,'line_correction_source',c.recorded_at,to_jsonb(c)-'recorded_at','builder_attested'),
 'correctionKind',c.correction_kind,'invoiceLineId',c.line_id::text,'value',jsonb_build_object('pence',c.amount_pence,'currency','GBP','basis','gross'),'actual',true)
 FROM app.ch6_line_correction_source c WHERE c.tenant_id=t AND c.job_id=j AND c.lock_id=l.id AND c.session_digest=d
 AND (c.correction_kind='credit' OR NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=c.evidence_id))) sources;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(corrections) c WHERE c->>'invoiceLineId' IS NULL) THEN missing:=array_append(missing,'credit_line_source_unavailable'); END IF;
 IF EXISTS(SELECT 1 FROM app.ch6_line_correction_source c WHERE c.tenant_id=t AND c.job_id=j AND c.session_digest=d AND c.correction_kind='writeoff' AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=c.evidence_id)) THEN missing:=array_remove(missing,'writeoff_line_source_unavailable'); END IF;
 -- The installed neutral receipt source adapter explicitly refuses every save with
 -- RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED (0258 / receipt-line-allocation-repository.ts).
 -- Its quarantine tables are NOT evidence of a user-selected allocation. Do not read
 -- or promote their contents. A later accepted source handoff must wire this port.
 allocations:='[]'::jsonb;
 RETURN jsonb_build_object('published',jsonb_build_object('lockId',l.id,'contractVersion','persisted-published-integrity.v1','cutoff',to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'lockSource',app.ch6_source(t,j,d,l.id::text,'final_account_lock',l.locked_at,jsonb_build_object('lock',l.snapshot_digest,'revision',r.source_hash)),
 'lockedAccount',jsonb_build_object('pence',r.total_pence,'currency','GBP','basis','gross'),
 'catches',catches,'completions',completions,'receipts',receipts,'corrections',corrections,'allocations',allocations),'availability',missing);
END $$;

CREATE FUNCTION app.ch6_integrity_sources(t uuid,j uuid,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog STABLE AS $$
DECLARE ordinary jsonb; quotes jsonb; activations jsonb; activity jsonb; events jsonb; assertions jsonb;
 published jsonb:=NULL; publication jsonb; availability jsonb; start_at text; end_at text; now_at text; has_lock boolean; actor uuid;
BEGIN
 actor:=app.ch6_integrity_authority(t,j,d);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) INTO has_lock;
 -- Only exact, owned, immutable accepted documents and their saved party bindings. No fuzzy identity matching.
 WITH RECURSIVE owned AS (SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
 UNION SELECT x.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
 JOIN app.job x ON x.tenant_id=t AND x.id::text=e.subject_ref AND x.provenance='imported' AND x.practice_session_digest IS NULL)
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,a.job_id,d,a.id::text,'quote_acceptance',a.recorded_at,
 jsonb_build_object('document',doc.content_hash,'binding',b.id,'customer',b.customer_id,'site',b.site_id)),
 'status','accepted','customerId',coalesce(b.customer_id::text,'unbound'),'siteId',coalesce(b.site_id::text,'unbound'),'bindingConfirmed',b.id IS NOT NULL,
 'value',jsonb_build_object('pence',(doc.snapshot->>'netPence')::bigint,'currency','GBP','basis','net'),
 'acceptedAt',to_char(a.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY a.id),'[]') INTO quotes
 FROM app.quote_acceptance a JOIN owned o ON o.id=a.job_id JOIN app.job jb ON jb.tenant_id=t AND jb.id=a.job_id AND jb.accepted_quote_version_id=a.document_id
 JOIN app.quote_document_version doc ON(doc.tenant_id,doc.job_id,doc.id,doc.content_hash)=(a.tenant_id,a.job_id,a.document_id,a.document_hash)
 LEFT JOIN LATERAL (SELECT bind.* FROM app.job_party_binding bind WHERE bind.tenant_id=t AND bind.job_id=a.job_id AND bind.id::text=doc.snapshot->'jobParties'->>'bindingId' LIMIT 1) b ON true
 WHERE a.tenant_id=t AND jsonb_typeof(doc.snapshot->'netPence')='number' AND (doc.snapshot->>'netPence')~'^[0-9]+$'
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event cancelled WHERE cancelled.tenant_id=t AND cancelled.job_id=a.job_id AND (cancelled.acceptance_id=a.id OR (cancelled.kind='superseded' AND cancelled.document_id=a.document_id)) AND cancelled.kind IN('acceptance_cancelled','superseded') AND cancelled.recorded_at>=a.recorded_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'job_activation',a.recorded_at,jsonb_build_object('id',a.id,'document',a.accepted_document_hash))) ORDER BY a.id),'[]') INTO activations FROM app.job_activation a WHERE a.tenant_id=t AND a.job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,x.id::text,x.kind,x.created_at,x.content,x.provenance),'activityKind',x.activity) ORDER BY x.kind,x.id),'[]') INTO activity
 FROM (SELECT i.id,i.created_at,'customer_invoice'::text kind,'invoice'::text activity,jsonb_build_object('id',i.id,'source',i.source_hash,'pdf',i.pdf_sha256) content,'server_recorded'::text provenance FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j
 UNION ALL SELECT p.id,p.created_at,'customer_payment','payment',jsonb_build_object('id',p.id,'invoice',p.invoice_id,'pence',p.amount_pence),'builder_attested' FROM app.customer_payment p WHERE p.tenant_id=t AND p.job_id=j) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,e.id::text,'job_work_state_event',e.fact_at,jsonb_build_object('id',e.id,'request',e.request_hash,'kind',e.kind,'predecessor',e.predecessor_id)),
 'kind',CASE e.kind WHEN 'finished_on_site' THEN 'finish' WHEN 'finished_cancelled' THEN 'cancel_finish' WHEN 'resumed' THEN 'resume' WHEN 'closed' THEN 'close' ELSE 'reopen' END,'predecessorId',e.predecessor_id::text) ORDER BY e.sequence),'[]') INTO events
 FROM app.job_work_state_event e WHERE e.tenant_id=t AND e.job_id=j AND e.kind IN('finished_on_site','finished_cancelled','resumed','closed','reopened');
 -- Minimized same-tenant, same-current-user equality only. No cross-tenant registry or raw user/phone/card value is returned.
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,encode(sha256(convert_to(d||':user','UTF8')),'hex'),'account_user_assertion',x.first_at,x.content),
 'identifierKind','user','scopeId',d,'subjectRef',encode(sha256(convert_to(d||':user','UTF8')),'hex'),'authorityRef','current-tenant-membership',
 'purpose','synthetic_integrity','validFrom',to_char(x.first_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil','9999-12-31T23:59:59.999999Z','sharing','unexplained')),'[]') INTO assertions
 FROM (SELECT min(m.created_at) first_at,jsonb_agg(jsonb_build_object('membership',m.id,'account',m.account_id) ORDER BY m.id) content
 FROM app.membership own JOIN app.membership m ON m.tenant_id=own.tenant_id AND m.identity_user_id=own.identity_user_id
 WHERE own.tenant_id=t AND own.id=actor AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 GROUP BY own.identity_user_id HAVING count(DISTINCT m.account_id)>1) x;
 SELECT assertions||coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'synthetic_identifier_assertion',a.recorded_at,(to_jsonb(a)-'recorded_at'-'valid_from'-'valid_until')||jsonb_build_object('validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
 'identifierKind',a.identifier_kind,'scopeId',d,'subjectRef',a.subject_ref,'authorityRef',a.authority_ref,'purpose','synthetic_integrity',
 'validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sharing',a.sharing) ORDER BY a.id),'[]') INTO assertions
 FROM app.ch6_identifier_assertion a WHERE a.tenant_id=t AND a.job_id=j AND a.session_digest=d;
 ordinary:=jsonb_build_object('lockState',CASE WHEN has_lock THEN 'present' ELSE 'absent' END,'quotes',quotes,'activations',activations,'activity',activity,'workEvents',events,'assertions',assertions);
 availability:='["identifier_phone_source_unavailable","identifier_card_source_unavailable","writeoff_line_source_unavailable","receipt_line_source_handoff_unavailable"]'::jsonb;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) q WHERE NOT (q->>'bindingConfirmed')::boolean) THEN availability:=availability||'"quote_party_binding_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM app.job q WHERE q.tenant_id=t AND q.practice_session_digest=d AND q.accepted_quote_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) fact WHERE fact->'source'->>'jobId'=q.id::text)) THEN availability:=availability||'"quote_value_source_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF;
 -- This branch is the only publication entry. An unlocked call never reads or invokes hidden storage.
 IF has_lock THEN publication:=app.ch6_integrity_published(t,j,d);published:=nullif(publication->'published','null'::jsonb);availability:=availability||(publication->'availability');
 IF NOT (publication->'availability') ? 'writeoff_line_source_unavailable' THEN availability:=availability-'writeoff_line_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF; END IF;
 SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO start_at FROM app.job WHERE tenant_id=t AND id=j;
 WITH facts AS (SELECT f FROM jsonb_each(ordinary) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f
 UNION ALL SELECT f FROM jsonb_each(coalesce(published,'{}')) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f)
 SELECT least(start_at,coalesce(min(f->'source'->>'recordedAt'),start_at)),greatest(start_at,coalesce(max(f->'source'->>'recordedAt'),start_at),coalesce(published->>'cutoff',start_at)) INTO start_at,end_at FROM facts;
 SELECT coalesce(jsonb_agg(code ORDER BY code COLLATE "C"),'[]') INTO availability FROM (SELECT DISTINCT value code FROM jsonb_array_elements_text(availability)) codes;
 now_at:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 RETURN jsonb_build_object('input',jsonb_build_object('version','commercial-integrity-input.v3','environment','synthetic_demo','tenantId',t,'jobId',j,'scopeId',d,'evaluatedAt',now_at,
 'profile',jsonb_build_object('version','synthetic_fixture.persisted-v3.1','ruleVersion','persisted-v3.1','window',jsonb_build_object('start',start_at,'end',end_at),
 'won',jsonb_build_object('delayMicroseconds','604800000000'),'quote',jsonb_build_object('basis','net','endpoint','inclusive','windowDays',90),'restart',jsonb_build_object('minimumCycles',2),'allocation',jsonb_build_object('minimumPayments',2)),
 'phase',CASE WHEN published IS NULL OR published='null'::jsonb THEN 'pre_lock' ELSE 'post_lock' END,'ordinaryFacts',ordinary)
 ||CASE WHEN published IS NULL OR published='null'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('published',published) END,'availability',availability);
END $$;

-- Re-resolve all source facts on the checked review path. No caller-supplied source, lock, profile or compared value is trusted.
CREATE OR REPLACE FUNCTION app.ch6_integrity_source_fingerprint(t uuid,j uuid,digest text,source_snapshot jsonb) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog STABLE AS $$
DECLARE inp jsonb; o jsonb; pub jsonb; p jsonb; win jsonb; kind text; facts jsonb; candidates jsonb; compared jsonb;
 a jsonb; b jsonb; c jsonb; proof jsonb; lock_fact jsonb; ids jsonb; expected jsonb; finding_key text; n numeric; total numeric; distance numeric;
BEGIN
 inp:=app.ch6_integrity_sources(t,j,digest)->'input';o:=inp->'ordinaryFacts';pub:=inp->'published';p:=inp->'profile';win:=p->'window';kind:=source_snapshot->>'kind';
 IF jsonb_typeof(source_snapshot->'facts') IS DISTINCT FROM 'array' OR jsonb_array_length(source_snapshot->'facts')=0 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 -- Every submitted fact must exactly match a current, authorised fact, including its revisions, amounts and provenance.
 WITH current_facts AS (
 SELECT f FROM jsonb_each(o) x CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.value)='array' THEN x.value ELSE '[]' END) f
 UNION ALL SELECT f FROM jsonb_each(coalesce(pub,'{}')) x CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.value)='array' THEN x.value ELSE '[]' END) f)
 SELECT coalesce(jsonb_agg(f),'[]') INTO candidates FROM current_facts;
 IF pub IS NOT NULL THEN
 lock_fact:=jsonb_build_object('source',pub->'lockSource','lockedAccount',pub->'lockedAccount','lockId',pub->'lockId','cutoff',pub->'cutoff','contractVersion',pub->'contractVersion');
 candidates:=candidates||jsonb_build_array(lock_fact);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(source_snapshot->'facts') f WHERE NOT candidates @> jsonb_build_array(f)) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 facts:=source_snapshot->'facts';
 IF kind='invoice_or_payment_without_lock' THEN
  a:=facts->0;
  IF o->>'lockState'<>'absent' OR jsonb_array_length(facts)<>1 OR NOT (o->'activity') @> jsonb_build_array(a) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('lockState','absent','activityKind',a->>'activityKind');
 ELSIF kind='won_never_switched_live' THEN
  a:=facts->0;
  IF jsonb_array_length(facts)<>1 OR NOT (o->'quotes') @> jsonb_build_array(a) OR a->>'status'<>'accepted' OR a->'source'->>'jobId'<>j::text
  OR jsonb_array_length(o->'activations')>0 OR extract(epoch FROM ((inp->>'evaluatedAt')::timestamptz-(a->>'acceptedAt')::timestamptz))*1000000<=(p->'won'->>'delayMicroseconds')::numeric THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('acceptedAt',a->>'acceptedAt','delayMicroseconds',p->'won'->>'delayMicroseconds','activation','absent');
 ELSIF kind='related_sub2000_quotes_90_days' THEN
  SELECT value INTO a FROM jsonb_array_elements(facts) ORDER BY value->'source'->>'jobId',value->'source'->>'sourceId' LIMIT 1;
  SELECT value INTO b FROM jsonb_array_elements(facts) ORDER BY value->'source'->>'jobId' DESC,value->'source'->>'sourceId' DESC LIMIT 1;
  distance:=abs(extract(epoch FROM ((a->>'acceptedAt')::timestamptz-(b->>'acceptedAt')::timestamptz))*1000000);
  IF jsonb_array_length(facts)<>2 OR NOT (o->'quotes') @> facts OR a->>'status'<>'accepted' OR b->>'status'<>'accepted'
  OR NOT (a->>'bindingConfirmed')::boolean OR NOT (b->>'bindingConfirmed')::boolean OR a->>'customerId'<>b->>'customerId' OR a->>'siteId'<>b->>'siteId'
  OR a->'source'->>'jobId'=b->'source'->>'jobId' OR (a->'source'->>'jobId'<>j::text AND b->'source'->>'jobId'<>j::text)
  OR a->'value'->>'basis'<>'net' OR b->'value'->>'basis'<>'net' OR (a->'value'->>'pence')::bigint>=200000 OR (b->'value'->>'pence')::bigint>=200000
  OR distance>7776000000000 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('firstPence',(a->'value'->>'pence')::bigint,'secondPence',(b->'value'->>'pence')::bigint,'basis','net','maximumPenceExclusive',200000,'distanceMicroseconds',trunc(distance)::text,'endpoint','inclusive');
 ELSIF kind='repeated_finish_restart' THEN
  WITH pairs AS (SELECT DISTINCT ON(f->'source'->>'sourceId') f,rs FROM jsonb_array_elements(o->'workEvents') f CROSS JOIN jsonb_array_elements(o->'workEvents') rs
  WHERE rs->>'predecessorId'=f->'source'->>'sourceId' AND f->'source'->>'recordedAt'<rs->'source'->>'recordedAt'
  AND ((f->>'kind'='finish' AND rs->>'kind' IN('resume','cancel_finish')) OR (f->>'kind'='close' AND rs->>'kind'='reopen'))
  ORDER BY f->'source'->>'sourceId',rs->'source'->>'recordedAt',rs->'source'->>'sourceId')
  SELECT coalesce(jsonb_agg(f)||jsonb_agg(rs),'[]'),count(*) INTO facts,n FROM pairs;
  IF n<2 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('cycles',n,'minimumCycles',2);
 ELSIF kind='account_identifier_reuse' THEN
  a:=facts->0;
  IF jsonb_array_length(facts)<>1 OR NOT (o->'assertions') @> jsonb_build_array(a) OR a->>'sharing'<>'unexplained'
  OR a->>'validFrom'>inp->>'evaluatedAt' OR a->>'validUntil'<inp->>'evaluatedAt' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('identifierKind',a->>'identifierKind','subjectRef',a->>'subjectRef','authorityRef',a->>'authorityRef');
 ELSIF pub IS NULL THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE';
 ELSIF kind='dismissed_not_completed_with_completion_evidence' THEN
  SELECT f INTO c FROM jsonb_array_elements(facts) f WHERE f ? 'catchId' AND f->>'status'='dismissed_not_completed';
  SELECT f INTO proof FROM jsonb_array_elements(facts) f WHERE f->>'catchId'=c->>'catchId' AND f->>'state'='verified';
  IF c IS NULL OR proof IS NULL OR jsonb_array_length(facts)<>3 OR NOT facts @> jsonb_build_array(lock_fact) OR proof->'source'->>'provenance'<>'server_recorded'
  OR NOT (proof->>'original')::boolean OR proof->'source'->>'recordedAt'>pub->>'cutoff' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('catchId',c->>'catchId','disposition',c->>'status','evidenceState','verified','cutoff',pub->>'cutoff','lockId',pub->>'lockId');
 ELSIF kind='receipts_exceed_locked_account_and_confirmed_catches' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(pub->'corrections') x WHERE (x->>'actual')::boolean) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  SELECT coalesce(sum((x->'value'->>'pence')::numeric),0) INTO n FROM jsonb_array_elements(pub->'receipts') x WHERE NOT (x->>'reversed')::boolean;
  SELECT (pub->'lockedAccount'->>'pence')::numeric+coalesce(sum((x->'value'->>'pence')::numeric),0) INTO total FROM jsonb_array_elements(pub->'catches') x WHERE x->>'status'='confirmed' AND NOT (x->>'includedInLockedAccount')::boolean;
  SELECT jsonb_build_array(lock_fact)||coalesce(jsonb_agg(x),'[]')||(pub->'receipts') INTO facts FROM jsonb_array_elements(pub->'catches') x WHERE x->>'status'='confirmed' AND NOT (x->>'includedInLockedAccount')::boolean;
  IF n<=total OR EXISTS(SELECT 1 FROM jsonb_array_elements(facts) x WHERE x ? 'value' AND x->'value'->>'basis' IS DISTINCT FROM pub->'lockedAccount'->>'basis') THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('receiptPence',trunc(n)::text,'accountPence',trunc(total)::text,'basis',pub->'lockedAccount'->>'basis','lockId',pub->>'lockId','cutoff',pub->>'cutoff');
 ELSIF kind='catch_line_credit_or_writeoff' THEN
  SELECT f INTO c FROM jsonb_array_elements(facts) f WHERE f->>'status'='confirmed';
  SELECT f INTO a FROM jsonb_array_elements(facts) f WHERE f ? 'correctionKind' AND (f->>'actual')::boolean;
  IF c IS NULL OR a IS NULL OR jsonb_array_length(facts)<>3 OR NOT facts @> jsonb_build_array(lock_fact) OR c->>'invoiceLineId' IS NULL OR c->>'invoiceLineId' IS DISTINCT FROM a->>'invoiceLineId'
  OR a->'value'->>'basis'='unknown' OR a->'value'->>'basis' IS DISTINCT FROM c->'value'->>'basis' OR (a->'value'->>'pence')::bigint<=0 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('correctionKind',a->>'correctionKind','pence',(a->'value'->>'pence')::bigint,'basis',a->'value'->>'basis','lineId',a->>'invoiceLineId','lockId',pub->>'lockId');
 ELSIF kind='explicit_allocations_avoid_catch_lines' THEN
  RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; -- source handoff is not installed; never infer it from quarantine rows.
 ELSE RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 SELECT coalesce(jsonb_agg(identity ORDER BY identity),'[]') INTO ids FROM (SELECT DISTINCT app.ch6_integrity_canonical(jsonb_build_object('tenantId',f->'source'->'tenantId','jobId',f->'source'->'jobId','scopeId',f->'source'->'scopeId','sourceType',f->'source'->'sourceType','sourceId',f->'source'->'sourceId')) identity FROM jsonb_array_elements(facts) f) x;
 finding_key:=app.ch6_integrity_canonical(jsonb_build_object('kind',kind,'ruleVersion',p->>'ruleVersion','sources',ids,'window',win));
 expected:=jsonb_build_object('version','commercial-integrity-source-snapshot.v3','tenantId',t,'jobId',j,'scopeId',digest,'family','v3','phase',inp->>'phase',
 'kind',kind,'findingKey',finding_key,'profile',p,'window',win,'facts',facts,'compared',compared);
 IF app.ch6_integrity_canonical(expected) IS DISTINCT FROM app.ch6_integrity_canonical(source_snapshot) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 RETURN encode(sha256(convert_to(app.ch6_integrity_canonical(expected),'UTF8')),'hex');
END $$;
CREATE OR REPLACE FUNCTION app.ch6_record_integrity_review(t uuid,j uuid,digest text,review jsonb,source_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;user_id uuid;cid uuid;rh text;sh text;answer jsonb;prior app.command_receipt;canonical_review jsonb;owned_jobs uuid[];
BEGIN
 actor:=app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 -- Hold authority rows against revocation; recheck wall-clock expiry after every wait.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor FOR SHARE;
 PERFORM app.ch6_integrity_authority(t,j,digest);
 SELECT identity_user_id INTO user_id FROM app.authenticate_practice_session(digest,t);
 -- Decode the ECMAScript trim set at execution, avoiding Unicode escape parsing on SQL_ASCII.
 IF jsonb_typeof(review) IS DISTINCT FROM 'object' OR review->>'version' IS DISTINCT FROM 'commercial-integrity-review.v3'
  OR review->>'outcome' IS DISTINCT FROM 'dismissed_false_positive' OR review->>'commandId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR review->>'findingSnapshotHash' !~ '^[a-f0-9]{64}$' OR coalesce(length(review->>'findingKey'),0)=0
  OR (SELECT coalesce(sum((CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END)),0) FROM regexp_split_to_table(review->>'explanation','') ch(c)) NOT BETWEEN 1 AND 500 OR btrim(review->>'explanation',convert_from(decode('090a0b0c0d20c2a0e19a80e28080e28081e28082e28083e28084e28085e28086e28087e28088e28089e2808ae280a8e280a9e280afe2819fe38080efbbbf','hex'),'UTF8')) IS DISTINCT FROM review->>'explanation'
 THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 cid:=(review->>'commandId')::uuid;
 canonical_review:=jsonb_build_object('version','commercial-integrity-review.v3','commandId',cid,'findingKey',review->>'findingKey','findingSnapshotHash',review->>'findingSnapshotHash','outcome','dismissed_false_positive','explanation',review->>'explanation');
 IF canonical_review IS DISTINCT FROM review THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 rh:=encode(sha256(convert_to(app.ch6_integrity_canonical(jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'review',review)),'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,627));
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type<>'commercial_integrity.review.v3' OR prior.status<>'succeeded' OR prior.actor_membership_id<>actor OR prior.semantic_key<>j::text||':'||cid::text OR prior.request_hash<>rh THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'INTEGRITY_RETRY_REQUIRED' USING ERRCODE='40001'; END IF;
 -- Lock order: session, membership, command advisory, jobs (UUID order), then
 -- source rows in the order below, receipt, audit head. No later business locks.
 -- Related-quote facts also use owned jobs in this session, never another tenant.
 WITH RECURSIVE owned AS (SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
 UNION SELECT x.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
 JOIN app.job x ON x.tenant_id=t AND x.id::text=e.subject_ref AND x.provenance='imported' AND x.practice_session_digest IS NULL)
 SELECT array_agg(id ORDER BY id) INTO owned_jobs FROM owned;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j ORDER BY job_id FOR SHARE;
 PERFORM 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_payment WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_acceptance WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.acceptance_event WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_document_version WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_party_binding WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j ORDER BY run_id FOR SHARE;
 PERFORM 1 FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j ORDER BY run_id,signal_id FOR SHARE;
 PERFORM 1 FROM app.final_check_disposition_binding WHERE tenant_id=t AND job_id=j ORDER BY disposition_id FOR SHARE;
 PERFORM 1 FROM app.evidence_object WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_upload WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=i.evidence_id) ORDER BY i.id FOR SHARE;
 PERFORM 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j ORDER BY variation_id FOR SHARE;
 PERFORM 1 FROM app.variation_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j ORDER BY invoice_id,final_account_line_id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j ORDER BY invoice_id FOR SHARE;
 PERFORM 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_identifier_assertion WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_line_correction_source WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 -- STABLE source readers/fingerprint use one fresh statement snapshot after
 -- these waits: absence predicates and all aggregates share that same snapshot.
 -- Row locks protect existing facts; they deliberately do not lock insert gaps.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 sh:=app.ch6_integrity_source_fingerprint(t,j,digest,source_snapshot);
 IF sh IS DISTINCT FROM review->>'findingSnapshotHash' OR source_snapshot->>'findingKey' IS DISTINCT FROM review->>'findingKey' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 answer:=review||jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'commercial_integrity.review.v3',j::text||':'||cid::text,rh,'succeeded',answer,actor,clock_timestamp());
 PERFORM app.ch6_append_integrity_review_audit(t,j,actor,cid,rh,sh);
 -- No later business locks: revalidate expiry/authority with plain reads after the audit-head wait.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 RETURN answer;
END $$;
ALTER FUNCTION app.ch6_guard_line_correction() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch6_guard_line_correction() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
ALTER FUNCTION app.ch6_source(uuid,uuid,text,text,text,timestamptz,jsonb,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ch6_integrity_published(uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ch6_integrity_sources(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch6_source(uuid,uuid,text,text,text,timestamptz,jsonb,text),app.ch6_integrity_published(uuid,uuid,text),app.ch6_integrity_sources(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.ch6_integrity_sources(uuid,uuid,text) TO jobguard_runtime;
COMMIT;
