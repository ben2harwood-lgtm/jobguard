import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { FinalAccountLockError } from "@jobguard/core";
import { expect, it, vi } from "vitest";
import { GuardedPracticeInvoiceRepository } from "./guarded-practice-invoice-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

it.each(["JOB_WORK_CLOSED", "FINAL_ACCOUNT_LOCK_REQUIRED", "private SQL diagnostic"])("maps only known invoice refusals: %s", async message => {
 const error = new Error(message);
 const query = vi.fn(async (sql: string) => {
  if (sql.includes("app.issue_practice_customer_invoice")) throw error;
  return { rows: [], rowCount: 0 };
 });
 const release = vi.fn();
 const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
 const repo = new GuardedPracticeInvoiceRepository(pool);
 const result = repo.issue(verifiedTenantContextForQueuedJob(randomUUID()), {
  jobId: randomUUID(), finalAccountRevisionId: randomUUID(), actorMembershipId: randomUUID(),
  commandId: randomUUID(), recipient: "practice-customer@example.invalid", issuedOn: "2026-11-01",
 });
 if (message === "private SQL diagnostic") await expect(result).rejects.toBe(error);
 else await expect(result).rejects.toEqual(new FinalAccountLockError(message as "JOB_WORK_CLOSED" | "FINAL_ACCOUNT_LOCK_REQUIRED"));
 expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
 expect(release).toHaveBeenCalledOnce();
});

it("replaces only the latest invoice routine, guarding new commands after replay under the job lock", () => {
 const priorMigration = readFileSync(new URL("../migrations/0237_final_check_prerequisites.sql", import.meta.url), "utf8");
 const start = priorMigration.indexOf("CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(");
 const prior = priorMigration.slice(start, priorMigration.indexOf("END $$;", start) + "END $$;".length);
 const migration = readFileSync(new URL("../migrations/0524_practice_invoice_closed_job.sql", import.meta.url), "utf8");
 const replacementStart = migration.indexOf("CREATE OR REPLACE FUNCTION");
 const replacement = migration.slice(replacementStart, migration.indexOf("END $$;", replacementStart) + "END $$;".length);
 const guard = " PERFORM app.ch4_require_open(p_tenant,p_job);\n";
 expect(replacement.replace(guard, "")).toBe(prior);
 expect(replacement.split(guard)).toHaveLength(2);
 const guardIndex = replacement.indexOf(guard);
 expect(replacement.indexOf("FOR UPDATE;")).toBeLessThan(guardIndex);
 expect(replacement.indexOf("prior->>'outboxStatus'; RETURN;")).toBeLessThan(guardIndex);
 expect(guardIndex).toBeLessThan(replacement.indexOf("IF p_recipient !~"));
});
