// V2-F3: every piece of change-draft wording, as pure helpers (tested with renderToStaticMarkup, no jsdom).
export const pounds = (pence: number) => `${pence < 0 ? "−" : ""}£${(Math.abs(pence) / 100).toFixed(2)}`;

/** "95" or "95.5" or "95.50" to whole pence; anything else is null. */
export function penceFromPounds(text: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/u.exec(text.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

export const changePriceLine = (draft: { direction: "addition" | "omission"; delta: string; unit: string; unitRatePence: number; previewPence: number }) =>
  `${draft.direction === "addition" ? "Extra" : "Less"} ${draft.delta} ${draft.unit} at ${pounds(draft.unitRatePence)} per ${draft.unit} = ${pounds(draft.previewPence)} (you confirm the rate)`;

export const changeTimeLine = (title: string, minutes: number) => `Extra time: ${title} +${minutes} min`;

export function changeMaterialsLine(tasks: { proposedMinutes?: number; materialNeeds: readonly string[] }[]) {
  const needs = [...new Set(tasks.flatMap(task => task.materialNeeds))];
  return needs.length ? `Will need more: ${needs.join(", ")}` : "";
}

export const changeDescription = (line: string, quantity: string, unit: string) => `Change ${line} to ${quantity} ${unit}`;

export function changeStateLabel(row: { state: string; current: boolean; linked: boolean; timeOnPlan: boolean; tasks: { proposedMinutes: number }[] }) {
  if (!row.current) return "Replaced by a newer version";
  if (row.state === "rejected") return "Customer said no";
  if (row.state === "approved") return row.timeOnPlan || !row.tasks.some(task => task.proposedMinutes > 0)
    ? "Agreed. Extra time is on the plan" : "Agreed. Extra time not on the plan yet";
  return row.linked ? "Sent for approval. Not agreed yet" : "Waiting to send for approval";
}

export const changePendingNote = "Pending changes are not in the agreed scope, the plan or any brief until the customer agrees.";
export const changeProblem: Record<string, string> = {
  CHANGE_DRAFT_NO_CHANGE: "That is the quantity already agreed.",
  CHANGE_DRAFT_LINE_UNPRICED: "This line has no quantity, unit or rate. Enter a rate to price the change.",
  CHANGE_DRAFT_INVALID_QUANTITY: "Enter the new total as a number, up to six decimal places.",
  CHANGE_DRAFT_VERSION_CONFLICT: "This change moved on since the page loaded. It has reloaded; check and try again.",
  CHANGE_DRAFT_COMMAND_CONFLICT: "This change moved on since the page loaded. It has reloaded; check and try again.",
  CHANGE_DRAFT_NOT_APPROVED: "The customer has not agreed this version yet.",
  CHANGE_DRAFT_FORBIDDEN: "Only the firm's owner can price a change, on a live job.",
};
export const changeProblemText = (code: string | undefined) => (code && changeProblem[code]) || "Not saved. Try again.";
