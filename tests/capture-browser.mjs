// Live checks for the phone features: the phone bar and More, Add from a UPI message (matched by reference, or added
// and later replaced by the statement row), a bill photo read on the device and attached as a receipt (viewed and
// removed), a bill kept for later, the installable app (manifest, icons, service worker, share target and its
// fallback) and the install card. Synthetic data on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Phone QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()),ago=n=>new Date(Date.parse(today+'T00:00:00Z')-n*864e5).toISOString().slice(0,10),dmy=d=>d.split('-').reverse().join('/');
const account=(id,name,type,last4)=>({id,name,bank:'',type,last4,currency:'INR',archived:false});
const row=(id,accountId,date,description,amount,category='Food & dining')=>({id,statementId:'s-'+accountId,accountId,account:accountId==='h'?'HDFC Savings':'ICICI Card',date,description,amount,category,type:'Expense',review:false});
const seed={schemaVersion:2,initialized:true,rules:[],accounts:[account('h','HDFC Savings','Savings','4821'),account('c','ICICI Card','Credit card','9003')],
 statements:[{id:'s-h',accountId:'h',account:'HDFC Savings',name:'hdfc.csv',count:1,created:ago(1)+'T00:00:00Z'},{id:'s-c',accountId:'c',account:'ICICI Card',name:'card.pdf',count:1,created:ago(1)+'T00:00:00Z'}],
 transactions:[row('swiggy','h',ago(1),'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345678-Order',-45000),row('grocery','c',ago(2),'POS 4532XXXX9003 RELIANCE RETAIL',-84368,'Groceries')]};
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const ledger=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state;
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state=seed;assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 const modal=page.locator('#modal'),toast=page.locator('#toast');

 // 1. The phone bar: Overview, Transactions, Add, Investments, More; the other pages open from More.
 await page.goto(base+'/');await page.locator('#page-content').waitFor();
 const visible=await page.locator('nav > a, nav > button').evaluateAll(els=>els.filter(e=>e.offsetParent!==null).map(e=>e.innerText.trim()));
 assert.deepEqual(visible.sort(),['Add','Investments','More','Overview','Transactions'].sort());
 await page.locator('nav .nav-more').click();await modal.locator('[data-more-page="reports"]').click();await page.waitForURL(/\/reports$/);
 assert.equal(await page.locator('nav .nav-more.active').count(),1,'More is highlighted on pages it holds');

 // 2. A UPI message for a payment already imported: matched by its reference.
 await page.locator('nav .nav-add').click();await modal.getByText('UPI or bank message').click();
 await modal.locator('textarea').fill(`Sent Rs.450.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn ${dmy(ago(1)).replace(/\/20(\d\d)$/,'/$1')}\nRef 628512345678\nNot You?`);
 await modal.getByRole('button',{name:'Read message'}).click();
 await modal.getByText('Same UPI reference').waitFor();assert.equal(await modal.locator('select[name="account"]').inputValue(),'h','account found from the last digits');
 await modal.locator('#capture-save').click();await toast.getByText(/Added to/).waitFor();
 let state=await ledger();assert.equal(state.transactions.find(t=>t.id==='swiggy').displayName,'Swiggy');assert.equal(state.transactions.length,2);

 // 3. A UPI message with no transaction yet: added now, marked as from a message.
 await page.locator('nav .nav-add').click();await modal.getByText('UPI or bank message').click();
 await modal.locator('textarea').fill(`Rs.300.00 debited from a/c **4821 on ${dmy(today)} to VPA chaipoint@icici(UPI Ref No 628511112222). Not you?`);
 await modal.getByRole('button',{name:'Read message'}).click();await modal.getByText(/No transaction for ₹300/).waitFor();
 await modal.locator('#capture-save').click();await toast.getByText(/Payment added/).waitFor();
 state=await ledger();const chai=state.transactions.find(t=>t.source==='message');assert.ok(chai,'added from the message');
 assert.deepEqual({amount:chai.amount,date:chai.date,account:chai.accountId,ref:chai.ref,name:chai.displayName,review:chai.review},{amount:-30000,date:today,account:'h',ref:'628511112222',name:'Chaipoint',review:true});
 await page.goto(base+'/transactions');await page.locator('#page-content').getByText('Added from a UPI message').waitFor();
 const card=await page.locator('tr[data-transaction="swiggy"]').boundingBox(),added=await page.locator(`tr[data-transaction="${chai.id}"]`).boundingBox();
 assert.ok(card.height<120&&added.height<190,`phone transaction rows stay compact (${Math.round(card.height)}px, ${Math.round(added.height)}px)`);
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/phone-transactions.png'});

 // 4. A bill photo: read on the device, matched to the card payment, attached as its receipt.
 const shot=await browser.newPage({viewport:{width:520,height:640}});
 await shot.setContent(`<div style="font:28px/1.5 'DejaVu Sans Mono',monospace;padding:30px;background:#fff;color:#000;width:460px">RELIANCE SMART<br>TAX INVOICE<br>Date: ${dmy(ago(2))}<br>Toor Dal 1kg 378.00<br>Rice 5kg 425.50<br>Sub Total 803.50<br>GST 40.18<br>Grand Total 843.68<br>Thank you</div>`);
 const bill=await shot.screenshot({type:'png'});await shot.close();
 await page.locator('nav .nav-add').click();await modal.getByText('Photo of a bill').click();
 await modal.locator('input[data-photo]').nth(1).setInputFiles({name:'bill.png',mimeType:'image/png',buffer:bill});
 await modal.locator('#capture-review').waitFor({timeout:120000});
 assert.equal(await modal.locator('input[name="amount"]').inputValue(),'843.68','total read from the photo');assert.equal(await modal.locator('input[name="date"]').inputValue(),ago(2));
 assert.match(await modal.locator('input[name="payee"]').inputValue(),/Reliance Smart/i);
 assert.equal(await modal.locator('input[name="capture-choice"]:checked').inputValue(),'grocery','the card payment is suggested');
 await modal.locator('#capture-save').click();await toast.getByText(/Bill attached/).waitFor();
 state=await ledger();const receipt=state.transactions.find(t=>t.id==='grocery').receipts?.[0];assert.ok(receipt,'receipt attached');
 const file=await context.request.get(base+'/api/files/'+receipt.id);assert.equal(file.status(),200);assert.equal(file.headers()['content-type'],'image/jpeg');

 // 5. View and remove the receipt; the photo is deleted.
 await page.goto(base+'/transactions');await page.locator('[data-receipt="grocery"]').click();
 await page.waitForFunction(()=>document.querySelector('#modal .receipt-item img')?.naturalWidth>0);
 page.once('dialog',d=>d.accept());await modal.locator('[data-remove-receipt]').click();await toast.getByText('Receipt removed').waitFor();
 state=await ledger();assert.equal(state.transactions.find(t=>t.id==='grocery').receipts,undefined);assert.equal((await context.request.get(base+'/api/files/'+receipt.id)).status(),404);

 // 6. A bill with no payment yet waits in the inbox and shows on the overview.
 const shot2=await browser.newPage({viewport:{width:520,height:400}});await shot2.setContent(`<div style="font:28px/1.5 'DejaVu Sans Mono',monospace;padding:30px;background:#fff;color:#000">APOLLO PHARMACY<br>Date: ${dmy(today)}<br>Net Payable 1,245.00</div>`);
 const bill2=await shot2.screenshot({type:'png'});await shot2.close();
 await page.goto(base+'/');await page.locator('nav .nav-add').click();await modal.getByText('Photo of a bill').click();
 await modal.locator('input[data-photo]').nth(1).setInputFiles({name:'apollo.png',mimeType:'image/png',buffer:bill2});await modal.locator('#capture-review').waitFor({timeout:60000});
 assert.equal(await modal.locator('input[name="capture-choice"]:checked').inputValue(),'later');await modal.locator('#capture-save').click();await toast.getByText(/Bill kept/).waitFor();
 state=await ledger();assert.equal(state.receipts.length,1);assert.equal(state.receipts[0].total,124500);
 await page.locator('#page-content').getByText('1 bill is waiting for its payment.').waitFor();

 // 7. The statement arrives: its row replaces the payment added from the message, keeping the name.
 await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption('h');
 await page.locator('#file-input').setInputFiles({name:'hdfc-new.csv',mimeType:'text/csv',buffer:Buffer.from(`Date,Narration,Withdrawal Amt.,Deposit Amt.\n${dmy(today)},UPI-CHAI POINT-628511112222,300.00,\n`)});
 await page.locator('#map-next').click();await modal.getByText('1 payment you added from your phone will be replaced').waitFor();
 await page.locator('#commit-import').click();await toast.getByText(/transactions and the original statement saved/).waitFor();
 state=await ledger();assert.equal(state.transactions.filter(t=>t.source).length,0);const replaced=state.transactions.find(t=>/CHAI POINT/.test(t.description));
 assert.equal(replaced.displayName,'Chaipoint');assert.ok(replaced.statementId);

 // 8. Installable app: manifest, icons, service worker, share target (and its fallback), install card.
 const manifest=await(await context.request.get(base+'/manifest.webmanifest')).json();
 assert.equal(manifest.name,'Ledger');assert.equal(manifest.display,'standalone');assert.equal(manifest.share_target.action,'/share');
 for(const i of manifest.icons)assert.equal((await context.request.get(base+i.src)).headers()['content-type'],'image/png');
 assert.equal((await context.request.post(base+'/share',{maxRedirects:0,multipart:{text:'x'}})).headers().location,'/?shared=unavailable','without the service worker, ask to share again');
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 if(!await page.evaluate(()=>!!navigator.serviceWorker.controller)){await page.reload();await page.locator('#page-content').waitFor();}
 const shared=await page.evaluate(async()=>{const f=new FormData();f.append('text','Sent Rs.450.00 From HDFC Bank A/C *4821 To SWIGGY Ref 628512345678');const r=await fetch('/share',{method:'POST',body:f});return new URL(r.url).searchParams.get('shared');});
 assert.match(shared||'',/^[0-9a-f-]{36}$/,'the service worker kept the shared message');
 await page.goto(base+'/?shared='+shared);await modal.getByText('Same UPI reference').waitFor();await page.keyboard.press('Escape');
 await page.goto(base+'/settings');await page.locator('#pwa-card').getByText('Ledger on your phone').waitFor();
 assert.equal(await page.evaluate(()=>document.querySelector('meta[name="theme-color"]')?.content),'#173b32');
 assert.deepEqual(problems,[]);
 console.log('PASS: phone bar and More, UPI message matched by reference and added as new, bill photo read on the device and attached, receipt viewed and removed (file deleted), bill kept for later with overview strip, statement row replaces the phone payment, manifest, icons, service worker share target and fallback, install card, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
