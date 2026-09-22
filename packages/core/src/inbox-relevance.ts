import type { Money } from "./money.js";

export const INBOX_GROUPING_VERSION = "inbox-grouping.v1" as const;
export type FindingLane = "mandatory" | "advisory";
export type InboxFinding = Readonly<{
  findingId:string; findingRevision:number; jobId:string; lane:FindingLane; ruleId:string; ruleRevision:string;
  action:string; recipient:string|null; amount:Money|null; sourceRevision:string; sourceReference:string;
  title:string; explanation:string; permittedAction:string;
}>;
export type GroupedDecision = Readonly<{key:string;lane:FindingLane;jobId:string;title:string;explanation:string;permittedAction:string;amount:Money|null;sources:readonly string[];findingIds:readonly string[]}>;
const part=(value:string|null|number)=>`${String(value).length}:${String(value)}`;
export function coalescingKey(f:InboxFinding):string {
  return [f.jobId,f.lane,f.ruleId,f.ruleRevision,f.action,f.recipient??"",f.amount?.currency??"",f.amount?.pence??"",f.sourceRevision].map(part).join("|");
}
export function groupInbox(findings:readonly InboxFinding[],advisoryBudget:number):Readonly<{mandatory:readonly GroupedDecision[];advisory:readonly GroupedDecision[];availableAdvisory:number}> {
  if(!Number.isSafeInteger(advisoryBudget)||advisoryBudget<0)throw new Error("INVALID_ADVISORY_BUDGET");
  const groups=new Map<string,GroupedDecision>();
  for(const f of findings){
    if(f.findingRevision<1||!f.ruleRevision||!f.sourceRevision)throw new Error("INVALID_FINDING_REVISION");
    const key=coalescingKey(f),old=groups.get(key);
    groups.set(key,old?Object.freeze({...old,sources:Object.freeze([...old.sources,f.sourceReference]),findingIds:Object.freeze([...old.findingIds,f.findingId])}):Object.freeze({key,lane:f.lane,jobId:f.jobId,title:f.title,explanation:f.explanation,permittedAction:f.permittedAction,amount:f.amount,sources:Object.freeze([f.sourceReference]),findingIds:Object.freeze([f.findingId])}));
  }
  const ordered=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
  const mandatory=ordered.filter(x=>x.lane==="mandatory"),allAdvisory=ordered.filter(x=>x.lane==="advisory");
  return Object.freeze({mandatory:Object.freeze(mandatory),advisory:Object.freeze(allAdvisory.slice(0,advisoryBudget)),availableAdvisory:allAdvisory.length});
}
export type OutcomeEvent=Readonly<{eventId:string;commandId:string;ruleId:string;ruleRevision:string;findingRevision:number;kind:"created"|"dismissed"|"approved";occurredAt:string}>;
export function sourceMetrics(events:readonly OutcomeEvent[],clock:Readonly<{version:string;now:string}>){
  if(!clock.version||!Number.isFinite(Date.parse(clock.now)))throw new Error("INVALID_SCENARIO_CLOCK");
  const unique=[...new Map(events.map(e=>[`${e.commandId}:${e.kind}`,e])).values()];
  const created=new Map(unique.filter(e=>e.kind==="created").map(e=>[`${e.ruleId}:${e.ruleRevision}:${e.findingRevision}`,e]));
  const resolved=unique.filter(e=>e.kind!=="created");
  const durations=resolved.flatMap(e=>{const c=created.get(`${e.ruleId}:${e.ruleRevision}:${e.findingRevision}`);return c?[Math.max(0,Date.parse(e.occurredAt)-Date.parse(c.occurredAt))]:[]});
  return Object.freeze({created:unique.filter(e=>e.kind==="created").length,dismissed:resolved.filter(e=>e.kind==="dismissed").length,approved:resolved.filter(e=>e.kind==="approved").length,resolutionTimeMs:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,clockVersion:clock.version});
}
