// Live checks for the dashboard insights and the new Reports and Investments charts, on four months of synthetic data:
// insight notes, net worth, payments coming up, spending by category, savings rate, tax-saving progress, top payees,
// payment methods, the month's waterfall, unusual payments, account and card balances, the spending calendar and fund
// allocation; turning a card off in Settings; the phone layout and dark theme; no CSP violations.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Insights QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
import {insightsLedger as ledger} from './fixtures/insights-ledger.mjs';
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=ledger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200,'synthetic ledger accepted');
 const content=page.locator('#page-content');

 // Dashboard
 await page.goto(base+'/');await content.locator('#net-worth-card').waitFor();
 assert.ok(await content.locator('.insight-chip').count()>=3,'insight notes under the totals');
 assert.match(await content.locator('.insight-chips').innerText(),/Shopping: up ₹15,000/);
 const net=await content.locator('#net-worth-card').innerText();assert.match(net,/Net worth[\s\S]*₹/);assert.equal(await content.locator('#net-worth-card svg.kit path').count()>=3,true);
 assert.match(await content.locator('#upcoming-card').innerText(),/Coming up[\s\S]*Landlord Ramesh Kumar[\s\S]*₹35,000/);
 assert.equal(await content.locator('#category-trend-card svg.kit rect').count()>=8,true);
 assert.match(await content.locator('#savings-trend-card').innerText(),/average \d+%/);
 assert.match(await content.locator('#tax-card').innerText(),/80C[\s\S]*₹18,000(?:\.00)? of ₹1,50,000(?:\.00)?[\s\S]*₹1,32,000(?:\.00)? left/);
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/dashboard.png',fullPage:true});

 // Reports
 await page.goto(base+'/reports');await content.locator('#payees-card').waitFor();
 for(const id of ['payees-card','methods-card','waterfall-card','unusual-card','balances-card','cards-card','calendar-card'])assert.equal(await content.locator('#'+id).count(),1,id);
 assert.match(await content.locator('#methods-card').innerText(),/UPI[\s\S]*Card[\s\S]*Auto-debit/);
 assert.match(await content.locator('#waterfall-card').innerText(),/Opening balance[\s\S]*Income[\s\S]*Invested[\s\S]*Closing balance/);
 assert.match(await content.locator('#unusual-card').innerText(),/Much more than usual[\s\S]*₹15,000/);
 assert.ok(await content.locator('#calendar-card rect.heat').count()>100,'a day-by-day calendar');
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/reports.png',fullPage:true});

 // Investments allocation
 await page.goto(base+'/investments');await content.locator('.allocation-card').waitFor();assert.match(await content.locator('.allocation-card').innerText(),/Alpha Flexi Cap Fund[\s\S]*Through SIPs/);

 // A card can be turned off in Settings.
 await page.goto(base+'/settings');await page.locator('#preferences-form').waitFor();await page.getByLabel('Tax-saving progress').uncheck();
 await page.locator('#preferences-form button[type="submit"]').first().click();await page.locator('#toast').getByText(/saved/i).waitFor();
 await page.goto(base+'/');await content.locator('#net-worth-card').waitFor();assert.equal(await content.locator('#tax-card').count(),0,'tax card hidden');

 // Phone and dark theme: no sideways scroll, charts still drawn.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 p.on('pageerror',e=>problems.push('pageerror: '+e.message));
 for(const path of ['/','/reports','/investments']){await p.goto(base+path);await p.locator('#page-content .card').first().waitFor();await p.waitForTimeout(300);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} fits a phone`);}
 await p.goto(base+'/');await p.locator('#net-worth-card').waitFor();if(process.env.SHOT_DIR)await p.screenshot({path:process.env.SHOT_DIR+'/phone.png',fullPage:true});
 await p.evaluate(()=>{document.documentElement.dataset.theme='dark'});assert.ok(await p.locator('#net-worth-card svg.kit').isVisible());
 assert.deepEqual(problems,[]);
 console.log('PASS: dashboard insights (notes, net worth, coming up, categories by month, savings rate, tax progress), Reports charts (payees, payment methods, waterfall, unusual, balances, cards, calendar), investment allocation, Settings toggle, phone layout and dark theme, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
