// Live checks for sorting Transactions: newest first by default; column headings sort by amount (by size, both ways),
// name, category and status and show which way; the Sort menu follows and works on a phone; sorting combines with filters
// and is remembered on the device. Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Sort QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
const fixture=insightsLedger();for(const t of fixture.transactions)if(['t6','t15'].includes(t.id))t.review=true;
const byId=new Map(fixture.transactions.map(t=>[t.id,t])),collator=new Intl.Collator('en-IN',{sensitivity:'base',numeric:true});
const ordered=(list,cmp)=>list.every((x,i)=>!i||cmp(list[i-1],x)<=0);
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=fixture;assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const ids=pg=>pg.locator('#transaction-results tr[data-transaction]').evaluateAll(r=>r.map(x=>x.dataset.transaction)),rows=async pg=>(await ids(pg)).map(id=>byId.get(id));
 const ariaSort=key=>page.locator(`th:has([data-sort-key="${key}"])`).getAttribute('aria-sort');
 const heading=async key=>{await page.locator(`[data-sort-key="${key}"]`).click();await page.locator(`[data-sort-key="${key}"].active`).waitFor();};

 // 1. Newest first by default.
 await page.goto(base+'/transactions');await page.locator('tr[data-transaction]').first().waitFor();
 let list=await rows(page);assert.equal(list.length,37);assert.ok(ordered(list,(a,b)=>b.date.localeCompare(a.date)),'newest first');
 assert.equal(await ariaSort('date'),'descending');assert.equal(await page.locator('#sort').inputValue(),'date:desc');

 // 2. Amount: largest first (money in or out), then smallest first; the heading keeps focus.
 await heading('amount');list=await rows(page);assert.ok(ordered(list,(a,b)=>Math.abs(b.amount)-Math.abs(a.amount)),'largest first');assert.equal(Math.abs(list[0].amount),12500000);
 assert.equal(await ariaSort('amount'),'descending');assert.equal(await ariaSort('date'),'none');assert.equal(await page.locator('#sort').inputValue(),'amount:desc');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.sortKey),'amount');
 await heading('amount');await page.waitForFunction(()=>document.querySelector('th:has([data-sort-key="amount"])').getAttribute('aria-sort')==='ascending');
 list=await rows(page);assert.ok(ordered(list,(a,b)=>Math.abs(a.amount)-Math.abs(b.amount)),'smallest first');

 // 3. Name A–Z, category A–Z, needs review first.
 await heading('name');const names=await page.locator('#transaction-results .transaction-name').allInnerTexts();assert.ok(ordered(names,collator.compare),'names A–Z');assert.notDeepEqual(names,[...names].reverse());
 await heading('category');const cats=await page.locator('#transaction-results .tx-cat .pill').allInnerTexts();assert.ok(ordered(cats.map(c=>c.trim()),collator.compare),'categories A–Z');
 await heading('status');assert.deepEqual((await ids(page)).slice(0,2).sort(),['t15','t6'],'needs review first');

 // 4. With a filter: expenses, largest first, picked from the Sort menu.
 await page.locator('#type-filter').selectOption('Expense');await page.locator('#sort').selectOption('amount:desc');await page.locator('[data-sort-key="amount"].active').waitFor();
 list=await rows(page);assert.ok(list.every(t=>t.type==='Expense'));assert.ok(ordered(list,(a,b)=>Math.abs(b.amount)-Math.abs(a.amount)));assert.equal(list[0].amount,-3500000);

 // 5. Remembered on this device after a reload.
 await page.reload();await page.locator('tr[data-transaction]').first().waitFor();assert.equal(await page.locator('#sort').inputValue(),'amount:desc');assert.equal(Math.abs((await rows(page))[0].amount),12500000);

 // 6. Phone: no headings, so the Sort menu; nothing wider than the screen.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 await p.goto(base+'/transactions');await p.locator('tr[data-transaction]').first().waitFor();await p.locator('#sort').selectOption('date:asc');
 await p.waitForFunction(first=>document.querySelector('#transaction-results tr[data-transaction]')?.dataset.transaction===first,[...fixture.transactions].sort((a,b)=>a.date.localeCompare(b.date))[0].id);
 assert.ok(ordered(await rows(p),(a,b)=>a.date.localeCompare(b.date)),'oldest first');
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'nothing is wider than the phone screen');
 assert.deepEqual(problems,[]);
 console.log('PASS: newest first by default; sorting by amount (both ways), name, category and status from the headings with aria-sort and focus kept; Sort menu with a type filter; remembered after reload; phone Sort menu; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
