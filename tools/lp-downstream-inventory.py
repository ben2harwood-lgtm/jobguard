"""Regenerate the proposed source index; never modifies the LP-0 capability freeze."""
import re,json,collections,sys
from pathlib import Path
# Recorded inventory input; the live LP-0 capability freeze evolves independently.
LP0_INPUT=Path('docs/contracts/lp-downstream-lp-0-recorded-input-v1.json')
p=json.loads(LP0_INPUT.read_text())
groups={g['id']:g for g in p['groups']}; obj=collections.defaultdict(lambda:{'groups':set(),'sources':set(),'writes':set(),'calls':set(),'signatures':set(),'reach':set(),'definitions':set()})
for e in p['entries']:
 k=e['key'].split('|'); name=None; kind=None
 if k[:2]==['acl','rel']:kind='relation';name=k[3]
 elif k[:2]==['acl','col']:kind='relation';name=k[2].rsplit('.',1)[0]
 elif k[:2]==['acl','routine']:
  kind='routine';name=k[2].split(':',1)[1].split('(')[0]
 if name:obj[kind,name]['groups'].add(e['group'])
for r in p['recorded']['routines']:
 name=r['identity'].split(':',1)[1].split('(')[0]; o=obj['routine',name]
 o['signatures'].add(r['identity']);o['writes'].update(r['staticWrites']);o['calls'].update(r['staticCalls'])
 if r['reachable']:o['reach'].add('LP-0 reachable')
 if r['returnsTrigger']:o['reach'].add('trigger')
for r in p['recorded']['rls']:obj['relation',r.split('|')[0]]
# Conservative source union: include historical definitions rather than silently excluding a legacy door.
# Recorded design snapshot: advance deliberately when refreshing the inventory.
MAX_MIGRATION=347
files=sorted(f for f in Path('packages/db/migrations').glob('*.sql')
             if int(f.name.split('_',1)[0])<=MAX_MIGRATION)
for f in files:
 s=f.read_text()
 pat=r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:UNLOGGED|TEMPORARY|TEMP)\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][\w]*\.[a-z_][\w]*)'
 matches=list(re.finditer(pat,s,re.I))
 for i,m in enumerate(matches):
  kind='routine' if m[1].upper() in ('FUNCTION','PROCEDURE') else 'relation';o=obj[kind,m[2].lower()];o['sources'].add(f'{f}:{s.count(chr(10),0,m.start())+1}')
  if kind=='relation':
   o['definitions'].add(s[m.end():].split(';',1)[0])
  if kind=='routine':
   # Body scan is a review aid, not a SQL parser; triggers/dynamic SQL need catalogue tracing.
   tail=s[m.end():];d=re.search(r'\$[a-z_]*\$',tail,re.I)
   body=tail[:tail.find(d[0],d.end())+len(d[0])] if d else tail[:tail.find(';')]
   o['writes'].update(re.findall(r'(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]\w*\.[a-z_]\w*)',body,re.I))
   o['calls'].update(re.findall(r'(?:PERFORM|SELECT)\s+([a-z_]\w*\.[a-z_]\w*)\s*\(',body,re.I))
for tr in p['recorded']['triggers']:
 parts=tr.split('|');obj['relation',parts[0]]['calls'].add(parts[2]);obj['routine',parts[2]]['reach'].add('trigger')
# Stable proposed downstream classes. Exact LP-0 groups also remain visible per object.
def name_hint(name):
 if name.startswith('identity.') or name=='app.account' or re.search(r'(membership|person|role_grant|invitation|session|practice_worker_switch)',name):return 'identity'
 if re.search(r'(audit|checkpoint)',name):return 'audit'
 if re.search(r'(command_receipt|decision|authorization)',name):return 'command'
 if re.search(r'(outbox|attempt|provider_event|infrastructure\.|graphile)',name):return 'queue'
 if re.search(r'(shadow|final_check|attribution|signal)',name):return 'hidden'
 if re.search(r'(invoice|credit_note|payment|receipt|allocation|reversal|ledger|journal|fee|settlement|landing|recovery_cap|subscription|meter|counted_day|tariff|entitlement)',name):return 'money'
 if re.search(r'(evidence|proof|source|diary|customer_message|document|upload)',name):return 'evidence'
 if re.search(r'(final_account|activation|acceptance|quote|variation|work_order|extra|commercial|recovery|scope|proposal|prevention|finding|watchdog|supplier|purchase|material|merchant|goods)',name):return 'commitment'
 if re.search(r'(job|parties|party|customer|site|resident|contractor|client)',name):return 'resource'
 return 'support'
families={
 'identity':('Identity, account/person mapping, invitations, revocation and practice separation','LP-1, LP-6a, LP-6b, LP-6d, LP-7, LP-11, LP-12, LP-13'),
 'audit':('Accepted history, attribution or checkpoint integrity','LP-4, LP-6e, LP-9, LP-12'),
 'command':('Claim, approval, authorization reuse or completion authority','LP-5a, LP-5b, LP-5c, LP-6d'),
 'queue':('Approved work, claims, retries, completion or provider reconciliation','LP-8b, LP-10, LP-11, LP-12'),
 'hidden':('Hidden evidence, disclosure, final lock or fee attribution','LP-4, LP-6d, LP-8b, LP-10, LP-11'),
 'money':('Obligation, numbering, allocation, reversal or hypothetical charge input','LP-6c, LP-8a, LP-8b, LP-13'),
 'evidence':('Evidence provenance, bytes/version reference, visibility or invalidation','LP-6d, LP-8b, LP-11'),
 'commitment':('Scope, price, approval, commitment or downstream claim input','LP-5b, LP-6c, LP-6d, LP-8a, LP-8b'),
 'resource':('Resource ownership, ordinary job creation, party/assignment or access input','LP-2, LP-6d, LP-7, LP-11'),
 'support':('Support predicate, trigger, synthetic metadata or extension; transitive authority must be traced','LP-6d, LP-9, LP-11, LP-12'),
}
def classify(kind, name):
 # Prefer recorded domain groups and declaration evidence. Names are fallback
 # navigation hints, never authority or reachability proof. Effects can overlap.
 o=obj.get((kind,name),{})
 effects=set()
 for group in o.get('groups',()):
  domain=groups[group]['kind']
  if domain in families and domain!='support':effects.add(domain)
  if domain=='membership':effects.add('identity')
  if group in ('a-exec-shadow-runtime','a-shadow-role-grants'):
   effects.add('hidden')
 if kind=='relation':
  for declaration in o.get('definitions',()):
   if re.search(r'\b(?:\w*_pence|currency)\s+(?:bigint|integer|numeric|char|text|varchar)\b',declaration,re.I):
    effects.add('money')
   if re.search(r'\b(?:result_signal_ids|signal_ids)\s+(?:uuid|jsonb)\b',declaration,re.I):
    effects.add('hidden')
  # ENT-6B schema: imports, matches and quarantine are financial inputs even
  # when an individual table has no amount column. Include every declaration.
  if any(ref.startswith('packages/db/migrations/0243_contractor_billing.sql:') for ref in o.get('sources',())):
   effects.add('money')
 hint=name_hint(name)
 # Authoritative domain evidence overrides a misleading identity/support hint.
 if hint not in ('support','identity') or not effects:effects.add(hint)
 # Attempt/queue and hidden effects coexist; queue must not mask hidden work.
 if re.search(r'(shadow|final_check|attribution|signal)',name):effects.add('hidden')
 return effects

lines=['# LP downstream-effect source inventory, version 1','', '**Status: PROPOSED — needs review.** Companion to [the design note](lp-command-binding-design-v1.md). No grants, scanner pins, LP-0 baseline or migrations are changed. This appendix is design input, not accepted catalogue evidence.','',
 'Base: `cc147d78` (LP-DESIGN-NOTE-FIX checkout) (inspected 29 October 2026). Sources: the '+str(len(files))+' migration SQL files through migration '+f'`{MAX_MIGRATION:04d}`'+', and the LP-0 JSON entries, recorded routines, RLS and trigger records from the inventory’s recorded input [`lp-downstream-lp-0-recorded-input-v1.json`](lp-downstream-lp-0-recorded-input-v1.json) (copied from `lp-0-effective-privileges-v1.json` on main `baad7d56`, 29 October 2026). The live LP-0 JSON is excluded. The migration boundary is recorded as `MAX_MIGRATION` in `tools/lp-downstream-inventory.py`; newer migrations are excluded. To refresh this design snapshot, update the recorded LP-0 input and migration boundary as needed, and regenerate this document together. All source references below are repository-relative.','',
 'This is a conservative **superset** of reachable objects: source declarations include historical/replaced/dropped objects; LP-0 reachability is its recorded observation, not a fresh measurement. Routine rows group names and retain every LP-0 overload in the final column. Source-only names require an overload/catalogue check. No row means “safe working data”. Regenerate with `python3 tools/lp-downstream-inventory.py`; use `--check` to detect drift. Family assignments prefer LP-0 group domain kinds and schema declarations (money columns, hidden result fields and the ENT-6B billing schema), then combine name hints and direct-write target effects. Classes overlap: queue work can also be hidden. These remain navigation hints; each is a downstream-effect **hypothesis**, not a policy or proof. Transitive consequences are explained in the companion path table and must be followed through the listed call/trigger edges. Each later card must resolve the applicable subset, trace actual callers, trigger edges, views, dynamic SQL and all overloads as the real role, then pair refusal with an allowed case and committed-state checks. The full LP-0 guard remains authoritative for its frozen capabilities. Do not regenerate its expected facts from this appendix.','',
 'LP-5 implementation sources (renumbered 31 October 2026): `packages/db/migrations/0535_lp5a_commands.sql` owns checked dispatcher begin/complete; `packages/db/migrations/0536_lp5b_writers.sql` converts the other writers, including the latest 0413 combined invoice and 0505 source-intake admission bodies. This source map does not refresh the frozen design snapshot above or claim implementation acceptance.','',
 '## Effect classes and assigned work','', '| Class | Downstream consequence to test | Responsible existing LP cards |','|---|---|---|']
for key,(effect,cards) in families.items():lines.append(f'| `{key}` | {effect} | {cards} |')
lines+=['','Cards in the object index combine the existing LP-0 group assignments with the proposed primary/direct-write classes above. A shared assignment splits responsibilities by the card contracts in §11.8: binding (LP-6), checked write closure (LP-5/8), worker separation (LP-10), policy visibility (LP-11), owner narrowing (LP-12), bounded legacy items (LP-13), and final refusal proof (LP-9). LP-13 never absorbs an earlier authority/money fix. Pure extensions and trigger-only functions remain listed because helper or trigger composition may be reachable.','',
 '## Object index','',
 'Edges are the union of recorded/static source references, so may include historical writes. They are navigation aids rather than an executable call graph. `source-only` means fresh catalogue reachability and overload evidence is required; `LP-0 recorded` likewise does not assert current execution rights.','']
for kind in ['relation','routine']:
 lines+=['### '+('Tables and views' if kind=='relation' else 'Routines, including helpers and trigger functions'),'','| Object | Proposed effect / cards | Existing LP-0 groups | Source locations; write/call edges; recorded overloads |','|---|---|---|---|']
 for (typ,name),o in sorted(obj.items()):
  if typ!=kind:continue
  effects=classify(typ,name)
  for target in o['writes']:effects.update(classify('relation',target))
  if len(effects)>1:effects.discard('support')
  cards=set()
  for e in effects:cards.update(families[e][1].split(', '))
  for g in o['groups']:cards.update(groups[g]['cards'])
  refs='; '.join('`'+s+'`' for s in sorted(o['sources'])) or 'LP-0 JSON'
  edges=[]
  if o['writes']:edges.append('writes: '+', '.join('`'+s+'`' for s in sorted(o['writes'])))
  if o['calls']:edges.append('calls/triggers: '+', '.join('`'+s+'`' for s in sorted(o['calls'])))
  if typ=='routine':edges.append('overloads: '+(', '.join('`'+s+'`' for s in sorted(o['signatures'])) or 'source-only; enumerate at card'));edges.append(', '.join(sorted(o['reach'])) or 'LP-0 recorded' if o['signatures'] else 'source-only')
  lines.append('| `'+name+'` | '+', '.join(sorted(effects))+' / '+', '.join(sorted(cards))+' | '+', '.join('`'+s+'`' for s in sorted(o['groups']))+' | '+refs+('; '+'; '.join(edges) if edges else '')+' |')
 lines+=['']
generated='\n'.join(lines)
output=Path('docs/contracts/lp-downstream-effects-v1.md')
if '--stdout' in sys.argv:
 print(generated,end='')
elif '--check' in sys.argv:
 if output.read_text()!=generated:
  sys.exit('Downstream inventory differs; run python3 tools/lp-downstream-inventory.py')
 print('PASS downstream inventory matches source generator')
else:
 output.write_text(generated)
 print('inventory',collections.Counter(k[0] for k in obj), 'lines',len(lines))
