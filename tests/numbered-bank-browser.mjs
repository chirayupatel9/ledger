// Full workflow uses synthetic data. Optional LEDGER_PREVIEW_PDF is previewed locally, never uploaded.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {makePDF} from './fixtures/card-statements.mjs';
import {numberedBank} from './fixtures/numbered-bank.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'PDF QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(create){return new Promise((resolve,reject)=>{
 const args=create?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`];
 const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','ignore']});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Test account operation failed')));child.stdin.end(JSON.stringify(user));
});}
const browser=await chromium.launch({headless:true});let created=false;
try{
 await operator(true);created=true;
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const state=async()=>{const r=await context.request.get(base+'/api/ledger');assert.equal(r.status(),200);return r.json();};
 const data=await state();data.state={schemaVersion:2,initialized:true,accounts:[{id:'pdf-test',name:'PDF Savings',bank:'Test bank',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[],transactions:[],rules:[]};
 assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 await page.goto(base+'/statements');
 const upload=async file=>{
  await page.locator('[data-action="upload"]').first().click();
  await page.locator('#account-name').selectOption('pdf-test');
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#commit-import').waitFor({timeout:60000});
 };
 if(process.env.LEDGER_PREVIEW_PDF){
  let uploadRequests=0;
  const block=async route=>{if(route.request().method()==='POST'){uploadRequests++;await route.abort();}else await route.continue();};
  await page.route('**/api/files',block);
  await upload({name:'private-preview.pdf',mimeType:'application/pdf',buffer:readFileSync(process.env.LEDGER_PREVIEW_PDF)});
  assert.equal(await page.locator('[data-include]').count(),Number(process.env.LEDGER_PREVIEW_ROWS||917));
  assert.equal(await page.locator('.import-table input:not(:checked)').count(),0);
  assert.equal(await page.locator('#modal .notice.error').count(),0);
  await page.locator('#reconcile-result .notice.success').waitFor();
  await page.locator('#modal [data-action="close"]').filter({hasText:'Cancel'}).click();
  assert.equal(uploadRequests,0,'Private PDF must never leave browser preview');
  assert.equal((await state()).state.transactions.length,0);
  await page.unroute('**/api/files',block);
  console.log('PASS: private PDF preview extracted all rows and reconciled; no original or transactions uploaded.');
 }
 const file={name:'synthetic-numbered.pdf',mimeType:'application/pdf',buffer:makePDF(numberedBank)};
 await upload(file);
 assert.equal(await page.locator('[data-include]').count(),4);
 assert.equal(await page.locator('#st-from').inputValue(),'2026-04-01');
 assert.equal(await page.locator('#st-to').inputValue(),'2026-10-20');
 await page.locator('#reconcile-result .notice.success').waitFor();
 await page.locator('#commit-import').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.reload();await page.locator('nav').waitFor();
 const saved=(await state()).state;assert.equal(saved.transactions.length,4);assert.equal(saved.statements.length,1);
 const original=saved.statements[0].fileId;
 assert.equal((await context.request.get(base+'/api/files/'+original)).status(),200);
 await upload(file);assert.equal(await page.locator('.import-table input:checked').count(),0);assert.ok(await page.locator('#commit-import').isDisabled());
 await page.locator('#modal [data-action="close"]').filter({hasText:'Cancel'}).click();
 await page.locator('nav [data-page="statements"]').click();
 await page.locator('[data-delete-statement]').click();await page.locator('#confirm-remove').click();await page.locator('#modal').waitFor({state:'hidden'});
 const removed=(await state()).state;assert.equal(removed.statements.length,0);assert.equal(removed.transactions.length,0);
 assert.equal((await context.request.get(base+'/api/files/'+original)).status(),404);
 assert.deepEqual(errors,[]);
 console.log('PASS: numbered PDF preview, period/balances, save, persisted reload, original download, duplicate prevention and deletion of transactions/original.');
}finally{await browser.close();if(created)await operator(false);}
