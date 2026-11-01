// Live checks for interactive charts: hover tooltips, clicking a bar, ring part, legend row, calendar day, payee or
// waterfall row opens the matching transactions; legends switch a series off and on; arrow keys, Enter and Escape;
// tapping on a phone pins the tooltip with a button. Synthetic four-month ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger,ledgerMonths} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Charts QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
const fixture=insightsLedger(),byId=new Map(fixture.transactions.map(t=>[t.id,t])),long=m=>new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'long',year:'numeric'});
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=fixture;assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const tip=page.locator('.kit-tip'),rows=async pg=>(await pg.locator('#transaction-results tr[data-transaction]').evaluateAll(r=>r.map(x=>x.dataset.transaction))).map(id=>byId.get(id));
 const onTransactions=async pg=>{await pg.waitForURL(/\/transactions/);await pg.locator('#transaction-results').waitFor();return rows(pg);};
 const drillOf=async loc=>JSON.parse(await loc.getAttribute('data-drill'));
 const dashboard=async()=>{await page.goto(base+'/');await page.locator('#net-worth-card').waitFor();};

 // 1. Money in, money out: hovering a bar shows the month's totals; clicking the Expenses bar opens that month's expenses.
 await dashboard();const expenses=page.locator('.chart .kit-seg[fill="#fd6e88"]').last();
 await expenses.hover();await tip.waitFor();const text=await tip.innerText();
 assert.match(text,new RegExp(long(ledgerMonths.at(-1))));assert.match(text,/Income[\s\S]*Expenses[\s\S]*Net/);assert.match(text,/Click to see/);
 const month=(await drillOf(expenses)).month;await expenses.click();let list=await onTransactions(page);
 assert.ok(page.url().includes(month),'the period is that month');assert.equal(await page.locator('#type-filter').inputValue(),'Expense');
 assert.ok(list.length>0&&list.every(t=>t.type==='Expense'&&t.date.startsWith(month)));

 // 2. Where it all goes: hovering a legend row highlights its part; clicking it opens that category.
 await dashboard();const rentRow=page.locator('.category-legend [data-for]').first();await rentRow.hover();await tip.waitFor();
 assert.match(await tip.innerText(),/Rent[\s\S]*Spent[\s\S]*Share/);assert.equal(await page.locator('.category-content circle.on').count(),1);
 await rentRow.click();list=await onTransactions(page);assert.equal(await page.locator('#category-filter').inputValue(),'Rent');assert.ok(list.length===4&&list.every(t=>t.category==='Rent'));

 // 3. Spending by category: a part's tooltip lists the month with that part in bold; the legend switches a category off and on.
 await dashboard();const trend=page.locator('#category-trend-card');const segs=()=>trend.locator('.kit-seg').count(),before=await segs();
 await trend.locator('.kit-seg').first().hover();await tip.waitFor();assert.equal(await tip.locator('.kit-tip-row.on').count(),1);assert.match(await tip.innerText(),/Total/);
 const toggle=trend.locator('[data-series-toggle]').first(),name=await toggle.getAttribute('data-series-toggle');await toggle.click();
 await page.waitForFunction(n=>document.querySelector(`#category-trend-card [data-series-toggle="${n}"]`)?.getAttribute('aria-pressed')==='false',name);
 assert.ok(await segs()<before,'the category is switched off');
 await trend.locator(`[data-series-toggle="${name}"]`).click();await page.waitForFunction(([n,b])=>document.querySelectorAll('#category-trend-card .kit-seg').length===b,[name,before]);
 assert.equal(await trend.locator(`[data-series-toggle="${name}"]`).getAttribute('aria-pressed'),'true');

 // 4. Keyboard: arrow keys move month by month, Escape closes, Enter opens the month (savings rate).
 const net=page.locator('#net-worth-card .kit-live');await net.press('ArrowRight');await tip.waitFor();assert.match(await tip.innerText(),new RegExp(long(ledgerMonths[0])));assert.match(await tip.innerText(),/Net worth/);
 await net.press('End');assert.match(await tip.innerText(),new RegExp(long(ledgerMonths.at(-1))));await net.press('Escape');await tip.waitFor({state:'hidden'});
 const savings=page.locator('#savings-trend-card .kit-live');await savings.press('End');await tip.waitFor();assert.match(await tip.innerText(),/Press Enter/);
 const active=await drillOf(savings.locator('.kit-hit.on'));assert.equal(active.month,ledgerMonths.at(-1),'End picks the latest month');await savings.press('Enter');
 await onTransactions(page);assert.ok(page.url().includes(active.month),`Enter opens that month: ${page.url()}`);

 // 5. Reports: a calendar day, a payee and a waterfall row each open their transactions.
 await page.goto(base+'/reports');await page.locator('#calendar-card').waitFor();
 const day=page.locator('#calendar-card [data-drill]').last(),date=(await drillOf(day)).day;await day.hover();await tip.waitFor();assert.match(await tip.innerText(),/Spent/);
 await day.click();list=await onTransactions(page);assert.ok(list.length>0&&list.every(t=>t.date===date),'only that day');
 const all=(await rows(page)).length;await page.locator('[data-action="clear-day"]').click();await page.waitForFunction(n=>document.querySelectorAll('#transaction-results tr[data-transaction]').length>n,all);
 await page.goto(base+'/reports');const payee=page.locator('#payees-card .kit-go').first(),search=(await drillOf(payee)).search;await payee.click();list=await onTransactions(page);
 assert.equal(await page.locator('#search').inputValue(),search);assert.ok(list.length>0);
 await page.goto(base+'/reports');await page.locator('#waterfall-card').waitFor();const step=page.locator('#waterfall-card .kit-go').filter({hasText:'Groceries'});
 const target=await drillOf(step);await step.click();list=await onTransactions(page);assert.equal(await page.locator('#category-filter').inputValue(),'Groceries');
 assert.ok(list.length>0&&list.every(t=>t.category==='Groceries'&&t.date.startsWith(target.month)));

 // 6. Phone: a tap pins the tooltip with a button; tapping elsewhere closes it; the button opens the transactions.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 p.on('pageerror',e=>problems.push('phone pageerror: '+e.message));
 await p.goto(base+'/');const bar=p.locator('.chart .kit-seg[fill="#3b7fc4"]').last();await bar.tap();const ptip=p.locator('.kit-tip.pinned');await ptip.waitFor();
 assert.match(await ptip.innerText(),/Income/);await p.locator('.metrics').first().tap();await p.locator('.kit-tip').waitFor({state:'hidden'});
 await bar.tap();await ptip.locator('.kit-tip-go').tap();list=await onTransactions(p);assert.equal(await p.locator('#type-filter').inputValue(),'Income');assert.ok(list.every(t=>t.type==='Income'));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'nothing is wider than the phone screen');
 assert.deepEqual(problems,[]);
 console.log('PASS: tooltips on bars, ring and legend, calendar; clicks open a month by type, a category, a day (with clear), a payee and a waterfall category; series switched off and on; arrow keys, End, Escape, Enter; phone tap pins a tooltip, tap outside closes, its button opens transactions; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
