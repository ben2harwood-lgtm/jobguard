export type Subject = {
  kind: "table" | "routine" | "role"; oid: string; name: string; facts: string[];
  columns: string[]; columnGrants: { column: string; fact: string }[];
  policies: Record<string, { permissive: boolean; text: string }>;
};

export function compare(before: Subject[], live: Subject[]): string[] {
  const differences: string[] = [];
  for (const now of live) {
    const was = before.find(subject => subject.kind === now.kind && subject.oid === now.oid)
      ?? before.find(subject => subject.kind === now.kind && subject.name === now.name);
    if (!was) continue;
    for (const fact of now.facts) if (!was.facts.includes(fact)) differences.push(`${now.kind} ${now.name}: + ${fact}`);
    if (now.kind !== "table") continue;
    for (const grant of now.columnGrants) if (was.columns.includes(grant.column)
      && !was.facts.includes(grant.fact)
      && !was.columnGrants.some(old => old.column === grant.column && old.fact === grant.fact)) {
      differences.push(`table ${now.name}: + column ${grant.column} ${grant.fact}`);
    }
    for (const [name, policy] of Object.entries(was.policies)) {
      const current = now.policies[name];
      if (current && current.text !== policy.text) differences.push(`policy ${now.name}.${name}: changed`);
      else if (!current && !policy.permissive) differences.push(`policy ${now.name}.${name}: restrictive policy gone`);
    }
    for (const [name, policy] of Object.entries(now.policies)) if (!Object.hasOwn(was.policies, name)
      && policy.permissive && !was.facts.includes("row security off")) {
      differences.push(`policy ${now.name}.${name}: permissive policy added`);
    }
  }
  return differences.sort();
}
