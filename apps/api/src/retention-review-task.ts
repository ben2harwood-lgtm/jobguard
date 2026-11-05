import type { TaskList } from "graphile-worker";
import { z } from "zod";

const taskV1 = z.object({ version: z.literal("retention-review-task.v1"), tenantId: z.guid() }).strict();
/** One scheduling owner; infrastructure credentials can append timer reviews only. */
export function registerRetentionReviewTasks(tasks: TaskList, environment: string, raiseReviews: (tenantId: string) => Promise<unknown>): string {
  if (environment !== "synthetic_demo") return "";
  tasks.discover_retention_reviews = async (_payload, helpers) => {
    const rows = await helpers.withPgClient(client => client.query<{ tenant_id: string; bucket: string }>(
      "SELECT tenant_id,floor(extract(epoch FROM CURRENT_TIMESTAMP)/60)::text bucket FROM infrastructure.discover_retention_reviews()"));
    for (const row of rows.rows) {
      const payload = taskV1.parse({ version: "retention-review-task.v1", tenantId: row.tenant_id });
      await helpers.addJob("raise_retention_reviews", payload, {
        jobKey: `retention-review:${payload.tenantId}:${row.bucket}`, jobKeyMode: "preserve_run_at",
      });
    }
  };
  tasks.raise_retention_reviews = async payload => {
    const parsed = taskV1.parse(payload);
    await raiseReviews(parsed.tenantId);
  };
  return "*/1 * * * * discover_retention_reviews";
}
