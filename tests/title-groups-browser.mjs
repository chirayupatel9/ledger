// Live checks for Transaction titles grouped by title: each title once with its transactions; renaming a title renames
// all of them (an automatic title gets a rule so later imports follow, a naming rule's title changes, your own titles
// change); renaming onto an existing title merges; renaming back drops the rule; single corrections still work.
// Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Titles QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const tx=(id,date,description,amount,category,type)=>({id,statementId:'s',accountId:'h',account:'HDFC Savings',date,description,amount,category,type,review:false});
const ledger=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false}],statements:[{id:'s',accountId:'h',account:'HDFC Savings',name:'s.csv',count:0,created:'2026-10-01T00:00:00Z'}],
 titleRules:[{id:'r1',mode:'contains',keyword:'hdfc life',title:'Life insurance'}],
 transactions:[...[1,2,3,4].map(i=>tx('st'+i,`2026-0${5+i}-10`,`IMPS-SELF TRANSFER TO XX99${i}0-${8000+i}12345`,-1000000*i,'Transfers','Transfer')),
  ...[1,2,3].map(i=>tx('sw'+i,`2026-0${6+i}-1${i}`,`UPI-SWIGGY LIMITED-swiggy@axisbank-62851234567${i}`,-45000-i*100,'Food & dining','Expense')),
  ...[1,2].map(i=>tx('zo'+i,`2026-0${7+i}-2${i}`,`UPI-ZOMATO LIMITED-zomato@hdfcbank-62859876543${i}`,-38000-i*100,'Food & dining','Expense')),
  ...[1,2].map(i=>tx('li'+i,`2026-0${7+i}-03`,'ACH D- HDFC LIFE INSURANCE CO-PREMIUM',-450000,'Insurance','Expense'))]});
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const get=async()=>(await context.request.get(base+'/api/ledger')).json(),put=data=>context.request.put(base+'/api/ledger',{headers:{Origin:base},data});
 let data=await get();data.state=ledger();assert.equal((await put(data)).status(),200);
 const group=key=>page.locator(`[data-title-group="${key}"]`),toast=page.locator('#toast');
 const rename=async(key,to,message)=>{await group(key).locator('.title-group-name').click();const f=page.locator('#title-group-form');await f.locator('[name="title"]').fill(to);
  await Promise.all([page.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT'),f.locator('button[type="submit"]').click()]);await toast.getByText(message).waitFor();};
 const rules=async()=>(await get()).state.titleRules.map(r=>[r.mode,r.keyword,r.title]);

 // 1. Each title once, most used first, with how many transactions have it.
 await page.goto(base+'/titles');await group('self transfer').waitFor();
 assert.deepEqual(await page.locator('[data-title-group]').evaluateAll(g=>g.map(x=>x.dataset.titleGroup)),['self transfer','swiggy','life insurance','zomato']);
 assert.match(await group('self transfer').innerText(),/Self transfer[\s\S]*4 transactions/);assert.match(await page.locator('.title-count').innerText(),/4 titles · 11 transactions/);
 await group('self transfer').locator('[data-open-group]').click();assert.equal(await group('self transfer').locator('[data-title-row]').count(),4);
 await group('self transfer').locator('[data-open-group]').click();assert.equal(await group('self transfer').locator('[data-title-row]').count(),0);

 // 2. Edit the title in place: the group opens and its rows follow as you type; Esc cancels without saving.
 await group('swiggy').locator('.title-group-name').click();const inline=page.locator('#title-group-form');await inline.locator('[name="title"]').fill('Food delivery');
 assert.deepEqual(await group('swiggy').locator('.title-group-items .title-row-copy strong').allInnerTexts(),Array(3).fill('Food delivery'),'the rows inside follow as you type');
 await inline.locator('[name="title"]').press('Escape');await inline.waitFor({state:'detached'});assert.deepEqual(await group('swiggy').locator('.title-group-items .title-row-copy strong').allInnerTexts(),Array(3).fill('Swiggy'));
 assert.equal((await get()).state.titleRules.length,1,'nothing saved');await group('swiggy').locator('[data-open-group]').click();

 // 3. Rename an automatic title: all four change, through one rule on the automatic title (no per-transaction names).
 await group('self transfer').locator('[data-open-group]').click();await rename('self transfer','Between my accounts','4 transactions renamed to “Between my accounts”');
 assert.deepEqual(await group('between my accounts').locator('.title-group-items .title-row-copy strong').allInnerTexts(),Array(4).fill('Between my accounts'),'the group stays open with every row renamed');
 assert.match(await group('between my accounts').innerText(),/4 transactions/);assert.equal(await group('self transfer').count(),0);
 assert.deepEqual(await rules(),[['contains','hdfc life','Life insurance'],['title','Self transfer','Between my accounts']]);
 assert.ok((await get()).state.transactions.every(t=>!t.displayName));
 assert.match(await page.locator('.title-rule-row').nth(1).innerText(),/Automatic title is “Self transfer”/);

 // 4. A self transfer imported later gets the new title too.
 data=await get();data.state.transactions.push(tx('st5','2026-10-10','NEFT DR-SELF TRANSFER-XX9950-9001234',-500000,'Transfers','Transfer'));assert.equal((await put(data)).status(),200);
 await page.reload();await group('between my accounts').waitFor();assert.match(await group('between my accounts').innerText(),/5 transactions/);
 await page.goto(base+'/transactions');assert.equal(await page.locator('tr[data-transaction="st5"] .transaction-name').innerText(),'Between my accounts');

 // 5. A title given by a naming rule: the rule's title changes, no new rule.
 await page.goto(base+'/titles');await rename('life insurance','Insurance premium','2 transactions renamed to “Insurance premium”');
 assert.deepEqual(await rules(),[['contains','hdfc life','Insurance premium'],['title','Self transfer','Between my accounts']]);

 // 6. Renaming onto a title you already use puts them together, keeping that title's spelling.
 await rename('zomato','swiggy','2 transactions moved to “Swiggy”');assert.match(await group('swiggy').innerText(),/5 transactions/);assert.equal(await group('zomato').count(),0);
 assert.deepEqual((await rules()).at(-1),['title','Zomato','Swiggy']);

 // 7. One transaction corrected on its own, then that title renamed: your own title changes, no rule is added.
 const opener=group('swiggy').locator('[data-open-group]');assert.equal(await opener.getAttribute('aria-expanded'),'true','a group renamed in place stays open');await page.locator('[data-edit-title="sw1"]').click();await page.locator('#title-edit-form [name="title"]').fill('Team lunch');
 await page.getByRole('button',{name:'Save title'}).click();await toast.getByText('Transaction title saved').waitFor();assert.match(await group('swiggy').innerText(),/4 transactions/);
 const before=(await rules()).length;await rename('team lunch','Office lunch','1 transaction renamed to “Office lunch”');
 data=await get();assert.equal(data.state.transactions.find(t=>t.id==='sw1').displayName,'Office lunch');assert.equal(data.state.titleRules.length,before);

 // 8. Renaming back to the automatic title removes the rule.
 await rename('between my accounts','Self transfer','5 transactions renamed to “Self transfer”');
 assert.ok(!(await rules()).some(r=>r[0]==='title'&&r[1]==='Self transfer'));assert.match(await group('self transfer').innerText(),/5 transactions/);

 // 9. Search finds a title by its name or a narration; the server refuses an unknown kind of rule; it fits a phone.
 await page.locator('#title-search').fill('zomato');assert.deepEqual(await page.locator('[data-title-group]').evaluateAll(g=>g.map(x=>x.dataset.titleGroup)),['swiggy']);
 data=await get();data.state.titleRules.push({id:'bad',mode:'regex',keyword:'x',title:'y'});assert.equal((await put(data)).status(),400);
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/titles');await group('swiggy').locator('[data-open-group]').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fits a phone');
 assert.deepEqual(problems,[]);
 console.log('PASS: titles grouped (counts, order, open and close); automatic title renamed with one rule, followed by a later import; rule title renamed; merge onto an existing title; single correction then renamed without a rule; renaming back drops the rule; search; server validation; phone layout; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
