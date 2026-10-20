import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareAssets} from '../apps/web/asset-build.mjs';

test('changing a lazy parser or its worker changes the whole release URL while preserving old assets',t=>{
 const root=mkdtempSync(path.join(tmpdir(),'ledger-assets-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(path.join(root,'vendor'));
 const sources={'app.js':"export const parser=()=>import('./pdf.js');",'pdf.js':"export const worker=new URL('./vendor/pdf.worker.mjs',import.meta.url);",'vendor/pdf.worker.mjs':'old worker','styles.css':'body{color:green}'};
 for(const [name,source] of Object.entries(sources))writeFileSync(path.join(root,name),source);
 const first=prepareAssets(root);assert.match(first,/^\/assets\/[a-f0-9]{24}$/);
 assert.equal(prepareAssets(root),first,'regenerating must ignore its own output');
 for(const [name,source] of Object.entries(sources))assert.equal(readFileSync(path.join(root,first,name),'utf8'),source);
 writeFileSync(path.join(root,'pdf.js'),'new parser');
 const second=prepareAssets(root);assert.notEqual(second,first);
 assert.equal(readFileSync(path.join(root,first,'pdf.js'),'utf8'),sources['pdf.js'],'old release must not change');
 assert.equal(readFileSync(path.join(root,second,'pdf.js'),'utf8'),'new parser');
 writeFileSync(path.join(root,'vendor/pdf.worker.mjs'),'new worker');assert.notEqual(prepareAssets(root),second);
});
