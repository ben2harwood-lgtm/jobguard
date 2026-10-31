import { jobDoorsDatabase } from "./lp-job-doors-fixtures.js";
export const lp3OldSignatures = [
  "app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,character varying,character varying,character varying,uuid,timestamp with time zone)",
  "app.record_simulated_settlement(uuid,uuid,uuid,character varying,bigint,timestamp with time zone)",
  "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)",
  "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)",
] as const;
export const lp3NewSignatures = lp3OldSignatures.map((signature, index) =>
  signature.slice(0, -1) + (index === 1 ? ",uuid" : "") + ",uuid,uuid)");

export const lp3CatalogDatabase=()=>jobDoorsDatabase();
