// V2-G1: every piece of snag-register wording, as pure helpers (tested with renderToStaticMarkup, no jsdom).
export type RegisterPerson = { kind: "builder" } | { kind: "crew"; crewId: string; name: string; trade: string } | { kind: "unknown" };
type Event = { sequence: number; kind: "fixed" | "checked" | "reopened" };

export const snagFinalAccountNote = "Checking a snag does not approve the final account.";
export const snagCheckerAlert = "Choose someone other than the person who fixed it.";
// M3's empty and problem wording (V2-G7).
export const snagEmptyTitle = "No snags recorded yet";
export const snagEmpty = "Add a snag with an owner, due date and photo when you find one.";
export const snagLoadProblem = "Snags could not load. Sign in to the right practice firm and try again. Nothing new was recorded or sent.";
export const snagProblem: Record<string, string> = {
  V2_SNAG_CHECKER_IS_FIXER: snagCheckerAlert,
  V2_SNAG_NOTHING_OUTSTANDING: "A checked snag has nothing left to agree.",
  V2_SNAG_CREW_UNAVAILABLE: "That crew member isn't in your firm's crew list.",
  SNAG_TRANSITION_REFUSED: "The snag changed since the page loaded. It has reloaded; check and try again.",
  SNAG_COMMAND_CONFLICT: "The snag changed since the page loaded. It has reloaded; check and try again.",
  V2_SNAG_COMMAND_CONFLICT: "The snag changed since the page loaded. It has reloaded; check and try again.",
  JOB_NOT_LIVE: "Snags can be recorded once the job is live.",
};
export const snagProblemText = (code: string | undefined) => (code && snagProblem[code]) || "Not saved. Try again.";

/** "2026-12-04" as "4 Dec". */
export function snagDue(dueOn: string | null) {
  if (!dueOn) return null;
  const [year, month, day] = dueOn.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const personName = (person: RegisterPerson | undefined) =>
  !person || person.kind === "unknown" ? "person not recorded" : person.kind === "builder" ? "The builder" : person.name;

export function snagOwnerLine(snag: { owner: { name: string } | null; assigneeLabel: string | null; dueOn: string | null }) {
  const who = snag.owner?.name ?? snag.assigneeLabel ?? "not set", due = snagDue(snag.dueOn);
  return `Owner: ${who}${due ? ` · due ${due}` : ""}`;
}

/** The person on the fixed event the snag is now on, and on its check, if any. */
export function snagPeople(snag: { events: readonly Event[]; people: Record<number, RegisterPerson> }) {
  const events = [...snag.events].sort((a, b) => a.sequence - b.sequence);
  const reopened = Math.max(0, ...events.filter(e => e.kind === "reopened").map(e => e.sequence));
  const fixed = events.filter(e => e.kind === "fixed" && e.sequence > reopened).at(-1);
  const checked = events.filter(e => e.kind === "checked" && e.sequence > reopened).at(-1);
  return { fixer: fixed ? snag.people[fixed.sequence] ?? { kind: "unknown" as const } : null,
    checker: checked ? snag.people[checked.sequence] ?? { kind: "unknown" as const } : null };
}

export const fixedTag = (fixer: RegisterPerson | null) => `Fixed: ${fixer ? personName(fixer) : "No"}`;
export const checkedTag = (checker: RegisterPerson | null) => `Checked: ${checker ? `${personName(checker)} · second person` : "No"}`;

export const samePerson = (a: RegisterPerson | null, b: RegisterPerson | null) => !!a && !!b && a.kind === b.kind && a.kind !== "unknown"
  && (a.kind !== "crew" || (b.kind === "crew" && a.crewId === b.crewId));

export const checkerOption = (name: string, isFixer: boolean) => `${name} · ${isFixer ? "fixed this snag" : "second person"}`;
export const agreedLine = (note: string) => `Agreed to leave open at handover: ${note}`;
