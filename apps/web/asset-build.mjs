import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Keep relative imports (including lazy parsers and PDF workers) in one release directory.
// Changing any dependency changes the URLs for the entire graph, not just app.js.
export function prepareAssets(publicDir){
 const files=[];
 function visit(dir,relative=''){
  for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   // ocr/ is the versioned bill reader, served from its own fixed folder (see public/ocr.js).
   if(!relative&&(entry.name==='assets'||entry.name==='ocr'))continue;
   const name=path.posix.join(relative,entry.name),file=path.join(dir,entry.name);
   if(entry.isDirectory())visit(file,name);
   else if(entry.isFile()&&/\.(?:m?js|css)$/.test(entry.name))files.push([name,readFileSync(file)]);
  }
 }
 visit(publicDir);
 if(!files.some(([name])=>name==='app.js'))throw Error('Workspace entry point is missing');
 const hash=createHash('sha256');
 for(const [name,bytes] of files){hash.update(name);hash.update('\0');hash.update(String(bytes.length));hash.update('\0');hash.update(bytes);}
 const version=hash.digest('hex').slice(0,24),base='/assets/'+version;
 for(const [name,bytes] of files){
  const target=path.join(publicDir,'assets',version,name);
  mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes);
 }
 return base;
}
