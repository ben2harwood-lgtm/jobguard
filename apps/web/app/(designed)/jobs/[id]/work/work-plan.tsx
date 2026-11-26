"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Empty, Note, Tag, shortDate } from "../../../designed-ui";
import { JOB_SAVED_EVENT } from "../../../../ui/job-page-fetch";

// The work-plan route's JSON, as this card reads it. Client code keeps server packages out.
type Task = {
  key: string; scopeItemId: string; title: string; trade: string; durationMinutes: number; position: number;
  scheduledDate?: string | null; assignee?: string | null; assigneeRef?: string | null; needsReview?: true;
};
type PlanView = {
  state: "draft" | "accepted" | "live"; tasks: Task[]; quoteRevisionId: string; version: number;
  changes: { added: Task[]; changed: { before: Task; after: Task }[]; removed: Task[] };
  acceptanceCancelled: boolean;
  unplanned: { scopeItemId: string; title: string; key: string }[];
  // Approved extras: the approved variation revision each scope item was planned from.
  variationRevisions?: Record<string, string>;
};
type TaskChanges = Partial<Pick<Task, "position" | "durationMinutes" | "trade" | "scheduledDate" | "assignee">>;
type EditableTask = Pick<Task, "title" | "key" | "scopeItemId"> &
  Partial<Pick<Task, "trade" | "position" | "durationMinutes" | "scheduledDate" | "assignee" | "assigneeRef">>;
type Problem = { message: string; reload?: boolean };

class PlanRequestError extends Error {}

async function requestPlan<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...(body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new PlanRequestError(data.code);
  return data;
}

// The assignee goes only when the user changed it, so a linked crew member stays assigned.
export function editFields(fields: FormData, task: EditableTask): TaskChanges {
  const assignee = String(fields.get("assignee") ?? "").trim();
  return {
    position: Number(fields.get("position")),
    trade: String(fields.get("trade")).trim(),
    durationMinutes: Number(fields.get("duration")),
    scheduledDate: String(fields.get("day")) || null,
    ...(assignee !== (task.assignee ?? "").trim() && { assignee: assignee || null }),
  };
}

// An approved extra's edit names the approved revision it was planned from.
export function editCommand(plan: PlanView, task: EditableTask, changes: TaskChanges) {
  const variationRevisionId = plan.variationRevisions?.[task.scopeItemId];
  return { version: "work-plan-edit.v1", quoteRevisionId: plan.quoteRevisionId,
    expectedVersion: plan.version, taskKey: task.key, scopeItemId: task.scopeItemId, changes,
    ...(variationRevisionId && { variationRevisionId }) } as const;
}

function TaskForm({ task, positions, busy, save, cancel }: {
  task: EditableTask; positions: number; busy: boolean;
  save: (changes: TaskChanges) => void; cancel: () => void;
}) {
  return <form className="form" onSubmit={event => { event.preventDefault(); save(editFields(new FormData(event.currentTarget), task)); }}>
    <fieldset disabled={busy} className="field-pair" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label>Trade<input name="trade" defaultValue={task.trade} maxLength={100} required/></label>
      <label>Position<select name="position" defaultValue={task.position ?? positions}>
        {Array.from({ length: positions }, (_, i) => <option key={i}>{i + 1}</option>)}
      </select></label>
      <label>Duration (minutes)<input name="duration" type="number" min={1} max={2147483647} defaultValue={task.durationMinutes} required/></label>
      <label>Day<input name="day" type="date" defaultValue={task.scheduledDate ?? ""}/></label>
      <label>Assignee<input name="assignee" defaultValue={task.assignee ?? ""} maxLength={100}
        placeholder={task.assigneeRef ? "Crew member assigned" : undefined}/></label>
    </fieldset>
    <div className="form-actions">
      <button type="button" className="btn" onClick={cancel} disabled={busy}>Cancel</button>
      <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save task"}</button>
    </div>
  </form>;
}

const taskId = ({ scopeItemId, key }: EditableTask) => `${scopeItemId}/${key}`;
const stages = { draft: "Draft plan", accepted: "Accepted plan", live: "Live plan" };

export function WorkPlan({ jobId }: { jobId: string }) {
  const jobPath = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}`;
  const path = `${jobPath}/work-plan`;
  const [plan, setPlan] = useState<PlanView | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const editReplay = useRef<{ payload: string; commandId: string }>(null);
  const activationId = useRef<string>(null);

  // Each read takes a number; only the newest read may replace the card.
  const reads = useRef(0);
  const readPlan = useCallback(async () => {
    const read = ++reads.current;
    const view = await requestPlan<PlanView>(path);
    return { view, current: read === reads.current };
  }, [path]);
  const refresh = useCallback(() => {
    const read = reads.current + 1;
    readPlan().then(({ view, current }) => {
      if (current) setPlan(view);
    }).catch(error => {
      if (read !== reads.current) return;
      if (error instanceof PlanRequestError && error.message === "QUOTE_REVISION_NOT_FOUND") setPlan(null);
      else setProblem({ message: "The plan could not open. Your job is unchanged.", reload: true });
    });
  }, [readPlan]);

  useEffect(() => {
    refresh();
    return () => { reads.current++; };
  }, [refresh]);

  // Quote saves and lifecycle changes in the workspace below change the plan's source.
  useEffect(() => {
    const changed = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : (detail as { jobId?: unknown } | null)?.jobId;
      if (id === jobId) refresh();
    };
    const names = [JOB_SAVED_EVENT, "job-lifecycle-changed"];
    names.forEach(name => window.addEventListener(name, changed));
    return () => names.forEach(name => window.removeEventListener(name, changed));
  }, [jobId, refresh]);

  // An open task form belongs to the quote revision it was opened on.
  const revision = plan?.quoteRevisionId;
  useEffect(() => { setEditing(null); }, [revision]);

  function reload() {
    window.location.reload();
  }

  async function save(task: EditableTask, changes: TaskChanges) {
    if (!plan || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    setNotice("");
    const command = editCommand(plan, task, changes);
    const payload = JSON.stringify(command);
    if (editReplay.current?.payload !== payload) editReplay.current = { payload, commandId: crypto.randomUUID() };
    try {
      await requestPlan(path, { ...command, commandId: editReplay.current.commandId });
      editReplay.current = null;
      setEditing(null);
      setNotice("Task saved.");
      try {
        const { view, current } = await readPlan();
        if (current) setPlan(view);
      } catch {
        setProblem({ message: "The task was saved, but the updated plan could not open.", reload: true });
      }
    } catch (error) {
      const stale = error instanceof PlanRequestError && error.message === "WORK_PLAN_VERSION_CONFLICT";
      setProblem(stale
        ? { message: "The plan changed since you opened it. This edit was not saved.", reload: true }
        : { message: "The task save could not be confirmed. Try saving again." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function switchLive() {
    if (!plan || plan.state !== "accepted" || plan.acceptanceCancelled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    setNotice("");
    activationId.current ??= crypto.randomUUID();
    try {
      await requestPlan(`${jobPath}/quotes/activation`, {
        version: "practice-activation-command.v1", commandId: activationId.current, scenario: "no_charge",
      });
      const { view, current } = await readPlan();
      if (current) setPlan(view);
      window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: jobId }));
    } catch {
      setProblem({ message: "Switch live could not be confirmed. Reload the plan to check its status.", reload: true });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function taskEditor(task: EditableTask) {
    const existing = task.position !== undefined;
    const action = existing ? "Edit task" : "Plan task";
    return editing === taskId(task) && !problem?.reload
      ? <TaskForm task={task} positions={(plan?.tasks.length ?? 0) + Number(!existing)} busy={busy}
          save={changes => void save(task, changes)} cancel={() => { setEditing(null); setProblem(null); }}/>
      : <button type="button" className="btn small" aria-label={`${action} ${task.title}`} disabled={busy || problem?.reload}
          onClick={() => { setEditing(taskId(task)); setNotice(""); setProblem(null); }}>{action}</button>;
  }

  return <Card title="Plan" id="work-plan">
    {problem && <div className="card-body" role="alert"><Note tone="warning">{problem.message}
      {problem.reload && <div className="form-actions"><button type="button" className="btn small" onClick={reload}>Reload plan</button></div>}
    </Note></div>}
    {notice && <p className="card-body" role="status">{notice}</p>}
    {plan === undefined && !problem && <p className="card-body" role="status">Loading plan…</p>}
    {plan && <div className="card-body form">
      <div role="status"><Note><strong>{stages[plan.state]}</strong>{plan.acceptanceCancelled && " · Acceptance cancelled"}</Note></div>
      {plan.state === "accepted" && !plan.acceptanceCancelled &&
        <div className="form-actions"><button type="button" className="btn primary" disabled={busy || problem?.reload || editing !== null}
          onClick={() => void switchLive()}>Switch live</button></div>}
    </div>}
    {(plan === null || (plan && !plan.tasks.length && !plan.unplanned.length)) &&
      <Empty title="No planned tasks yet" text="Start with the scope from a quote revision."/>}
    {plan?.tasks.map(task => {
      const changed = plan.changes.added.some(row => taskId(row) === taskId(task)) ||
        plan.changes.changed.some(row => taskId(row.after) === taskId(task));
      return <article className="card-body" key={taskId(task)}>
        <h3>{task.position}. {task.title}</h3>
        <p>{task.trade} · {task.durationMinutes} min · {shortDate(task.scheduledDate ?? "") || "Day to set"}{task.assignee ? ` · ${task.assignee}` : task.assigneeRef ? " · Crew member assigned" : ""}</p>
        <div className="job-caption">
          <Tag tone={task.scheduledDate ? "green" : "amber"}>{task.scheduledDate ? "Scheduled" : "Planned"}</Tag>
          {changed && <Tag tone="amber">Changed since last quote revision</Tag>}
          {task.needsReview && <Tag tone="amber">Review previous edits</Tag>}
        </div>
        {taskEditor(task)}
      </article>;
    })}
    {!!plan?.changes.removed.length && <div className="card-body">
      <h3>Removed since last quote revision</h3>
      <ul>{plan.changes.removed.map(task => <li key={taskId(task)}>{task.title}{task.needsReview && " · Review previous edits"}</li>)}</ul>
    </div>}
    {!!plan?.unplanned.length && <div className="card-body">
      <h3>Unplanned</h3>
      {plan.unplanned.map(item => <article key={item.scopeItemId}>
        <h4>{item.title}</h4>
        <p>Needs a trade, duration and place in the plan</p>
        {taskEditor(item)}
      </article>)}
    </div>}
  </Card>;
}
