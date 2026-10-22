// Live checks for categories learned from payees: a suggestion on a row in Needs review (use it, or use them all), the
// offer to put a payee's other transactions in the category you just chose, and an imported statement taking the
// category you use for that payee. Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Learn QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const ramesh=i=>`UPI-RAMESH KUMAR-ramesh.k@okhdfcbank-6285333344${String(i).padStart(2,'0')}-MILK`,swiggy=i=>`UPI-SWIGGY LIMITED-swiggy@axisbank-6285123456${String(i).padStart(2,'0')}`;
const tx=(id,day,description,amount,category,type,review=false)=>({id,statementId:'s',accountId:'h',account:'HDFC Savings',date:`2026-09-${String(day).padStart(2,'0')}`,description,amount,category,type,review});
const ledger=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false}],statements:[{id:'s',accountId:'h',account:'HDFC Savings',name:'s.csv',count:0,created:'2026-10-01T00:00:00Z'}],
 transactions:[tx('r1',1,ramesh(1),-600000,'Groceries','Expense'),tx('r2',2,ramesh(2),-600000,'Groceries','Expense'),tx('r3',3,ramesh(3),-600000,'Uncategorized','Expense',true),tx('r4',4,ramesh(4),-600000,'Uncategorized','Expense',true),tx('r5',5,ramesh(5),-600000,'Uncategorized','Expense',true),
  tx('w1',6,swiggy(1),-45000,'Food & dining','Expense'),tx('w2',7,swiggy(2),-46000,'Food & dining','Expense'),tx('w3',8,swiggy(3),-47000,'Food & dining','Expense'),tx('x1',9,'UPI/DR/628599990001/PAYMENT',-1000,'Uncategorized','Expense',true)]});
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const get=async()=>(await context.request.get(base+'/api/ledger')).json(),tx_=async id=>(await get()).state.transactions.find(t=>t.id===id);
 let data=await get();data.state=ledger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const toast=page.locator('#toast'),saved=()=>page.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT');

 // 1. Needs review: Ramesh Kumar's rows suggest Groceries (from the two settled ones); the generic UPI row suggests nothing.
 await page.goto(base+'/transactions');await page.locator('[data-action="review-toggle"]').click();await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===4);
 assert.equal(await page.locator('[data-suggest]').count(),3);assert.equal(await page.locator('tr[data-transaction="x1"] [data-suggest]').count(),0);
 assert.match(await page.locator('tr[data-transaction="r3"] [data-suggest]').innerText(),/Groceries\? Use it/);
 await Promise.all([saved(),page.locator('tr[data-transaction="r3"] [data-suggest]').click()]);await toast.getByText('Ramesh Kumar: Groceries, as before').waitFor();
 let t=await tx_('r3');assert.deepEqual([t.category,t.review],['Groceries',false]);

 // 2. Use all the remaining suggestions at once.
 const all=page.locator('[data-action="accept-suggestions"]');assert.match(await all.innerText(),/Use 2 suggested categories/);
 await Promise.all([saved(),all.click()]);await toast.getByText(/2 transactions categorised like your earlier payments/).waitFor();
 for(const id of ['r4','r5']){t=await tx_(id);assert.deepEqual([t.category,t.review],['Groceries',false],id);}
 assert.equal(await all.count(),0);

 // 3. Change one Swiggy payment's category: the offer puts the other two in the same category.
 await page.locator('[data-action="review-toggle"]').click();await page.locator('[data-edit="w1"]').click();await page.locator('#inline-transaction-form [name="category"]').selectOption('Entertainment');
 await Promise.all([saved(),page.locator('#inline-transaction-form button[type="submit"]').click()]);
 const offer=toast.getByRole('button',{name:'Also put 2 other Swiggy transactions in Entertainment'});await offer.waitFor();
 await Promise.all([saved(),offer.click()]);await toast.getByText('2 more Swiggy transactions now in Entertainment').waitFor();
 assert.deepEqual(await Promise.all(['w1','w2','w3'].map(async id=>(await tx_(id)).category)),['Entertainment','Entertainment','Entertainment']);

 // 4. An imported statement row from Ramesh Kumar takes Groceries and is settled (seen more than once before).
 await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption('h');
 await page.locator('#file-input').setInputFiles({name:'october.csv',mimeType:'text/csv',buffer:Buffer.from(`Date,Description,Debit,Credit\n05/10/2026,"${ramesh(9)}",6000,\n06/10/2026,"UPI-NEW SHOP-newshop@ybl-628512349999",250,\n`)});
 await page.locator('#map-next').click();await page.locator('#modal').getByText('1 row got the category you use for that payee.').waitFor();
 await Promise.all([saved(),page.locator('#commit-import').click()]);await toast.getByText(/2 transactions and the original statement saved/).waitFor();
 const imported=(await get()).state.transactions.filter(t=>t.date>='2026-10-01');
 const r=imported.find(t=>/RAMESH/.test(t.description)),n=imported.find(t=>/NEW SHOP/.test(t.description));
 assert.deepEqual([r.category,r.review],['Groceries',false]);assert.equal(n.review,true,'a payee seen for the first time still needs review');
 assert.deepEqual(problems,[]);
 console.log('PASS: suggestions in Needs review from settled payments (one, then all at once), none for generic UPI rows; changing one payee’s category offers the rest; an import takes the learned category; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
