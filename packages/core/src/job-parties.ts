import { z } from "zod";

export const customerTypes = ["person", "business", "landlord_or_agent", "insurer", "main_contractor", "housing_association", "local_authority"] as const;
const text = z.string().trim().min(1).max(160);
const optionalText = text.optional();
export const ukPostcodeV1 = z.string().trim().transform(value => value.toUpperCase().replace(/\s+/gu, ""))
  .pipe(z.string().regex(/^(GIR0AA|[A-PR-UWYZ](?:[0-9][0-9A-HJKPSTUW]?|[A-HK-Y][0-9][0-9ABEHMNPRVWXY]?)[0-9][ABD-HJLNP-UW-Z]{2})$/u))
  .transform(value => `${value.slice(0, -3)} ${value.slice(-3)}`);
export const customerV1 = z.object({ version: z.literal("customer.v1"), name: text, type: z.enum(customerTypes),
  email: z.string().trim().email().max(320).optional(), phone: z.string().trim().min(3).max(40).optional(),
  companyNumber: z.string().trim().regex(/^(?:\d{8}|[A-Z]{2}\d{6})$/u).optional(),
});
export type CustomerV1 = z.infer<typeof customerV1>;
export const isIndividual = (customer: Pick<CustomerV1, "type">): boolean => customer.type === "person";
export const siteV1 = z.object({ version: z.literal("site.v1"), addressLines: z.array(text).min(1).max(4), town: text,
  postcode: ukPostcodeV1, unit: optionalText, uprn: z.string().regex(/^\d{1,12}$/u).optional(),
});
export type SiteV1 = z.infer<typeof siteV1>;
const normalized = (value: string) => value.normalize("NFKC").toUpperCase().trim().replace(/\s+/gu, " ");
/** Length-safe JSON encoding prevents separator collisions; units remain part of UPRN keys. */
export function siteMatchKey(raw: unknown): string {
  const site = siteV1.parse(raw);
  return JSON.stringify(site.uprn ? ["uprn", site.uprn.replace(/^0+(?=\d)/u, ""), normalized(site.unit ?? "")]
    : ["address", site.postcode, site.addressLines.map(normalized), normalized(site.town), normalized(site.unit ?? "")]);
}
const uuid = z.string().uuid();
export const jobPartiesV1 = z.object({ version: z.literal("job-parties.v1"), customerRevisionId: uuid, siteRevisionId: uuid,
  payingPartyRevisionId: uuid.nullable().default(null),
});
export const jobPartiesCommandV1 = z.discriminatedUnion("action", [
  z.object({ version: z.literal("job-parties-command.v1"), commandId: uuid, action: z.literal("create_customer"), customer: customerV1 }),
  z.object({ version: z.literal("job-parties-command.v1"), commandId: uuid, action: z.literal("revise_customer"), customerId: uuid, expectedRevision: z.number().int().positive(), customer: customerV1 }),
  z.object({ version: z.literal("job-parties-command.v1"), commandId: uuid, action: z.literal("create_site"), site: siteV1,
    reuseSiteId: uuid.optional(), confirmSamePlace: z.boolean().default(false) }),
  z.object({ version: z.literal("job-parties-command.v1"), commandId: uuid, action: z.enum(["bind", "correct"]),
    expectedJobRevision: z.number().int().nonnegative(), parties: jobPartiesV1, reason: z.string().trim().min(1).max(500).optional() }),
]);
export type JobPartiesCommandV1 = z.infer<typeof jobPartiesCommandV1>;
export const jobPartiesSnapshotV1 = z.object({ version: z.literal("job-parties-snapshot.v1"), bindingId: uuid,
  customerRevisionId: uuid, siteRevisionId: uuid, payingPartyRevisionId: uuid,
  customer: customerV1, payingParty: customerV1, site: siteV1,
});
export type JobPartiesSnapshotV1 = z.infer<typeof jobPartiesSnapshotV1>;
export const jobPartiesWorkspaceV1 = z.object({ version: z.literal("job-parties-workspace.v1"), environment: z.literal("synthetic_demo"),
  jobId: uuid, jobRevision: z.number().int().nonnegative(), status: z.string(), current: jobPartiesSnapshotV1.nullable(),
  customers: z.array(z.object({ id: uuid, revisionId: uuid, revision: z.number().int().positive(), customer: customerV1 })),
  sites: z.array(z.object({ id: uuid, revisionId: uuid, site: siteV1, matchKey: z.string() })),
  recognition: z.array(z.object({ jobId: uuid, status: z.string(), startedAt: z.string().nullable(), endedAt: z.string().nullable() })),
  realExternalActions: z.literal(0),
});
export const jobPartiesImportV1 = z.object({ version: z.literal("job-parties-import.v1"), commandId: uuid, expectedBindingId: uuid });
export const jobPartiesCommandResultV1 = z.object({ version: z.literal("job-parties-command-result.v1"), environment: z.literal("synthetic_demo"),
  commandId: uuid, id: uuid, revisionId: uuid.optional(), revision: z.number().int().nonnegative().optional(), reused: z.boolean().optional(), realExternalActions: z.literal(0),
}).strict();
export const jobPartiesImportResultV1 = z.object({ version: z.literal("job-parties-import-result.v1"), environment: z.literal("synthetic_demo"),
  jobId: uuid, baselineId: uuid, sourceJobId: uuid, sourceBindingId: uuid, realExternalActions: z.literal(0),
  acceptedNetValuePence: z.number().int().nonnegative().max(1_000_000_000_000), recoveryCapPence: z.number().int().nonnegative().max(1_000_000_000_000),
  provenance: z.literal("imported"), lifecyclePoint: z.literal("live"), billing: z.literal("none"), historicFeesCreated: z.literal(0),
  lineageStrength: z.literal("builder_attested_weaker"), lineageLabel: z.string(),
}).strict();
export const jobPartiesListV1 = z.object({ version: z.literal("job-parties-list.v1"), environment: z.literal("synthetic_demo"),
  jobs: z.array(z.object({ id: uuid, title: z.string(), status: z.enum(["draft","quoting","accepted","live","invoiced","paid","lost"]), revision: z.number().int().nonnegative(), customerLabel: z.string(), siteLabel: z.string() })),
});
