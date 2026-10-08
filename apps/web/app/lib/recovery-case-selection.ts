/**
 * Which case the workbench shows after a command (M4-1-S-R repair 11, Sol P2-5).
 *
 * The server names the case the command itself changed (`affectedCaseId`). The refreshed list is read AFTER that command and can already hold cases that another
 * browser opened in the meantime, so the selection must never be inferred from the list. A command that only updates a case keeps the user's current choice;
 * the newest case is the fallback only when there is nothing valid to keep.
 */
export function selectedCaseAfterResponse(input: Readonly<{
  previous: string | undefined;
  cases: readonly { readonly id: string }[];
  affectedCaseId?: string;
  selectAffected: boolean;
}>): string | undefined {
  const listed = (id: string | undefined): id is string => id !== undefined && input.cases.some(item => item.id === id);
  if (input.selectAffected && listed(input.affectedCaseId)) return input.affectedCaseId;
  if (listed(input.previous)) return input.previous;
  return input.cases.at(-1)?.id;
}
