// Live checks for Excel import, reconciliation, books gaps, bulk edit, rules, tax summary, paging, 2FA and CSP.
// Uses disposable operator-provisioned accounts that are deleted afterwards; the owner's ledger is never touched.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import * as XLSX from '../apps/web/public/vendor/xlsx.mjs';
import {makePDF,hdfc as cardStatement} from './fixtures/card-statements.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const users=[1,2].map(()=>({name:'Bookkeeping QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')}));
function operator(create,user){return new Promise((resolve,reject)=>{const args=create?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`];const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','pipe']});child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Test account operation failed')));child.stdin.end(JSON.stringify(user));});}
function totp(secret,offset=0){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/\s|=/g,'').toUpperCase())bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset));const h=createHmac('sha1',key).update(counter).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');}
// HDFC-style workbook: bank preamble with the period, numeric date cells in a US format, running balance.
function octoberWorkbook(){
 const rows=[['HDFC BANK Ltd.'],['Statement From : 01/10/2026 To : 31/10/2026'],['Date','Narration','Chq./Ref.No.','Value Dt','Withdrawal Amt.','Deposit Amt.','Closing Balance'],['********'],
  [46296,'UPI-RAHUL SHARMA-rahul@okhdfcbank-PAYMENT','0001',46296,1250.5,'',8749.5],[46298,'SALARY ACME TECHNOLOGIES','0002',46298,'',50000,58749.5],
  [46300,'NACH-DR-LIC OF INDIA PREMIUM','0003',46300,12000,'',46749.5],[46326,'UPI-SWIGGY-swiggy@icici','0004',46326,500,'',46249.5],[],['STATEMENT SUMMARY :-']];
 const sheet=XLSX.utils.aoa_to_sheet(rows);for(const r of [4,5,6,7])for(const c of [0,3])sheet[XLSX.utils.encode_cell({r,c})].z='m/d/yy';
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Statement');return Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
}
const browser=await chromium.launch({headless:true}),created=[],problems=[];
const watch=page=>{page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});};
try{
 for(const user of users){await operator(true,user);created.push(user);}
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();watch(page);
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:users[0].email,password:users[0].password}})).status(),200);
 const state=async(ctx=context)=>(await(await ctx.request.get(base+'/api/ledger')).json());
 const put=async(data,ctx=context)=>ctx.request.put(base+'/api/ledger',{headers:{Origin:base},data});
 let data=await state();data.state={schemaVersion:2,initialized:true,accounts:[{id:'hdfc',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false},{id:'card',name:'HDFC Credit Card',bank:'HDFC Bank',type:'Credit card',last4:'9876',currency:'INR',archived:false}],statements:[],transactions:[],rules:[]};
 assert.equal((await put(data)).status(),200);
 const importFile=async(file,account='hdfc',mapped=true)=>{await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption(account);await page.locator('#file-input').setInputFiles(file);await page.locator(mapped?'#map-next':'#commit-import').waitFor();};

 // 1. Excel import: period from the preamble, balance column mapped, reconciliation passes, values persist.
 await page.goto(base+'/statements');await page.locator('h1').waitFor();
 await importFile({name:'hdfc-oct.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:octoberWorkbook()});
 assert.notEqual(await page.locator('[data-map="balance"]').inputValue(),'-1');await page.locator('#map-next').click();
 assert.equal(await page.locator('#st-from').inputValue(),'2026-10-01');assert.equal(await page.locator('#st-to').inputValue(),'2026-10-31');
 assert.equal(await page.locator('#st-opening').inputValue(),'10000.00');assert.equal(await page.locator('#st-closing').inputValue(),'46249.50');
 await page.locator('#reconcile-result .notice.success').waitFor();
 await page.locator('#commit-import').click();await page.locator('#modal').waitFor({state:'hidden'});
 data=await state();const oct=data.state.statements[0];
 assert.deepEqual([oct.from,oct.to,oct.opening,oct.closing],['2026-10-01','2026-10-31',1000000,4624950]);
 assert.deepEqual(data.state.transactions.map(t=>[t.date,t.amount,t.balance]),[['2026-10-01',-125050,874950],['2026-10-03',5000000,5874950],['2026-10-05',-1200000,4674950],['2026-10-31',-50000,4624950]]);
 assert.equal(data.state.transactions.find(t=>t.description.startsWith('NACH')).category,'Insurance');
 // Re-importing the same workbook is recognised as duplicates via date, narration, amount and running balance.
 await importFile({name:'hdfc-oct-again.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:octoberWorkbook()});await page.locator('#map-next').click();
 assert.equal(await page.locator('[data-include]:checked').count(),0);assert.equal(await page.locator('#commit-import').isDisabled(),true);await page.getByRole('button',{name:'Close dialog'}).click();

 // 2. A file with a missing row is caught before saving.
 await importFile({name:'broken.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Narration,Debit,Credit,Balance\n01/09/2026,Opening Balance,,,"1,000.00"\n02/09/2026,TEA STALL,100.00,,900.00\n04/09/2026,BOOKS,100.00,,700.00\n')});
 await page.locator('#map-next').click();await page.locator('#reconcile-result').getByText('don’t follow the running balance').waitFor();
 assert.match(await page.locator('#reconcile-result').innerText(),/unaccounted for/);await page.getByRole('button',{name:'Close dialog'}).click();

 // 3. December without November: books check reports the gap and the balance break; overview warns.
 await importFile({name:'hdfc-dec.csv',mimeType:'text/csv',buffer:Buffer.from('Statement period: 01/12/2026 to 31/12/2026\nDate,Narration,Debit,Credit,Balance\n02/12/2026,AMAZON PAY INDIA,"2,000.00",,"38,000.00"\n05/12/2026,PAYMENT TO MEENA TUITION CLASSES,"1,500.00",,"36,500.00"\n')});
 await page.locator('#map-next').click();await page.locator('#reconcile-result .notice.success').waitFor();await page.locator('#commit-import').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('nav [data-page="statements"]').click();const books=page.locator('[data-books="hdfc"]');await books.waitFor();
 assert.match(await books.innerText(),/No statement for 01 Nov 2026 – 30 Nov 2026/);assert.match(await books.innerText(),/does not carry over/);
 assert.match(await books.innerText(),/Bank balance ₹36,500\.00 on 31 Dec 2026/);
 await page.locator('nav [data-page="overview"]').click();await page.locator('.books-strip').waitFor();
 await page.locator('nav [data-page="accounts"]').click();assert.match(await page.locator('.bank-card').filter({hasText:'HDFC Savings'}).innerText(),/Bank balance\s+₹36,500\.00/);

 // 4. Statement details can be corrected later.
 await page.locator('nav [data-page="statements"]').click();const decId=(await state()).state.statements.find(s=>s.name==='hdfc-dec.csv').id;
 await page.locator(`[data-statement-details="${decId}"]`).click();await page.locator('#statement-form [name="opening"]').fill('40,000.00');await page.getByRole('button',{name:'Save details'}).click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.equal((await state()).state.statements.find(s=>s.id===decId).opening,4000000);

 // 5. Rule with back-fill updates matching transactions still in review.
 await page.locator('nav [data-page="categories"]').click();await page.locator('#rule-form [name="keyword"]').fill('MEENA');await page.locator('#rule-form [name="category"]').selectOption('Education');await page.getByRole('button',{name:'Add rule'}).click();
 await page.locator('.rule-row').filter({hasText:'MEENA'}).waitFor();
 let meena=(await state()).state.transactions.find(t=>t.description.includes('MEENA'));assert.equal(meena.category,'Education');assert.equal(meena.review,false);

 // 6. Bulk edit with tax tag and review.
 await page.locator('nav [data-page="transactions"]').click();await page.locator('#transaction-results tbody tr').first().waitFor();
 const ids=(await state()).state.transactions.filter(t=>/RAHUL|SWIGGY/.test(t.description)).map(t=>t.id);
 for(const id of ids)await page.locator(`[data-select="${id}"]`).check();
 await page.locator('#bulk-category').selectOption('Food & dining');await page.locator('#bulk-tax').selectOption('business-expense');await page.locator('#bulk-apply').click();await page.locator('#bulk-apply').waitFor({state:'detached'});
 for(const t of (await state()).state.transactions.filter(t=>ids.includes(t.id)))assert.deepEqual([t.category,t.taxTag,t.review],['Food & dining','business-expense',false]);
 // Selecting a credit and a debit, then choosing Expense, skips the credit instead of corrupting it.
 const salary=(await state()).state.transactions.find(t=>t.description.startsWith('SALARY'));
 await page.locator(`[data-select="${salary.id}"]`).check();await page.locator(`[data-select="${ids[0]}"]`).check();await page.locator('#bulk-type').selectOption('Expense');await page.locator('#bulk-apply').click();await page.locator('#toast').getByText('skipped').waitFor();
 assert.equal((await state()).state.transactions.find(t=>t.id===salary.id).type,'Income');

 // 7. Tax summary for FY 2026-27 and its CSV export.
 await page.goto(base+'/reports?period=fy-2026');const tax=page.locator('.tax-card');await tax.waitFor();
 assert.match(await tax.innerText(),/Tax year 2026–27/);assert.match(await tax.innerText(),/Salary · Salaries/);assert.match(await tax.innerText(),/80C · PPF, ELSS, life insurance, tuition/);
 const downloading=page.waitForEvent('download');await page.locator('[data-action="tax-export"]').click();const file=await downloading;let csv='';for await(const chunk of await file.createReadStream())csv+=chunk;
 assert.match(csv,/"Deduction \(old regime\)","80C"/);assert.match(csv,/"Income","Salaries","Salary","1","1","50000.00"/);
 mkdirSync('playwright-results',{recursive:true});await page.screenshot({path:'playwright-results/reports-tax.png',fullPage:true});
 await page.locator('nav [data-page="statements"]').click();await page.screenshot({path:'playwright-results/statements-books.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});for(const p of ['statements','transactions','reports']){await page.locator(`nav [data-page="${p}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,p+' fits mobile');}
 await page.screenshot({path:'playwright-results/reports-mobile.png',fullPage:true});

 // 8a. Credit card PDF: unsigned charges, Cr credits, amount due reconciles, balances shown as amounts due.
 await page.setViewportSize({width:1440,height:1000});const cardPDF={name:'hdfc-card-sep.pdf',mimeType:'application/pdf',buffer:makePDF(cardStatement)};
 await importFile(cardPDF,'hdfc',false);assert.match(await page.locator('#modal').innerText(),/looks like a credit card statement/);await page.getByRole('button',{name:'Cancel'}).click();
 await importFile(cardPDF,'card',false);assert.equal(await page.locator('#st-opening').inputValue(),'5000.00');assert.equal(await page.locator('#st-closing').inputValue(),'9974.90');
 await page.locator('#reconcile-result').getByText('This matches the total due').waitFor();await page.locator('#modal').screenshot({path:'playwright-results/card-import.png'});await page.locator('#commit-import').click();await page.locator('#modal').waitFor({state:'hidden'});
 data=await state();const card=data.state.statements.find(s=>s.accountId==='card'),cardRows=data.state.transactions.filter(t=>t.accountId==='card');
 assert.deepEqual([card.from,card.to,card.opening,card.closing],['2026-08-24','2026-09-23',-500000,-997490]);assert.equal(cardRows.length,7);
 assert.equal(cardRows.find(t=>t.description.startsWith('NETBANKING')).type,'Transfer');assert.equal(cardRows.find(t=>t.description.startsWith('SWIGGY')).amount,-45000);
 await page.locator('nav [data-page="statements"]').click();assert.match(await page.locator('[data-books="card"]').innerText(),/Outstanding\s+₹9,974\.90/);assert.match(await page.locator('.statement').filter({hasText:'hdfc-card-sep.pdf'}).innerText(),/Total due ₹9,974\.90/);
 await page.locator('nav [data-page="accounts"]').click();assert.match(await page.locator('.bank-card').filter({hasText:'HDFC Credit Card'}).innerText(),/Outstanding\s+₹9,974\.90/);
 await page.locator('nav [data-page="transactions"]').click();await page.locator('#search').fill('RELIANCE');assert.match(await page.locator('#transaction-results tbody tr').first().innerText(),/EMI 3 of 12/);await page.locator('#search').fill('');

 // 8b. Transfers: the bank debit for the card bill pairs with the card's payment, can be unlinked and relinked by hand.
 await importFile({name:'hdfc-aug.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Narration,Debit,Credit\n28/08/2026,CC 000XXXX9876 AUTOPAY HDFC CREDIT CARD,"5,000.00",\n')});await page.locator('#map-next').click();await page.locator('#commit-import').click();
 // Importing the second leg offers the link straight away; postponing it leaves a reminder on Overview.
 const pair=page.locator('.pair-row');await pair.first().waitFor();assert.match(await page.locator('#modal h2').innerText(),/Transfers found in this import/);
 assert.equal(await pair.count(),1);assert.match(await pair.innerText(),/HDFC Savings → HDFC Credit Card[\s\S]*Same day/);
 await page.getByRole('button',{name:'Cancel'}).click();const strip=page.locator('.transfer-strip');await strip.waitFor();assert.match(await strip.innerText(),/1 transfer between your accounts can be linked/);
 await strip.locator('[data-action="pair-transfers"]').click();await page.locator('#pair-confirm').click();await page.locator('#modal').waitFor({state:'hidden'});await strip.waitFor({state:'detached'});
 await page.locator('nav [data-page="transactions"]').click();await page.locator('#transaction-results tbody tr').first().waitFor();
 let tx=(await state()).state.transactions;const bankLeg=tx.find(t=>t.description.startsWith('CC 000XXXX9876')),cardLeg=tx.find(t=>t.description.startsWith('NETBANKING TRANSFER'));
 assert.ok(bankLeg.transferId&&bankLeg.transferId===cardLeg.transferId);assert.deepEqual([bankLeg.type,cardLeg.type,bankLeg.review,cardLeg.review],['Transfer','Transfer',false,false]);
 assert.match(await page.locator(`[data-transaction="${bankLeg.id}"]`).innerText(),/Transfer to HDFC Credit Card/);assert.match(await page.locator(`[data-transaction="${cardLeg.id}"]`).innerText(),/Transfer from HDFC Savings/);
 await page.locator(`[data-edit="${bankLeg.id}"]`).click();await page.getByLabel('Linked transfer').selectOption('');await page.getByRole('button',{name:'Save changes'}).click();await page.locator('#inline-transaction-form').waitFor({state:'detached'});
 tx=(await state()).state.transactions;assert.ok(!tx.find(t=>t.id===bankLeg.id).transferId&&!tx.find(t=>t.id===cardLeg.id).transferId,'unlinking clears both sides');
 await page.locator('#type-filter').selectOption('unlinked');assert.equal(await page.locator(`[data-transaction="${cardLeg.id}"]`).count(),1);
 await page.locator(`[data-edit="${cardLeg.id}"]`).click();await page.getByLabel('Linked transfer').selectOption(bankLeg.id);await page.getByRole('button',{name:'Save changes'}).click();await page.locator('#inline-transaction-form').waitFor({state:'detached'});
 tx=(await state()).state.transactions;assert.ok(tx.find(t=>t.id===bankLeg.id).transferId===tx.find(t=>t.id===cardLeg.id).transferId);
 await page.locator('#type-filter').selectOption('all');
 await page.goto(base+'/reports?period=fy-2026');const transfers=page.locator('.transfers-card');await transfers.waitFor();
 assert.match(await transfers.innerText(),/Linked transfers out · 1 pair\s+−₹5,000\.00[\s\S]*Linked transfers in\s+\+₹5,000\.00[\s\S]*Net\s+₹0\.00/);

 // 8c. Recurring payments: three monthly Netflix charges become a series that links to its transactions.
 data=await state();const octId=data.state.statements.find(st=>st.name==='hdfc-oct.xlsx').id;
 data.state.transactions.push(...['2026-08-06','2026-09-05','2026-10-06'].map((date,i)=>({id:'netflix-'+i,statementId:octId,accountId:'hdfc',account:'HDFC Savings',date,description:'NETFLIX.COM MUMBAI',amount:-64900,category:'Entertainment',type:'Expense',review:false})));
 assert.equal((await put(data)).status(),200);await page.goto(base+'/reports');const recurring=page.locator('.recurring-card');await recurring.waitFor();
 assert.match(await recurring.innerText(),/About ₹649\.00 a month[\s\S]*Netflix[\s\S]*monthly[\s\S]*No statement covers 06 Nov 2026/,'the November statement is deliberately missing in this test');
 await recurring.locator('[data-recurring="Netflix"]').click();assert.equal(await page.locator('#search').inputValue(),'Netflix');assert.equal(await page.locator('#transaction-results tbody tr').count(),3);
 await page.goto(base+'/');await page.locator('.security-strip').waitFor();

 // 8. Paging: a large ledger renders 200 rows at a time.
 const other=await browser.newContext();assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:users[1].email,password:users[1].password}})).status(),200);
 // A full statement period can contain no activity after the last recurring payment.
 const regression=await state(other);regression.state={schemaVersion:2,initialized:true,accounts:[{id:'a',name:'Coverage test',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'coverage',accountId:'a',account:'Coverage test',name:'jan-april.csv',count:3,created:'2026-04-30T00:00:00Z',from:'2026-01-01',to:'2026-04-30'}],rules:[],transactions:['2026-01-05','2026-02-05','2026-03-05'].map((date,i)=>({id:'coverage-'+i,statementId:'coverage',accountId:'a',account:'Coverage test',date,description:'NETFLIX',amount:-64900,category:'Entertainment',type:'Expense',review:false}))};
 assert.equal((await put(regression,other)).status(),200);const coveragePage=await other.newPage();watch(coveragePage);await coveragePage.goto(base+'/reports');await coveragePage.locator('.recurring-card').waitFor();assert.match(await coveragePage.locator('.recurring-card .recurring-missing').innerText(),/Expected around .* but not in that statement/);await coveragePage.close();
 data=await state(other);data.state={schemaVersion:2,initialized:true,accounts:[{id:'a',name:'Bulk',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'Bulk',name:'bulk.csv',count:450,created:'2026-10-16T00:00:00Z'}],rules:[],transactions:Array.from({length:450},(_,i)=>({id:'t'+i,statementId:'s',accountId:'a',account:'Bulk',date:'2026-09-'+String(1+i%28).padStart(2,'0'),description:'UPI/DR/'+(100000+i)+'/SHOP',amount:-(100+i),category:'Shopping',type:'Expense',review:true}))};
 assert.equal((await put(data,other)).status(),200);
 const p2=await other.newPage();watch(p2);await p2.goto(base+'/transactions');await p2.locator('#transaction-results tbody tr').first().waitFor();
 assert.equal(await p2.locator('#transaction-results tbody tr').count(),200);await p2.locator('[data-action="more"]').click();assert.equal(await p2.locator('#transaction-results tbody tr').count(),400);await p2.locator('[data-action="more"]').click();assert.equal(await p2.locator('#transaction-results tbody tr').count(),450);
 await p2.locator('[data-select-all]').check();assert.match(await p2.locator('.bulk-bar').innerText(),/450 selected/);await other.close();

 // 9. Two-step verification: enable with an authenticator code, then sign in through the UI with a code.
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/security');await page.getByLabel('Current password').fill(users[0].password);await page.getByRole('button',{name:'Set up two-step verification'}).click();
 const secret=(await page.locator('.secret-key code').innerText()).replace(/\s/g,'');assert.equal(await page.locator('.backup-codes li').count()>=8,true);
 const enableCode=totp(secret);await page.getByLabel('Authentication code').fill(enableCode);await page.getByRole('button',{name:'Turn on two-step verification'}).click();await page.getByText('Two-step verification is on.').waitFor();
 const fresh=await browser.newContext(),login=await fresh.newPage();watch(login);
 const apiLogin=await fresh.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:users[0].email,password:users[0].password}});assert.equal((await apiLogin.json()).twoFactorRedirect,true);
 assert.equal((await fresh.request.get(base+'/api/ledger')).status(),401,'Password alone must not open the ledger');
 await fresh.clearCookies();await login.goto(base+'/login?next=%2Freports');await login.getByLabel('Email address').fill(users[0].email);await login.getByLabel('Password').fill(users[0].password);await login.getByRole('button',{name:'Sign in'}).click();
 await login.getByLabel('Authentication code').fill('000000');await login.getByRole('button',{name:'Verify and sign in'}).click();await login.locator('.auth-error').waitFor();
 let code=totp(secret);if(code===enableCode){await sleep(30000-Date.now()%30000+500);code=totp(secret);}
 await login.getByLabel('Authentication code').fill(code);await login.getByRole('button',{name:'Verify and sign in'}).click();await login.waitForURL(u=>new URL(u).pathname==='/reports');
 assert.equal((await fresh.request.get(base+'/api/ledger')).status(),200);await fresh.close();
 await page.goto(base+'/');await page.locator('.metrics').waitFor();assert.equal(await page.locator('.security-strip').count(),0,'reminder disappears once two-step verification is on');

 assert.deepEqual(problems,[]);
 console.log('PASS: transfer prompt after import, Overview transfer strip, Reports transfers net to zero, recurring payments, two-step reminder, transfer pairing (find, confirm, unlink, relink, unlinked filter), credit card PDF import (signs, amount due, card account warning, outstanding balance, EMI labels), Excel import with period/balances, duplicate re-import, unreadable-row detection, missing-period and balance-break detection, statement details, rule back-fill, bulk edit with type safety, tax summary and export, mobile layout, 200-row paging, two-step verification, no CSP violations.');
}finally{await browser.close();for(const user of created)await operator(false,user);}
