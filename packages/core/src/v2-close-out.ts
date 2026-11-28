/**
 * V2-G6: "Before you close this job". A read-only list of what is still open on a V2 practice job, worked out on
 * read from existing records. Nothing here is stored, priced or totalled; the final account, lock, Final Check and
 * invoices stay main's.
 */
export type V2CloseOutKind = "open_tasks" | "extras_not_planned" | "stage_drafts_open" | "proof_missing";

export type V2CloseOutFacts = {
  readonly jobId: string;
  /** Effective work-plan tasks with no recorded "done". */
  readonly openTasks: number;
  /** Approved extras the plan could not place (the work plan's extrasNotPlanned). */
  readonly extrasNotPlanned: number;
  /** K5B-1 stage invoice drafts with no withdrawal. */
  readonly stageDraftsOpen: number;
  /** mandatory_proof_missing findings on the final account's current revision (none before a draft exists). */
  readonly proofMissing: number;
};

export type V2CloseOutItem = {
  readonly kind: V2CloseOutKind;
  readonly blocking: boolean;
  readonly count: number;
  readonly label: string;
  readonly href: string;
};

export type V2CloseOutReview = { readonly jobId: string; readonly blocking: boolean; readonly items: readonly V2CloseOutItem[] };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Plain words for each item. */
export function v2CloseOutLabel(kind: V2CloseOutKind, count: number): string {
  switch (kind) {
    case "open_tasks": return `${plural(count, "plan task is", "plan tasks are")} not marked done`;
    case "extras_not_planned": return `${plural(count, "approved extra is", "approved extras are")} not in the plan`;
    case "stage_drafts_open": return `${plural(count, "stage invoice draft is", "stage invoice drafts are")} not withdrawn. Withdraw ${count === 1 ? "it" : "them"} before you lock the account`;
    case "proof_missing": return `${plural(count, "piece of required proof is", "pieces of required proof are")} missing`;
  }
}

const order: readonly V2CloseOutKind[] = ["stage_drafts_open", "open_tasks", "extras_not_planned", "proof_missing"];

/**
 * Everything is a warning except a live stage draft: the lock refuses while one exists (V2_STAGE_DRAFT_OPEN), so a
 * draft can never become a second bill for work the final invoice covers.
 */
export function v2CloseOutReview(facts: V2CloseOutFacts): V2CloseOutReview {
  const counts: Record<V2CloseOutKind, number> = { open_tasks: facts.openTasks, extras_not_planned: facts.extrasNotPlanned,
    stage_drafts_open: facts.stageDraftsOpen, proof_missing: facts.proofMissing };
  const job = encodeURIComponent(facts.jobId);
  const href: Record<V2CloseOutKind, string> = { open_tasks: `/jobs/${job}/work`, extras_not_planned: `/jobs/${job}/work`,
    stage_drafts_open: `/jobs/${job}/money#payment-schedule-heading`, proof_missing: `/jobs/${job}/work#final-account-title` };
  const items = order.flatMap(kind => {
    const count = counts[kind];
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("V2_CLOSE_OUT_FACTS_INVALID");
    return count ? [{ kind, blocking: kind === "stage_drafts_open", count, label: v2CloseOutLabel(kind, count), href: href[kind] }] : [];
  });
  return { jobId: facts.jobId, blocking: items.some(item => item.blocking), items };
}
