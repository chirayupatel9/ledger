import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Every browser script must parse: one syntax error stops the whole workspace from loading.
test('every browser script parses',()=>{
 const dir=new URL('../apps/web/public/',import.meta.url),files=readdirSync(dir).filter(f=>f.endsWith('.js'));
 assert.ok(files.length>20);
 for(const f of files){const r=spawnSync(process.execPath,['--check',new URL(f,dir).pathname],{encoding:'utf8'});assert.equal(r.status,0,`${f}: ${r.stderr}`);}
});
