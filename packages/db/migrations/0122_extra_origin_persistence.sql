BEGIN;
-- ENT-4b: additions only. No earlier routine, row, policy or grant is replaced.
ALTER TABLE app.extra_origin
 ADD COLUMN command_type text,
 ADD COLUMN raising_grant_id uuid,
 ADD COLUMN raiser_assigned boolean,
 ADD COLUMN work_order_id uuid,
 ADD COLUMN work_order_revision_id uuid,
 ADD COLUMN site_visit_id uuid,
 ADD COLUMN evidence_id uuid,
 ADD COLUMN resident_confirmation_evidence_id uuid,
 ADD COLUMN client_capture_id uuid,
 ADD COLUMN origin_hash char(64),
 ADD CONSTRAINT extra_origin_contractor_columns CHECK(job_track='contractor' OR num_nonnulls(command_type,raising_grant_id,raiser_assigned,work_order_id,work_order_revision_id,site_visit_id,evidence_id,resident_confirmation_evidence_id,client_capture_id,origin_hash)=0),
 ADD CONSTRAINT extra_origin_hash_format CHECK(origin_hash IS NULL OR origin_hash ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT extra_origin_grant_fk FOREIGN KEY(tenant_id,raising_grant_id) REFERENCES app.role_grant(tenant_id,id),
 ADD CONSTRAINT extra_origin_order_fk FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 ADD CONSTRAINT extra_origin_order_revision_fk FOREIGN KEY(tenant_id,work_order_id,work_order_revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 ADD CONSTRAINT extra_origin_visit_fk FOREIGN KEY(tenant_id,site_visit_id) REFERENCES app.site_visit(tenant_id,id),
 ADD CONSTRAINT extra_origin_evidence_fk FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 ADD CONSTRAINT extra_origin_resident_evidence_fk FOREIGN KEY(tenant_id,job_id,resident_confirmation_evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id);
CREATE UNIQUE INDEX extra_origin_client_capture_once ON app.extra_origin(tenant_id,job_id,client_capture_id) WHERE client_capture_id IS NOT NULL;
ALTER TABLE app.variation
 ADD COLUMN sor_version_id uuid,
 ADD COLUMN sor_code text,
 ADD COLUMN excess_of_revision_id uuid,
 ADD COLUMN excess_of_scope_item_id uuid,
 ADD CONSTRAINT variation_contractor_references CHECK(
  (job_track='contractor' OR num_nonnulls(sor_version_id,sor_code,excess_of_revision_id,excess_of_scope_item_id)=0)
  AND (sor_version_id IS NULL)=(sor_code IS NULL) AND (excess_of_revision_id IS NULL)=(excess_of_scope_item_id IS NULL)),
 ADD CONSTRAINT variation_sor_item_fk FOREIGN KEY(tenant_id,sor_version_id,sor_code) REFERENCES app.sor_item(tenant_id,version_id,code),
 ADD CONSTRAINT variation_excess_line_fk FOREIGN KEY(tenant_id,excess_of_revision_id,excess_of_scope_item_id) REFERENCES app.work_order_line(tenant_id,revision_id,scope_item_id);

CREATE FUNCTION app.ent4b_origin_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; grant_row app.role_grant; team_row app.team; branch_row app.org_unit;
 v app.variation; values_to_hash text[]; value_text text; encoded text:='extra-origin-hash.v1'||chr(10);
BEGIN
 IF NEW.job_track<>'contractor' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(NEW.tenant_id,NEW.job_id) AND provenance='work_order') THEN
  IF num_nonnulls(NEW.command_type,NEW.raising_grant_id,NEW.raiser_assigned,NEW.work_order_id,NEW.work_order_revision_id,NEW.site_visit_id,NEW.evidence_id,NEW.resident_confirmation_evidence_id,NEW.client_capture_id,NEW.origin_hash)<>0 THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.kind='jobguard_surfaced_confirmed' THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 NEW.command_type:=command.command_type;
 SELECT w.id,c.revision_id INTO NEW.work_order_id,NEW.work_order_revision_id FROM app.work_order w
 JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE (w.tenant_id,w.job_id)=(NEW.tenant_id,NEW.job_id);
 IF NEW.work_order_id IS NULL OR NEW.work_order_revision_id IS NULL OR NOT app.contractor_member_active(NEW.raising_membership_id) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 SELECT * INTO grant_row FROM app.role_grant WHERE (tenant_id,id)=(NEW.tenant_id,NEW.raising_grant_id);
 SELECT * INTO team_row FROM app.team WHERE (tenant_id,id)=(NEW.tenant_id,app.contractor_job_team(NEW.job_id));
 SELECT * INTO branch_row FROM app.org_unit WHERE (tenant_id,id)=(NEW.tenant_id,team_row.branch_id);
 IF grant_row.id IS NULL OR grant_row.membership_id IS DISTINCT FROM NEW.raising_membership_id OR grant_row.role IS DISTINCT FROM NEW.raising_role
  OR EXISTS(SELECT 1 FROM app.role_grant_revocation WHERE (tenant_id,grant_id)=(NEW.tenant_id,grant_row.id))
  OR team_row.id IS NULL OR branch_row.id IS NULL
  OR NOT coalesce((grant_row.scope_kind='tenant' AND grant_row.scope_id=NEW.tenant_id)
    OR (grant_row.scope_kind='team' AND grant_row.scope_id=team_row.id)
    OR (grant_row.scope_kind='branch' AND grant_row.scope_id=branch_row.id)
    OR (grant_row.scope_kind='region' AND grant_row.scope_id=branch_row.parent_id),false) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 NEW.raiser_assigned:=app.contractor_job_assigned(NEW.raising_membership_id,NEW.job_id);
 IF NEW.site_visit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.site_visit WHERE (tenant_id,id,job_id,membership_id)=(NEW.tenant_id,NEW.site_visit_id,NEW.job_id,NEW.raising_membership_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 SELECT sha256 INTO NEW.evidence_hash FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id);
 IF NEW.resident_confirmation_evidence_id IS NOT NULL AND EXISTS(SELECT 1 FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.resident_confirmation_evidence_id) AND evidence_type<>'resident_confirmation') THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 IF v.excess_of_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.work_order_line WHERE (tenant_id,job_id,revision_id,scope_item_id)=(NEW.tenant_id,NEW.job_id,v.excess_of_revision_id,v.excess_of_scope_item_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 -- Boolean spelling and microsecond timestamps are independent of session timezone/DateStyle.
 values_to_hash:=ARRAY[NEW.tenant_id::text,NEW.job_id::text,NEW.variation_id::text,NEW.job_track,NEW.kind,NEW.provenance,NEW.command_id::text,NEW.command_type,
  NEW.raising_membership_id::text,NEW.raising_role,NEW.raising_grant_id::text,CASE WHEN NEW.raiser_assigned THEN 'true' ELSE 'false' END,
  to_char(NEW.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.device_id,
  to_char(NEW.device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.client_capture_id::text,NEW.work_order_id::text,NEW.work_order_revision_id::text,
  NEW.site_visit_id::text,NEW.evidence_id::text,NEW.evidence_hash,NEW.resident_confirmation_evidence_id::text,NEW.source_capture_kind,NEW.source_capture_hash];
 FOREACH value_text IN ARRAY values_to_hash LOOP
  encoded:=encoded||CASE WHEN value_text IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(value_text,'UTF8'))::text||':'||value_text||';' END;
 END LOOP;
 NEW.origin_hash:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 RETURN NEW;
END $$;
-- PostgreSQL runs same-timing triggers by name: z follows SH-1's extra_origin_validate.
CREATE TRIGGER extra_origin_z_contractor_provenance BEFORE INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.ent4b_origin_provenance();

CREATE TABLE app.extra_event (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), kind text NOT NULL CHECK(kind IN('logged','awaiting_approval','approved','rejected','withdrawn','duplicate','exported','billed','part_paid','paid','credited','billing_rejected')),
 revision_id uuid, reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{0,39}$'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,variation_id,sequence), CHECK((sequence=1)=(kind='logged')),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_duplicate_link (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, duplicate_id uuid NOT NULL, canonical_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('link','unlink')), reverses_link_id uuid, reason_code text,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,reverses_link_id),
 CHECK(duplicate_id<>canonical_id),
 CHECK((kind='link' AND reverses_link_id IS NULL AND reason_code IS NULL) OR
  (kind='unlink' AND reverses_link_id IS NOT NULL AND reason_code ~ '^[a-z][a-z0-9_]{0,39}$' AND reason_code IS NOT NULL)),
 FOREIGN KEY(tenant_id,job_id,duplicate_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,canonical_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,reverses_link_id) REFERENCES app.extra_duplicate_link(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_order_line_link (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 work_order_id uuid NOT NULL, revision_id uuid NOT NULL, scope_item_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,variation_id), UNIQUE(tenant_id,revision_id,scope_item_id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 FOREIGN KEY(tenant_id,revision_id,scope_item_id) REFERENCES app.work_order_line(tenant_id,revision_id,scope_item_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE FUNCTION app.ent4b_fact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; origin_row app.extra_origin; prior_link app.extra_duplicate_link; origin_revision integer; instructed_revision integer;
BEGIN
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 IF command.command_id IS NULL OR command.status<>'processing' OR command.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Serialises the active-link graph and event sequences even for direct runtime SQL.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,417));
 NEW.server_recorded_at:=transaction_timestamp();
 IF TG_TABLE_NAME='extra_event' THEN
  IF EXISTS(SELECT 1 FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND job_track<>'contractor') THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  IF NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.variation_revision WHERE (tenant_id,job_id,variation_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.revision_id)) THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  NEW.sequence:=coalesce((SELECT max(sequence) FROM app.extra_event WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)),0)+1;
  IF (NEW.sequence=1) IS DISTINCT FROM (NEW.kind='logged') OR (NEW.kind='logged' AND NEW.command_id IS DISTINCT FROM origin_row.command_id) THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='extra_duplicate_link' THEN
  IF EXISTS(SELECT 1 FROM app.variation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id IN(NEW.duplicate_id,NEW.canonical_id) AND job_track<>'contractor') THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.extra_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id IN(NEW.duplicate_id,NEW.canonical_id) AND kind='exported') THEN
   RAISE EXCEPTION 'EXTRA_EXPORTED' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='link' THEN
   IF command.command_type<>'MarkDuplicate' OR command.semantic_key<>('extra-duplicate:'||NEW.job_id::text||':'||NEW.duplicate_id::text||':'||NEW.canonical_id::text||':'||NEW.command_id::text) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id AND l.kind='link'
    AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE (u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))
    AND (l.duplicate_id=NEW.duplicate_id OR l.duplicate_id=NEW.canonical_id OR l.canonical_id=NEW.duplicate_id)) THEN
    RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514';
   END IF;
  ELSE
   -- Row guards only; no unlink receipt type, repository function or authorization rule in this leaf.
   SELECT * INTO prior_link FROM app.extra_duplicate_link WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.reverses_link_id);
   IF prior_link.id IS NOT NULL AND (prior_link.kind<>'link' OR prior_link.duplicate_id<>NEW.duplicate_id OR prior_link.canonical_id<>NEW.canonical_id) THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF command.command_type<>'RecordClientInstruction' OR command.semantic_key<>('extra-order-line:'||NEW.job_id::text||':'||NEW.variation_id::text) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT * INTO origin_row FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
  -- Let the composite FKs produce 23503 on missing/foreign rows, before comparing revision numbers.
  IF EXISTS(SELECT 1 FROM app.work_order WHERE (tenant_id,id,job_id)=(NEW.tenant_id,NEW.work_order_id,NEW.job_id))
   AND EXISTS(SELECT 1 FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id)) THEN
   IF origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.work_order_id IS DISTINCT FROM NEW.work_order_id THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
   SELECT revision INTO origin_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,origin_row.work_order_revision_id);
   SELECT revision INTO instructed_revision FROM app.work_order_revision WHERE (tenant_id,work_order_id,id)=(NEW.tenant_id,NEW.work_order_id,NEW.revision_id);
   IF origin_revision IS NULL OR instructed_revision<=origin_revision THEN RAISE EXCEPTION 'ORDER_LINE_LINK_REFUSED' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION app.ent4b_require_origin_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE o app.extra_origin; origin_xid xid;
BEGIN
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM NEW.tenant_id::text THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 SELECT * INTO o FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 SELECT xmin INTO origin_xid FROM app.extra_origin WHERE (tenant_id,job_id,variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 IF o.job_track IS DISTINCT FROM 'contractor' OR NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(o.tenant_id,o.job_id) AND provenance='work_order') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM app.extra_event WHERE (tenant_id,job_id,variation_id)=(o.tenant_id,o.job_id,o.variation_id) AND sequence=1 AND kind='logged' AND command_id=o.command_id AND xmin=origin_xid)<>1
  OR (SELECT count(*) FROM app.audit_event WHERE tenant_id=o.tenant_id AND event_type='contractor.extra.raised' AND subject_type='extra' AND subject_ref=o.variation_id::text)<>1
  OR NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=o.tenant_id AND event_type='contractor.extra.raised' AND subject_type='extra' AND subject_ref=o.variation_id::text
   AND xmin=origin_xid AND payload->'hashes'->>'origin'=o.origin_hash AND payload->'references'->>'command'=o.command_id::text) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER extra_origin_raised_audit AFTER INSERT ON app.extra_origin DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent4b_require_origin_audit();
CREATE CONSTRAINT TRIGGER extra_event_raised_audit AFTER INSERT ON app.extra_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent4b_require_origin_audit();
CREATE FUNCTION app.ent4b_require_link_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE event_kind text; subject uuid; fact_xid xid;
BEGIN
 IF TG_TABLE_NAME='extra_duplicate_link' THEN
  SELECT xmin INTO fact_xid FROM app.extra_duplicate_link WHERE (tenant_id,id)=(NEW.tenant_id,NEW.id);
  event_kind:=CASE NEW.kind WHEN 'link' THEN 'contractor.extra.duplicate_linked' ELSE 'contractor.extra.duplicate_unlinked' END; subject:=NEW.duplicate_id;
 ELSE SELECT xmin INTO fact_xid FROM app.extra_order_line_link WHERE (tenant_id,id)=(NEW.tenant_id,NEW.id); event_kind:='contractor.extra.order_line_linked'; subject:=NEW.variation_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE (tenant_id,id)=(NEW.tenant_id,NEW.id) AND xmin=fact_xid AND event_type=event_kind AND subject_type='extra' AND subject_ref=subject::text
   AND payload->'references'->>'command'=NEW.command_id::text AND payload->'references'->>'link'=NEW.id::text) THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER extra_duplicate_link_audit AFTER INSERT ON app.extra_duplicate_link DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent4b_require_link_audit();
CREATE CONSTRAINT TRIGGER extra_order_line_link_audit AFTER INSERT ON app.extra_order_line_link DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent4b_require_link_audit();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['extra_event','extra_duplicate_link','extra_order_line_link'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n||'_immutable',n);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ent4b_fact_guard()',n||'_insert_guard',n);
 END LOOP;
END $$;
ALTER FUNCTION app.ent4b_origin_provenance() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent4b_fact_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent4b_require_origin_audit() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent4b_require_link_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent4b_origin_provenance(),app.ent4b_fact_guard(),app.ent4b_require_origin_audit(),app.ent4b_require_link_audit() FROM PUBLIC,jobguard_runtime;
COMMIT;
