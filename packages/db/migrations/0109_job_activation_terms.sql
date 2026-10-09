BEGIN;
-- Expand-compatible: historic routines and rows remain available. New no-charge
-- activations deliberately have no recovery-cap field on their job baseline.
ALTER TABLE app.job DROP CONSTRAINT job_baseline_shape;
ALTER TABLE app.job ADD CONSTRAINT job_baseline_shape CHECK (
 (baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL)
 OR (provenance='system_generated_quote' AND baseline_quote_version_id IS NOT NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND
     ((fee_policy_version='reference_fee_policy_v3' AND recovery_cap_pence IS NULL) OR (fee_policy_version<>'reference_fee_policy_v3' AND recovery_cap_pence IS NOT NULL)))
 OR (provenance='imported' AND baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND recovery_cap_pence IS NOT NULL)
);
ALTER TABLE app.job_activation DROP CONSTRAINT job_activation_check;
ALTER TABLE app.job_activation ADD CONSTRAINT job_activation_check CHECK (
 (mode='pilot_no_charge' AND activation_terms_version='pilot_no_charge.v1') OR
 (mode='synthetic_demo' AND activation_terms_version IN('synthetic_demo_illustrative.v1','synthetic_demo_activation.v3'))
);
ALTER TABLE app.quote_document_version ADD CONSTRAINT quote_document_job_identity UNIQUE(tenant_id,job_id,id,document_version,content_hash);
CREATE TABLE app.job_activation_terms (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, activation_id uuid NOT NULL,
 version text NOT NULL DEFAULT 'job-activation-terms.v1' CHECK(version='job-activation-terms.v1'),
 baseline_quote_version_id uuid NOT NULL, baseline_document_version integer NOT NULL, baseline_document_hash char(64) NOT NULL,
 accepted_net_pence bigint NOT NULL CHECK(accepted_net_pence BETWEEN 0 AND 1000000000000),
 highest_sent_net_pence bigint NOT NULL CHECK(highest_sent_net_pence BETWEEN 0 AND 1000000000000),
 small_job boolean NOT NULL CHECK(small_job=(greatest(accepted_net_pence,highest_sent_net_pence)<200000)),
 policy_version text NOT NULL CHECK(policy_version='reference_fee_policy_v3'),
 commercial_track varchar(16) NOT NULL CHECK(commercial_track='small_builder'),
 trial_plan_context text NOT NULL CHECK(trial_plan_context='none_recorded_pre_mon2a'),
 activated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,activation_id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,baseline_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash) REFERENCES app.quote_document_version(tenant_id,job_id,id,document_version,content_hash),
 FOREIGN KEY(tenant_id,job_id,commercial_track) REFERENCES app.job_commercial_track(tenant_id,job_id,job_track)
);
ALTER TABLE app.job_activation_terms OWNER TO jobguard_migration;
ALTER TABLE app.job_activation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_activation_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.job_activation_terms FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.job_activation_terms TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.job_activation_terms FROM jobguard_runtime;
CREATE FUNCTION app.guard_activation_terms_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'controlled activation required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_activation_terms_insert() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_activation_terms_insert() FROM PUBLIC;
CREATE TRIGGER activation_terms_controlled BEFORE INSERT ON app.job_activation_terms FOR EACH ROW EXECUTE FUNCTION app.guard_activation_terms_insert();
CREATE TRIGGER activation_terms_immutable BEFORE UPDATE OR DELETE ON app.job_activation_terms FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.switch_job_live_v3(p_tenant uuid,p_activation uuid,p_terms uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_command uuid,p_authorization uuid)
RETURNS app.job_activation_terms LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;t app.job_activation_terms;highest bigint;
BEGIN
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
  RETURN t;
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
 RETURN t;
END $$;
ALTER FUNCTION app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid) TO jobguard_runtime;

-- A saved, generated v1 proposal per newly issued session. Its marker is not a
-- client-selectable policy switch. Original session issuance/ownership stays intact.
ALTER TABLE app.job DROP CONSTRAINT job_practice_scenario_check;
ALTER TABLE app.job ADD CONSTRAINT job_practice_scenario_check CHECK(practice_scenario IN('capture','core-1000','home','v1_sample'));
ALTER TABLE app.job ADD COLUMN saved_v1_sample boolean NOT NULL DEFAULT false;
CREATE FUNCTION app.guard_saved_v1_sample() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.saved_v1_sample IS DISTINCT FROM OLD.saved_v1_sample THEN RAISE EXCEPTION 'saved fixture identity is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND NEW.saved_v1_sample AND (current_user<>'jobguard_migration' OR NEW.tenant_id<>'11111111-1111-4111-8111-111111111111'::uuid OR NEW.practice_session_digest IS NULL OR NEW.practice_scenario IS DISTINCT FROM 'v1_sample') THEN RAISE EXCEPTION 'saved fixture is server-only' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_saved_v1_sample() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_saved_v1_sample() FROM PUBLIC;
CREATE TRIGGER saved_v1_sample_guard BEFORE INSERT OR UPDATE ON app.job FOR EACH ROW EXECUTE FUNCTION app.guard_saved_v1_sample();
CREATE FUNCTION app.seed_saved_v1_sample() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE tenant uuid:='11111111-1111-4111-8111-111111111111'; j uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); proposal_id uuid:=gen_random_uuid(); scope uuid; line jsonb; lines jsonb:='[]'; data jsonb; label text; i integer:=0; text_value text:='Generated fictional v1 decorating sample. No real customer data.'; previous_context text;
BEGIN
 IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'session fixture requires migration owner' USING ERRCODE='42501'; END IF;
 previous_context:=current_setting('app.tenant_id',true);PERFORM set_config('app.tenant_id',tenant::text,true);
 INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,saved_v1_sample) VALUES(j,tenant,'Earlier proposed pricing (v1)','draft',NEW.token_digest,'v1_sample',true);
 FOREACH label IN ARRAY ARRAY['Protect room','Prepare walls','Paint walls','Finish trim','Clean site','Replace shelves'] LOOP
  i:=i+1;
  line:=jsonb_build_object('description',jsonb_build_object('value',label,'provenance',jsonb_build_object('kind','human_supplied','note','Generated saved v1 sample')),'quantity',jsonb_build_object('value','1','provenance',jsonb_build_object('kind','defaulted','note','Generated single item')),'unit',jsonb_build_object('value','item','provenance',jsonb_build_object('kind','defaulted','note','Generated item unit')),'unitPricePence',jsonb_build_object('value',CASE WHEN i<=4 THEN to_jsonb(20000) ELSE 'null'::jsonb END,'provenance',jsonb_build_object('kind','human_supplied','note','Generated sample rate or explicitly unknown')));
  lines:=lines||jsonb_build_array(line);
 END LOOP;
 data:=jsonb_build_object('title',jsonb_build_object('value','Earlier proposed pricing (v1)','provenance',jsonb_build_object('kind','human_supplied','note','Generated saved v1 sample')),'lines',lines,'materials','[]'::jsonb,'questions',jsonb_build_array(jsonb_build_object('question',jsonb_build_object('value','Confirm disposal','provenance',jsonb_build_object('kind','human_supplied','note','Generated sample question')))));
 INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES(src,tenant,'text',convert_to(text_value,'UTF8'),text_value,encode(sha256(convert_to(text_value,'UTF8')),'hex'));
 INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES(proposal_id,tenant,src,j,src,1,encode(sha256(convert_to(text_value,'UTF8')),'hex'),'saved-v1-sample.v1','job-record-proposal-v1','generated-no-model',data);
 i:=0;FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  i:=i+1;scope:=gen_random_uuid();INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES(scope,tenant,j);
  INSERT INTO app.proposal_line(id,tenant_id,job_id,scope_item_id,source_hash,source_reference,proposal_id,ordinal,proposed_data) VALUES(gen_random_uuid(),tenant,j,scope,encode(sha256(convert_to(text_value,'UTF8')),'hex'),src::text||':v1',proposal_id,i,line);
 END LOOP;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);RETURN NEW;
END $$;
ALTER FUNCTION app.seed_saved_v1_sample() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.seed_saved_v1_sample() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER saved_v1_sample_on_session AFTER INSERT ON control_plane.practice_session FOR EACH ROW EXECUTE FUNCTION app.seed_saved_v1_sample();
COMMIT;
