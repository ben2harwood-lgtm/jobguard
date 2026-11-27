import { randomUUID } from "node:crypto";

export const policy = Object.freeze({
  version: "pilot-privacy-fixture.v1",
  approval: "provisional_fixture_only",
  backupRetentionMs: 2 * 24 * 60 * 60 * 1000,
});

const refused = () => { throw new Error("PILOT_PRIVACY_REHEARSAL_REFUSED"); };
const sameSubject = (left, right) => left.tenantId === right.tenantId && left.subjectId === right.subjectId;
const exportable = new Set(["source_version", "derived", "cache", "log", "accounting", "legal", "shadow"]);
const erasedOnDelete = new Set(["source_version", "derived", "cache", "log", "prior_export"]);

// All ports belong to an isolated fixture. The caller has no API, provider or live-store credentials.
// Export callbacks use recipient-scoped fields selected during review, never raw mixed-subject payloads.
export function createPilotPrivacyRehearsal({ verify, records, snapshot, disclose, clock }) {
  let inventory = structuredClone(records);
  const tombstones = new Map();
  const expiredBackups = new Map();
  const approved = new WeakMap();
  const roles = new WeakMap();
  let ready = true;

  function operator(credential, role) {
    const actor = verify(credential, role);
    if (actor?.role !== role || !actor.tenantId) refused();
    const token = Object.freeze({});
    roles.set(token, { credential, role, tenantId: actor.tenantId });
    return token;
  }

  function authorize(token, role) {
    const entry = roles.get(token);
    if (entry?.role !== role) refused();
    const actor = verify(entry.credential, role);
    if (actor?.role !== role || actor.tenantId !== entry.tenantId) refused();
    return entry.tenantId;
  }

  function subjectAuthorized(scope) {
    const subject = verify(scope.requesterCredential, "subject_request");
    return subject?.subjectId && subject.identityVerified && subject.authorityVerified && sameSubject(scope, subject) &&
      (subject.controller === "jobguard" || (subject.controller === "contractor" &&
        verify(scope.instructionCredential, "controller_instruction", scope) === true));
  }

  function scopedRecords(scope) {
    return inventory.filter(record => sameSubject(record, scope));
  }

  function review(token, request) {
    const tenantId = authorize(token, "privacy_operator");
    if (!ready || tenantId !== request.tenantId || !subjectAuthorized(request) ||
        !["access", "export", "delete"].includes(request.operation)) refused();
    const receipt = Object.freeze({});
    approved.set(receipt, { token, tenantId, subjectId: request.subjectId, operation: request.operation,
      requesterCredential: request.requesterCredential, instructionCredential: request.instructionCredential,
      reviewedRecords: scopedRecords(request), disclosureIds: new Map(), receiptId: randomUUID() });
    return receipt;
  }

  function applyDeletion(target, scope) {
    return target.flatMap(record => {
      if (!sameSubject(record, scope)) return [record];
      if (erasedOnDelete.has(record.kind)) return [];
      const status = { session: "revoked", object_grant: "revoked", queue: "cancelled", inflight: "outcome_unknown",
        processor_copy: "pending_confirmation", accounting: "restricted", legal: "restricted", shadow: "restricted" }[record.kind];
      return [{ ...record, ...(status && { status }) }];
    });
  }

  async function execute(token, approval) {
    const scope = approved.get(approval);
    const check = () => {
      if (!ready || !scope || scope.token !== token || authorize(token, "privacy_operator") !== scope.tenantId ||
          !subjectAuthorized(scope)) refused();
    };
    check();
    if (scope.deletionReceipt) return { ...scope.deletionReceipt };
    const current = scopedRecords(scope);
    if (current.length !== scope.reviewedRecords.length || current.some(record => !scope.reviewedRecords.includes(record))) refused();
    if (scope.operation === "delete") {
      const key = JSON.stringify([scope.tenantId, scope.subjectId]);
      if (!tombstones.has(key)) tombstones.set(key, { tenantId: scope.tenantId, subjectId: scope.subjectId,
        receiptId: scope.receiptId, at: clock() });
      inventory = applyDeletion(inventory, scope);
      const remaining = scopedRecords(scope);
      scope.deletionReceipt = { receiptId: scope.receiptId, backupsErased: false,
        restricted: remaining.filter(record => record.status === "restricted").length,
        confirmationPending: remaining.filter(record => record.status === "pending_confirmation").length,
        outcomeUnknown: remaining.filter(record => record.status === "outcome_unknown").length };
      return { ...scope.deletionReceipt };
    }
    const rows = current.filter(record => exportable.has(record.kind) &&
      record.status !== "restricted" && record.release !== undefined);
    for (const record of rows.filter(row => row.kind === "shadow")) {
      const route = scope.operation === "access" ? "data_subject_access" : "export";
      if (!scope.disclosureIds.has(record.id)) scope.disclosureIds.set(record.id, randomUUID());
      // The restricted port resolves after recording the disclosure and applying pre-lock ineligibility.
      const eventId = scope.disclosureIds.get(record.id);
      if (await disclose({ route, tenantId: scope.tenantId, jobId: record.jobId, signalId: record.id, eventId }) !== eventId) refused();
    }
    check();
    const refreshed = scopedRecords(scope);
    if (refreshed.length !== current.length || refreshed.some(record => !current.includes(record))) refused();
    return structuredClone(rows.map(({ id, kind, versionId, release }) => ({ id, kind, ...(versionId && { versionId }), data: release })));
  }

  function restore(token) {
    const tenantId = authorize(token, "restore_operator");
    ready = false;
    const restored = snapshot(tenantId);
    if (restored.some(record => record.tenantId !== tenantId)) refused();
    const expired = expiredBackups.get(tenantId);
    let tenantRecords = structuredClone(restored.filter(record => record.kind !== "backup" || !expired?.has(record.id)));
    for (const scope of tombstones.values()) {
      if (scope.tenantId === tenantId) tenantRecords = applyDeletion(tenantRecords, scope);
    }
    inventory = [...inventory.filter(record => record.tenantId !== tenantId), ...tenantRecords];
    ready = true;
  }

  function expireBackup(token, backupId, confirmExpiry) {
    const tenantId = authorize(token, "restore_operator");
    const backup = inventory.find(record => record.tenantId === tenantId && record.kind === "backup" && record.id === backupId);
    if (!ready || !backup || !Number.isFinite(backup.createdAt) || clock() < backup.createdAt + policy.backupRetentionMs ||
        confirmExpiry(backup.id) !== true) refused();
    if (!expiredBackups.has(tenantId)) expiredBackups.set(tenantId, new Set());
    expiredBackups.get(tenantId).add(backup.id);
    inventory = inventory.filter(record => record !== backup);
  }

  function usable(credential, kind, id) {
    const subject = verify(credential, "subject_request");
    return ready && !!subject && ["session", "object_grant", "queue"].includes(kind) &&
      inventory.some(record => sameSubject(record, subject) && record.kind === kind && record.id === id && record.status === "active");
  }

  return { operator, review, execute, restore, expireBackup, usable };
}
