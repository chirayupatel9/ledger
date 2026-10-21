// Live check for scanned statements: a bank statement saved as images only (no text in the PDF) is read with the
// on-device OCR, its rows go through the normal bank parser, the opening and closing balances reconcile, the review
// says it was a scan, and the import saves the rows and the original PDF. Synthetic statement, disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {scannedPDF} from './fixtures/scanned-pdf.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Scan QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
const rows=[['01/10/2026','NEFT CR ACME TECHNOLOGIES SALARY','','1,25,000.00','1,35,000.00'],['03/10/2026','UPI SWIGGY 628512345678','450.00','','1,34,550.00'],
 ['05/10/2026','ACH D HDFC LIFE INSURANCE PREMIUM','4,500.00','','1,30,050.00'],['10/10/2026','ACH D NSE CLEARING SIP','25,000.00','','1,05,050.00']];
const cell=(w,t)=>`<td style="width:${w}px;padding:9px 6px;vertical-align:top">${t}</td>`;
const statement=`<div style="width:900px;padding:40px 30px;background:#fff;color:#000;font:18px/1.4 'DejaVu Sans',Arial,sans-serif">
 <div style="font-size:24px;font-weight:bold">HDFC BANK LIMITED</div><div style="margin:10px 0 24px">Statement of account · Opening Balance 10,000.00</div>
 <table style="border-collapse:collapse"><tr style="font-weight:bold">${cell(140,'Date')}${cell(330,'Narration')}${cell(130,'Withdrawal')}${cell(130,'Deposit')}${cell(130,'Balance')}</tr>
 ${rows.map(r=>`<tr>${cell(140,r[0])}${cell(330,r[1])}${cell(130,r[2])}${cell(130,r[3])}${cell(130,r[4])}</tr>`).join('')}</table>
 <div style="margin-top:24px">Closing Balance 1,05,050.00</div></div>`;
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const shot=await browser.newPage({viewport:{width:960,height:700},deviceScaleFactor:2});await shot.setContent(statement);
 const size=await shot.locator('body > div').boundingBox(),jpeg=await shot.locator('body > div').screenshot({type:'jpeg',quality:90});await shot.close();
 const pdf=scannedPDF([{jpeg,width:Math.round(size.width*2),height:Math.round(size.height*2)}]);
 assert.ok(!pdf.includes('NEFT'),'the PDF has no text layer');
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const ledger=async()=>(await(await context.request.get(base+'/api/ledger')).json()).state;
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state={schemaVersion:2,initialized:true,rules:[],statements:[],transactions:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false}]};
 assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);

 await page.goto(base+'/statements');await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption('h');
 await page.locator('#file-input').setInputFiles({name:'hdfc-scanned-oct.pdf',mimeType:'application/pdf',buffer:pdf});
 const modal=page.locator('#modal');await modal.getByText(/rows extracted/).waitFor({timeout:180000});
 assert.match(await modal.innerText(),/4 rows extracted/);await modal.getByText('This statement is a scan and was read with OCR').waitFor();
 assert.equal(await modal.locator('#st-opening').inputValue(),'10000.00');assert.equal(await modal.locator('#st-closing').inputValue(),'105050.00');
 await modal.getByText('This matches the closing balance').waitFor();
 await page.locator('#commit-import').click();await page.locator('#toast').getByText(/transactions and the original statement saved/).waitFor();
 const state=await ledger();
 assert.deepEqual(state.transactions.map(t=>[t.date,t.amount]).sort(),[['2026-10-01',12500000],['2026-10-03',-45000],['2026-10-05',-450000],['2026-10-10',-2500000]]);
 assert.ok(state.statements[0].fileId,'the original scanned PDF is kept');
 assert.deepEqual(problems,[]);
 console.log('PASS: scanned (image-only) statement read with on-device OCR, normal bank parser, opening and closing balances reconcile, review says it was a scan, rows and original PDF saved, no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
