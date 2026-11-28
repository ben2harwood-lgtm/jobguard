import type { HireTask } from "@jobguard/api/workspace";

/** A plan task keeps its scope item and task key across quote revisions; the revision id does not. */
export const hireTaskKey = (task: Pick<HireTask, "scopeItemId" | "templateTaskKey">) => `${task.scopeItemId}/${task.templateTaskKey}`;

export function isHireTaskLinked(links: readonly HireTask[], task: HireTask) {
  return links.some(link => hireTaskKey(link) === hireTaskKey(task));
}

/**
 * Ticking links the current plan's task; unticking removes every link to that task, from any revision.
 * Links to tasks no longer in the current plan (an excluded or recategorised line) are dropped, so the
 * builder can always save a change and the server never sees a task it cannot find.
 */
export function toggleHireTask(links: readonly HireTask[], task: HireTask, checked: boolean, planTasks: readonly HireTask[]): HireTask[] {
  const others = links.filter(link => hireTaskKey(link) !== hireTaskKey(task) && isHireTaskLinked(planTasks, link));
  return checked ? [...others, task] : others;
}
