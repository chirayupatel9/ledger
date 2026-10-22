// Live checks for undo: the Undo button on the toast after a save, Redo, Ctrl+Z, the change history (undo the latest,
// go back to before an earlier change), a removed receipt staying deleted when its change is undone, and the history
// keeping the last 30 changes. Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'History QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const get=async()=>(await context.request.get(base+'/api/ledger')).json(),put=data=>context.request.put(base+'/api/ledger',{headers:{Origin:base},data});
 const tx=async id=>(await get()).state.transactions.find(t=>t.id===id);
 let data=await get();data.state=insightsLedger();data.action='Synthetic ledger';assert.equal((await put(data)).status(),200);
 const toast=page.locator('#toast'),saved=()=>page.waitForResponse(r=>r.url().startsWith(base+'/api/ledger')&&['PUT','POST'].includes(r.request().method()));

 // 1. Bulk edit, then Undo from the toast, then Redo.
 await page.goto(base+'/transactions');await page.locator('tr[data-transaction="t5"]').waitFor();
 for(const id of ['t5','t14'])await page.locator(`[data-select="${id}"]`).check();
 await page.locator('#bulk-category').selectOption('Shopping');await Promise.all([saved(),page.locator('#bulk-apply').click()]);await toast.getByText('2 transactions updated').waitFor();
 assert.equal((await tx('t5')).category,'Shopping');
 await Promise.all([saved(),toast.getByRole('button',{name:'Undo'}).click()]);await toast.getByText('Undone: Bulk edit of 2 transactions').waitFor();
 assert.deepEqual([(await tx('t5')).category,(await tx('t14')).category],['Food & dining','Food & dining']);assert.match(await page.locator('tr[data-transaction="t5"] .tx-cat').innerText(),/Food & dining/);
 await Promise.all([saved(),toast.getByRole('button',{name:'Redo'}).click()]);await toast.getByText('Redone: Bulk edit of 2 transactions').waitFor();
 await page.waitForFunction(()=>/Shopping/.test(document.querySelector('tr[data-transaction="t5"] .tx-cat')?.textContent||''));assert.equal((await tx('t5')).category,'Shopping','redone');

 // 2. Ctrl+Z (outside a text box) undoes the latest change.
 await page.locator('h1').click();await Promise.all([saved(),page.keyboard.press('Control+z')]);await toast.getByText('Undone: Bulk edit of 2 transactions').waitFor();
 assert.equal((await tx('t5')).category,'Food & dining');

 // 3. Two edits, then go back to before the first from the change history: both are undone; then undo that.
 const edit=async(field,value)=>{await page.locator('[data-edit="t6"]').click();await page.locator(`#inline-transaction-form [name="${field}"]`).fill(value);await Promise.all([saved(),page.locator('#inline-transaction-form button[type="submit"]').click()]);await toast.getByText('Transaction saved').waitFor();};
 await edit('note','Weekly groceries');await edit('displayName','Reliance Smart');
 assert.deepEqual([(await tx('t6')).note,(await tx('t6')).displayName],['Weekly groceries','Reliance Smart']);
 await page.locator('header [data-action="history"]').click();const modal=page.locator('#modal');await modal.locator('.history-row').first().waitFor();
 assert.deepEqual(await modal.locator('.history-row b').evaluateAll(b=>b.slice(0,2).map(x=>x.textContent)),['Transaction edited','Transaction edited']);
 assert.equal(await modal.locator('.history-row').first().locator('button').innerText(),'Undo');
 page.once('dialog',d=>{assert.match(d.message(),/also undoes the 1 change after it/);d.accept();});
 await Promise.all([saved(),modal.locator('.history-row').nth(1).locator('button').click()]);await toast.getByText('Back to before: Transaction edited').waitFor();
 let t=await tx('t6');assert.equal(t.note,undefined);assert.equal(t.displayName,undefined);
 await Promise.all([saved(),toast.getByRole('button',{name:'Undo this'}).click()]);await toast.getByText(/^Undone:/).waitFor();
 t=await tx('t6');assert.deepEqual([t.note,t.displayName],['Weekly groceries','Reliance Smart']);

 // 4. A removed receipt is deleted at once; undoing its removal brings the rest back without it.
 const jpeg=Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9','hex');
 assert.equal((await context.request.post(base+'/api/files',{headers:{Origin:base},multipart:{id:'history-receipt',file:{name:'bill.jpg',mimeType:'image/jpeg',buffer:jpeg}}})).status(),201);
 data=await get();data.state.transactions.find(t=>t.id==='t6').receipts=[{id:'history-receipt',name:'bill.jpg',addedAt:new Date().toISOString()}];data.action='Receipt attached';assert.equal((await put(data)).status(),200);
 data=await get();const t6=data.state.transactions.find(t=>t.id==='t6');delete t6.receipts;t6.note='Receipt removed';data.action='Receipt removed';assert.equal((await put(data)).status(),200);
 assert.equal((await context.request.get(base+'/api/files/history-receipt')).status(),404,'deleted straight away');
 data=await get();const undone=await context.request.post(base+'/api/ledger/restore',{headers:{Origin:base},data:{revision:data.revision,to:data.revision-1}});assert.equal(undone.status(),200);
 const restored=await undone.json();assert.equal(restored.missingFiles,1);assert.equal(restored.state.transactions.find(t=>t.id==='t6').note,'Weekly groceries');assert.equal(restored.state.transactions.find(t=>t.id==='t6').receipts,undefined);

 // 5. A stale revision is refused; the history keeps the last 30 changes.
 assert.equal((await context.request.post(base+'/api/ledger/restore',{headers:{Origin:base},data:{revision:restored.revision-1,to:restored.revision-2}})).status(),409);
 for(let i=0;i<32;i++){data=await get();data.state.transactions.find(t=>t.id==='t6').note='Note '+i;data.action='Note '+i;assert.equal((await put(data)).status(),200);}
 const history=await(await context.request.get(base+'/api/ledger/history')).json();assert.equal(history.changes.length,30);assert.equal(history.changes[0].action,'Note 31');
 data=await get();assert.equal((await context.request.post(base+'/api/ledger/restore',{headers:{Origin:base},data:{revision:data.revision,to:history.changes.at(-1).before-1}})).status(),404,'older changes are gone');

 // 6. Phone: the history fits the screen.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 await p.goto(base+'/settings');await p.locator('.settings-links [data-action="history"]').tap();await p.locator('#modal .history-row').first().waitFor();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fits a phone');
 assert.deepEqual(problems,[]);
 console.log('PASS: Undo and Redo from the toast after a bulk edit; Ctrl+Z; change history with undo and going back two changes (and undoing that); a removed receipt stays deleted and the rest comes back; stale revision refused; last 30 changes kept; phone layout; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
