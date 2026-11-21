import { z } from "zod";

const settings = z.object({
  PILOT_WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PILOT_QUEUE_BACKLOG_SECONDS: z.coerce.number().int().min(1).max(86_400).prefault(300),
});

export function parsePilotOperations(env: Readonly<Record<string, string | undefined>>) {
  const result = settings.safeParse(env);
  if (!result.success) throw new Error("PILOT_OPERATIONS_CONFIG_REFUSED");
  return result.data;
}
