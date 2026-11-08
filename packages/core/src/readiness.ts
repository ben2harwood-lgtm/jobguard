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
  if(input.predecessors.some(x=>x.complete===false))reasons.push("A predecessor is not complete");
  if(input.predecessors.some(x=>x.complete!==true&&x.complete!==false))reasons.push("Predecessor completion unknown");
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
 const desired=Date.parse(`${date}T${time}:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||!Number.isFinite(desired)||new Date(desired).toISOString().slice(0,10)!==date||!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time))throw new Error("INVALID_LOCAL_TIME");
 const formatter=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const local=(stamp:number)=>{
  const parts=formatter.formatToParts(new Date(stamp));
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:00Z`;
 };
 // Sample both sides of a transition, then verify the complete wall-clock date/time.
 // A skipped time fails closed; a repeated time runs at its first occurrence.
 const candidates=new Set<number>();
 for(const delta of [-86_400_000,0,86_400_000]){
  const sample=desired+delta,offset=Date.parse(local(sample))-sample;
  const candidate=desired-offset;
  if(local(candidate)===`${date}T${time}:00Z`)candidates.add(candidate);
 }
 if(candidates.size===0)throw new Error("NONEXISTENT_LOCAL_TIME");
 return new Date(Math.min(...candidates)).toISOString();
}


export type ResequencePlan = Readonly<{
  scope: Readonly<{ tenantId: string; jobId: string; taskId: string }>;
  status: "confirmed" | "cancelled"; plannedDate: string;
  predecessors: readonly Readonly<{ taskId: string; complete: Truth }>[];
  edges: readonly Readonly<{ taskId: string; dependsOnTaskId: string }>[];
  material: Readonly<{ requiredUnits: number; landedUnits: number }>;
  access: Truth; crew: Truth;
}>;
export type ResequenceCandidate = Readonly<{ taskId: string; fromDate: string; toDate: string }>;

/** Prevention proposals only. No dates or facts are changed. Unknown is never ready. */
export function proposeResequence(blocked: ResequencePlan, others: readonly ResequencePlan[]): readonly ResequenceCandidate[] {
  if (blocked.crew !== true) return [];
  const plans = [blocked, ...others.filter(plan => plan.scope.tenantId === blocked.scope.tenantId
    && plan.scope.jobId === blocked.scope.jobId && plan.scope.taskId !== blocked.scope.taskId)];
  const edges = plans.flatMap(plan => [
    ...plan.edges,
    ...plan.predecessors.map(fact => ({ taskId: plan.scope.taskId, dependsOnTaskId: fact.taskId })),
  ]);
  try { assertAcyclicDependencies(edges); } catch { return []; }
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const dependencies = graph.get(edge.taskId) ?? new Set<string>();
    dependencies.add(edge.dependsOnTaskId); graph.set(edge.taskId, dependencies);
  }
  const dependsOnBlocked = (taskId: string): boolean => {
    const pending = [taskId], seen = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (id === blocked.scope.taskId) return true;
      if (seen.has(id)) continue;
      seen.add(id); pending.push(...graph.get(id) ?? []);
    }
    return false;
  };
  return plans.filter(plan => plan.scope.taskId !== blocked.scope.taskId && plan.status === "confirmed"
    && plan.plannedDate > blocked.plannedDate && plan.access === true && plan.crew === true
    && finiteNonNegative(plan.material.requiredUnits) && finiteNonNegative(plan.material.landedUnits)
    && plan.material.landedUnits >= plan.material.requiredUnits
    && plan.predecessors.every(fact => fact.complete === true)
    && [...graph.get(plan.scope.taskId) ?? []].every(id => plan.predecessors.some(fact => fact.taskId === id && fact.complete === true))
    && !dependsOnBlocked(plan.scope.taskId))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.scope.taskId.localeCompare(b.scope.taskId))
    .slice(0, 3).map(plan => ({ taskId: plan.scope.taskId, fromDate: plan.plannedDate, toDate: blocked.plannedDate }));
}
