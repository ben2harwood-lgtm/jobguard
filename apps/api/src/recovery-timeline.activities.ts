import type { Pool } from "pg";
import { RecoveryFollowUpRepository, RecoveryMessageRepository, practiceMaterialPool } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryFollowUpApplication } from "./recovery-follow-up.application.js";
import {
  RecoveryTimelineError, requireSyntheticTimeline, type RecoveryTimelineActivities,
  type RecoveryTimelineRef, type TimelineActivity, type TimelineState,
} from "./recovery-timeline.workflow.js";

/** Session references are resolved server-side and NEVER enter workflow history. No approval or send activity exists. */
export class PracticeRecoveryTimelineActivities implements RecoveryTimelineActivities {
  constructor(private readonly pool: Pool, private readonly sessionFor: (ref: RecoveryTimelineRef) => Promise<string | undefined>,
    private readonly environment = "disabled") {}

  async execute(activity: TimelineActivity): Promise<TimelineState> {
    requireSyntheticTimeline(this.environment);
    const session = await this.sessionFor(activity.ref);
    const access = await new PracticeAccess(this.pool, session).case(activity.ref.caseId);
    if (access.context.tenantId !== activity.ref.tenantId) throw new RecoveryTimelineError("NOT_FOUND");
    const app = new RecoveryFollowUpApplication(this.pool);
    const state = await app.read(session, activity.ref.caseId);
    const followUp = state.followUps.find(row => row.id === activity.ref.followUpId);
    if (state.jobId !== activity.ref.jobId || state.run?.id !== activity.ref.runId || !followUp || followUp.owner.runId !== activity.ref.runId) {
      throw new RecoveryTimelineError("NOT_FOUND");
    }
    if (followUp.stopReason || state.run.archived) return "stopped";
    if (activity.kind === "cancel" || activity.kind === "close") {
      // Closure stops only this intent; it never closes a financial case or infers settlement.
      await app.command(session, activity.ref.caseId, followUp.id, {
        version: "recovery-follow-up-command.v1", action: "cancel", commandId: activity.commandId,
        followUpId: followUp.id, expectedRevision: followUp.revision,
      });
      return "stopped";
    }
    if (activity.kind === "timer") {
      const pool = practiceMaterialPool(this.pool, access.digest);
      const repository = new RecoveryFollowUpRepository(pool, new RecoveryMessageRepository(pool));
      // The persisted practice clock is authoritative. A workflow timer cannot advance it, approve or send.
      await repository.signalDue(access.context, activity.ref.runId);
      const current = await app.read(session, activity.ref.caseId);
      return current.followUps.find(row => row.id === followUp.id)?.dueDecision ? "review" : "waiting";
    }
    // Responses/evidence are wakeups: current commands own their validation, canonical transitions and audit.
    return followUp.dueDecision ? "review" : "waiting";
  }
}
