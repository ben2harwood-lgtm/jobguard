/** Installed-v1 finite source guard. No execution/taint/SQL isolation claim.
 * Barrels resolve per symbol; reached implementation modules are deliberately
 * overapproximated at module level. Authority discovery is naming-based only.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { posix, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const DIRECTORIES = ['packages/core/src', 'packages/db/src', 'apps/api/src', 'apps/web/app'];
export const ORIGINS = ['packages/core/src/commercial-integrity.ts', 'packages/db/src/commercial-integrity-repository.ts', 'packages/db/src/commercial-integrity-application-repository.ts', 'apps/api/src/commercial-integrity.application.ts', 'apps/api/src/commercial-integrity.contracts.ts'];
const extension = /\.(?:tsx?|mts|cts)$/u;
const excluded = f => /\.d\.(?:ts|mts|cts)$|\.(?:test|spec)\.[^.]+$/u.test(f) || f.split('/').some(s => ['__tests__', '__fixtures__'].includes(s));
// Exact finite token/phrase contract; no semantic authority discovery is claimed.
export const isProtectedRoot = f => /^(?:packages\/(?:core|db)\/src|apps\/api\/src)\//u.test(f) && /(?:^|[.-])(?:pricing|meter|fee|entitlements?|subscription|activation|free-first-job|jobs-on-the-go|account-status)(?:$|[.-])|^account-repository$/u.test(posix.basename(f).replace(extension, '').toLowerCase());
export function createProject(files) {
  const texts = new Map(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const sources = new Map();
  for (const [f, s] of texts) if (extension.test(f) && !excluded(f)) sources.set(f, ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  const host = { getSourceFile: f => sources.get(f), getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => '', getDirectories: () => [], fileExists: f => texts.has(f), readFile: f => texts.get(f), getCanonicalFileName: f => f, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const program = ts.createProgram([...sources.keys()], { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest }, host);
  return { texts, sources, checker: program.getTypeChecker(), roots: [...sources.keys()].filter(isProtectedRoot).sort(), loadErrors: [] };
}
export function loadRepoProject(root = fileURLToPath(new URL('..', import.meta.url))) {
  const files = {}, errors = [];
  const walk = dir => { for (const e of readdirSync(join(root, dir), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) { const f = posix.join(dir, e.name); if (e.isSymbolicLink()) { errors.push(f + ': symbolic link'); continue; } if (e.isDirectory()) { if (!['__tests__','__fixtures__'].includes(e.name)) walk(f); } else if (extension.test(f) && !excluded(f)) files[f] = readFileSync(join(root, f), 'utf8'); } };
  for (const dir of DIRECTORIES) { if (existsSync(join(root, dir))) walk(dir); else errors.push(dir + ': missing directory'); }
  for (const top of ['packages','apps']) if (existsSync(join(root, top))) for (const e of readdirSync(join(root, top), { withFileTypes:true })) if (e.isDirectory()) { const f = `${top}/${e.name}/package.json`; if (existsSync(join(root,f))) files[f] = readFileSync(join(root,f),'utf8'); }
  for (const [f,text] of Object.entries(files)) if(f.endsWith('/package.json')) {
    try {
      const manifest=JSON.parse(text);
      if(manifest.name?.startsWith('@jobguard/')) {
        const dir=posix.join(posix.dirname(f),'src');
        if(!DIRECTORIES.includes(dir) && existsSync(join(root,dir))) walk(dir);
      }
    } catch { errors.push(f+': invalid package manifest'); }
  }
  const p = createProject(files); p.loadErrors = errors; return p;
}

export function checkCommercialIntegrityBoundary(p) {
  const diagnostics = [], keys = new Set();
  const emit = (code, file, node, dependency, chain) => { const line = node && p.sources.has(file) ? p.sources.get(file).getLineAndCharacterOfPosition(node.getStart()).line + 1 : 1; const d = {code,file,line,dependency,chain: [...chain]}; const k=JSON.stringify(d); if (!keys.has(k)) { keys.add(k); diagnostics.push(d); } };
  const unresolved = (f,n,d,c) => emit('UNRESOLVED_COVERED_EDGE',f,n,d,c);
  for (const err of p.loadErrors) unresolved(err.split(':')[0],null,err,[err.split(':')[0]]);
  for (const dir of DIRECTORIES) if (![...p.sources.keys()].some(f => f.startsWith(dir+'/'))) unresolved(dir,null,'missing required source directory',[dir]);
  for (const f of ORIGINS) if (!p.sources.has(f)) unresolved(f,null,'missing advisory anchor',[f]);
  if (!p.roots.length) unresolved('packages/core/src',null,'no protected roots',['packages/core/src']);
  for (const [f,s] of p.sources) { if (posix.normalize(f)!==f || f.startsWith('/') || f.startsWith('../')) unresolved(f,null,'non-normalized/root escape',[f]); for (const d of s.parseDiagnostics) unresolved(f,s,ts.flattenDiagnosticMessageText(d.messageText,' '),[f]); }
  const manifests = [];
  for (const [f,text] of p.texts) if (f.endsWith('/package.json')) { try { const m=JSON.parse(text); if (m.name?.startsWith('@jobguard/')) manifests.push({f,m}); } catch { unresolved(f,null,'invalid package manifest',[f]); } }
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from),spec));
    else if (spec.startsWith('@jobguard/')) {
      const parts=spec.split('/'), name=parts.slice(0,2).join('/'), sub=parts.length===2?'.':'./'+parts.slice(2).join('/');
      const matches=manifests.filter(x=>x.m.name===name); if(matches.length!==1) return {error:spec};
      const exp=matches[0].m.exports?.[sub]; const target=exp && typeof exp==='object' ? exp.types : undefined;
      if(typeof target!=='string' || !target.startsWith('./src/')) return {error:spec};
      base=posix.normalize(posix.join(posix.dirname(matches[0].f),target));
      if(!base.startsWith(posix.dirname(matches[0].f)+'/src/')) return {error:spec};
    } else return {external:true};
    if(base.startsWith('../') || base.startsWith('/')) return {error:spec};
    const stem=base.replace(/\.(?:[cm]?js|tsx?|mts|cts)$/u,'');
    const candidates=[...new Set([base,...['.ts','.tsx','.mts','.cts'].flatMap(e=>[stem+e,stem+'/index'+e])])].filter(f=>p.sources.has(f));
    return candidates.length===1 ? {file:candidates[0]} : {error:spec};
  };
  const mod = n => n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  const runtimeDecl = n => !ts.isInterfaceDeclaration(n) && !ts.isTypeAliasDeclaration(n) && !n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DeclareKeyword);
  const symbol = n => p.checker.getSymbolAtLocation(n);
  const imports = new Map();
  for(const [f,s] of p.sources) { const map=new Map(); imports.set(f,map); for(const st of s.statements) if(ts.isImportDeclaration(st) && st.importClause && !st.importClause.isTypeOnly) { const c=st.importClause, spec=st.moduleSpecifier.text; if(c.name) map.set(symbol(c.name),{spec,name:'default'}); if(c.namedBindings) { if(ts.isNamespaceImport(c.namedBindings)) map.set(symbol(c.namedBindings.name),{spec,name:'*'}); else for(const e of c.namedBindings.elements) if(!e.isTypeOnly) map.set(symbol(e.name),{spec,name:(e.propertyName??e.name).text}); } } }
  const exportTargets = (f,name,seen=new Set()) => {
    const key=f+'#'+name; if(seen.has(key)) return []; const next=new Set(seen).add(key), s=p.sources.get(f); if(!s) return [];
    const explicit=[],stars=[];
    const edge=(spec,n)=> {const r=resolve(f,spec); return r.external?[{external:true}]:r.error?[{error:spec}]:exportTargets(r.file,n,next).map(t=>({...t,route:[f,...t.route]}));};
    for(const st of s.statements) {
      if(ts.isExportDeclaration(st) && !st.isTypeOnly) {
        if(st.exportClause && ts.isNamedExports(st.exportClause)) {
          for(const e of st.exportClause.elements) if(!e.isTypeOnly && e.name.text===name) {
            if(st.moduleSpecifier) explicit.push(...edge(st.moduleSpecifier.text,(e.propertyName??e.name).text));
            else {
              const local=p.checker.getExportSpecifierLocalTargetSymbol(e);
              const im=imports.get(f).get(local);
              if(im) explicit.push(...edge(im.spec,im.name));
              else if(local?.valueDeclaration && runtimeDecl(local.valueDeclaration)) explicit.push({file:f,name});
            }
          }
        } else if(!st.exportClause && st.moduleSpecifier && name!=='default') stars.push(...edge(st.moduleSpecifier.text,name));
        else if(st.exportClause && ts.isNamespaceExport(st.exportClause) && st.exportClause.name.text===name) explicit.push({error:'namespace re-export'});
      }
      else if(ts.isExportAssignment(st) && !st.isExportEquals && name==='default') explicit.push({file:f,name});
      else if(mod(st) && runtimeDecl(st)) { if(st.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword) && name==='default') explicit.push({file:f,name}); else if(st.name?.text===name || (ts.isVariableStatement(st) && st.declarationList.declarations.some(d=>d.name.text===name))) explicit.push({file:f,name}); }
    }
    const results=explicit.length?explicit:stars; return [...new Map(results.map(r=>[JSON.stringify({file:r.file,name:r.name,external:r.external,error:r.error}),{...r,route:r.route??[f]}])).values()];
  };
  const origins = (f,n) => ORIGINS.includes(f) && (f!==ORIGINS[4] || n==='integrityReviewV1');
  for(const root of p.roots) {
    const queue=[{f:root,chain:[root]}], visited=new Set();
    while(queue.length) {
      const {f,chain}=queue.shift(); if(visited.has(f)) continue; visited.add(f); const s=p.sources.get(f); if(!s) continue;
      const follow=(spec,name,node) => { const r=resolve(f,spec); if(r.external) return; if(r.error) return unresolved(f,node,'unresolved module '+spec,chain);
        if(name==='!side-effect') { if(ORIGINS.includes(r.file)) emit('FORBIDDEN_ADVISORY_DEPENDENCY',f,node,r.file,[...chain,r.file]); else queue.push({f:r.file,chain:[...chain,r.file]}); return; }
        const targets=exportTargets(r.file,name); if(targets.length!==1 || targets[0].error) return unresolved(f,node,'unresolved/ambiguous export '+spec+'#'+name,[...chain,r.file]);
        const t=targets[0]; const path=[...chain,...t.route];
        // Pure barrels are selective. Executable intermediate modules still
        // contribute their runtime references, even when re-exporting a safe leaf.
        for(let i=0;i<t.route.length-(t.external?0:1);i++) {
          const intermediate=t.route[i], source=p.sources.get(intermediate);
          if(source.statements.some(st=>!(ts.isExportDeclaration(st)||ts.isInterfaceDeclaration(st)||ts.isTypeAliasDeclaration(st)||(ts.isImportDeclaration(st)&&st.importClause)))) queue.push({f:intermediate,chain:[...chain,...t.route.slice(0,i+1)]});
        }
        if(t.external) return;
        if(origins(t.file,t.name)) emit('FORBIDDEN_ADVISORY_DEPENDENCY',f,node,t.file+'#'+t.name,path); else queue.push({f:t.file,chain:path});
      };
      const binding=(n,seen=new Set())=> { if(!n) return null; if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n)) { const b=binding(n.expression,seen); if(b?.name==='*') { const name=ts.isPropertyAccessExpression(n)?n.name.text:ts.isStringLiteral(n.argumentExpression)?n.argumentExpression.text:null; return {...b,name:name??'*',unsafe:!name}; } return null; } if(!ts.isIdentifier(n)) return null; const sym=symbol(n); if(!sym||seen.has(sym)) return null; seen.add(sym); const im=imports.get(f).get(sym); if(im) return im;
        const d=sym.valueDeclaration; if(d && ts.isVariableDeclaration(d) && d.initializer) { const b=binding(d.initializer,seen); if(b) { if(!(d.parent.flags & ts.NodeFlags.Const)) return {...b,unsafe:true}; return b; } } return null; };
      const value=(n,seen=new Set())=> { if(!n) return undefined; if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isNumericLiteral(n)) return n.text; if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isNonNullExpression(n)) return value(n.expression,seen); if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken) { const a=value(n.left,seen),b=value(n.right,seen); return a!==undefined&&b!==undefined?a+b:undefined; } if(ts.isIdentifier(n)) { const sym=symbol(n),d=sym?.valueDeclaration; if(!seen.has(sym)&&d&&ts.isVariableDeclaration(d)&&(d.parent.flags&ts.NodeFlags.Const)) return value(d.initializer,new Set(seen).add(sym)); } return undefined; };
      const visit=n=> {
        if(ts.isImportDeclaration(n)) { if(!n.importClause) follow(n.moduleSpecifier.text,'!side-effect',n); return; }
        if(ts.isExportDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n)||ts.isTypeNode(n)) return;
        if(ts.isImportEqualsDeclaration(n)) { unresolved(f,n,'unsupported import binding',chain); return; }
        if(ts.isCallExpression(n)||ts.isNewExpression(n)) {
          const e=n.expression, terminal=ts.isPropertyAccessExpression(e)?e.name.text:ts.isElementAccessExpression(e)?value(e.argumentExpression):ts.isIdentifier(e)?e.text:'';
          if(e.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(e)&&e.text==='require')) {const spec=value(n.arguments?.[0]); if(spec===undefined) unresolved(f,n,'dynamic import/require',chain); else {
            let use=n.parent;
            if(ts.isAwaitExpression(use)) use=use.parent;
            if(ts.isParenthesizedExpression(use)) use=use.parent;
            const member=ts.isPropertyAccessExpression(use)?use.name.text:ts.isElementAccessExpression(use)?value(use.argumentExpression):undefined;
            if(member) follow(spec,member,n);
            else { const r=resolve(f,spec); if(!r.external) { follow(spec,'!side-effect',n); unresolved(f,n,'dynamic module namespace escape',chain); } }
          } }
          if(['eval','Function'].includes(terminal)) unresolved(f,n,'eval/Function loading',chain);
          if(['query','execute'].includes(terminal)) inspectSql(n,n.arguments?.[0],n.arguments?.[1],value,f,chain,emit,unresolved,symbol);
        }
        if(ts.isTaggedTemplateExpression(n)) { const tag=n.tag; if((ts.isIdentifier(tag)?tag.text:ts.isPropertyAccessExpression(tag)?tag.name.text:'')==='sql') inspectSql(n,n.template,undefined,value,f,chain,emit,unresolved,symbol); }
        if(ts.isIdentifier(n)) {
          const parent=n.parent;
          const isName=(parent.name===n && !ts.isShorthandPropertyAssignment(parent)) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent);
          if(!isName && ['require','eval','Function'].includes(n.text) && !symbol(n)?.valueDeclaration && !(ts.isCallExpression(parent)||ts.isNewExpression(parent))) unresolved(f,n,'escaped builtin loader '+n.text,chain);
          if(!isName) { const b=binding(n); if(b) {
            if(b.unsafe) unresolved(f,n,'reassigned imported alias',chain);
            let name=b.name;
            if(name==='*') { if(ts.isPropertyAccessExpression(parent)&&parent.expression===n) name=parent.name.text; else if(ts.isElementAccessExpression(parent)&&parent.expression===n) { name=value(parent.argumentExpression); if(name===undefined) unresolved(f,n,'computed namespace member',chain); } else if(ts.isVariableDeclaration(parent)&&parent.initializer===n&&ts.isIdentifier(parent.name)&&(parent.parent.flags&ts.NodeFlags.Const)) name=null; else { unresolved(f,n,'namespace-object escape',chain); name=null; } }
            if(name && !b.unsafe) follow(b.spec,name,n);
            if(ts.isBinaryExpression(parent)&&parent.left===n&&parent.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&parent.operatorToken.kind<=ts.SyntaxKind.LastAssignment) unresolved(f,n,'reassigned imported alias',chain);
          } }
        }
        ts.forEachChild(n,visit);
      };
      visit(s);
    }
  }
  return diagnostics.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function inspectSql(node, query, params, value, file, chain, emit, unresolved, symbol) {
  const text=value(query);
  if(text===undefined) return unresolved(file,node,'unknown query text/structure',chain);
  const tokens=[], rx=/\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|'(?:''|[^'])*'|\$\d+|[A-Za-z_][A-Za-z_0-9$]*|[().,*=;]|./gy;
  for(const m of text.matchAll(rx)) { const s=m[0]; if(/^\s|^--|^\/\*/u.test(s)) continue; if(s[0]==='"') tokens.push({kind:'id',v:s.slice(1,-1).replaceAll('""','"').toLowerCase()}); else if(s[0]==="'") tokens.push({kind:'str',v:s.slice(1,-1).replaceAll("''", "'")}); else if(/^\$\d+$/u.test(s)) tokens.push({kind:'param',v:Number(s.slice(1))}); else if(/^[A-Za-z_]/u.test(s)) tokens.push({kind:'id',v:s.toLowerCase()}); else if(['"',"'",'/'].includes(s)) return unresolved(file,node,'unresolved SQL token',chain); else tokens.push({kind:'punct',v:s}); }
  const has=v=>tokens.some(t=>t.kind==='id'&&t.v===v);
  const tables=[];
  for(let i=0;i<tokens.length-2;i++) if(tokens[i].kind==='id'&&tokens[i].v==='app'&&tokens[i+1].v==='.'&&tokens[i+2].kind==='id') tables.push(tokens[i+2].v);
  const forbidden=d=>emit('FORBIDDEN_ADVISORY_SQL',file,node,d,chain);
  for(const t of tables) if(['commercial_integrity_value_fact','commercial_integrity_activity_fact'].includes(t)) forbidden('app.'+t);
  const reads=has('select')||has('returning');
  if(!reads) return;
  const markers=['commercial_integrity.review','commercial-integrity-review.v1','commercial-integrity-view.v1','commercial_integrity.reviewed'];
  let array=params;
  // Parameters may be an immutable array binding; scalar aliases use lexical symbols.
  const seen=new Set();
  while(array && ts.isIdentifier(array)) {
    const decl=symbol(array)?.valueDeclaration;
    if(!decl || !ts.isVariableDeclaration(decl) || !(decl.parent.flags&ts.NodeFlags.Const) || seen.has(decl)) { array=undefined; break; }
    seen.add(decl); array=decl.initializer;
  }
  const val=t=>t?.kind==='str'?t.v:t?.kind==='param'&&array&&ts.isArrayLiteralExpression(array)?value(array.elements[t.v-1]):undefined;
  const from=tokens.findIndex(t=>t.kind==='id'&&t.v==='from');
  if(from>=0 && tokens.slice(from).some(t=>markers.includes(val(t)))) forbidden('advisory review/view/audit discriminator');
  const wildcard=tokens.some((t,i)=>t.v==='*' && ['select','distinct','all','returning','.',','].includes(tokens[i-1]?.v));
  if(tables.includes('command_receipt') && (has('result')||wildcard)) {
    const discriminators=[];
    for(let i=0;i<tokens.length;i++) if(tokens[i].kind==='id'&&tokens[i].v==='command_type') {
      if(tokens[i+1]?.v==='=') discriminators.push(val(tokens[i+2]));
      else if(tokens[i-1]?.v==='=') discriminators.push(val(tokens[i-2]));
    }
    if(discriminators.includes('commercial_integrity.review')) forbidden('app.command_receipt.result commercial_integrity.review');
    else if(!discriminators.length||discriminators.some(x=>x===undefined)||has('or')||has('union')||has('not')||has('join')||tables.length!==1||tokens.slice(from+1,tokens.findIndex(t=>t.kind==='id'&&t.v==='where')<0?undefined:tokens.findIndex(t=>t.kind==='id'&&t.v==='where')).some(t=>t.v===',')||tokens.filter(t=>t.kind==='id'&&t.v==='select').length>1) unresolved(file,node,'app.command_receipt.result without proven non-advisory discriminator',chain);
  }
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    const project=loadRepoProject(process.argv[2]);
    const diagnostics=checkCommercialIntegrityBoundary(project);
    for(const d of diagnostics) console.error(JSON.stringify(d));
    console.log(`${project.roots.length} protected roots; ${diagnostics.length} diagnostics`);
    process.exitCode=diagnostics.length?1:0;
  } catch(error) { console.error(JSON.stringify({code:'UNRESOLVED_COVERED_EDGE',file:process.argv[2]??'.',line:1,dependency:String(error.message),chain:[process.argv[2]??'.']})); process.exitCode=1; }
}
