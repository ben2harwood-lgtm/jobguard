// V2-F7M: every piece of crew-link wording, as pure helpers (tested with renderToStaticMarkup, no jsdom).
export type CrewKind = "done" | "blocked" | "changed";

export const crewBlockedReasons = ["Materials not here", "No access to the room", "Earlier work not ready", "Something else"] as const;

export const crewKindLabel = (kind: CrewKind) => ({ done: "Done", blocked: "Blocked", changed: "Changed" })[kind];

export const crewPageHead = (trade: string, crewName: string) => ({
  kicker: "MY BRIEF · BY LINK",
  title: `Your ${trade} brief`,
  text: `For ${crewName} only. Practice job: nothing real is sent. No prices.`,
});

export const crewPageProblem = {
  refused: "This link has expired, was cancelled or was replaced. Nothing was recorded. Ask the builder for a new link.",
  problem: "Your brief could not open. Nothing you sent has changed. Try the link again later.",
  changed: "Your brief has changed. Ask the builder for the new one.",
  empty: "No work for you yet. The builder will send a new link when there is.",
  notSent: "Your update was not sent. Try again in a moment.",
  invalid: "That update can't be used. Check it and try again.",
};

export const crewProofNote = "The builder adds the proof photo.";
export const crewChangedNote = "Recorded only. This does not change the scope, the price or any order. The builder decides what happens next.";
export const crewSentNote = (kind: CrewKind) => `${crewKindLabel(kind)} sent to the builder. The builder confirms it on their screen.`;

/** Blocked joins the chosen reason and the optional note, as the M2 mock does. */
export const crewBlockedNote = (reason: string, note: string) => [reason, note.trim()].filter(Boolean).join(" · ");

/** Builder side. */
export const crewPressLabel = (kind: CrewKind, crewName: string) => `${crewKindLabel(kind)} by ${crewName}, by link`;
export const crewPressState = (confirmed: boolean) => confirmed ? "Confirmed" : "Not confirmed yet";
export const crewLinkState = (link: { cancelled: boolean; replaced: boolean; expiresAt: string | Date }, now: number) =>
  link.cancelled ? "Cancelled" : link.replaced ? "Replaced" : new Date(link.expiresAt).getTime() <= now ? "Expired"
    : `Expires ${new Date(link.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}`;
export const crewLinkOnce = "Copy this link now. It is shown once. Anyone with it can record updates for this trade until it expires.";
