import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
const taskChanges = z.strictObject({
  position: z.number().int().min(1).max(2_147_483_647).optional(),
  durationMinutes: z.number().int().min(1).max(2_147_483_647).optional(),
  trade: z.string().trim().min(1).max(100).optional(),
  scheduledDate: z.iso.date().nullable().optional(),
  assignee: z.string().trim().min(1).max(100).nullable().optional(),
  // V2-C3C: a firm crew record (app.v2_crew_contact.crew_id). Old edits without it are unchanged.
  assigneeRef: uuid.nullable().optional(),
}).refine(changes => Object.values(changes).some(value => value !== undefined))
  .refine(changes => changes.assignee === undefined || changes.assigneeRef === undefined);

export const customWorkPlanTaskKey = "custom-scope-item";
export const workPlanQueryV1 = z.strictObject({ version: z.literal("work-plan-query.v1") });
export const workPlanEditV1 = z.strictObject({
  version: z.literal("work-plan-edit.v1"),
  commandId: uuid,
  quoteRevisionId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_647),
  scopeItemId: uuid,
  taskKey: z.string().min(1).max(100),
  // Required for an approved extra: the approved variation revision shown in the plan's scopeItems.
  variationRevisionId: uuid.optional(),
  changes: taskChanges,
});

export type WorkPlanEdit = z.infer<typeof workPlanEditV1>;

export type WorkPlanTask = {
  key: string;
  scopeItemId: string;
  title: string;
  trade: string;
  durationMinutes: number;
  position: number;
  dependsOn: { scopeItemId: string; templateTaskKey: string }[];
  materialNeeds: readonly string[];
  proofPoints: readonly string[];
  customerChoices: readonly string[];
  scheduledDate?: string | null;
  /** Free text from older edits: shown as "(not linked)", never used for matching. */
  assignee?: string | null;
  assigneeRef?: string | null;
  needsReview?: true;
};

type ScopeDetails = { description: string; category: string | null; quantity: string | null; unit: string | null };

export type WorkPlanScopeRow = {
  scope_item_id: string;
  source: ScopeDetails;
  template_task_key: string | null;
};

export type WorkPlanEditRow = {
  scope_item_id: string;
  template_task_key: string;
  quote_revision_id: string;
  changes: WorkPlanEdit["changes"];
  source: ScopeDetails;
};

export const taskId = (scopeItemId: string, key: string) => `${scopeItemId}/${key}`;

const scopeChanged = (before: ScopeDetails | undefined, after: ScopeDetails | undefined) =>
  JSON.stringify(before) !== JSON.stringify(after);

export function applyWorkPlanEdits(scope: WorkPlanScopeRow[], baseTasks: WorkPlanTask[], edits: WorkPlanEditRow[]) {
  const scopeItems = new Map(scope.map(row => [row.scope_item_id, row]));
  const templated = new Set(baseTasks.map(task => task.scopeItemId));
  const tasks = [...baseTasks];
  const edited = new Set<string>();
  for (const edit of edits) {
    const { scope_item_id: scopeItemId, template_task_key: key, changes } = edit;
    const item = scopeItems.get(scopeItemId);
    if (!item) continue;
    const index = tasks.findIndex(task => task.scopeItemId === scopeItemId && task.key === key);
    let task = tasks[index];
    if (!task) {
      if (key !== customWorkPlanTaskKey || templated.has(scopeItemId) || changes.trade === undefined ||
        changes.durationMinutes === undefined || changes.position === undefined) continue;
      task = { key, scopeItemId, title: item.source.description, trade: changes.trade,
        durationMinutes: changes.durationMinutes, position: changes.position, dependsOn: [],
        materialNeeds: [], proofPoints: [], customerChoices: [] };
    }
    const { position, trade, durationMinutes, scheduledDate, assignee, assigneeRef } = changes;
    const { needsReview: _needsReview, ...prior } = task;
    const next: WorkPlanTask = { ...prior, trade: trade ?? task.trade, durationMinutes: durationMinutes ?? task.durationMinutes,
      ...(scheduledDate !== undefined && { scheduledDate }), ...(assignee !== undefined && { assignee }) };
    // A task has one assignment: setting a crew record replaces free text, and the reverse.
    if (assigneeRef !== undefined) {
      delete next.assignee;
      next.assigneeRef = assigneeRef;
    } else if (assignee !== undefined) {
      delete next.assigneeRef;
    }
    if (scopeChanged(item.source, edit.source)) next.needsReview = true;
    if (index >= 0) tasks.splice(index, 1);
    tasks.splice(position === undefined ? index : position - 1, 0, next);
    edited.add(taskId(scopeItemId, key));
  }
  const planned = new Set(tasks.map(task => task.scopeItemId));
  const unplanned = [...scopeItems.values()].filter(item => !planned.has(item.scope_item_id)).map(item => ({
    scopeItemId: item.scope_item_id, title: item.source.description, status: "Unplanned" as const,
  }));
  return { tasks: tasks.map((task, index) => ({ ...task, position: index + 1 })), unplanned, edited,
    sources: new Map([...scopeItems].map(([id, row]) => [id, row.source])) };
}

type PlanProjection = ReturnType<typeof applyWorkPlanEdits>;

export function compareWorkPlanTasks(previous: PlanProjection | null, current: PlanProjection) {
  const added: WorkPlanTask[] = [], removed: WorkPlanTask[] = [];
  const changed: { before: WorkPlanTask; after: WorkPlanTask;
    beforeScope: ScopeDetails | undefined; afterScope: ScopeDetails | undefined }[] = [];
  if (!previous) return { added, removed, changed };
  const prior = new Map(previous.tasks.map(task => [taskId(task.scopeItemId, task.key), task]));
  for (const task of current.tasks) {
    const id = taskId(task.scopeItemId, task.key);
    const before = prior.get(id);
    if (!before) {
      added.push(task);
    } else {
      prior.delete(id);
      const beforeScope = previous.sources.get(task.scopeItemId);
      const afterScope = current.sources.get(task.scopeItemId);
      if (scopeChanged(beforeScope, afterScope) || before.position !== task.position) {
        changed.push({ before, after: task, beforeScope, afterScope });
      }
    }
  }
  for (const [id, task] of prior) removed.push(previous.edited.has(id) ? { ...task, needsReview: true } : task);
  return { added, removed, changed };
}
