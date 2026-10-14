import { describe, expect, it, vi } from "vitest";
import { listDecisionInbox } from "./decision-repository.js";
import type { TenantTransaction } from "./tenant-context.js";

describe("adopted-job inbox ownership query", () => {
  it.each([undefined, "11111111-1111-4111-8111-111111111111"])(
    "includes source-owned adopted jobs in the inbox (job filter: %s)", async jobId => {
      const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [] }));
      const db = { $client: { query } } as unknown as TenantTransaction;
      const digest = "a".repeat(64);
      await listDecisionInbox(db, jobId, digest);
      const [sql, values] = query.mock.calls[0]!;
      // An imported job has a NULL direct digest. The query must use the same
      // immutable source/audit ownership closure as authorizePracticeJob.
      expect(sql).toContain("WITH RECURSIVE practice_owned_job");
      expect(sql).toContain("job.imported_baseline_attested");
      expect(sql).toContain("e.payload->'references'->>'sourceJobId'=source.id::text");
      expect(sql).toContain("j.provenance='imported' AND j.practice_session_digest IS NULL");
      expect(sql).toContain("tenant_id=current_setting('app.tenant_id', true)::uuid");
      expect(sql).toContain("($2::text IS NULL OR j.id IN (SELECT id FROM practice_owned_job))");
      expect(sql).toContain("($1::uuid IS NULL OR f.job_id=$1)");
      expect(values).toEqual([jobId ?? null, digest]);
    },
  );
});
