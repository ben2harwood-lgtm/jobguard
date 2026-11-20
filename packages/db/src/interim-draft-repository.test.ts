import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { InterimDraftRepository } from "./interim-draft-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

it.each([
 ["42501", "REQUEST_BINDING_REFUSED", "INTERIM_DRAFT_FORBIDDEN"],
 ["XX000", "REQUEST_BINDING_REFUSED", "INTERIM_DRAFT_UNAVAILABLE"],
 ["42501", "unrelated permission denial", "INTERIM_DRAFT_UNAVAILABLE"],
])("maps only the exact binding refusal (%s, %s) and rolls back", async (sqlstate, message, expected) => {
 const error = Object.assign(new Error(message), { code: sqlstate });
 const query = vi.fn(async (sql: string) => {
  if (sql.startsWith("SELECT app.interim_draft_records")) throw error;
  return { rows: [] };
 });
 const release = vi.fn(), connect = vi.fn(async () => ({query,release}));
 const repository = new InterimDraftRepository({connect} as unknown as Pool);
 const context = verifiedTenantContextForQueuedJob(randomUUID());
 await expect(repository.read(context,randomUUID(),"a".repeat(64))).rejects.toThrow(expected);
 expect(query).toHaveBeenLastCalledWith("ROLLBACK");
 expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
 expect(release).toHaveBeenCalledOnce();
});
