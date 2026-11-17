import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { InboxRelevanceRepository } from "@jobguard/db";
import { InboxRelevanceApplication } from "./inbox-relevance.application.js";
import { PracticeAccess } from "./practice-access.js";

afterEach(() => vi.restoreAllMocks());

it.each(["view", "seed", "budget", "dismiss"] as const)("S24: %s binds persistence to the verified session owner", async action => {
  const jobId = randomUUID(), decisionId = randomUUID(), commandId = randomUUID();
  const persistenceMethod = action === "budget" ? "setBudget" : action;
  const persistence = vi.spyOn(InboxRelevanceRepository.prototype, persistenceMethod).mockResolvedValue({} as never);
  const access = vi.spyOn(PracticeAccess.prototype, "job"), membershipId = randomUUID();
  for (const sessionId of [randomUUID(), randomUUID()]) {
    const owner = { context: {}, membershipId, digest: createHash("sha256").update(sessionId).digest("hex") };
    access.mockResolvedValueOnce(owner as never);
    const app = new InboxRelevanceApplication({} as Pool, sessionId);
    if (action === "view") await app.view(jobId);
    else if (action === "seed") await app.seed(jobId, { version: "inbox-seed.v1", commandId });
    else if (action === "budget") await app.budget(jobId, { version: "inbox-budget.v1", commandId, advisoryBudget: 0 });
    else await app.dismiss(jobId, decisionId, { version: "inbox-dismiss.v1", commandId });
    expect(persistence.mock.lastCall?.slice(-2)).toEqual([owner.membershipId, owner.digest]);
  }
});
