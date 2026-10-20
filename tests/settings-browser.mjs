// Live checks for Settings (appearance, dashboard and transaction display) and Transaction titles (naming rules and
// individual corrections). Uses a disposable operator-provisioned account that is deleted afterwards.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Settings QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(create){return new Promise((resolve,reject)=>{const args=create?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`];const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','pipe']});child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Test account operation failed')));child.stdin.end(JSON.stringify(user));});}
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
const watch=page=>{page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});};
try{
 await operator(true);created=true;
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();watch(page);
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const state=async()=>(await(await context.request.get(base+'/api/ledger')).json());
 const put=async data=>context.request.put(base+'/api/ledger',{headers:{Origin:base},data});
 let data=await state();
 data.state={schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'',currency:'INR',archived:false}],
  statements:[{id:'s',accountId:'a',account:'HDFC Savings',name:'hdfc.csv',count:4,created:'2026-10-16T00:00:00Z',from:'2026-07-01',to:'2026-09-30'}],
  transactions:[...['2026-07-05','2026-08-05','2026-09-05'].map((date,i)=>({id:'n'+i,date,description:`UPI/DR/${4000+i}0000123/NETFLIXUPI/HDFC`,amount:-64900,balance:5000000-i*64900})),{id:'amz',date:'2026-09-12',description:'POS AMAZON PAY INDIA',amount:-129900,balance:4675400}]
   .map(t=>({...t,accountId:'a',account:'HDFC Savings',statementId:'s',category:'Uncategorized',type:'Expense',review:true}))};
 assert.equal((await put(data)).status(),200);

 // 1. Appearance previews immediately, guards unsaved changes, and persists to the account.
 await page.goto(base+'/settings');const form=page.locator('#preferences-form');await form.waitFor();
 await form.locator('[name="theme"]').selectOption('dark');await form.locator('[name="fontSize"]').selectOption('20');await form.locator('[name="fontFamily"]').selectOption('serif');await form.locator('[name="density"]').selectOption('compact');
 for(const name of ['showChart','showBalances','showLabelSource'])await form.locator(`[name="${name}"]`).uncheck();await form.locator('[name="expandNarration"]').check();
 const root=()=>page.evaluate(()=>({font:getComputedStyle(document.documentElement).fontSize,theme:document.documentElement.dataset.theme,family:document.documentElement.dataset.font,density:document.documentElement.dataset.density,bg:getComputedStyle(document.body).backgroundColor}));
 assert.deepEqual(await root(),{font:'20px',theme:'dark',family:'serif',density:'compact',bg:'rgb(15, 23, 20)'},'live preview before saving');
 page.once('dialog',d=>d.dismiss());await page.locator('nav [data-page="overview"]').click();assert.equal(new URL(page.url()).pathname,'/settings','unsaved settings keep you on the page');
 mkdirSync('playwright-results',{recursive:true});await page.screenshot({path:'playwright-results/settings-dark.png',fullPage:true});
 await form.getByRole('button',{name:'Save settings'}).click();await page.locator('#toast').getByText('Display settings saved').waitFor();
 assert.deepEqual((await state()).state.preferences,{theme:'dark',fontSize:20,fontFamily:'serif',density:'compact',showChart:false,showCategories:true,showRecent:true,showBalances:false,showLabelSource:false,expandNarration:true});
 await page.reload();await form.waitFor();assert.deepEqual(await root(),{font:'20px',theme:'dark',family:'serif',density:'compact',bg:'rgb(15, 23, 20)'},'saved preferences apply after reload');

 // 2. An older tab that does not know about preferences cannot erase them.
 data=await state();delete data.state.preferences;delete data.state.titleRules;assert.equal((await put(data)).status(),200);assert.equal((await state()).state.preferences.fontSize,20);
 await page.reload();await form.waitFor();

 // 3. Dashboard and transaction display follow the saved preferences.
 await page.locator('nav [data-page="overview"]').click();await page.locator('.metrics').waitFor();assert.equal(await page.locator('.chart').count(),0);assert.equal(await page.locator('.donut-wrap').count(),1);
 await page.locator('nav [data-page="transactions"]').click();const row=page.locator('[data-transaction="n2"]');await row.waitFor();
 assert.equal(await row.locator('.running-balance').isVisible(),false);assert.equal(await row.locator('.label-source').isVisible(),false);assert.equal(await row.locator('details.bank-narration').evaluate(d=>d.open),true);

 // 4. Naming rules rename existing transactions, follow priority, and reach recurring payments and exports.
 await page.locator('nav [data-page="titles"]').click();await page.locator('#new-title-rule').click();const rule=page.locator('#title-rule-form');
 await rule.locator('[name="keyword"]').fill('netflixupi');await rule.locator('[name="title"]').fill('Netflix subscription');await page.locator('#title-rule-preview').getByText('3 matching transactions').waitFor();
 await rule.getByRole('button',{name:'Save naming rule'}).click();await page.locator('#toast').getByText('Naming rule saved').waitFor();
 assert.deepEqual((await state()).state.titleRules.map(r=>[r.mode,r.keyword,r.title]),[['contains','netflixupi','Netflix subscription']]);
 assert.equal(await page.locator('[data-title-row] strong').filter({hasText:'Netflix subscription'}).count(),3);
 await page.locator('#new-title-rule').click();await rule.locator('[name="keyword"]').fill('upi/dr');await rule.locator('[name="title"]').fill('Generic UPI');await rule.getByRole('button',{name:'Save naming rule'}).click();await page.locator('.title-rule-row').nth(1).waitFor();
 const second=(await state()).state.titleRules[1].id;await page.locator(`[data-rule-up="${second}"]`).click();await page.locator('#toast').getByText('Naming rule priority updated').waitFor();
 assert.equal(await page.locator('[data-title-row="n0"] strong').innerText(),'Generic UPI','the first matching rule wins');
 page.once('dialog',d=>d.accept());await page.locator(`[data-rule-delete="${second}"]`).click();await page.locator('#toast').getByText('Naming rule removed').waitFor();
 assert.equal(await page.locator('[data-title-row="n0"] strong').innerText(),'Netflix subscription');

 // 5. Individual corrections win over rules and keep the original narration.
 await page.locator('[data-edit-title="amz"]').click();await page.locator('#title-edit-form [name="title"]').fill('Amazon groceries');await page.getByRole('button',{name:'Save title'}).click();await page.locator('#toast').getByText('Transaction title saved').waitFor();
 data=await state();assert.equal(data.state.transactions.find(t=>t.id==='amz').displayName,'Amazon groceries');assert.equal(data.state.transactions.find(t=>t.id==='amz').description,'POS AMAZON PAY INDIA');
 await page.locator('#title-search').fill('amazon');assert.equal(await page.locator('[data-title-row]').count(),1);
 await page.screenshot({path:'playwright-results/titles-dark.png',fullPage:true});
 await page.locator('nav [data-page="transactions"]').click();await page.locator('#search').fill('Netflix subscription');assert.equal(await page.locator('#transaction-results tbody tr').count(),3);await page.locator('#search').fill('');
 const downloading=page.waitForEvent('download');await page.locator('[data-action="export"]').click();let csv='';for await(const c of await (await downloading).createReadStream())csv+=c;
 assert.match(csv,/"Netflix subscription"/);assert.match(csv,/"Amazon groceries"/);assert.match(csv,/NETFLIXUPI/,'exports keep the original narration');
 await page.goto(base+'/reports');await page.locator('.recurring-card [data-recurring="Netflix subscription"]').waitFor();

 // 6. Defaults can be previewed and restored; both pages fit a phone screen.
 await page.goto(base+'/settings');await form.waitFor();await page.getByRole('button',{name:'Preview defaults'}).click();assert.equal((await root()).theme,'light');
 await page.getByRole('button',{name:'Save settings'}).click();await page.locator('#toast').getByText('Display settings saved').waitFor();assert.equal((await state()).state.preferences.fontSize,16);
 await page.setViewportSize({width:390,height:844});for(const p of ['settings','titles']){await page.goto(base+'/'+p);await page.locator('.settings-card').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,p+' fits mobile');}
 await page.screenshot({path:'playwright-results/titles-mobile.png',fullPage:true});
 assert.deepEqual(problems,[]);
 console.log('PASS: settings preview, unsaved-change guard, saved appearance (dark theme, font size, serif, compact), dashboard and transaction display toggles, old-tab safety, naming rules (create, priority, remove), individual titles, search, CSV export, recurring payees, defaults, mobile layout, no CSP violations.');
}finally{await browser.close();if(created)await operator(false);}
