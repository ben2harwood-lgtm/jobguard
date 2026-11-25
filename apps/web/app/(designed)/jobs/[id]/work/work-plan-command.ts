// Pure command building for the Plan card, kept apart so it can be tested without a browser.
export type TaskChanges = {
  position?: number; durationMinutes?: number; trade?: string; scheduledDate?: string | null; assignee?: string | null;
};
export type PlanItem = { key: string; scopeItemId: string; variationRevisionId?: string };

/** An approved extra's edit names the approved revision the screen was showing; a quote line names none. */
export function workPlanEditCommand(plan: { quoteRevisionId: string; version: number }, task: PlanItem, changes: TaskChanges) {
  return { version: "work-plan-edit.v1", quoteRevisionId: plan.quoteRevisionId, expectedVersion: plan.version,
    taskKey: task.key, scopeItemId: task.scopeItemId,
    ...(task.variationRevisionId && { variationRevisionId: task.variationRevisionId }), changes } as const;
}

export type ExtraNotPlanned = {
  scopeItemId: string; title: string; reason: "omission" | "direction_unknown"; planningDropped: boolean;
  variationRevisionId?: string;
};

/** C3B-2: the builder's answer for an approved no-charge extra, bound to the revision the screen shows. */
export function extraDirectionCommand(plan: { quoteRevisionId: string; version: number },
  extra: { variationRevisionId: string }, direction: "adds_work" | "removes_work") {
  return { version: "work-plan-extra-direction.v1", quoteRevisionId: plan.quoteRevisionId, expectedVersion: plan.version,
    variationRevisionId: extra.variationRevisionId, direction } as const;
}

/** The plain reason an approved extra is not on the plan. */
export function extraNotPlannedReason(extra: ExtraNotPlanned) {
  const reason = extra.reason === "omission"
    ? "removed work, nothing to plan"
    : "no price change: say whether it adds or removes work";
  return extra.planningDropped ? `${reason} · planning on this extra was set aside` : reason;
}
