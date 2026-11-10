import { z } from "zod";

export const failureClasses = ["queue_failure", "unknown_send", "backup_failure", "unauthorized_route", "storage_verification_error"] as const;
const signals = ["outbox.failure", "outbox.unknown_outcome", "backup.failed", "route.denied", "storage.verification_failed"] as const;
const roles = ["QUEUE_OPERATOR", "INCIDENT_COMMANDER", "BACKUP_OPERATOR", "SECURITY_OPERATOR", "STORAGE_OPERATOR"] as const;
const alertSchema = z.strictObject({
  id: z.enum(failureClasses), signal: z.enum(signals),
  source: z.string().regex(/^(packages|apps)\/[a-zA-Z0-9/_.-]+\.(ts|mjs)$/u),
  condition: z.string().trim().min(1), severity: z.enum(["critical", "error"]),
  ownerRole: z.enum(roles),
  runbook: z.string().regex(/^docs\/operations\/incident-ownership\.md#[a-z-]+$/u),
});
export const opsAlertsV1Schema = z.strictObject({ version: z.literal("ops-alerts.v1"), alerts: z.array(alertSchema).length(5) })
  .superRefine(({ alerts }, ctx) => {
    failureClasses.forEach((id, index) => {
      const matches = alerts.filter(alert => alert.id === id);
      if (matches.length !== 1 || matches[0]?.signal !== signals[index] || matches[0]?.ownerRole !== roles[index])
        ctx.addIssue({ code: "custom", message: "Every failure class requires its unique signal and owner role" });
    });
  });
export type OpsCatalogue = z.infer<typeof opsAlertsV1Schema>;
export const opsSignalV1Schema = z.strictObject({ version: z.literal("ops-signal.v1"), signal: z.enum(signals) });
export class OpsAlertError extends Error {
  readonly code = "OPS_ALERT_INVALID";
  constructor() { super("Invalid operations alert input"); }
}
export function parseOpsAlerts(raw: unknown): OpsCatalogue {
  const result = opsAlertsV1Schema.safeParse(raw);
  if (!result.success) throw new OpsAlertError();
  return result.data;
}
/** Closed labels only: no free text, identity, content, credentials or provider errors. */
export class FakeOpsSink {
  readonly records: OpsCatalogue["alerts"] = [];
  private readonly catalogue: OpsCatalogue;
  constructor(raw: unknown) { this.catalogue = parseOpsAlerts(raw); }
  emit(raw: unknown): void {
    const result = opsSignalV1Schema.safeParse(raw);
    if (!result.success) throw new OpsAlertError();
    const alert = this.catalogue.alerts.find(row => row.signal === result.data.signal);
    if (!alert) throw new OpsAlertError();
    this.records.push({ ...alert });
  }
  /** Compatible with the existing outbox SafeTelemetry port; fields are discarded. */
  outboxTelemetry() {
    return { emit: (name: string, _fields: Readonly<Record<string, string | number>>) => {
      if (name === "outbox.failure" || name === "outbox.unknown_outcome")
        this.emit({ version: "ops-signal.v1", signal: name });
    } };
  }
}
/** Synthetic harness boundary for a failed backup, refused route or rejected storage check.
 * Not installed as a production observer; rethrows the original failure to preserve fail-closed behavior. */
export async function observeOpsFailure<T>(sink: FakeOpsSink,
  signal: "backup.failed" | "route.denied" | "storage.verification_failed", operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { sink.emit({ version: "ops-signal.v1", signal }); throw error; }
}
