import { moneyFromBigInt, type Money } from "./money.js";

export const READINESS_RULE_REVISION = "readiness.v1";
export type Truth = true | false | "unknown";
export type Jurisdiction = "england-and-wales" | "scotland" | "northern-ireland";
export type ReadinessInput = Readonly<{
  version: "readiness-input.v1"; taskId: string; taskRevision: number; ruleRevision: string;
  predecessors: readonly Readonly<{ taskId: string; complete: Truth }>[];
  material: Readonly<{ requiredUnits: number; landedUnits: number }>;
  access: Truth; crew: Truth;
  weather: Readonly<{ suitable: Truth; observedAt: string; staleAfterMinutes: number; synthetic: true; adapterRevision: string }> | null;
  evaluatedAt: string; labourRatePence?: number; uncertainDurationHours?: number;
}>;
export type ReadinessResult = Readonly<{ ready: boolean; reasons: readonly string[]; weather: Truth; exposure: Money | null; recoveryFee: Money }>;

const finiteNonNegative=(n:number)=>Number.isFinite(n)&&n>=0;
export function evaluateReadiness(input:ReadinessInput):ReadinessResult {
  if(input.version!=="readiness-input.v1"||!input.taskId||input.taskRevision<1||!input.ruleRevision)throw new Error("INVALID_READINESS_INPUT");
  if(!finiteNonNegative(input.material.requiredUnits)||!finiteNonNegative(input.material.landedUnits))throw new Error("INVALID_MATERIAL_QUANTITY");
  const reasons:string[]=[];
  if(input.predecessors.some(x=>x.complete!==true))reasons.push("A predecessor is not complete");
  const shortage=Math.max(0,input.material.requiredUnits-input.material.landedUnits);
  if(shortage>0)reasons.push(`${shortage} units still needed`);
  if(input.access!==true)reasons.push(input.access==="unknown"?"Access availability unknown":"Access is not available");
  if(input.crew!==true)reasons.push(input.crew==="unknown"?"Crew availability unknown":"Crew is not available");
  let weather:Truth="unknown";
  if(input.weather){const age=Date.parse(input.evaluatedAt)-Date.parse(input.weather.observedAt);weather=Number.isFinite(age)&&age>=0&&age<=input.weather.staleAfterMinutes*60_000?input.weather.suitable:"unknown";}
  if(weather===false)reasons.push("Synthetic weather is unsuitable");
  const exposure=input.labourRatePence===undefined||input.uncertainDurationHours===undefined?null:moneyFromBigInt(BigInt(input.labourRatePence)*BigInt(input.uncertainDurationHours));
  return Object.freeze({ready:reasons.length===0,reasons:Object.freeze(reasons),weather,exposure,recoveryFee:moneyFromBigInt(0n)});
}

export function assertAcyclicDependencies(edges:readonly Readonly<{taskId:string;dependsOnTaskId:string}>[]):void {
 const graph=new Map<string,string[]>();for(const e of edges){if(e.taskId===e.dependsOnTaskId)throw new Error("DEPENDENCY_CYCLE");graph.set(e.taskId,[...(graph.get(e.taskId)??[]),e.dependsOnTaskId]);}
 const visiting=new Set<string>(),done=new Set<string>();const visit=(n:string)=>{if(visiting.has(n))throw new Error("DEPENDENCY_CYCLE");if(done.has(n))return;visiting.add(n);for(const d of graph.get(n)??[])visit(d);visiting.delete(n);done.add(n)};for(const n of graph.keys())visit(n);
}

export function nextWorkday(date:string,jurisdiction:Jurisdiction,holidays:Readonly<Record<Jurisdiction,readonly string[]>>):string {
 const d=new Date(`${date}T12:00:00Z`);if(Number.isNaN(d.valueOf()))throw new Error("INVALID_CALENDAR_DATE");do{d.setUTCDate(d.getUTCDate()+1)}while(d.getUTCDay()===0||d.getUTCDay()===6||holidays[jurisdiction].includes(d.toISOString().slice(0,10)));return d.toISOString().slice(0,10);
}

export function dueAtLocalTime(date:string,time:string,timeZone:string):string {
 // Noon-offset sampling avoids the midnight side of a DST transition. Synthetic scheduling only.
 const desired=Date.parse(`${date}T${time}:00Z`),sample=new Date(`${date}T12:00:00Z`);
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(sample);
 const localMinutes=Number(parts.find(x=>x.type==="hour")?.value)*60+Number(parts.find(x=>x.type==="minute")?.value);
 return new Date(desired-(localMinutes-720)*60_000).toISOString();
}
