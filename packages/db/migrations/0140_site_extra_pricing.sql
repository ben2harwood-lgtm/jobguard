BEGIN;
-- ENT-3c: the server-priced first revision of a schedule-of-rates site extra and its pricing-basis side record.
-- Additions only: two new tables, five routines, triggers on the two new tables. No column, index, constraint, policy, grant or trigger is added to any
-- existing table, no row of app.variation_revision is written, and no existing object is replaced or dropped. Needs 0110 (work orders, app.sor_line_net_pence)
-- and 0122 (extra origin persistence), plus 0135 (the stored-origin authority check).
-- Standard F: the application login gets SELECT only on both new tables. The ONLY writer is app.ent3c_record_sor_revision, a SECURITY DEFINER routine owned by
-- jobguard_migration that takes no actor, rate, price, outcome or time: everything but the claimed quantity and the request hash is read from rows already
-- stored in the raising transaction. It carries its own ENT-3a authority check and runs only while the raising command's own receipt is still processing.

-- 1. The first priced revision of a schedule-item extra. Complete on purpose: a later piece may fingerprint whole rows, after which no column can be added.
CREATE TABLE app.extra_sor_revision (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision=1),
 work_order_id uuid NOT NULL, work_order_revision_id uuid NOT NULL, sor_version_id uuid NOT NULL,
 sor_code text NOT NULL, unit text NOT NULL, rate_pence bigint NOT NULL,
 adjustment_numerator bigint NOT NULL, adjustment_denominator bigint NOT NULL CHECK(adjustment_denominator>0),
 coverage text NOT NULL CHECK(coverage IN('new','excess')),
 excess_of_scope_item_id uuid,
 instructed_quantity text CHECK(instructed_quantity IS NULL OR instructed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 claimed_quantity text NOT NULL CHECK(claimed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 quantity text NOT NULL CHECK(quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 net_pence bigint NOT NULL CHECK(net_pence BETWEEN 1 AND 1000000000000),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 command_id uuid NOT NULL, raising_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 CHECK((coverage='excess')=(excess_of_scope_item_id IS NOT NULL) AND (coverage='excess')=(instructed_quantity IS NOT NULL)),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,variation_id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,variation_id) REFERENCES app.extra_origin(tenant_id,variation_id),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,work_order_id,work_order_revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 -- The rate and the unit are the persisted schedule item's, never the caller's (the merged pattern of app.work_order_line).
 FOREIGN KEY(tenant_id,sor_version_id,sor_code,unit,rate_pence) REFERENCES app.sor_item(tenant_id,version_id,code,unit,rate_pence),
 FOREIGN KEY(tenant_id,work_order_revision_id,excess_of_scope_item_id) REFERENCES app.work_order_line(tenant_id,revision_id,scope_item_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,raising_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- 2. How a revision's price was reached, beside the revision (ruling A1). The key is (extra, revision number) so a later piece can put a record beside a
-- revision it writes without adding a column here. In this piece only server_sor for revision 1 can be written.
CREATE TABLE app.extra_pricing_basis (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 pricing_basis text NOT NULL CHECK(pricing_basis IN('server_sor','surveyor_quoted','unpriced')),
 revision_content_hash char(64) NOT NULL CHECK(revision_content_hash ~ '^[0-9a-f]{64}$'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,variation_id,revision),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- Owner, forced row security, the merged tenant policy (naming BOTH roles, because the writer runs as the owner), SELECT only for the application login,
-- and the merged immutability trigger.
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['extra_sor_revision','extra_pricing_basis'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
END LOOP; END $$;

-- 3. The ONLY writer of both tables. Models app.work_order_commit (0110, section 10). No INSERT sits inside a block that has an EXCEPTION clause: the only guarded
-- block reads the tenant setting. Every WHERE names the tenant: the routine runs as the table owner, to whom app.audit_event shows every tenant's events.
CREATE FUNCTION app.ent3c_record_sor_revision(p_job uuid, p_variation uuid, p_claimed_quantity text, p_request_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; origin_row app.extra_origin; receipt app.command_receipt; variation_row app.variation; baseline app.work_order_revision; item app.sor_item; line app.work_order_line;
 claimed numeric; instructed numeric; extra_quantity text; cover text; price bigint; new_id uuid; new_hash text;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Standard F: check the stored raising member's current authority, including the tenant lock, before pricing or writing anything.
 PERFORM app.ent3a_require_extra_authority(p_job,p_variation);
 IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF p_claimed_quantity IS NULL OR p_claimed_quantity !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 claimed:=p_claimed_quantity::numeric;
 IF claimed=0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 -- The stored origin of this very extra, raised by a contractor site command.
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE o.tenant_id=tenant AND o.job_id=p_job AND o.variation_id=p_variation;
 IF origin_row.variation_id IS NULL OR origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.provenance IS DISTINCT FROM 'command'
  OR origin_row.command_type IS DISTINCT FROM 'LogSiteExtra' OR origin_row.kind IS DISTINCT FROM 'site_user' THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Only inside the raising command's own transaction: its receipt is still processing, for the same actor.
 SELECT r.* INTO receipt FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=origin_row.command_id;
 IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.command_type IS DISTINCT FROM 'LogSiteExtra'
  OR receipt.actor_membership_id IS DISTINCT FROM origin_row.raising_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT v.* INTO variation_row FROM app.variation v WHERE v.tenant_id=tenant AND v.job_id=p_job AND v.id=p_variation;
 IF variation_row.id IS NULL OR variation_row.sor_version_id IS NULL OR variation_row.sor_code IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- The baseline is the revision the merged origin trigger stored; a revision that moved on in between makes this extra stale, never mixed.
 SELECT r.* INTO baseline FROM app.work_order_revision r WHERE r.tenant_id=tenant AND r.work_order_id=origin_row.work_order_id AND r.id=origin_row.work_order_revision_id;
 IF baseline.id IS NULL OR baseline.status IS DISTINCT FROM 'ordered' OR baseline.sor_version_id IS DISTINCT FROM variation_row.sor_version_id
  OR (variation_row.excess_of_revision_id IS NOT NULL AND variation_row.excess_of_revision_id IS DISTINCT FROM baseline.id) THEN
  RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001';
 END IF;
 SELECT i.* INTO item FROM app.sor_item i WHERE i.tenant_id=tenant AND i.version_id=variation_row.sor_version_id AND i.code=variation_row.sor_code;
 IF item.code IS NULL THEN RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001'; END IF;
 -- The order check, decided again from the baseline's own lines.
 IF variation_row.excess_of_scope_item_id IS NOT NULL THEN
  SELECT l.* INTO line FROM app.work_order_line l WHERE l.tenant_id=tenant AND l.revision_id=baseline.id AND l.scope_item_id=variation_row.excess_of_scope_item_id;
  IF line.id IS NULL OR line.sor_code IS DISTINCT FROM variation_row.sor_code THEN RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001'; END IF;
  instructed:=line.quantity::numeric;
  IF claimed<=instructed THEN RAISE EXCEPTION 'ALREADY_ON_ORDER' USING ERRCODE='23514'; END IF;
  cover:='excess'; extra_quantity:=trim_scale(claimed-instructed)::text;
 ELSE
  IF EXISTS(SELECT 1 FROM app.work_order_line l WHERE l.tenant_id=tenant AND l.revision_id=baseline.id AND l.sor_code=variation_row.sor_code) THEN
   RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001';
  END IF;
  cover:='new'; extra_quantity:=trim_scale(claimed)::text;
 END IF;
 -- The one money figure: the merged exact half-even price of the extra quantity alone (its own MONEY_OUT_OF_RANGE passes through unchanged).
 price:=app.sor_line_net_pence(extra_quantity,item.rate_pence,baseline.adjustment_numerator,baseline.adjustment_denominator);
 IF price IS NULL OR price<1 THEN RAISE EXCEPTION 'EXTRA_NOT_POSITIVE' USING ERRCODE='23514'; END IF;
 -- content_hash and server_recorded_at are set by the table's guard; nobody can supply them.
 INSERT INTO app.extra_sor_revision(tenant_id,id,job_id,variation_id,revision,work_order_id,work_order_revision_id,sor_version_id,sor_code,unit,rate_pence,adjustment_numerator,adjustment_denominator,
  coverage,excess_of_scope_item_id,instructed_quantity,claimed_quantity,quantity,net_pence,request_hash,command_id,raising_membership_id)
 VALUES(tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,1,origin_row.work_order_id,origin_row.work_order_revision_id,variation_row.sor_version_id,variation_row.sor_code,item.unit,item.rate_pence,
  baseline.adjustment_numerator,baseline.adjustment_denominator,cover,variation_row.excess_of_scope_item_id,CASE WHEN cover='excess' THEN trim_scale(instructed)::text END,
  trim_scale(claimed)::text,extra_quantity,price,p_request_hash,origin_row.command_id,origin_row.raising_membership_id)
 RETURNING id,content_hash INTO new_id,new_hash;
 INSERT INTO app.extra_pricing_basis(tenant_id,id,job_id,variation_id,revision,pricing_basis,revision_content_hash,command_id,actor_membership_id)
 VALUES(tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,1,'server_sor',new_hash,origin_row.command_id,origin_row.raising_membership_id);
 RETURN new_id;
END $$;

-- 4. Binds EVERY writer of the revision table, the owner included (merged model: app.guard_work_order_line).
CREATE FUNCTION app.ent3c_sor_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE o app.extra_origin; receipt app.command_receipt; v app.variation; b app.work_order_revision; l app.work_order_line; claimed numeric; instructed numeric; extra numeric;
 values_to_hash text[]; value_text text; encoded text:='extra-sor-revision-hash.v1'||chr(10);
BEGIN
 IF NOT coalesce(NEW.claimed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' AND NEW.quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
  AND (NEW.instructed_quantity IS NULL OR NEW.instructed_quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$') AND NEW.revision=1 AND NEW.coverage IN('new','excess'),false) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT x.* INTO o FROM app.extra_origin x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.variation_id=NEW.variation_id;
 IF o.variation_id IS NULL OR o.origin_hash IS NULL OR o.command_id IS DISTINCT FROM NEW.command_id OR o.raising_membership_id IS DISTINCT FROM NEW.raising_membership_id
  OR o.work_order_id IS DISTINCT FROM NEW.work_order_id OR o.work_order_revision_id IS DISTINCT FROM NEW.work_order_revision_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT r.* INTO receipt FROM app.command_receipt r WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id;
 IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.command_type IS DISTINCT FROM 'LogSiteExtra'
  OR receipt.actor_membership_id IS DISTINCT FROM NEW.raising_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT x.* INTO v FROM app.variation x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.id=NEW.variation_id;
 IF v.id IS NULL OR v.sor_version_id IS DISTINCT FROM NEW.sor_version_id OR v.sor_code IS DISTINCT FROM NEW.sor_code
  OR v.excess_of_scope_item_id IS DISTINCT FROM NEW.excess_of_scope_item_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT x.* INTO b FROM app.work_order_revision x WHERE x.tenant_id=NEW.tenant_id AND x.work_order_id=NEW.work_order_id AND x.id=NEW.work_order_revision_id;
 IF b.id IS NULL OR b.status IS DISTINCT FROM 'ordered' OR b.sor_version_id IS DISTINCT FROM NEW.sor_version_id
  OR b.adjustment_numerator IS DISTINCT FROM NEW.adjustment_numerator OR b.adjustment_denominator IS DISTINCT FROM NEW.adjustment_denominator THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 claimed:=NEW.claimed_quantity::numeric; extra:=NEW.quantity::numeric;
 IF NEW.coverage='excess' THEN
  IF NEW.excess_of_scope_item_id IS NULL OR NEW.instructed_quantity IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  SELECT x.* INTO l FROM app.work_order_line x WHERE x.tenant_id=NEW.tenant_id AND x.revision_id=NEW.work_order_revision_id AND x.scope_item_id=NEW.excess_of_scope_item_id;
  instructed:=NEW.instructed_quantity::numeric;
  IF l.id IS NULL OR l.sor_code IS DISTINCT FROM NEW.sor_code OR l.quantity::numeric<>instructed OR claimed-instructed<>extra OR extra<=0 THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.excess_of_scope_item_id IS NOT NULL OR NEW.instructed_quantity IS NOT NULL
   OR EXISTS(SELECT 1 FROM app.work_order_line x WHERE x.tenant_id=NEW.tenant_id AND x.revision_id=NEW.work_order_revision_id AND x.sor_code=NEW.sor_code)
   OR extra<>claimed OR extra<=0 THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
  END IF;
 END IF;
 -- The price is the merged function's, applied to the stored rate, the baseline's own adjustment and the derived extra quantity.
 IF NEW.net_pence IS DISTINCT FROM app.sor_line_net_pence(NEW.quantity,NEW.rate_pence,NEW.adjustment_numerator,NEW.adjustment_denominator) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 NEW.server_recorded_at:=o.server_recorded_at;
 values_to_hash:=ARRAY[NEW.tenant_id::text,NEW.job_id::text,NEW.variation_id::text,NEW.revision::text,o.origin_hash::text,NEW.work_order_id::text,NEW.work_order_revision_id::text,NEW.sor_version_id::text,
  NEW.sor_code,NEW.unit,NEW.rate_pence::text,NEW.adjustment_numerator::text,NEW.adjustment_denominator::text,NEW.coverage,NEW.excess_of_scope_item_id::text,NEW.instructed_quantity,
  NEW.claimed_quantity,NEW.quantity,NEW.net_pence::text];
 FOREACH value_text IN ARRAY values_to_hash LOOP
  encoded:=encoded||(CASE WHEN value_text IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(value_text,'UTF8'))::text||':'||value_text||';' END);
 END LOOP;
 NEW.content_hash:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 RETURN NEW;
END $$;

-- 5. At commit: the price sits in the transaction that raised the extra, beside that transaction's one audit event (Q8: the price itself is named in no audit payload).
CREATE FUNCTION app.ent3c_require_sor_revision_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE setting_tenant uuid; origin_row app.extra_origin; origin_xid xid; revision_xid xid;
BEGIN
 BEGIN
  setting_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'PRICING_AUDIT_REQUIRED' USING ERRCODE='23514';
 END;
 IF setting_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'PRICING_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE o.tenant_id=NEW.tenant_id AND o.job_id=NEW.job_id AND o.variation_id=NEW.variation_id;
 SELECT o.xmin INTO origin_xid FROM app.extra_origin o WHERE o.tenant_id=NEW.tenant_id AND o.job_id=NEW.job_id AND o.variation_id=NEW.variation_id;
 SELECT r.xmin INTO revision_xid FROM app.extra_sor_revision r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.id;
 IF origin_row.variation_id IS NULL OR origin_xid IS DISTINCT FROM revision_xid OR origin_row.origin_hash IS NULL
  OR (SELECT count(*) FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.event_type='contractor.extra.raised' AND e.subject_type='extra' AND e.subject_ref=NEW.variation_id::text
   AND (e.payload->'references')->>'command'=NEW.command_id::text AND (e.payload->'hashes')->>'origin'=origin_row.origin_hash AND e.xmin=revision_xid)<>1 THEN
  RAISE EXCEPTION 'PRICING_AUDIT_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

-- 6. A pricing-basis row is accepted only as server_sor for revision 1, beside a revision row of the same extra, hash, command and member, inside its command.
CREATE FUNCTION app.ent3c_pricing_basis_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r app.extra_sor_revision; receipt app.command_receipt;
BEGIN
 IF NEW.pricing_basis IS DISTINCT FROM 'server_sor' OR NEW.revision IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT x.* INTO r FROM app.extra_sor_revision x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.variation_id=NEW.variation_id AND x.revision=NEW.revision;
 IF r.id IS NULL OR r.content_hash IS DISTINCT FROM NEW.revision_content_hash OR r.command_id IS DISTINCT FROM NEW.command_id OR r.raising_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT x.* INTO receipt FROM app.command_receipt x WHERE x.tenant_id=NEW.tenant_id AND x.command_id=NEW.command_id;
 IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.command_type IS DISTINCT FROM 'LogSiteExtra'
  OR receipt.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 NEW.server_recorded_at:=r.server_recorded_at;
 RETURN NEW;
END $$;

-- 7. At commit: a priced revision never exists without its basis record, for any writer.
CREATE FUNCTION app.ent3c_require_pricing_basis() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE revision_xid xid;
BEGIN
 SELECT r.xmin INTO revision_xid FROM app.extra_sor_revision r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.id;
 IF (SELECT count(*) FROM app.extra_pricing_basis p WHERE p.tenant_id=NEW.tenant_id AND p.variation_id=NEW.variation_id AND p.revision=1 AND p.pricing_basis='server_sor'
   AND p.revision_content_hash=NEW.content_hash AND p.xmin=revision_xid)<>1 THEN
  RAISE EXCEPTION 'PRICING_BASIS_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER a_sor_revision_guard BEFORE INSERT ON app.extra_sor_revision FOR EACH ROW EXECUTE FUNCTION app.ent3c_sor_revision_guard();
CREATE CONSTRAINT TRIGGER sor_revision_audit AFTER INSERT ON app.extra_sor_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent3c_require_sor_revision_audit();
CREATE CONSTRAINT TRIGGER sor_revision_basis AFTER INSERT ON app.extra_sor_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent3c_require_pricing_basis();
CREATE TRIGGER a_pricing_basis_guard BEFORE INSERT ON app.extra_pricing_basis FOR EACH ROW EXECUTE FUNCTION app.ent3c_pricing_basis_guard();

ALTER FUNCTION app.ent3c_record_sor_revision(uuid,uuid,text,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3c_sor_revision_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3c_require_sor_revision_audit() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3c_pricing_basis_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3c_require_pricing_basis() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3c_record_sor_revision(uuid,uuid,text,text) FROM PUBLIC,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.ent3c_sor_revision_guard(),app.ent3c_require_sor_revision_audit(),app.ent3c_pricing_basis_guard(),app.ent3c_require_pricing_basis() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3c_record_sor_revision(uuid,uuid,text,text) TO jobguard_runtime;
COMMIT;
