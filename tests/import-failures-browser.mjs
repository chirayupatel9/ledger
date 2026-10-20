// Live checks for reporting statements that cannot be read: the operator is emailed a description of the file (never its
// rows), once per file, and the person importing is told. Uses a disposable .test account, so the report is recorded in
// the mail outbox but never sent.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {makePDF} from './fixtures/card-statements.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Import QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
// Operator helpers run inside the API container and only ever touch rows for this bank-qa-*@example.test account.
function operator(script,input){return new Promise((resolve,reject)=>{let out='';const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','pipe','pipe']});child.stdout.on('data',d=>out+=d);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const create=u=>operator(['node','apps/api/dist/apps/api/src/create-account.js'],u);
const sql=(query,params)=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {query,params}=JSON.parse(s);if(!params.every(p=>/^bank-qa-[a-f0-9-]+@example\\.test$/.test(p)))throw Error('Unexpected email');const r=await pool.query(query,params);console.log(JSON.stringify(r.rows));await pool.end();`],{query,params}).then(JSON.parse);
const reports=()=>sql("SELECT subject,body,suppressed FROM mail_outbox WHERE body LIKE '%<'||$1||'>%' ORDER BY id",[user.email]);
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await create(user);created=true;
 const context=await browser.newContext(),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const data=await(await context.request.get(base+'/api/ledger')).json();data.state={schemaVersion:2,initialized:true,accounts:[{id:'hdfc',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[],transactions:[],rules:[]};
 assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);
 await page.goto(base+'/statements');
 const pick=async file=>{await page.locator('[data-action="upload"]').first().click();await page.locator('#account-name').selectOption('hdfc');await page.locator('#file-input').setInputFiles(file);};
 const note=/administrator has been told/;

 // 1. A CSV with no transaction table: the error is shown, the operator is told, and the file's rows are not sent.
 const odd={name:'odd-export.csv',mimeType:'text/csv',buffer:Buffer.from('Ref,Info\nX1,SWIGGY 450\n')};
 await pick(odd);const status=page.locator('#upload-status');await status.getByText(note).waitFor();
 assert.match(await status.innerText(),/No transaction header found/);
 let sent=await reports();assert.equal(sent.length,1);
 assert.equal(sent[0].subject,'Ledger could not read a statement: CSV statement');assert.equal(sent[0].suppressed,true,'test accounts never send mail');
 assert.match(sent[0].body,/File: odd-export\.csv \(CSV, 1 KB\)/);assert.match(sent[0].body,/Imported into: HDFC Savings \(Savings\)/);
 assert.doesNotMatch(sent[0].body,/SWIGGY|450|X1/,'statement contents are never emailed');

 // 2. The same file again is not reported twice, but the person is still told.
 await page.reload();await pick(odd);await status.getByText(note).waitFor();assert.equal((await reports()).length,1);

 // 3. An unsupported file type.
 await page.reload();await pick({name:'bank-export.ofx',mimeType:'application/octet-stream',buffer:Buffer.from('OFXHEADER:100\n')});await status.getByText(note).waitFor();
 sent=await reports();assert.equal(sent.length,2);assert.equal(sent[1].subject,'Ledger could not open a statement file: .ofx file');

 // 4. A PDF whose layout yields no transactions: the bank is recognised from its first page.
 const pdf=makePDF([[[40,800,'HDFC BANK LIMITED',12],[40,780,'Statement of account'],[40,760,'Nothing here looks like a transaction table']]]);
 await page.reload();await pick({name:'hdfc-statement.pdf',mimeType:'application/pdf',buffer:pdf});
 const modal=page.locator('#modal');await modal.getByText('No transactions could be read').waitFor();await modal.locator('#import-reported').getByText(note).waitFor();
 sent=await reports();assert.equal(sent.length,3);assert.equal(sent[2].subject,'Ledger found no transactions in a statement: HDFC Bank PDF');
 assert.match(sent[2].body,/File: hdfc-statement\.pdf \(PDF, 1 page, \d+ KB\)/);assert.match(sent[2].body,/Looks like: HDFC Bank/);
 assert.match(sent[2].body,/Parser note: No dated rows found/);
 await modal.locator('[data-action="upload"]').click();

 // 5. A CSV with one unreadable row: the rest can be imported, and the operator learns rows were left out.
 await page.reload();await pick({name:'partly.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Narration,Amount\n01/10/2026,UPI-A,-100\n32/13/2026,UPI-B,-50\n03/10/2026,UPI-C,200\n')});
 await page.locator('#map-next').click();await modal.getByText('1 rows could not be read').waitFor();await modal.locator('#import-reported').getByText(note).waitFor();
 sent=await reports();assert.equal(sent.length,4);assert.equal(sent[3].subject,'Ledger only partly read a statement: CSV statement');
 assert.match(sent[3].body,/What happened: 1 of 3 rows could not be read and were left out\./);assert.match(sent[3].body,/Rows: 2 read, 1 could not be read/);
 assert.match(sent[3].body,/Columns found: Date · Narration · Amount/);assert.doesNotMatch(sent[3].body,/UPI-|32\/13/);
 await modal.getByRole('button',{name:'Cancel'}).click();

 // 6. The endpoint needs a signed-in person and a well-formed report.
 assert.equal((await context.request.post(base+'/api/import-failures',{headers:{Origin:base},data:{kind:'empty',fileName:'x.pdf'}})).status(),400);
 const anon=await browser.newContext();assert.ok([401,403].includes((await anon.request.post(base+'/api/import-failures',{headers:{Origin:base},data:{kind:'empty',fileHash:'a'.repeat(64),fileName:'x.pdf'}})).status()));await anon.close();
 assert.deepEqual(problems,[]);
 console.log('PASS: unreadable statements reported to the operator (CSV error, unsupported type, PDF with no rows and its bank, partly read CSV), once per file, contents never emailed, test mail never sent, person told, endpoint validation, no CSP violations.');
}finally{
 await browser.close();
 if(created){await sql("DELETE FROM mail_outbox WHERE body LIKE '%<'||$1||'>%'",[user.email]).catch(()=>{});await sql('DELETE FROM "user" WHERE email=$1',[user.email]).catch(()=>{});}
}
