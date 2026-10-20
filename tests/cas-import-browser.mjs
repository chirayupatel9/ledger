// Live checks for importing a mutual fund CAS PDF: password, the Investment-account guidance, the unit balance check
// (match, mismatch, units carried in), duplicates of a fund report already imported, saving, and the Investments page.
// Synthetic data on a disposable account. Optional LEDGER_PREVIEW_CAS (with LEDGER_PREVIEW_PASSWORD) is previewed in
// the browser only, never uploaded, and only counts are printed.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {makePDF} from './fixtures/card-statements.mjs';
import {casPages,casPassword} from './fixtures/cas-statement.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'CAS QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const account=(id,name,type)=>({id,name,bank:'',type,last4:'',currency:'INR',archived:false});
// One SIP instalment already imported from a distributor's report, under the report's scheme name.
const report='Alpha Flexi Cap Fund - Regular Plan - Growth';
const seeded=[{id:'r1',statementId:'si',accountId:'i',account:'Mutual funds',date:'2026-07-10',description:`SIP Purchase · ${report} · Folio 111/01 · 13.027 units @ ₹1918.97`,amount:2500000,category:'Investments',type:'Transfer',review:false},
 {id:'r2',statementId:'si',accountId:'i',account:'Mutual funds',date:'2026-07-10',description:`Stamp duty · ${report} · Folio 111/01`,amount:-125,category:'Taxes',type:'Expense',review:false}];
const casFile=(pages=casPages,name='cas-synthetic.pdf')=>({name,mimeType:'application/pdf',buffer:makePDF(pages,{password:casPassword})});
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const state=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state;
 const data=await(await context.request.get(base+'/api/ledger')).json();
 data.state={schemaVersion:2,initialized:true,rules:[],accounts:[account('b','HDFC Savings','Savings'),account('i','Mutual funds','Investment')],
  statements:[{id:'si',accountId:'i',account:'Mutual funds',name:'fund-report.xlsx',count:2,created:'2026-10-06T00:00:00Z',from:'2026-07-01',to:'2026-07-31'}],transactions:seeded};
 assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 await page.goto(base+'/statements');await page.locator('nav').waitFor();
 const modal=page.locator('#modal'),cancel=()=>modal.locator('[data-action="close"]').filter({hasText:'Cancel'}).click();
 const choose=async(id,password,file)=>{await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption(id);await page.locator('#pdf-password').fill(password);await page.locator('#file-input').setInputFiles(file);};

 if(process.env.LEDGER_PREVIEW_CAS){
  let uploads=0;const block=async route=>{if(route.request().method()==='POST'){uploads++;await route.abort();}else await route.continue();};
  await page.route('**/api/files',block);
  await choose('i',process.env.LEDGER_PREVIEW_PASSWORD||'',{name:'private-preview.pdf',mimeType:'application/pdf',buffer:readFileSync(process.env.LEDGER_PREVIEW_CAS)});
  await page.locator('#commit-import').waitFor({timeout:60000});
  const rows=await page.locator('[data-include]').count(),ok=await page.locator('#reconcile-result .notice.success').count(),errors=await modal.locator('.notice.error').count();
  console.log(`Private CAS preview: ${rows} rows, unit check ${ok?'matched':'NOT matched'}, ${errors} error notice(s).`);
  await cancel();assert.equal(uploads,0,'a private CAS must never leave the browser');assert.equal((await state()).transactions.length,2);
  await page.unroute('**/api/files',block);
 }

 // 1. A wrong password is explained; the right one opens the file.
 await choose('i','not-the-password',casFile());
 await page.locator('#upload-status').getByText('The PDF password is missing or incorrect').waitFor();
 await page.locator('#pdf-password').fill(casPassword);await page.locator('#file-input').setInputFiles(casFile());
 await page.locator('#commit-import').waitFor({timeout:60000});await cancel();

 // 2. Into a savings account: the investment-report guidance.
 await choose('b',casPassword,casFile());await page.locator('#commit-import').waitFor({timeout:60000});
 assert.match(await modal.locator('.notice.error').first().innerText(),/looks like a mutual fund or SIP report, but HDFC Savings is not an Investment account/);await cancel();

 // 3. A row lost from the statement: the unit balance check says which scheme.
 await choose('i',casPassword,casFile(casPages.map(items=>items.filter(i=>i[1]!==500)),'cas-missing-row.pdf'));await page.locator('#commit-import').waitFor({timeout:60000});
 const mismatch=await page.locator('#reconcile-result .notice.error').first().innerText();
 assert.match(mismatch,/Units don’t match the statement’s closing unit balance for 1 of 4 schemes: Alpha Flexi Cap Fund - Regular Growth · Folio 111\/01: the rows add up to 150\.029 units, the statement closes at 163\.322/);
 assert.match(await page.locator('#reconcile-result').innerText(),/don’t follow the unit balance printed beside them: Alpha Flexi Cap Fund/);await cancel();

 // 4. The full statement: every scheme matches, units carried in are explained, the report's instalment is a duplicate.
 await choose('i',casPassword,casFile());await page.locator('#commit-import').waitFor({timeout:60000});
 assert.equal(await page.locator('[data-include]').count(),22);assert.equal(await page.locator('[data-include]:checked').count(),20);
 assert.equal(await page.locator('#st-from').inputValue(),'2026-05-01');assert.equal(await page.locator('#st-to').inputValue(),'2026-10-20');
 assert.match(await page.locator('#reconcile-result .notice.success').innerText(),/Units match the closing unit balance of all 4 schemes\. Every row was read\./);
 assert.match(await page.locator('#reconcile-result').innerText(),/1 scheme began this statement with units bought earlier \(Beta Liquid Fund - Regular Growth · Folio 222\/02: 20\.000\)/);
 assert.match(await modal.innerText(),/2 possible duplicate\(s\) are unchecked/);
 assert.match(await modal.locator('.import-table').innerText(),/SIP Purchase · Alpha Flexi Cap Fund - Regular Plan - Growth · Folio 111\/01 · 13\.512 units @ ₹1850\.10/);
 assert.equal(await modal.locator('.notice.error').count(),0);
 if(process.env.SHOT_DIR)await modal.screenshot({path:process.env.SHOT_DIR+'/cas-review.png'});
 await page.locator('#commit-import').click();await modal.waitFor({state:'hidden'});
 const saved=await state(),mine=saved.transactions.filter(t=>t.accountId==='i');
 assert.equal(mine.length,22);assert.equal(saved.statements.length,2);
 assert.deepEqual((({from,to})=>({from,to}))(saved.statements.find(s=>s.name==='cas-synthetic.pdf')),{from:'2026-05-01',to:'2026-10-20'});
 assert.equal(mine.filter(t=>t.description.includes(report)).length,12,'the CAS uses the scheme name already in the ledger');

 // 5. The Investments page shows the whole holding.
 await page.goto(base+'/investments');const content=page.locator('#page-content');await content.locator('.funds-table').waitFor();
 assert.match(await content.locator(`.funds-table tr[data-fund^="Alpha"]`).innerText(),/163\.322/);
 assert.match(await content.locator(`.funds-table tr[data-fund^="Beta Mid"]`).innerText(),/99\.737/);
 assert.match(await content.locator(`.funds-table tr[data-fund^="Gamma"]`).innerText(),/93\.678/);
 assert.match(await content.locator(`.funds-table tr[data-fund^="Beta Liquid"]`).innerText(),/Import earlier reports/);
 assert.equal(await content.locator('.funds-table tr[data-fund^="Alpha"]').count(),1,'one fund, not one per source');
 assert.match(await content.locator('.sips-card').innerText(),/Alpha Flexi Cap Fund/);
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/cas-investments.png',fullPage:true});
 assert.deepEqual(problems,[]);
 console.log('PASS: CAS import (wrong and right PDF password, Investment-account guidance, unit balance mismatch and running-balance breaks, all schemes matched, units carried in, duplicate of an imported fund report with its scheme name kept, statement period, save) and the Investments page showing full units per fund, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
