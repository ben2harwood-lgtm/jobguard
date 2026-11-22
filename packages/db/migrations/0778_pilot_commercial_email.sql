BEGIN;

INSERT INTO app.command_type_registry VALUES
 ('customer_invoice.send','command.v1','owner','route_before_begin','invoice','commercial','fake_invoice_delivery');

-- The queue runs in a separate database. Rotate opaque signal IDs using the
-- checked business worker login, without granting it access to any table.
CREATE FUNCTION app.pilot_email_signals() RETURNS TABLE(action_id uuid,tenant_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM app.lp10_assert_worker();
 IF current_database() !~ '^jobguard_pilot(_[a-z0-9]+)*$'
    OR current_database() ~ '^jobguard_pilot_(queue|restore)(_|$)'
    OR NOT outbound_control.claims_enabled() THEN RETURN; END IF;
 RETURN QUERY WITH batch AS (
  SELECT s.action_id FROM infrastructure.outbox_signal s
  ORDER BY s.enqueued_at NULLS FIRST,s.created_at,s.action_id LIMIT 100 FOR UPDATE SKIP LOCKED
 )
 UPDATE infrastructure.outbox_signal s SET enqueued_at=clock_timestamp()
 FROM batch WHERE s.action_id=batch.action_id RETURNING s.action_id,s.tenant_id;
END $$;
ALTER FUNCTION app.pilot_email_signals() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_email_signals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_email_signals() TO jobguard_worker;

-- Keep source reads on the pilot database and its dedicated worker login.
-- Existing recovery worker transactions retain their own source policies.
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['quote_send','quote_document_version','quote_draft','job_party_current',
  'job_party_binding','customer_revision','customer_portal_grant','job_commercial_track','contractor_party_binding',
  'acceptance_event','customer_invoice','final_account_revision','final_account_draft'] LOOP
  EXECUTE format('CREATE POLICY pilot_email_worker_read ON app.%I FOR SELECT TO jobguard_migration
   USING (current_database() ~ ''^jobguard_pilot(_[a-z0-9]+)*$''
    AND current_database() !~ ''^jobguard_pilot_(queue|restore)(_|$)''
    AND tenant_id=(SELECT app.lp11_worker_tenant(NULL::uuid)))',rel);
 END LOOP;
END $$;

CREATE FUNCTION app.pilot_email_action_current(p_action uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox;
BEGIN
 IF current_database() !~ '^jobguard_pilot(_[a-z0-9]+)*$'
    OR current_database() ~ '^jobguard_pilot_(queue|restore)(_|$)' THEN RETURN false; END IF;
 item:=app.lp10_lock_action(p_action);
 IF item.status<>'executing' OR app.lp10_action_author(item) IS NULL
    OR item.authorization_expires_at<=clock_timestamp() THEN RETURN false; END IF;

 IF item.adapter='fake_quote_delivery' AND item.action_type='quote.send' AND item.policy_version='free-quote-send.v1' THEN
  RETURN EXISTS(
   SELECT FROM app.quote_send s
   JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(s.tenant_id,s.job_id,s.document_id)
   JOIN app.quote_draft q ON (q.tenant_id,q.job_id,q.current_revision_id)=(d.tenant_id,d.job_id,d.quote_revision_id)
   JOIN app.job_commercial_track track ON (track.tenant_id,track.job_id)=(d.tenant_id,d.job_id)
   JOIN app.job_party_current p ON (p.tenant_id,p.job_id)=(d.tenant_id,d.job_id)
   JOIN app.job_party_binding b ON (b.tenant_id,b.job_id,b.id)=(p.tenant_id,p.job_id,p.binding_id)
   JOIN app.customer_revision c ON (c.tenant_id,c.customer_id,c.id)=(b.tenant_id,b.customer_id,b.customer_revision_id)
   WHERE (s.tenant_id,s.outbox_action_id,s.authorization_id)=(item.tenant_id,item.id,item.authorization_id)
    AND track.environment='pilot_no_charge' AND track.provenance='pilot_capture'
    AND s.content_hash=item.content_hash AND d.content_hash=item.content_hash AND d.document_version=item.aggregate_revision
    AND d.snapshot->'jobParties'->>'bindingId'=b.id::text
    AND lower(d.snapshot->'customer'->>'email')=lower(c.payload->>'email')
    AND to_jsonb(s.recipients)=jsonb_build_array(lower(c.payload->>'email'))
    AND to_jsonb(s.recipients)=item.recipient::jsonb
    AND item.provider_effect_key='quote:'||d.id||':'||item.content_hash
    AND NOT EXISTS(SELECT FROM app.quote_document_version new WHERE (new.tenant_id,new.job_id)=(d.tenant_id,d.job_id)
     AND new.document_version>d.document_version)
    AND NOT EXISTS(SELECT FROM app.customer_revision new WHERE (new.tenant_id,new.customer_id)=(c.tenant_id,c.customer_id)
     AND new.revision>c.revision)
    AND NOT EXISTS(SELECT FROM app.acceptance_event e WHERE (e.tenant_id,e.job_id,e.document_id)=(d.tenant_id,d.job_id,d.id)
     AND e.kind='superseded')
  );
 END IF;

 IF item.adapter='fake_email' AND item.action_type='customer_portal.signin.send'
    AND item.policy_version='customer-signin.synthetic.v1' THEN
  RETURN EXISTS(
   SELECT FROM app.customer_portal_grant g
   JOIN app.job_party_binding b ON (b.tenant_id,b.job_id,b.id)=(g.tenant_id,g.job_id,g.party_binding_id)
   JOIN app.customer_revision c ON (c.tenant_id,c.customer_id,c.id)=(b.tenant_id,b.customer_id,b.customer_revision_id)
   WHERE (g.tenant_id,g.outbox_id)=(item.tenant_id,item.id)
    AND g.expires_at>clock_timestamp() AND g.consumed_at IS NULL AND app.customer_portal_current(g)
    AND b.revision=item.aggregate_revision AND lower(c.payload->>'email')=item.recipient
    AND item.provider_effect_key='customer-signin:'||g.id
  );
 END IF;

 IF item.adapter='fake_invoice_delivery' AND item.action_type='customer_invoice.send'
    AND item.policy_version='customer-invoice-email.fixture.v1' THEN
  RETURN EXISTS(
   SELECT FROM app.customer_invoice i
   JOIN app.final_account_revision r ON (r.tenant_id,r.job_id,r.id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
   JOIN app.final_account_draft d ON (d.tenant_id,d.job_id,d.current_revision_id)=(r.tenant_id,r.job_id,r.id)
   JOIN app.job_commercial_track track ON (track.tenant_id,track.job_id)=(i.tenant_id,i.job_id)
   JOIN app.job_party_current p ON (p.tenant_id,p.job_id)=(i.tenant_id,i.job_id)
   JOIN app.job_party_binding b ON (b.tenant_id,b.job_id,b.id)=(p.tenant_id,p.job_id,p.binding_id)
   JOIN app.customer_revision c ON (c.tenant_id,c.customer_id,c.id)=(b.tenant_id,b.customer_id,b.customer_revision_id)
   WHERE i.tenant_id=item.tenant_id AND item.provider_effect_key='invoice-email:'||i.id||':'||c.id
    AND track.environment='pilot_no_charge' AND track.provenance='pilot_capture'
    AND i.synthetic AND i.pdf_sha256=item.content_hash AND i.pdf_bytes=convert_to(item.immutable_content,'UTF8')
    AND r.revision=item.aggregate_revision AND i.total_pence=item.amount_pence AND i.currency=item.currency
    AND lower(c.payload->>'email')=item.recipient
    AND NOT EXISTS(SELECT FROM app.customer_revision new WHERE (new.tenant_id,new.customer_id)=(c.tenant_id,c.customer_id)
     AND new.revision>c.revision)
  );
 END IF;

 -- The existing claim routine rechecks the exact extra revision, link,
 -- permission, entitlement and approval before binding the worker.
 RETURN item.adapter='fake_email' AND item.action_type='extra.client_approval_request.send'
  AND item.policy_version='extra-client-approval-send.v1';
END $$;
ALTER FUNCTION app.pilot_email_action_current(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_email_action_current(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_email_action_current(uuid) TO jobguard_worker;
COMMIT;
