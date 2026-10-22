// Live checks for tag rules: add one in the Tags window (with a count of existing matches, tagged at once), a title
// rule, a statement import tagged by the rules, renaming and deleting a tag carry over to its rules, and removing a rule
// keeps the tags. Synthetic ledger on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Tag rules QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const tx=(id,day,description,amount,category)=>({id,statementId:'s',accountId:'h',account:'HDFC Savings',date:`2026-09-${String(day).padStart(2,'0')}`,description,amount,category,type:'Expense',review:false});
const ledger=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false}],statements:[{id:'s',accountId:'h',account:'HDFC Savings',name:'s.csv',count:0,created:'2026-10-01T00:00:00Z'}],
 transactions:[tx('i1',1,'POS IRCTC WEB BOOKING 11',-150000,'Travel & transport'),tx('i2',2,'POS IRCTC WEB BOOKING 12',-90000,'Travel & transport'),tx('s1',3,'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345671',-45000,'Food & dining'),tx('a1',4,'AMAZON PAY INDIA',-120000,'Shopping')]});
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const get=async()=>(await context.request.get(base+'/api/ledger')).json(),tags=async id=>(await get()).state.transactions.find(t=>t.id===id)?.tags;
 let data=await get();data.state=ledger();assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const toast=page.locator('#toast'),modal=page.locator('#modal'),saved=()=>page.waitForResponse(r=>r.url()===base+'/api/ledger'&&r.request().method()==='PUT');
 const addRule=async(mode,keyword,tag,backfill=true)=>{const f=modal.locator('#tag-rule-form');await f.locator('[name="mode"]').selectOption(mode);await f.locator('[name="keyword"]').fill(keyword);await f.locator('[name="tag"]').fill(tag);if(!backfill)await f.locator('[name="backfill"]').uncheck();const n=await modal.locator('#tag-rule-count').innerText();await Promise.all([saved(),f.locator('button.primary').click()]);return n;};

 // 1. Narration rule with its count, tagging existing transactions; a title rule without back-filling.
 await page.goto(base+'/transactions');await page.locator('[data-action="tags"]').first().click();await modal.locator('#tag-rule-form').waitFor();
 assert.equal(await addRule('contains','irctc','Travel'),'2');await toast.getByText('Tag rule added · 2 transactions tagged #Travel').waitFor();
 assert.deepEqual([await tags('i1'),await tags('i2'),await tags('s1')],[['Travel'],['Travel'],undefined]);
 await addRule('title','Swiggy','Food delivery',false);await toast.getByText('Tag rule added · new transactions that match get #Food delivery').waitFor();assert.equal(await tags('s1'),undefined);
 assert.match(await modal.locator('.tag-rule-row').nth(1).innerText(),/Title is “Swiggy” → #Food delivery/);
 assert.equal(await modal.locator('.tag-rule-row').count(),2);

 // 2. A statement import is tagged by the rules, and the check before adding says so.
 await modal.locator('[data-action="close"]').click();await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption('h');
 await page.locator('#file-input').setInputFiles({name:'october.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Debit,Credit\n05/10/2026,"POS IRCTC WEB BOOKING 99",800,\n06/10/2026,"UPI-SWIGGY LIMITED-swiggy@axisbank-628512345699",300,\n07/10/2026,"AMAZON PAY INDIA",200,\n')});
 await page.locator('#map-next').click();await modal.getByText('2 rows were tagged by your tag rules.').waitFor();
 await Promise.all([saved(),page.locator('#commit-import').click()]);await toast.getByText(/3 transactions and the original statement saved/).waitFor();
 const imported=(await get()).state.transactions.filter(t=>t.date>='2026-10-01');
 assert.deepEqual(['IRCTC','SWIGGY','AMAZON'].map(k=>imported.find(t=>t.description.includes(k)).tags),[['Travel'],['Food delivery'],undefined]);

 // 3. Renaming a tag renames it in its rules; deleting a tag removes its rules; removing a rule keeps the tags.
 await page.goto(base+'/transactions');await page.locator('[data-action="tags"]').first().click();await modal.locator('.tag-row').first().waitFor();
 await modal.locator('[data-rename-tag="Travel"]').click();await modal.locator('.tag-rename input').fill('Train travel');await Promise.all([saved(),modal.locator('.tag-rename button.primary').click()]);await toast.getByText(/Renamed to #Train travel/).waitFor();
 data=await get();assert.deepEqual(data.state.tagRules.map(r=>r.tag),['Train travel','Food delivery']);
 page.once('dialog',d=>d.accept());await Promise.all([saved(),modal.locator('[data-delete-tag="Food delivery"]').click()]);await toast.getByText(/#Food delivery removed/).waitFor();
 data=await get();assert.deepEqual(data.state.tagRules.map(r=>r.tag),['Train travel']);
 await Promise.all([saved(),modal.locator('[data-remove-tag-rule]').first().click()]);await toast.getByText('Tag rule removed. Transactions keep the tags they have.').waitFor();
 data=await get();assert.deepEqual(data.state.tagRules,[]);assert.deepEqual(data.state.transactions.find(t=>t.id==='i1').tags,['Train travel']);

 // 4. Phone: the rule form fits.
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(problems,[]);
 console.log('PASS: tag rules (narration with a count and back-fill, title without), import tagged with notice, tag rename and delete follow into rules, rule removed keeps tags, phone width, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
