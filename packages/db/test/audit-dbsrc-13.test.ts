import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as audit from "../src/audit.js";
import * as sessions from "../src/practice-session.js";
import { DEMO_TENANT_ID } from "../src/demo-seed.js";
import { RecoveryMessageRepository } from "../src/recovery-message-repository.js";
import { SandboxRepository } from "../src/sandbox-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Scripted SQL reproductions of repository behavior, not PostgreSQL integrity proofs.
const context = testTenantContext(DEMO_TENANT_ID);
afterEach(() => vi.restoreAllMocks());

describe("AUDIT-FIX-DBSRC-13", () => {
  it("reading an unclaimed retry does not consume the previous attempt result", async () => {
    const messageId = randomUUID(), caseId = randomUUID(), membershipId = randomUUID();
    const history = ["previewed", "approved", "started", "retryable", "started"];
    const attempts = [{ id: randomUUID(), attempt_number: 1, outcome: "retryable" }];
    const audits: string[] = [];
    let status = "retryable";
    const row = { id: messageId, job_id: randomUUID(), outbox_action_id: randomUUID(),
      content_hash: "a".repeat(64), approving_membership_id: membershipId };
    const query = async (sql: string) => {
      if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config)/u.test(sql)) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM app.action_outbox")) return { rows: [{ status, claimed_at: null }], rowCount: 1 };
      if (sql.startsWith("UPDATE app.action_outbox")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM app.action_attempt")) return { rows: attempts, rowCount: attempts.length };
      if (sql.includes("FROM app.recovery_message_event")) return { rows: history.map((kind, i) => ({
        kind, revision: i + 1, command_id: messageId, request_hash: "b".repeat(64), actor_membership_id: membershipId,
      })), rowCount: history.length };
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const repo = new RecoveryMessageRepository({ connect: async () => ({ query, release() {} }) } as unknown as Pool);
    const service = repo as unknown as Record<string, (...args: any[]) => Promise<any>>;
    service.lockCase = async () => undefined;
    service.messageRows = async () => [row];
    service.event = async (_db, _tenant, _message, _actor, kind) => { history.push(kind); return history.length; };
    service.appendHistoryAudit = async (_db, events) => { audits.push(...events.map((event: audit.AuditEventInput) => event.eventType)); };
    service.state = async () => ({ history: [...history] });

    // The second start committed, but the executor has not yet claimed an attempt.
    const before = [...history];
    await repo.read(context, caseId);
    expect(history).toEqual(before);
    expect(audits).toEqual([]);
    // Release the second executor: a new, successful attempt is now committed.
    attempts.push({ id: randomUUID(), attempt_number: 2, outcome: "succeeded" });
    status = "succeeded";
    await repo.read(context, caseId);
    await repo.read(context, caseId);
    expect(history).toEqual([...before, "succeeded"]);
    expect(audits).toEqual(["recovery.message.succeeded"]);
  });

  it("reset preserves both archive and replacement creation history", async () => {
    vi.spyOn(sessions, "authenticatePracticeSession").mockResolvedValue({ context, digest: "a".repeat(64) } as never);
    const audits: audit.AuditEventInput[] = [];
    vi.spyOn(audit, "appendAuditBatch").mockImplementation(async (_db, events) => { audits.push(...events); return []; });
    const runs = new Map<string, { id: string; job_id: string; archived: boolean; step: number }>();
    const events: Array<{ runId: string; index: number; kind: string; commandId: string }> = [];
    const query = async (sql: string, args: any[] = []) => {
      if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config)/u.test(sql) || sql.includes("FROM app.audit_event")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO app.sandbox_run_event")) {
        // 0021's actual unique key and ON CONFLICT policy.
        if (!events.some(event => event.commandId === args[6])) {
          events.push({ runId: args[2], index: args[3], kind: args[4], commandId: args[6] });
          if (args[4] === "archived") runs.get(args[2])!.archived = true;
        }
      } else if (sql.startsWith("INSERT INTO app.sandbox_run(")) {
        runs.set(args[0], { id: args[0], job_id: args[2], archived: false, step: 0 });
      } else if (sql.includes("FROM app.sandbox_run r")) {
        const row = runs.get(args[1]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      } else if (!sql.startsWith("INSERT INTO app.job") && !sql.startsWith("INSERT INTO app.sandbox_work")) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }
      return { rows: [], rowCount: 0 };
    };
    const repo = new SandboxRepository({ connect: async () => ({ query, release() {} }) } as unknown as Pool);
    const sessionId = randomUUID(), resetCommand = randomUUID();
    const old = await repo.create(sessionId, randomUUID());
    const replacement = await repo.reset(sessionId, old.id, resetCommand);
    const archive = events.filter(event => event.runId === old.id && event.kind === "archived");
    const created = events.filter(event => event.runId === replacement.id && event.kind === "created");
    expect(archive).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0]!.index).toBe(1);
    for (const event of [archive[0]!, created[0]!]) {
      expect(audits.find(record => record.id === event.commandId)).toMatchObject({
        subjectRef: event.runId, payload: { references: { command: resetCommand } },
      });
    }
  });
});
