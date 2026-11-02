import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { openQuotingWatchdogJob } from "./helpers/capture-journey";
import { signInForChooser, releaseChooserSignIns } from "./helpers/chooser-sign-in";
import { detectMessages, issueLink, linkIssuer, openCustomer, portal, portalTenant, seedExtras, seedJob, seedStage } from "./helpers/customer-portal-journey";

// Real PostgreSQL + headless browser in CI, on both configured viewport projects.
// Only fictional setup inputs are seeded; links and approvals use their real writers.
test("MON-5 customer link through quote, extras, stage and builder message evidence", async ({page,browser,baseURL}) => {
  test.setTimeout(120_000);
  const admin = new Pool({connectionString:process.env.E2E_ADMIN_DATABASE_URL,max:1});
  const context = await browser.newContext({baseURL:baseURL!,viewport:page.viewportSize()});
  try {
    await openQuotingWatchdogJob(page);
    const job = (await page.getByTestId("workspace-job-id").getAttribute("data-job-id"))!;
    for (const name of ["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker"]) {
      const button = page.getByRole("button",{name,exact:true});
      await expect(button).toBeEnabled(); await button.click();
      if (name === "Save draft revision") await expect(page.getByTestId("quote-revision")).toHaveText("1");
    }
    const practice = (await page.context().cookies()).find(c => c.name === "jg_session")!;
    const digest = createHash("sha256").update(practice.value).digest("hex");
    await signInForChooser(page);
    const issuer = await linkIssuer(admin,page);
    const parties = await page.request.get(`/api/jobs/${job}/parties`);
    expect(parties.status()).toBe(200);
    const customer = (await parties.json()).currentIds.customerId as string;
    const other = await seedJob(admin,portalTenant,digest);
    const stage = await seedStage(admin,portalTenant,job);
    const link = await issueLink(admin,page,job,customer,issuer.csrf);
    const tab = await context.newPage();
    await tab.goto("/customer/sign-in");
    const refused = {status:401,body:{code:"CUSTOMER_REFUSED"}};
    // Valid-shaped forgery and another real customer's scope are indistinguishable.
    expect(await portal(tab,"signin",{...link.credential,token:"z".repeat(43)})).toEqual(refused);
    expect(await portal(tab,"signin",{...link.credential,customerId:other.customer})).toEqual(refused);
    const home = await context.newPage();
    const routes = await openCustomer(home,link.path);
    expect(await portal(tab,"signin",link.credential)).toEqual(refused);
    for (const jobId of [other.job,randomUUID()]) {
      for (const [action,version] of [["read","customer-read.v1"],["quote","customer-quote-read.v1"],["variations/read","customer-variations-read.v1"],["stages","customer-stages-read.v1"]]) {
        expect(await portal(tab,action!,{version,jobId})).toEqual(refused);
      }
      expect(await portal(tab,"messages",{version:"customer-portal-message.v1",jobId,commandId:randomUUID(),text:"Foreign job"})).toEqual(refused);
    }
    expect(await tab.evaluate(async () => (await fetch("/api/jobs")).status)).toBe(401);
    const quote = (await portal(tab,"quote",{version:"customer-quote-read.v1",jobId:job})).body;
    const acceptance = {version:"customer-quote-acceptance.v1",commandId:randomUUID(),jobId:job,expectedJobRevision:quote.jobRevision,
      target:{kind:"quote",id:quote.quote.id,revision:quote.quote.revision,hash:quote.quote.hash}};
    for (const target of [{...acceptance.target,revision:acceptance.target.revision+1},{...acceptance.target,hash:"0".repeat(64)}]) {
      expect(await portal(tab,"quote-accept",{...acceptance,target})).toEqual(refused);
    }
    expect(await portal(tab,"quote-accept",{...acceptance,expectedJobRevision:quote.jobRevision+1})).toEqual(refused);
    await admin.query("UPDATE app.job SET revision=revision+1 WHERE tenant_id=$1 AND id=$2",[portalTenant,job]);
    expect(await portal(tab,"quote-accept",acceptance)).toEqual(refused);
    await tab.goto(routes.quote);
    await expect(tab.getByRole("heading",{name:`${quote.quote.document.reference} · revision ${quote.quote.revision}`,exact:true})).toBeVisible();
    const quoteRequest = tab.waitForRequest(r => r.url().endsWith("/api/customer-portal/quote-accept") && r.method() === "POST");
    await tab.getByRole("button",{name:"Accept this quote",exact:true}).click();
    const accepted = (await quoteRequest).postDataJSON();
    await expect(tab.getByText("You accepted this quote.",{exact:true})).toBeVisible();
    expect(accepted.target).toEqual(acceptance.target);
    for (const result of await Promise.all([portal(tab,"quote-accept",accepted),portal(tab,"quote-accept",accepted)])) expect(result.status).toBe(200);
    expect((await admin.query("SELECT document_id,document_hash,acceptance_kind FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2",[portalTenant,job])).rows)
      .toEqual([{document_id:quote.quote.id,document_hash:quote.quote.hash,acceptance_kind:"customer_authenticated"}]);

    // Synthetic lifecycle input only, as in customer-signin; no fee or settlement.
    await admin.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2",[portalTenant,job]);
    const extras = await seedExtras(admin,portalTenant,job,issuer.member);
    await tab.goto(routes.extras);
    const approvedCommands: unknown[] = [];
    for (const x of extras) {
      const view = (await portal(tab,"variations/read",{version:"customer-variations-read.v1",jobId:job})).body;
      const command = {version:"customer-portal-approval.v1",commandId:randomUUID(),jobId:job,expectedJobRevision:view.jobRevision,
        target:{kind:"variation",id:x.id,revision:1,hash:x.hash,amount:{pence:5000,currency:"GBP"}}};
      for (const target of [{...command.target,revision:2},{...command.target,hash:"0".repeat(64)},{...command.target,amount:{pence:5001,currency:"GBP"}},{...command.target,id:randomUUID()}]) {
        expect(await portal(tab,"variation-approvals",{...command,target})).toEqual(refused);
      }
      expect(await portal(tab,"variation-approvals",{...command,expectedJobRevision:view.jobRevision+1})).toEqual(refused);
      await admin.query("UPDATE app.job SET revision=revision+1 WHERE tenant_id=$1 AND id=$2",[portalTenant,job]);
      expect(await portal(tab,"variation-approvals",command)).toEqual(refused);
      await tab.reload();
      const section = tab.locator("section").filter({has:tab.getByRole("heading",{name:x.description,exact:true})});
      await expect(section).toContainText(x.hash);
      const request = tab.waitForRequest(r => r.url().endsWith("/api/customer-portal/variation-approvals") && r.method() === "POST");
      await section.getByRole("button",{name:"Approve revision 1 for +£50.00",exact:true}).click();
      const approval = (await request).postDataJSON();
      approvedCommands.push(approval);
      await expect(section.getByText("Approved · authenticated customer",{exact:true})).toBeVisible();
      expect(approval.target).toEqual(command.target);
      for (const result of await Promise.all([portal(tab,"variation-approvals",approval),portal(tab,"variation-approvals",approval)])) expect(result.status).toBe(200);
      expect(await portal(tab,"variation-approvals",{...approval,commandId:randomUUID()})).toEqual(refused);
      expect((await admin.query("SELECT revision_id,content_hash,method,signed_delta_pence FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2",[portalTenant,x.id])).rows)
        .toEqual([{revision_id:x.revision,content_hash:x.hash,method:"customer_authenticated",signed_delta_pence:"5000"}]);
    }
    await tab.goto(routes.stages);
    await expect(tab.getByText(stage.objectVersion,{exact:true})).toBeVisible();
    const stageView = (await portal(tab,"stages",{version:"customer-stages-read.v1",jobId:job})).body.stages[0];
    expect(await portal(tab,"stage-acknowledge",{version:"customer-stage-acknowledge.v1",jobId:job,commandId:randomUUID(),completionId:stage.completion,snapshotHash:"0".repeat(64)})).toEqual(refused);
    const stageRequest = tab.waitForRequest(r => r.url().endsWith("/api/customer-portal/stage-acknowledge") && r.method() === "POST");
    await tab.getByRole("button",{name:"Acknowledge this recorded completion",exact:true}).click();
    const acknowledged = (await stageRequest).postDataJSON();
    await expect(tab.getByText("Historical acknowledgement recorded.",{exact:true})).toBeVisible();
    expect((await portal(tab,"stage-acknowledge",acknowledged)).status).toBe(200);
    expect((await admin.query("SELECT snapshot,snapshot_hash FROM app.customer_stage_acknowledgement WHERE tenant_id=$1 AND completion_id=$2",[portalTenant,stage.completion])).rows)
      .toEqual([{snapshot:stageView.snapshot,snapshot_hash:stageView.hash}]);

    const message = "Please fit an outside tap.";
    await home.getByLabel("Message",{exact:true}).fill(message);
    const messageRequest = home.waitForRequest(r => r.url().endsWith("/api/customer-portal/messages") && r.method() === "POST");
    await home.getByRole("button",{name:"Save message",exact:true}).click();
    const sentMessage = (await messageRequest).postDataJSON();
    await expect(home.getByRole("status")).toHaveText("Message saved for your builder with its evidence.");
    expect((await portal(home,"messages",sentMessage)).status).toBe(200);
    const builderMessages = async () => {
      const response = await page.request.get(`/api/jobs/${job}/customer-messages`);
      expect(response.status()).toBe(200); return response.json();
    };
    const before = await builderMessages();
    expect(before.messages).toContainEqual(expect.objectContaining({text:message,evidence:expect.objectContaining({sha256:createHash("sha256").update(message).digest("hex"),objectVersionId:expect.any(String)})}));
    await page.goto(`/jobs/${job}`);
    const messages = page.getByTestId("customer-messages");
    await expect(messages.getByTestId("customer-message")).toHaveCount(1);
    await expect(messages).toContainText(message);
    await expect(messages).toContainText(before.messages[0].evidence.id);
    await expect(messages).toContainText(before.messages[0].evidence.sha256);
    await expect(messages).toContainText(before.messages[0].evidence.objectVersionId);
    const hiddenId = randomUUID(), hiddenText = "Hidden fictional pre-lock signal";
    await admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),$5,'low','held_for_final_check')`,[portalTenant,job,hiddenId,randomUUID(),hiddenText]);
    expect(await builderMessages()).toEqual(before);
    await page.reload();
    await expect(messages.getByTestId("customer-message")).toHaveCount(1);
    await expect(page.getByText(hiddenText,{exact:false})).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(hiddenId);
    expect(JSON.stringify(before)).not.toContain(hiddenId); expect(JSON.stringify(before)).not.toContain(hiddenText);
    expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[portalTenant,job])).rows[0].n).toBe(0);
    const evidence = (await admin.query(`SELECT e.evidence_type,e.sha256,convert_from(o.bytes,'UTF8') text FROM app.customer_message_source s
      JOIN app.job_source_original o ON(o.tenant_id,o.source_id)=(s.tenant_id,s.id)
      JOIN app.evidence_object e ON(e.tenant_id,e.id)=(s.tenant_id,s.evidence_id) WHERE s.tenant_id=$1 AND s.job_id=$2`,[portalTenant,job])).rows;
    expect(evidence).toEqual([{evidence_type:"customer_message_text",sha256:createHash("sha256").update(message).digest("hex"),text:message}]);
    const safetyText = "There are exposed live wires beside the new socket.";
    await home.getByLabel("Message",{exact:true}).fill(safetyText);
    await home.getByRole("button",{name:"Save message",exact:true}).click();
    await expect(home.getByLabel("Message",{exact:true})).toHaveValue("");
    await detectMessages(admin,job,issuer.member,issuer.user);
    await detectMessages(admin,job,issuer.member,issuer.user);
    const firings = (await admin.query(`SELECT f.rule,s.state,s.disclosed_before_lock FROM app.shadow_must_surface_firing f
      JOIN app.shadow_commercial_signal s ON(s.tenant_id,s.id)=(f.tenant_id,f.signal_id) WHERE f.tenant_id=$1 AND f.job_id=$2`,[portalTenant,job])).rows;
    expect(firings).toEqual([{rule:"safety",state:"surfaced_early",disclosed_before_lock:true}]);
    const afterSafety = await builderMessages();
    expect(afterSafety.messages).toHaveLength(2);
    expect(JSON.stringify(afterSafety)).not.toContain(hiddenId);
    expect(JSON.stringify(afterSafety)).not.toContain(hiddenText);
    const audit = (await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'customer_portal.%'",[portalTenant])).rows;
    expect(audit.length).toBeGreaterThan(0);
    for (const privateValue of [message,safetyText,quote.quote.document.customer.email,quote.quote.document.customer.name,...quote.quote.document.customer.address,link.credential.token!].filter(Boolean)) expect(JSON.stringify(audit)).not.toContain(privateValue);

    expect((await portal(page,"revoke",{version:"customer-link-revoke.v1",tenantId:portalTenant,jobId:job,grantId:link.grant},issuer.csrf)).status).toBe(200);
    for (const command of approvedCommands) expect(await portal(tab,"variation-approvals",command)).toEqual(refused);
    expect(await portal(tab,"quote-accept",accepted)).toEqual(refused);
    expect(await portal(tab,"stage-acknowledge",acknowledged)).toEqual(refused);
    expect(await portal(tab,"signin",link.credential)).toEqual(refused);
    const expired = await issueLink(admin,page,other.job,other.customer,issuer.csrf);
    await admin.query("UPDATE app.customer_portal_grant SET issued_at=issued_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE tenant_id=$1 AND id=$2",[portalTenant,expired.grant]);
    expect(await portal(tab,"signin",expired.credential)).toEqual(refused);
    const staleJob = await seedJob(admin,portalTenant,digest);
    const stale = await issueLink(admin,page,staleJob.job,staleJob.customer,issuer.csrf);
    await admin.query(`INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload)
      SELECT tenant_id,$3,customer_id,2,payload FROM app.customer_revision WHERE tenant_id=$1 AND customer_id=$2 AND revision=1`,[portalTenant,staleJob.customer,randomUUID()]);
    expect(await portal(tab,"signin",stale.credential)).toEqual(refused);
  } finally { await context.close(); await admin.end(); await releaseChooserSignIns(); }
});
