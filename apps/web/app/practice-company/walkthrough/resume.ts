import { z } from "zod";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { quoteWorkspaceResponseV1 } from "@jobguard/api/quote-contracts";
import { variationWorkspaceResponseV1 } from "@jobguard/api/variation-contracts";
import { practiceInvoiceResponseV1 } from "@jobguard/api/customer-invoice-contracts";
import { finalCheckReadV1 } from "../../ui/final-check-reveal-view";
import { hasStartedWork } from "../../ui/workspace-lifecycle";

const uuid = z.string().uuid();
const proofViewV1 = z.object({ version: z.literal("practice-proof-view.v1"), jobId: uuid,
  completion: z.object({ id: uuid, reviewRequired: z.boolean() }).nullable() });
const deliveryViewV1 = z.object({ status: z.string() }).nullable();

async function read<T>(jobId: string, path: string, schema: z.ZodType<T>): Promise<T>;
async function read<T>(jobId: string, path: string, schema: z.ZodType<T>, notYet: number[]): Promise<T | null>;
async function read<T>(jobId: string, path: string, schema: z.ZodType<T>, notYet: number[] = []): Promise<T | null> {
  const response = await fetch(`/api/jobs/${jobId}/${path}`, { cache: "no-store" });
  if (notYet.includes(response.status)) return null;
  if (!response.ok) throw new Error("Your saved walkthrough could not load. Reload to try again; nothing was changed.");
  const value = schema.parse(await response.json());
  if (value && typeof value === "object" && "jobId" in value && value.jobId !== jobId) throw new Error("The saved job did not match this walkthrough.");
  return value;
}

/** URL IDs only select records. Completion always comes from authorized server reads,
 * never from a query-string step, local storage, or the presence of a job ID. */
export async function resumeWalkthrough(params: URLSearchParams) {
  const ownId = params.get("walkJob"), preparedId = params.get("walkExample");
  if (!ownId && !preparedId) return { capture: null, prepared: "", index: 0 };
  const capture = await read(uuid.parse(ownId), "proposal", captureWorkspaceResponseV1);
  if (!preparedId) {
    const quote = capture.status === "draft" ? null : await read(capture.jobId, "quotes", quoteWorkspaceResponseV1);
    return { capture, prepared: "", index: quote?.revisions.length ? 2 : 1 };
  }
  const prepared = uuid.parse(preparedId);
  const example = await read(prepared, "proposal", captureWorkspaceResponseV1);
  let index = 2;
  if (example.status !== "draft") {
    const delivery = await read(prepared, "quotes/delivery", deliveryViewV1);
    if (delivery?.status === "simulated_delivery") index = 3;
  }
  if (hasStartedWork(example.status)) {
    index = 4;
    const proof = await read(prepared, "proof", proofViewV1);
    if (proof.completion && !proof.completion.reviewRequired) {
      index = 5;
      const extras = await read(prepared, "variations", variationWorkspaceResponseV1);
      if (extras.approvedAdditionsPence === 12500) {
        index = 6;
        // Before the lock and Final Check run, the read is refused (403): that is "not done", not a failure.
        const check = await read(prepared, "final-check", finalCheckReadV1, [403, 404]);
        if (check?.state === "completed" && check.items.length === 0) {
          index = 7;
          const invoices = await read(prepared, "customer-invoices", practiceInvoiceResponseV1);
          if (invoices.invoices.some(invoice => invoice.balancePence === 0)) index = 8;
        }
      }
    }
  }
  return { capture, prepared, index };
}

export function rememberWalkJob(key: "walkJob" | "walkExample", jobId: string) {
  const url = new URL(location.href);
  url.searchParams.set(key, jobId);
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
