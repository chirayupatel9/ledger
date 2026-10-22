// Live checks for monthly budgets: the empty card, setting budgets (with last month's spending as a hint and bad amounts
// refused), the card's progress and status per budget, the dashboard notes for budgets over or nearly used, a row
// opening its transactions, and clearing a budget. Synthetic four-month ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger,ledgerMonths} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Budgets QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const get=async()=>(await context.request.get(base+'/api/ledger')).json();
 let data=await get();data.state=insightsLedger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const card=page.locator('#budgets-card'),modal=page.locator('#modal'),toast=page.locator('#toast'),saved=()=>page.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT');

 // 1. No budgets yet: the card invites you to set some.
 await page.goto(base+'/');await card.waitFor();assert.match(await card.innerText(),/Set a monthly limit/);
 await card.locator('[data-action="budgets"]').click();await modal.locator('#budget-form').waitFor();
 assert.match(await modal.locator('label',{has:page.locator('[data-budget="Shopping"]')}).innerText(),/Shopping[\s\S]*₹1,899/,'last month’s spending as a hint');

 // 2. A bad amount is refused; then all spending, Food & dining and Shopping are saved.
 await modal.locator('[data-budget="Food & dining"]').fill('abc');await modal.locator('#budget-save').click();await toast.getByText(/Enter an amount above zero for Food & dining/).waitFor();
 assert.deepEqual((await get()).state.budgets||[],[],'nothing saved');
 await modal.locator('[data-budget=""]').fill('1,00,000');await modal.locator('[data-budget="Food & dining"]').fill('500');await modal.locator('[data-budget="Shopping"]').fill('20000');
 await Promise.all([saved(),modal.locator('#budget-save').click()]);await toast.getByText('3 budgets saved').waitFor();
 assert.deepEqual((await get()).state.budgets,[{category:'',amount:10000000},{category:'Food & dining',amount:50000},{category:'Shopping',amount:2000000}]);

 // 3. The card: all spending first, then by share used, each with its status; Food & dining is over, Shopping nearly used.
 const rows=card.locator('.budget-row');assert.equal(await rows.count(),3);assert.match(await rows.first().innerText(),/All spending/);
 const food=card.locator('.budget-row',{hasText:'Food & dining'}),shop=card.locator('.budget-row',{hasText:'Shopping'});
 assert.match(await food.innerText(),/Over[\s\S]*₹649 of ₹500[\s\S]*₹149 over/);assert.ok(await food.evaluate(e=>e.classList.contains('over')));
 assert.match(await shop.innerText(),/Nearly used[\s\S]*₹16,899 of ₹20,000[\s\S]*₹3,101 left/);

 // 4. The dashboard notes lead with the budget over, then the one nearly used.
 const chips=await page.locator('.insight-chip').allInnerTexts();
 assert.match(chips[0],/Food & dining: ₹149\.00 over this month’s budget\./);assert.match(chips[1],/Shopping: ₹3,101\.00 left of this month’s budget, with \d+ days? to go\./);

 // 5. A budget row opens that category's transactions for the month.
 await food.click();await page.waitForURL(/\/transactions/);assert.equal(await page.locator('#category-filter').inputValue(),'Food & dining');assert.ok(page.url().includes(ledgerMonths.at(-1)));
 await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===1);

 // 6. Clearing a budget removes its row.
 await page.goto(base+'/');await card.locator('[data-action="budgets"]').click();await modal.locator('[data-budget="Food & dining"]').fill('');
 await Promise.all([saved(),modal.locator('#budget-save').click()]);await toast.getByText('2 budgets saved').waitFor();assert.equal(await card.locator('.budget-row').count(),2);

 // 7. Phone: the card and the editor fit.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 await p.goto(base+'/');await p.locator('#budgets-card').waitFor();await p.locator('#budgets-card [data-action="budgets"]').tap();await p.locator('#budget-form').waitFor();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fits a phone');
 assert.deepEqual(problems,[]);
 console.log('PASS: budgets (empty card, last month hint, bad amount refused, three saved, progress and status per budget, dashboard notes for over and nearly used, row opens its transactions, budget cleared), phone layout, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
