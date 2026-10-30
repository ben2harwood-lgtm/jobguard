// Test-only historical client: actual PostgreSQL v1 append protocol. Never
// imported by production or used as a fallback on a fully migrated database.
export async function legacyAuditModule(audit: typeof import("../src/audit.js")) {
  const { createHash } = await import("node:crypto");
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b))
      .map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  };
  return { ...audit, appendAuditBatch: async (database: import("../src/tenant-context.js").TenantTransaction,
    inputs: readonly import("../src/audit.js").AuditEventInput[]) => {
    if (!inputs.length) return [];
    const parsed = inputs.map(input => audit.auditEventInputV1Schema.strict().parse(input));
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
