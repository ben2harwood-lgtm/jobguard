import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
export function forbiddenCommercialBoundarySource(source,file){
  if(file.endsWith("apps/api/src/commercial/approved-boundary.ts")) return false;
  return /commercial-adapter\.port|\.execute\s*\(\s*\)/u.test(source);
}
async function files(dir){return (await readdir(dir,{withFileTypes:true})).flatMap(e=>e.isDirectory()?[]:[join(dir,e.name)]).concat(...await Promise.all((await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>files(join(dir,e.name)))))}
export async function checkCommercialBoundary(){
  const violations=[];
  for(const file of await files(join(root,"apps/api/src"))) if(file.endsWith(".ts")&&forbiddenCommercialBoundarySource(await readFile(file,"utf8"),relative(root,file))) violations.push(relative(root,file));
  if(violations.length) throw new Error(`Direct commercial adapter use outside approved boundary: ${violations.join(", ")}`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await checkCommercialBoundary();
