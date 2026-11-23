-- Loaded only by the checked V2 bootstrap, outside the shared migration runner.
DO $v2$
DECLARE
  routine regprocedure;
  definition text;
  relation regclass;
  demo_literal text := quote_literal('jobguard_synthetic_demo');
  v2_literal text := quote_literal('jobguard_v2_local');
BEGIN
  -- Bootstrap first verifies the exact directory and system ID for this checkout.
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;

  -- The existing practice and exact acceptance commands use hard-coded
  -- database-name fences. Retarget only the routines this rehearsal needs.
  -- CREATE OR REPLACE retains the existing owners and privileges.
  FOREACH routine IN ARRAY ARRAY[
    'app.linked_practice_parent(text)',
    'app.anonymous_practice_authority(text,uuid)',
    'app.lp6_session_authority(text,text,uuid)',
    'app.is_blank_practice_company(text)',
    'app.is_linked_practice_session(text)',
    'app.current_firm_profile_key()',
    'app.lp3_authorize(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer)',
    'app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid,uuid,uuid)'
  ]::regprocedure[] LOOP
    definition := pg_get_functiondef(routine);
    IF strpos(definition, v2_literal) = 0 AND strpos(definition, demo_literal) > 0 THEN
      EXECUTE overlay(definition PLACING v2_literal FROM strpos(definition, demo_literal) FOR length(demo_literal));
    ELSIF strpos(definition, v2_literal) = 0 THEN
      RAISE EXCEPTION 'Expected local database fence missing in %', routine;
    END IF;
  END LOOP;

  -- Linked practice firms share the backing practice tenant. Also scope the
  -- fixture's persisted job and quote graph to the authenticated firm namespace.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.job AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (practice_session_digest IS NULL OR app.current_firm_profile_key() = 'practice:' || practice_session_digest);
    FOREACH relation IN ARRAY ARRAY[
      'app.job_record_proposal', 'app.proposal_line', 'app.scope_identity', 'app.scope_revision',
      'app.quote_draft', 'app.quote_revision', 'app.quote_line', 'app.quote_document_version',
      'app.quote_send', 'app.quote_acceptance', 'app.acceptance_event'
    ]::regclass[] LOOP
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END LOOP;

    CREATE POLICY v2_practice_firm ON app.capture_source AS RESTRICTIVE FOR SELECT TO jobguard_runtime
      USING (id <> 'e2020000-0000-4000-8000-000000000001'
        OR EXISTS (SELECT FROM app.job_record_proposal p WHERE (p.tenant_id,p.source_id)=(capture_source.tenant_id,capture_source.id)));
  END IF;

  -- Existing linked practice commands require their fixed internal principal.
  -- The two visible firms and all job data are created by the normal commands.
  INSERT INTO control_plane.tenant(id) VALUES ('11111111-1111-4111-8111-111111111111') ON CONFLICT DO NOTHING;
  INSERT INTO identity.identity_user(id) VALUES ('d1500000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
  INSERT INTO app.account(id, tenant_id, name)
    VALUES ('d1500000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'V2 practice runtime')
    ON CONFLICT DO NOTHING;
  INSERT INTO app.membership(id, tenant_id, account_id, identity_user_id, role)
    VALUES ('d1500000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
      'd1500000-0000-4000-8000-000000000002', 'd1500000-0000-4000-8000-000000000001', 'owner')
    ON CONFLICT DO NOTHING;
END
$v2$;
