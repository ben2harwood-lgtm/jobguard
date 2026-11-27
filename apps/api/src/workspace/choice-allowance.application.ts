import { ChoiceAllowanceRepository, PracticeAccessError, choiceUuid, choiceVersionFinished,
  type ChoiceAllowanceCommand, type ChoiceAllowanceFact, type ChoiceAllowanceVersion, type ChoiceOutcome } from "@jobguard/db";
import type { Pool } from "pg";
import { PracticeAccess } from "../practice-access.js";
import { VariationApplication } from "../variation/variation.application.js";

export { ChoiceAllowanceError, choiceAllowanceCommandV1, type ChoiceAllowanceCommand,
  type ChoiceAllowanceReceipt } from "@jobguard/db";

type Variations = Pick<VariationApplication, "get" | "command">;
type Workspace = Awaited<ReturnType<VariationApplication["get"]>>;
type Variation = Workspace["variations"][number];

export const CHOICE_AGREED_WARNING = "Approved extra no longer matches this choice: raise a credit if needed";

export type ChoiceAllowanceView = {
  factId: string; question: string; neededBy: string; factStatus: string;
  late: "overdue" | "chosen_late" | null;
  allowance: { version: number; basis: "per_unit" | "total"; amount: string; quantity: string; unit: string; decideBy: string } | null;
  chosen: { item: string; amount: string } | null;
  draft: { variationId: string; revisionId: string | null; state: "being_drafted" | "awaiting_approval" | "approved" | "rejected";
    amount: string | null } | null;
  withdrawn: { variationId: string; rejectionId: string; reason: "superseded_by_choice_change"; outcome: ChoiceOutcome }[];
  warning: string | null;
  unfinished: string | null;
};

/** Exact pounds string from integer pence, for example 3600 -> "36.00". */
const pounds = (pence: number) => {
  const value = BigInt(pence), sign = value < 0n ? "-" : "", abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};

const approved = (variation: Variation) => variation.state === "approved" || variation.revisions.some(revision => revision.approved);
const errorCode = (error: unknown) => (error as { code?: string })?.code ?? (error instanceof Error ? error.message : "UNKNOWN");

// V2-E9. Main's variation command is called exactly as it is; this file never prices through propose,
// never approves, and never changes an approved variation.
export class ChoiceAllowanceApplication {
  private readonly access: PracticeAccess;
  private readonly choices: ChoiceAllowanceRepository;

  constructor(pool: Pool, private readonly sessionId?: string, private readonly variations: Variations = new VariationApplication(pool, sessionId)) {
    this.access = new PracticeAccess(pool, sessionId);
    this.choices = new ChoiceAllowanceRepository(pool);
  }

  /** Finishes any unfinished choice change first, then shows each customer choice with its allowance. */
  async read(jobId: string): Promise<ChoiceAllowanceView[]> {
    const { context } = await this.authorize(jobId);
    const unfinished = await this.reconcile(context, jobId);
    return this.view(await this.choices.read(context, jobId), await this.variations.get(jobId), unfinished);
  }

  async command(jobId: string, command: ChoiceAllowanceCommand) {
    const { context } = await this.authorize(jobId);
    // Another choice that can't be finished never blocks this one; this choice's own failure is reported.
    const target = (command as { factId?: unknown })?.factId;
    await this.reconcile(context, jobId, target);
    const receipt = await this.choices.set(context, jobId, this.sessionId!, command);
    const unfinished = await this.reconcile(context, jobId, receipt.factId);
    return { receipt, choices: this.view(await this.choices.read(context, jobId), await this.variations.get(jobId), unfinished) };
  }

  private async reconcile(context: Parameters<ChoiceAllowanceRepository["read"]>[0], jobId: string, strictFor: unknown = null) {
    const unfinished = new Map<string, string>();
    for (const fact of await this.choices.read(context, jobId)) {
      const latest = fact.versions.at(-1);
      if (!latest || choiceVersionFinished(latest)) continue;
      try { await this.finish(context, jobId, fact, latest); }
      catch (error) {
        if (typeof strictFor === "string" && strictFor.toLowerCase() === fact.factId) throw error;
        unfinished.set(fact.factId, errorCode(error));
      }
    }
    return unfinished;
  }

  // Each step repeats safely with the same ids: reject is idempotent on its rejection id, propose replays on
  // its proposal id, and an exact committed revise returns early. A step row is written only after its effect.
  private async finish(context: Parameters<ChoiceAllowanceRepository["read"]>[0], jobId: string,
    fact: ChoiceAllowanceFact, version: ChoiceAllowanceVersion) {
    const sessionId = this.sessionId!;
    const step = (name: "current" | "proposed" | "priced", outcome: ChoiceOutcome | null = null) =>
      this.choices.step(context, jobId, sessionId, { factId: fact.factId, version: version.version, step: name, outcome });
    let outcome = version.steps.find(entry => entry.step === "current")?.outcome ?? null;
    if (!version.steps.some(entry => entry.step === "current")) {
      // Withdraw first, so an old excess can't stay approvable once the new choice is current.
      outcome = version.withdrawVariationId ? await this.withdraw(jobId, version.withdrawVariationId, version.rejectionId!) : null;
      await step("current", outcome);
    }
    if (version.draftKind !== "new" || outcome === "kept_agreed") return;
    const proposalId = version.proposalId!, revisionId = version.revisionId!;
    const description = `Over allowance: ${fact.question}`.slice(0, 500);
    if (!version.steps.some(entry => entry.step === "proposed")) {
      const rate = version.basis === "per_unit" ? ` per ${version.unit}` : "";
      await this.variations.command(jobId, { version: "variation-command.v1", action: "propose", proposalId,
        scopeItemId: choiceUuid(proposalId, "scope"), existingScopeItemId: null, lineageParentScopeItemId: null, description,
        captureText: `Customer chose ${version.chosenItem} at £${pounds(version.chosenPence!)}${rate} against an allowance of ` +
          `£${pounds(version.allowancePence)}${rate}${version.basis === "per_unit" ? `, ${version.quantity} ${version.unit}` : ""}.`,
        price: null });
      await step("proposed");
    }
    const current = async () => (await this.variations.get(jobId)).variations.find(item => item.id === proposalId)?.currentRevisionId;
    const before = await current();
    // If the builder priced the draft in Extras before E9 could, their revision stands: E9 never overwrites it.
    if (before === null || before === undefined) {
      try {
        await this.variations.command(jobId, { version: "variation-command.v1", action: "revise", variationId: proposalId, revisionId,
          expectedRevisionId: null, description, price: { quantity: version.quantity, unit: version.unit,
            unitRatePence: version.excessRatePence!, direction: "addition" } });
      } catch (error) {
        // A racing twin, or the builder, may have priced it first.
        const after = await current();
        if (after === null || after === undefined) throw error;
      }
    }
    await step("priced");
  }

  private async withdraw(jobId: string, variationId: string, rejectionId: string): Promise<ChoiceOutcome> {
    const find = async () => {
      const variation = (await this.variations.get(jobId)).variations.find(item => item.id === variationId);
      if (!variation) throw new PracticeAccessError("NOT_FOUND");
      return variation;
    };
    const before = await find();
    if (approved(before)) return "kept_agreed";
    if (before.state === "rejected") return "withdrawn";
    try {
      // The variation's current revision is read back, never assumed.
      await this.variations.command(jobId, { version: "variation-command.v1", action: "reject", variationId,
        revisionId: before.currentRevisionId, rejectionId });
    } catch (error) {
      const after = await find();
      if (approved(after)) return "kept_agreed";
      // This rejection id is E9's own. A conflict on it while a revision is already rejected means the
      // withdrawal committed earlier and the builder has since re-priced the extra: the withdrawal stands.
      if (errorCode(error) === "VARIATION_COMMAND_CONFLICT" && after.revisions.some(revision => revision.rejected)) return "withdrawn";
      if (after.state !== "rejected") throw error;
    }
    return "withdrawn";
  }

  private view(facts: ChoiceAllowanceFact[], workspace: Workspace, unfinished: Map<string, string>): ChoiceAllowanceView[] {
    return facts.map(fact => {
      const current = [...fact.versions].reverse().find(version => version.steps.some(step => step.step === "current")) ?? null;
      const kept = fact.versions.some(version => version.steps.some(step => step.outcome === "kept_agreed"));
      const draftVersion = current && current.proposalId &&
        current.steps.find(step => step.step === "current")?.outcome !== "kept_agreed" ? current : null;
      const variation = draftVersion ? workspace.variations.find(item => item.id === draftVersion.proposalId) : undefined;
      const revision = variation?.revisions.find(item => item.id === variation.currentRevisionId);
      return {
        factId: fact.factId, question: fact.question, neededBy: fact.neededBy, factStatus: fact.factStatus,
        late: fact.overdue ? "overdue" : current?.chosenLate ? "chosen_late" : null,
        allowance: current && { version: current.version, basis: current.basis, amount: pounds(current.allowancePence),
          quantity: current.quantity, unit: current.unit, decideBy: current.decideBy },
        chosen: current?.chosenItem ? { item: current.chosenItem, amount: pounds(current.chosenPence!) } : null,
        draft: draftVersion ? { variationId: draftVersion.proposalId!, revisionId: revision?.id ?? null,
          state: !variation || !revision ? "being_drafted" : approved(variation) ? "approved" : variation.state === "rejected" ? "rejected" : "awaiting_approval",
          amount: revision ? pounds(revision.signedDeltaPence) : null } : null,
        withdrawn: fact.versions.flatMap(version => {
          const outcome = version.steps.find(step => step.step === "current")?.outcome;
          return version.withdrawVariationId && outcome ? [{ variationId: version.withdrawVariationId, rejectionId: version.rejectionId!,
            reason: version.rejectionReason!, outcome }] : [];
        }),
        warning: kept ? CHOICE_AGREED_WARNING : null,
        unfinished: unfinished.get(fact.factId) ?? (fact.versions.at(-1) && !choiceVersionFinished(fact.versions.at(-1)!) ? "UNFINISHED" : null),
      };
    });
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.access.job(jobId);
  }
}
