// Live checks for tags on transactions: add several in the editor (Enter, comma, or left in the box), remove one, reuse an
// existing spelling, bulk add and remove, filter and search by tag, the Reports card, rename, merge and delete in the
// Tags manager, the CSV column, server validation and the phone layout. Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {insightsLedger} from './fixtures/insights-ledger.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Tags QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const shots=process.env.SHOT_DIR,shot=async(pg,name,target)=>{if(shots)await(target||pg).screenshot({path:`${shots}/tags-${name}.png`});};
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000},acceptDownloads:true}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const ledger=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state,tagsOf=async id=>(await ledger()).transactions.find(t=>t.id===id).tags;
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=insightsLedger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const modal=page.locator('#modal'),toast=page.locator('#toast'),shown=()=>page.locator('#transaction-results tr[data-transaction]').count();
 const saving=async(pg,click,text)=>{await Promise.all([pg.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT'),click()]);await pg.locator('#toast').getByText(text).waitFor();};
 const chipsIn=form=>form.locator('[data-untag]').evaluateAll(els=>els.map(e=>e.dataset.untag));

 // 1. Three tags on a Swiggy payment: Enter, a comma, and one left in the box when saving.
 await page.goto(base+'/transactions');await page.locator('tr[data-transaction="t5"]').waitFor();
 await page.locator('[data-edit="t5"]').click();let form=page.locator('#inline-transaction-form'),input=form.locator('.tag-input');
 await input.fill('Goa trip');await input.press('Enter');await input.pressSequentially('work,');
 assert.deepEqual(await chipsIn(form),['Goa trip','work']);assert.equal(await input.inputValue(),'');
 await input.fill('Reimbursable');await saving(page,()=>form.locator('button[type="submit"]').click(),'Transaction saved');
 assert.deepEqual(await tagsOf('t5'),['Goa trip','work','Reimbursable']);
 assert.deepEqual(await page.locator('tr[data-transaction="t5"] .tx-tags .tag-chip').allInnerTexts(),['#Goa trip','#work','#Reimbursable']);

 // 2. Remove one with ×, the last with Backspace, and re-add it in lower case: the ledger’s spelling is kept.
 await page.locator('[data-edit="t5"]').click();form=page.locator('#inline-transaction-form');input=form.locator('.tag-input');
 await form.locator('[data-untag="work"]').click();await input.press('Backspace');assert.deepEqual(await chipsIn(form),['Goa trip']);
 await input.fill('reimbursable');await input.press('Enter');assert.deepEqual(await chipsIn(form),['Goa trip','Reimbursable']);await shot(page,'editor',page.locator('tr.transaction-editor'));
 await saving(page,()=>form.locator('button[type="submit"]').click(),'Transaction saved');assert.deepEqual(await tagsOf('t5'),['Goa trip','Reimbursable']);

 // 3. Bulk: add two tags to two more payments without marking them reviewed, then remove one from one of them.
 for(const id of ['t14','t23'])await page.locator(`[data-select="${id}"]`).check();
 await page.locator('#bulk-tag-add').fill('goa TRIP, Food run');await page.locator('#bulk-reviewed').uncheck();await saving(page,()=>page.locator('#bulk-apply').click(),'2 transactions updated');
 let state=await ledger();assert.deepEqual(state.transactions.find(t=>t.id==='t14').tags,['Goa trip','Food run']);assert.deepEqual(state.transactions.find(t=>t.id==='t23').tags,['Goa trip','Food run']);
 await page.locator('[data-select="t14"]').check();await page.locator('#bulk-tag-remove').selectOption('Food run');await saving(page,()=>page.locator('#bulk-apply').click(),'1 transaction updated');
 assert.deepEqual(await tagsOf('t14'),['Goa trip']);await shot(page,'rows');

 // 4. Filter by a tag, by untagged, search for #tag, and click a chip on a row.
 await page.locator('#tag-filter').selectOption('goa trip');await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===3);
 await page.locator('#tag-filter').selectOption('untagged');await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===34);
 await page.locator('#tag-filter').selectOption('all');await page.locator('#search').fill('#reimb');await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===1);
 await page.locator('#search').fill('');await page.locator('tr[data-transaction="t23"] .tag-chip',{hasText:'#Food run'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===1);assert.equal(await page.locator('#tag-filter').inputValue(),'food run');
 assert.equal(await page.locator('#inline-transaction-form').count(),0,'clicking a chip does not open the editor');

 // 5. Reports: spending by tag, and its chips open Transactions filtered to the tag.
 await page.goto(base+'/reports');const card=page.locator('.tags-card');await card.waitFor();
 await shot(page,'reports',card);const goa=card.locator('.tag-line',{has:page.locator('[data-tag-filter="Goa trip"]')});assert.match(await goa.innerText(),/3 transactions[\s\S]*₹1,947\.00/);
 await goa.locator('.tag-chip').click();await page.waitForURL(/\/transactions/);await page.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===3);

 // 6. Tags manager: rename, merge into an existing tag, delete.
 await page.locator('#tag-filter').selectOption('all');await page.locator('[data-action="tags"]').first().click();await modal.locator('.tag-row').first().waitFor();
 await modal.locator('[data-rename-tag="Goa trip"]').click();await modal.locator('.tag-rename input').fill('Goa 2026');await saving(page,()=>modal.locator('.tag-rename button.primary').click(),'Renamed to #Goa 2026 on 3 transactions');
 await modal.locator('[data-rename-tag="Food run"]').click();await modal.locator('.tag-rename input').fill('goa 2026');await saving(page,()=>modal.locator('.tag-rename button.primary').click(),'#Food run merged into #Goa 2026 on 1 transaction');
 state=await ledger();assert.deepEqual(['t5','t14','t23'].map(id=>state.transactions.find(t=>t.id===id).tags),[['Goa 2026','Reimbursable'],['Goa 2026'],['Goa 2026']]);
 page.once('dialog',d=>d.accept());await saving(page,()=>modal.locator('[data-delete-tag="Reimbursable"]').click(),'#Reimbursable removed from 1 transaction');
 assert.deepEqual(await tagsOf('t5'),['Goa 2026']);assert.deepEqual(await modal.locator('.tag-row').evaluateAll(els=>els.map(e=>e.dataset.tagRow)),['Goa 2026']);
 await shot(page,'manager',modal);await modal.locator('[data-action="close"]').click();

 // 7. The CSV export has a tags column.
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export"]').first().click()]);
 const csv=await readFile(await download.path(),'utf8');assert.match(csv.split(/\r?\n/)[0],/,"?tags"?$/);assert.equal(csv.split(/\r?\n/).filter(l=>/"Goa 2026"$/.test(l)).length,3);

 // 8. The server refuses malformed tags.
 const current=await(await context.request.get(base+'/api/ledger')).json();current.state.transactions[0].tags=['a,b'];
 const refused=await context.request.put(base+'/api/ledger',{headers:{Origin:base},data:current});assert.equal(refused.status(),400);assert.match((await refused.json()).error,/tags/);

 // 9. Phone: the tag editor and chips fit the screen; tapping a chip filters instead of opening the editor.
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState()}),p=await phone.newPage();
 await p.goto(base+'/transactions');await p.locator('tr[data-transaction="t5"]').waitFor();
 await p.locator('tr[data-transaction="t5"] .tag-chip').tap();await p.waitForFunction(()=>document.querySelectorAll('#transaction-results tr[data-transaction]').length===3);assert.equal(await p.locator('#inline-transaction-form').count(),0);
 await p.locator('tr[data-transaction="t5"] .transaction-name').tap();await p.locator('#inline-transaction-form .tag-editor').waitFor();
 await p.locator('#inline-transaction-form .tag-input').fill('Phone tag,');assert.deepEqual(await chipsIn(p.locator('#inline-transaction-form')),['Goa 2026','Phone tag']);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'nothing is wider than the phone screen');await shot(p,'phone');
 assert.deepEqual(problems,[]);
 console.log('PASS: tags added in the editor (Enter, comma, left in the box), removed, spelling reused; bulk add and remove; filter, untagged, #search and chip clicks; Reports card; rename, merge, delete; CSV column; server validation; phone layout; no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
