// Live checks for making Ledger your own: hide and reorder dashboard and Reports cards (saved to the account, kept after a
// reload, reset to default), and mark a recurring payment as not recurring from Reports or Coming up, then restore it.
// Synthetic four-month ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {insightsLedger} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Customize QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const ledger=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state;
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=insightsLedger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const modal=page.locator('#modal'),toast=page.locator('#toast'),order=()=>page.locator('.board > .board-item').evaluateAll(els=>els.map(e=>e.dataset.card));

 // 1. Dashboard: hide Savings rate, move Coming up to the top.
 await page.goto(base+'/');await page.locator('.board').waitFor();assert.equal((await order())[0],'insights','default order');
 await page.locator('[data-action="customize-dashboard"]').click();await modal.locator('#customize-list').waitFor();
 await modal.locator('[data-customize="savingsTrend"] input[type="checkbox"]').uncheck();
 for(let i=0;i<4;i++)await modal.locator('[data-customize="upcoming"] [data-by="-1"]').click();
 assert.equal(await modal.locator('#customize-list li').first().getAttribute('data-customize'),'upcoming');
 await modal.locator('#customize-save').click();await toast.getByText('Dashboard layout saved').waitFor();
 await page.reload();await page.locator('.board').waitFor();assert.equal((await order())[0],'upcoming','kept after a reload');assert.equal(await page.locator('#savings-trend-card').count(),0);
 let state=await ledger();assert.equal(state.preferences.dashboardOrder[0],'upcoming');assert.equal(state.preferences.showSavingsTrend,false);

 // 2. Reports: hide the spending calendar, put Top payees first.
 await page.goto(base+'/reports');await page.locator('.board').waitFor();
 await page.locator('[data-action="customize-reports"]').click();await modal.locator('[data-customize="calendar"] input[type="checkbox"]').uncheck();
 while(await modal.locator('#customize-list li').first().getAttribute('data-customize')!=='payees')await modal.locator('[data-customize="payees"] [data-by="-1"]').click();
 await modal.locator('#customize-save').click();await toast.getByText('Reports layout saved').waitFor();
 assert.equal((await order())[0],'payees');assert.equal(await page.locator('#calendar-card').count(),0);
 state=await ledger();assert.deepEqual(state.preferences.reportsHidden,['calendar']);

 // 3. Mark Netflix as not recurring on Reports, then restore it.
 const recurring=page.locator('.recurring-card');await recurring.getByText('Netflix').first().waitFor();
 await recurring.locator('[data-not-recurring][data-payee="Netflix"]').click();await toast.getByText('Netflix is no longer treated as a recurring payment').waitFor();
 assert.equal(await page.locator('.recurring-card [data-payee="Netflix"]').count(),0);state=await ledger();assert.equal(state.recurringDismissed.length,1);
 await page.goto(base+'/');await page.locator('#upcoming-card').waitFor();assert.doesNotMatch(await page.locator('#upcoming-card').innerText(),/Netflix/,'gone from Coming up too');
 await page.goto(base+'/reports');await page.locator('[data-action="recurring-hidden"]').click();await modal.getByText('Netflix').waitFor();
 await modal.locator('[data-restore-recurring]').click();await toast.getByText('Restored as a recurring payment').waitFor();
 assert.equal(await page.locator('.recurring-card [data-payee="Netflix"]').count(),1);state=await ledger();assert.equal(state.recurringDismissed.length,0);

 // 4. From Coming up on the dashboard.
 await page.goto(base+'/');const upcoming=page.locator('#upcoming-card');await upcoming.getByText('Swiggy').waitFor();
 await upcoming.locator('[data-not-recurring][data-payee="Swiggy"]').first().click();await toast.getByText('Swiggy is no longer treated as a recurring payment').waitFor();
 assert.doesNotMatch(await page.locator('#upcoming-card').innerText(),/Swiggy/);

 // 5. Reset the dashboard to the default layout.
 await page.locator('[data-action="customize-dashboard"]').click();await modal.locator('#customize-reset').click();await toast.getByText('Default layout restored').waitFor();
 assert.equal((await order())[0],'insights');assert.equal(await page.locator('#savings-trend-card').count(),1);

 // 6. Phone: one column, nothing wider than the screen.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 for(const path of ['/','/reports']){await p.goto(base+path);await p.locator('.board').waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path);}
 await p.locator('[data-action="customize-reports"]').click();await p.locator('#customize-list').waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'the Customize list fits a phone');
 assert.deepEqual(problems,[]);
 console.log('PASS: dashboard and Reports cards hidden and reordered (saved, kept after reload, reset), not recurring from Reports and Coming up and restored, phone layout, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
