import { describe,expect,it } from "vitest";
import { SyntheticSubscriptionPaymentAdapter } from "./subscription-simulated-payment-adapter.js";
const work={version:"subscription-simulated-work.v1",environment:"synthetic_demo",workId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",statementId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",amountPence:4900,contentHash:"a".repeat(64),currency:"GBP"};
describe("synthetic subscription payment adapter",()=>{
 it("redirect never settles",async()=>{expect(await new SyntheticSubscriptionPaymentAdapter("redirect").execute(work)).toMatchObject({outcome:"redirect",synthetic:true});});
 it("duplicate simulated result has one effect",async()=>{const a=new SyntheticSubscriptionPaymentAdapter("settled");expect(await a.execute(work)).toEqual(await a.execute(work));});
 it("unknown outcome requires reconciliation",async()=>{const a=new SyntheticSubscriptionPaymentAdapter("outcome_unknown");expect(await a.execute(work)).toMatchObject({outcome:"outcome_unknown"});expect(await a.reconcile(work)).toMatchObject({outcome:"outcome_unknown"});});
 it("forged environments amounts and fields fail",async()=>{const a=new SyntheticSubscriptionPaymentAdapter();for(const extra of [{environment:"production"},{amountPence:16901},{executor:true}])await expect(a.execute({...work,...extra})).rejects.toThrow();});
});

import { vi } from "vitest";
import { SubscriptionExecutor } from "./subscription-executor.js";
it("executor does not call adapter again for an unknown durable attempt",async()=>{
 const repository={read:vi.fn().mockResolvedValue({attempts:[{work_id:work.workId}],results:[{work_id:work.workId,outcome:"outcome_unknown"}]}),command:vi.fn()};
 const adapter={execute:vi.fn(),reconcile:vi.fn()};
 await expect(new SubscriptionExecutor(repository as never,adapter).execute({} as never,"a".repeat(64),work.statementId,work.workId,1)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
 expect(adapter.execute).not.toHaveBeenCalled();expect(repository.command).not.toHaveBeenCalled();
});
it("executor persists unknown when adapter fails after durable claim",async()=>{
 const repository={read:vi.fn().mockResolvedValue({attempts:[]}),command:vi.fn().mockResolvedValueOnce(work).mockResolvedValueOnce({outcome:"outcome_unknown"})};
 const adapter={execute:vi.fn().mockRejectedValue(new Error("uncertain")),reconcile:vi.fn()};
 expect(await new SubscriptionExecutor(repository as never,adapter).execute({} as never,"a".repeat(64),work.statementId,work.workId,1)).toEqual({outcome:"outcome_unknown"});
 expect(repository.command.mock.calls[1]?.[3]).toMatchObject({kind:"record_simulation",outcome:"outcome_unknown",workId:work.workId});
});
it("an interrupted claimed attempt can reconcile without executing again",async()=>{
 const repository={read:vi.fn().mockResolvedValue({work:[{id:work.workId,statement_id:work.statementId,amount_pence:work.amountPence,content_hash:work.contentHash}],attempts:[{work_id:work.workId}],results:[]}),command:vi.fn().mockResolvedValue({outcome:"settled"})};
 const adapter={execute:vi.fn(),reconcile:vi.fn().mockResolvedValue({version:"subscription-simulated-result.v1",synthetic:true,workId:work.workId,resultId:work.statementId,outcome:"settled"})};
 expect(await new SubscriptionExecutor(repository as never,adapter).reconcile({} as never,"a".repeat(64),work.workId,1)).toEqual({outcome:"settled"});
 expect(adapter.execute).not.toHaveBeenCalled();expect(repository.command.mock.calls[0]?.[2]).not.toBe(work.statementId);expect(repository.command.mock.calls[0]?.[3]).toMatchObject({kind:"reconcile_simulation",outcome:"settled"});
});
