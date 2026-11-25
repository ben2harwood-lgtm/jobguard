import type { HireTask } from "@jobguard/api/workspace";

/** A plan task keeps its scope item and task key across quote revisions; the revision id does not. */
export const hireTaskKey = (task: Pick<HireTask, "scopeItemId" | "templateTaskKey">) => `${task.scopeItemId}/${task.templateTaskKey}`;

export function isHireTaskLinked(links: readonly HireTask[], task: HireTask) {
  return links.some(link => hireTaskKey(link) === hireTaskKey(task));
}

/** Ticking links the current plan's task; unticking removes every link to that task, from any revision. */
export function toggleHireTask(links: readonly HireTask[], task: HireTask, checked: boolean): HireTask[] {
  const others = links.filter(link => hireTaskKey(link) !== hireTaskKey(task));
  return checked ? [...others, task] : others;
}
