const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b))
      .map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  };
export async function historicalSchema(client: Pick<import("pg").PoolClient,"query">): Promise<boolean> {
  const schema=(await client.query<{installed:boolean;sealed_schema:boolean}>(`SELECT
    to_regprocedure('app.append_audit(jsonb)') IS NOT NULL AS installed,
    EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('app.audit_event')
      AND c.conname='audit_event_version_check' AND pg_get_constraintdef(c.oid) LIKE '%audit.v2%') AS sealed_schema`)).rows[0];
  return schema?.installed===false && schema.sealed_schema===false;
}
// Test-only schema-aware client: real PostgreSQL v1 protocol for historical
// fixtures, and the unchanged production client once LP-4 is installed.
export async function legacyAuditModule(audit: typeof import("../src/audit.js")) {
  const { createHash } = await import("node:crypto");
  return { ...audit, appendAuditBatch: async (database: import("../src/tenant-context.js").TenantTransaction,
    inputs: readonly import("../src/audit.js").AuditEventInput[]) => {
    if (!inputs.length) return [];
    const parsed = inputs.map(input => audit.auditEventInputV1Schema.strict().parse(input));
    // Readable catalogue metadata avoids requiring runtime SELECT on the
    // owner-only migration registry. A damaged LP-4 schema still fails closed.
    if (!(await historicalSchema(database.$client))) {
      return audit.appendAuditBatch(database,inputs);
    }
    const tenantId = (await database.$client.query("SELECT nullif(current_setting('app.tenant_id',true),'')::uuid::text tenant_id")).rows[0]?.tenant_id;
    if (!tenantId) throw new audit.AuditVerificationError("Missing transaction-local tenant context");
    const head = (await database.$client.query("SELECT sequence::text,event_hash FROM app.lock_audit_head()")).rows[0];
    let sequence = Number(head?.sequence ?? 0), previousHash: string | null = head?.event_hash ?? null;
    const events: import("../src/audit.js").AuditEvent[] = [];
    for (const input of parsed) {
      const occurredAt = (await database.$client.query("SELECT clock_timestamp() occurred_at")).rows[0].occurred_at;
      const payload = canonical(input.payload), payloadHash = createHash("sha256").update(payload).digest("hex");
      const event = { ...input, tenantId, sequence: ++sequence, occurredAt, payloadHash, previousHash };
      const eventHash = audit.canonicalAuditHash(event);
      await database.$client.query(`INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,
        subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
        [input.id,tenantId,sequence,input.version,input.actorRef,input.eventType,input.subjectType,input.subjectRef,
          occurredAt,payload,payloadHash,previousHash,eventHash]);
      events.push({ ...event, eventHash }); previousHash = eventHash;
    }
    await database.$client.query("SELECT app.advance_audit_head($1,$2)",[sequence,previousHash]);
    return events;
  } };
}

// The historical SSO bridge accepts sealed v1 input through its own identity
// grants, not direct app-table writes. Keep that protocol out of production.
export async function legacySsoAuditModule(identity: typeof import("../src/enterprise-identity-repository.js"),
  audit: typeof import("../src/audit.js"),
  isHistorical: (client: import("pg").PoolClient) => Promise<boolean>) {
  const {createHash,randomUUID}=await import("node:crypto");
  class HistoricalIdentityRepository extends identity.EnterpriseIdentityRepository {
    override async audit(client: import("pg").PoolClient,connectionId:string,eventType:string,actorRef="identity:saml",code?:string,commandHash?:string):Promise<void> {
      if (!(await isHistorical(client))) return super.audit(client,connectionId,eventType,actorRef,code,commandHash);
      const payload={references:{environment:"synthetic_demo",...(code?{code}:{})},...(commandHash?{hashes:{document:commandHash}}:{}),classifications:{action:"security" as const}};
      const input=audit.auditEventInputV1Schema.parse({id:randomUUID(),version:"audit.v1",actorRef,eventType,subjectType:"sso-connection",subjectRef:connectionId,payload});
      const head=(await client.query<{tenant_id:string;sequence:string;previous_hash:string|null;occurred_at:Date}>("SELECT * FROM identity.sso_audit_head($1)",[connectionId])).rows[0]!;
      const event={...input,tenantId:head.tenant_id,sequence:Number(head.sequence),previousHash:head.previous_hash,occurredAt:head.occurred_at,
        payloadHash:createHash("sha256").update(canonical(payload)).digest("hex")};
      await client.query("SELECT identity.sso_audit_append($1,$2::jsonb)",[connectionId,JSON.stringify({...event,eventHash:audit.canonicalAuditHash(event)})]);
    }
  }
  return {...identity,EnterpriseIdentityRepository:HistoricalIdentityRepository};
}
