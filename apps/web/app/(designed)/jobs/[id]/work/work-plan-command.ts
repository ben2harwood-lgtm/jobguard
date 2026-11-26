// Pure helpers for the Plan card, kept apart so they can be tested without a browser.
export type ExtraNotPlanned = {
  scopeItemId: string; title: string; reason: "omission" | "direction_unknown"; planningDropped: boolean;
};

/** The plain reason an approved extra is not on the plan. */
export function extraNotPlannedReason(extra: ExtraNotPlanned) {
  const reason = extra.reason === "omission"
    ? "removed work, nothing to plan"
    : "no price change: say whether it adds or removes work";
  return extra.planningDropped ? `${reason} · planning on this extra was set aside` : reason;
}
