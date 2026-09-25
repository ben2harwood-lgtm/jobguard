import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createSyntheticInvoicePdf, money } from "@jobguard/core";

/** Test setup only: writes actual source rows with foreign keys/triggers enabled. */
export async function seedEvidencePackFixture(admin: Pool, options: { withVariation?: boolean } = {}) {
  const tenantId = randomUUID(), otherTenantId = randomUUID(), jobId = randomUUID(), otherJobId = randomUUID();
  const memberId = randomUUID(), accountId = randomUUID(), identityId = randomUUID(), scopeId = randomUUID();
  const quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID(), acceptanceId = randomUUID();
  const proofId = randomUUID(), uploadId = randomUUID(), variationId = randomUUID(), variationRevisionId = randomUUID();
  const merchantId = randomUUID(), skuId = randomUUID(), rateId = randomUUID();
  const invoiceId = randomUUID(), supplierInvoiceId = randomUUID(), supplierDeliveryId = randomUUID();
  const supplierInvoiceVersionId = randomUUID(), supplierDeliveryVersionId = randomUUID(), unrelatedSupplierVersionId = randomUUID();
  const caseId = randomUUID(), customerCaseId = randomUUID(), badReferenceCaseId = randomUUID(), crossJobReferenceCaseId = randomUUID(), emptyCaseId = randomUUID();
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const proofBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=", "base64"), proofHash = createHash("sha256").update(proofBytes).digest("hex");
  const db = await admin.connect();
  try {
    await db.query("BEGIN");
    await db.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantId, otherTenantId]);
    await db.query("INSERT INTO identity.identity_user(id) VALUES($1)", [identityId]);
    await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Evidence fixture builder')", [accountId, tenantId]);
    await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [memberId, tenantId, accountId, identityId]);
    await db.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$3,'Evidence fixture job'),($2,$3,'Unrelated fixture job')", [jobId, otherJobId, tenantId]);
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
    await db.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, tenantId, jobId]);
    await db.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',1880000,0,1880000,376000,2256000,true,'[]')", [quoteRevisionId, tenantId, jobId, quoteDraftId]);
    await db.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'FIXTURE-QUOTE-1',$5,'fixture/quote','quote-object-v1',1,'{}','{}',$6)", [quoteId, tenantId, jobId, quoteRevisionId, hash("quote immutable fixture"), {netPence:1880000,taxPence:376000,totalPence:2256000}]);
    await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, tenantId, jobId, hash("quote immutable fixture")]);
    await db.query("UPDATE app.job SET accepted_quote_version_id=$1,status='accepted' WHERE tenant_id=$2 AND id=$3", [quoteId,tenantId,jobId]);
    await db.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional Customer','verbal','2026-09-20T12:00:00Z')", [acceptanceId, tenantId, jobId, quoteId, hash("quote immutable fixture"), memberId]);
    await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof',$5,'image/png',$6,'standard_evidence','verified','proof-object-v1',now(),now()+interval '1 hour')", [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await db.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof','proof-object-v1','synthetic_demo','image/png',$5)", [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof','proof-object-v1',$6,$7,'image/png','standard_evidence',now(),now())", [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);
    if (options.withVariation !== false) {
    await db.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,$4,'text','Fictional additional work','Synthetic fixture extra','approved')", [variationId, tenantId, jobId, scopeId]);
    await db.query("INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Synthetic fixture extra','1','each',12500,12500,$6,$7,'human_entered','fixture',$6,'fixture.v1')", [variationRevisionId, tenantId, jobId, variationId, scopeId, hash("approved variation fixture"), memberId]);
    await db.query("INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,12500,'builder_attestation',$7,now())", [randomUUID(), tenantId, jobId, variationId, variationRevisionId, hash("approved variation fixture"), memberId]);
    }
    await db.query("INSERT INTO app.merchant(id,tenant_id,name) VALUES($1,$2,'Fictional supplier')", [merchantId, tenantId]);
    await db.query("INSERT INTO app.merchant_sku(id,tenant_id,merchant_id,sku,description,base_unit) VALUES($1,$2,$3,'FIXTURE-320','Fictional fixture material','each')", [skuId, tenantId, merchantId]);
    await db.query("INSERT INTO app.material_rate_revision(id,tenant_id,merchant_id,sku_id,version,price_pence,currency,price_unit,tax_basis,effective_from,source_label) VALUES($1,$2,$3,$4,1,2000,'GBP','each','net','2026-09-01','FIXTURE-AG-320')", [rateId, tenantId, merchantId, skuId]);
    await db.query("INSERT INTO app.material_requirement(id,tenant_id,job_id,scope_item_id,sku_id,quantity_decimal,unit,revision) VALUES($1,$2,$3,$4,$5,'40','each',1)", [randomUUID(), tenantId, jobId, scopeId, skuId]);
    for (const [id,versionId,sourceJob,type,number] of [[supplierInvoiceId,supplierInvoiceVersionId,jobId,"invoice","FIXTURE-INV-320"],[supplierDeliveryId,supplierDeliveryVersionId,jobId,"delivery","FIXTURE-DN-320"],[randomUUID(),unrelatedSupplierVersionId,otherJobId,"invoice","OTHER-JOB-INVOICE"]]) {
      const contentHash = hash(number!);
      await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status) VALUES($1,$2,$3,'fictional-merchant',$4,$5,$6,'ready')", [id,tenantId,sourceJob,type,number,contentHash]);
      await db.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'text/plain',1,$5,1)", [versionId,tenantId,sourceJob,id,contentHash]);
    }
    const finalDraft = randomUUID(), finalRevision = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
    await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [finalDraft,tenantId,jobId]);
    await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')", [finalRevision,tenantId,jobId,finalDraft,hash("final account fixture"),quoteId]);
    const invoiceBytes = Buffer.from(createSyntheticInvoicePdf({ invoiceNumber: "FIXTURE-INVOICE-1", issuerName: "Fictional fixture builder", total: money(2256000), sourceRevisionId: finalRevision, evidenceVersionIds: ["proof-object-v1"] }));
    await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')", [decision,tenantId,jobId]);
    await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution,tenantId,decision,memberId]);
    await db.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'final_account.issue','fixture@example.invalid',$6,1,2256000,'GBP','candidate_m1_standard_v1',now()+interval '1 hour')", [authorization,tenantId,decision,resolution,memberId,createHash("sha256").update(invoiceBytes).digest("hex")]);
    await db.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,'FIXTURE-INVOICE-1','2026-09-20','{}','candidate_m1_standard_v1','GBP',1880000,376000,2256000,$6,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')", [invoiceId,tenantId,jobId,finalRevision,authorization,hash("final account fixture"),createHash("sha256").update(invoiceBytes).digest("hex"),invoiceBytes]);
    for (const [id,sourceJob,type,refs] of [[caseId,jobId,"merchant_overcharge",[rateId,supplierInvoiceId,supplierDeliveryId]],[customerCaseId,jobId,"withheld_customer_payment",[invoiceId]],[badReferenceCaseId,jobId,"merchant_overcharge",["not-a-real-source"]],[crossJobReferenceCaseId,jobId,"merchant_overcharge",[unrelatedSupplierVersionId]],[emptyCaseId,otherJobId,"merchant_overcharge",[]]] as const) {
      await db.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,$4,'Fictional counterparty',$5,$6,$7)", [id,tenantId,sourceJob,type,type === "merchant_overcharge" ? "supplier_cost" : "builder_customer",type === "merchant_overcharge" ? "supplier_documents" : "customer_invoice",JSON.stringify(refs)]);
      await db.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)", [randomUUID(),tenantId,sourceJob,id,hash(id)]);
    }
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
  return { tenantId,otherTenantId,jobId,otherJobId,memberId,scopeId,caseId,customerCaseId,badReferenceCaseId,crossJobReferenceCaseId,emptyCaseId,quoteId,acceptanceId,proofId,proofBytes,variationId,variationRevisionId,invoiceId,supplierInvoiceId,supplierDeliveryId,supplierInvoiceVersionId,supplierDeliveryVersionId,unrelatedSupplierVersionId,rateId };
}
