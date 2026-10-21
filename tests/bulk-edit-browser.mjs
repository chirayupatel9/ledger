// Live checks for bulk edit from Needs review: give several transactions one title (with the selected rows' current
// titles offered), together with marking them reviewed or not, and the bar on a phone. Synthetic ledger, disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Bulk QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
const swiggy=['t5','t14','t23','t32'],reliance=['t6','t15','t24','t33'];
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const ledger=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state;
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=insightsLedger();for(const t of data.state.transactions)if([...swiggy,...reliance].includes(t.id))t.review=true;
 assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const shown=()=>page.locator('#transaction-results tr[data-transaction]').count(),waitShown=n=>page.waitForFunction(n=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===n,n);
 const apply=async text=>{await Promise.all([page.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT'),page.locator('#bulk-apply').click()]);await page.locator('#toast').getByText(text).waitFor();};

 // 1. Needs review: the selected rows' current titles are offered; one title for the four Reliance payments, marked reviewed.
 await page.goto(base+'/transactions');await page.locator('[data-action="review-toggle"]').click();await waitShown(8);
 for(const id of reliance)await page.locator(`[data-select="${id}"]`).check();
 assert.deepEqual(await page.locator('#bulk-name-list option').evaluateAll(o=>o.map(x=>x.value)),['Reliance Retail Ltd']);
 await page.locator('#bulk-name').fill('  Weekly   groceries ');await apply('4 transactions updated');await waitShown(4);
 let state=await ledger();for(const id of reliance){const t=state.transactions.find(t=>t.id===id);assert.equal(t.displayName,'Weekly groceries',id);assert.equal(t.review,false,id);}

 // 2. A title for the Swiggy payments while leaving them in Needs review; the selection keeps a typed title when it changes.
 await page.locator(`[data-select="${swiggy[0]}"]`).check();await page.locator('#bulk-name').fill('Food delivery');
 for(const id of swiggy.slice(1))await page.locator(`[data-select="${id}"]`).check();
 assert.equal(await page.locator('#bulk-name').inputValue(),'Food delivery');await page.locator('#bulk-reviewed').uncheck();
 await apply('4 transactions updated');await waitShown(4);
 assert.deepEqual(await page.locator('#transaction-results .transaction-name').allInnerTexts(),Array(4).fill('Food delivery'));
 state=await ledger();for(const id of swiggy){const t=state.transactions.find(t=>t.id===id);assert.equal(t.displayName,'Food delivery',id);assert.equal(t.review,true,id);}

 // 3. With every row selected, all their titles are offered; nothing changes without a choice.
 await page.locator('[data-select-all]').check();await page.locator('#bulk-reviewed').uncheck();
 assert.deepEqual(await page.locator('#bulk-name-list option').evaluateAll(o=>o.map(x=>x.value)),['Food delivery']);
 await page.locator('#bulk-apply').click();await page.locator('#toast').getByText('Choose a change to apply.').waitFor();

 // 4. Phone: the bulk bar with its title box fits the screen.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 await p.goto(base+'/transactions');await p.locator(`[data-select="${swiggy[0]}"]`).check();await p.locator('#bulk-name').waitFor();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'nothing is wider than the phone screen');
 assert.deepEqual(problems,[]);
 console.log('PASS: bulk title from Needs review (titles offered, trimmed, with and without marking reviewed, kept while selecting), no-op guard, phone layout, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
