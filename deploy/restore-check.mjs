import {spawn,spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Usage: node deploy/restore-check.mjs backups/ledger-TIMESTAMP.dump');
const backup=path.resolve(process.argv[2]),database='ledger_restore_check_'+Date.now();
function run(args){const result=spawnSync('sudo',['-n','docker','compose','exec','-T','db',...args],{cwd:root,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||'Database command failed');return result.stdout.trim();}
run(['createdb','-U','ledger',database]);
try{
 const child=spawn('sudo',['-n','docker','compose','exec','-T','db','pg_restore','-U','ledger','-d',database,'--exit-on-error','--no-owner'],{cwd:root,stdio:['pipe','ignore','inherit']});
 const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`Restore failed: ${code}`)));});
 await Promise.all([pipeline(createReadStream(backup),child.stdin),completed]);
 const sql=`SELECT json_build_object('users',(SELECT count(*) FROM "user"),'ledgers',(SELECT count(*) FROM ledgers),'transactions',(SELECT coalesce(sum(jsonb_array_length(state->'transactions')),0) FROM ledgers),'files',(SELECT count(*) FROM files),'bytes',(SELECT coalesce(sum(octet_length(data)),0) FROM files),'file_digests',(SELECT coalesce(string_agg(md5(data),',' ORDER BY owner,id),'') FROM files),'ledger_digest',(SELECT md5(coalesce(string_agg(owner||revision::text||state::text,',' ORDER BY owner),'')) FROM ledgers));`;
 const source=run(['psql','-U','ledger','-d','ledger','-Atc',sql]),restored=run(['psql','-U','ledger','-d',database,'-Atc',sql]);
 if(source!==restored)throw Error('Restored contents differ from the live database. If live writes occurred, compare with a quiesced backup.');
 console.log('PASS: backup restored into a separate temporary database; user/ledger/transaction counts, revisions, original bytes and content digests match.');
}finally{run(['dropdb','-U','ledger',database]);}
