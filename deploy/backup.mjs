import {mkdirSync,createWriteStream,chmodSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(path.join(root,'backups'),{recursive:true,mode:0o700});
// Named in Indian Standard Time whatever the host's time zone, e.g. ledger-2026-10-21T02-30-00+0530.dump.
const t=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const target=path.join(root,'backups',`ledger-${t.year}-${t.month}-${t.day}T${t.hour}-${t.minute}-${t.second}+0530.dump`);
const child=spawn('sudo',['-n','docker','compose','exec','-T','db','pg_dump','-U','ledger','-d','ledger','-Fc'],{cwd:root,stdio:['ignore','pipe','inherit']});
const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`pg_dump exited ${code}`)));});
await Promise.all([pipeline(child.stdout,createWriteStream(target,{flags:'wx',mode:0o600})),exited]);
chmodSync(target,0o600);console.log(`Backup saved: ${target}`);
