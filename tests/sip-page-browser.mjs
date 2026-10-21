// Live checks for the Investments page: SIPs from a fund report and from bank debits, funds with units and value, bank
// payments matched or not, the empty state, navigation and the phone layout. Synthetic data on a disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'SIP QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
let n=0;
const account=(id,name,type)=>({id,name,bank:'',type,last4:'',currency:'INR',archived:false});
const tx=(accountId,date,description,amount,extra={})=>({id:'t'+(++n),statementId:accountId==='i'?'si':'sb',accountId,account:accountId==='i'?'Mutual funds':'HDFC Savings',date,description,amount,category:'Investments',type:'Transfer',review:false,...extra});
const sip=(date,scheme,folio,units,nav,amount=2500000,stamp=125,kind='SIP Purchase')=>[tx('i',date,`${kind} · ${scheme} · Folio ${folio} · ${units} units @ ₹${nav}`,amount),tx('i',date,`Stamp duty · ${scheme} · Folio ${folio}`,-stamp,{category:'Taxes',type:'Expense'})];
const alpha='Alpha Flexi Cap Fund - Growth';
const fund=[...sip('2026-07-10',alpha,'111/01','13.027','1918.97'),...sip('2026-08-10',alpha,'111/01','13.027','1918.97'),...sip('2026-09-10',alpha,'111/01','13.027','1918.97'),...sip('2026-09-21',alpha,'111/01','98.11','2038.43',20000000,1000,'Purchase')];
const bank=[tx('b','2026-07-10','ACH D- NSE CLEARING LTD SIP',-2500000),tx('b','2026-08-10','ACH D- NSE CLEARING LTD SIP',-2500000),tx('b','2026-09-10','ACH D- NSE CLEARING LTD SIP',-2500000),
 ...['2026-08-05','2026-09-05','2026-10-05'].map(d=>tx('b',d,'ICCL MUTUAL FUND SIP',-500000))];
for(const [b,f] of [[bank[0],fund[0]],[bank[1],fund[2]],[bank[2],fund[4]]])b.transferId=f.transferId='link-'+b.date;
const statements=[{id:'si',accountId:'i',account:'Mutual funds',name:'fund-report.xlsx',count:fund.length,created:'2026-10-06T00:00:00Z',from:'2026-06-01',to:'2026-10-05'},{id:'sb',accountId:'b',account:'HDFC Savings',name:'hdfc.csv',count:bank.length,created:'2026-10-31T00:00:00Z',from:'2026-07-01',to:'2026-10-31'}];
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const put=async state=>{const data=await(await context.request.get(base+'/api/ledger')).json();data.state={schemaVersion:2,initialized:true,rules:[],...state};assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);};

 // 1. Empty state, reached from the sidebar.
 await put({accounts:[account('b','HDFC Savings','Savings')],statements:[],transactions:[]});
 await page.goto(base+'/');await page.locator('nav a[data-page="investments"]').click();await page.waitForURL(/\/investments$/);
 const content=page.locator('#page-content');await content.getByText('No investments yet').waitFor();
 assert.match(await content.locator('.inv-steps').innerText(),/From your SIP report or CAS\.[\s\S]*transaction report \(Excel\)[\s\S]*Consolidated Account Statement \(CAS\) PDF[\s\S]*PDF password field/);
 assert.equal(await page.locator('#account-filter').count(),0,'the page covers all accounts and all time');

 // 2. Fund report plus bank debits.
 await put({accounts:[account('b','HDFC Savings','Savings'),account('i','Mutual funds','Investment')],statements,transactions:[...fund,...bank]});
 await page.reload();await content.locator('.sips-card').waitFor();
 const sips=content.locator('.sips-card');
 assert.match(await sips.locator('[data-sip^="Alpha"]').innerText(),/Folio 111\/01 · Mutual funds · 10th of each month · 3 instalments since[\s\S]*Next instalment around 10 Oct 2026[\s\S]*₹25,000/);
 assert.match(await sips.innerText(),/₹30,000(?:\.00)?\s*a month across 2 active SIPs/);
 assert.match(await sips.locator('.recurring-line').nth(1).innerText(),/5th of each month · 3 instalments[\s\S]*Next instalment around 05 Nov 2026[\s\S]*₹5,000/);
 const row=content.locator('.funds-table tr[data-fund^="Alpha"]');
 assert.match(await row.innerText(),/₹2,75,000[\s\S]*incl\. ₹13\.75 stamp duty[\s\S]*137\.191[\s\S]*₹2,004\.40[\s\S]*₹2,79,654[\s\S]*NAV ₹2,038\.43 · 21 Sept? 2026/);
 assert.match(await content.locator('.bank-investments').innerText(),/6 payments categorised as Investments · 3 matched to a fund report/);
 assert.equal(await content.locator('.bank-investments .pill.review').count(),3);
 assert.match(await content.locator('.transfer-strip').innerText(),/3 investment payments from your bank are not matched/);
 assert.equal(await content.locator('.inv-bar').count(),12);
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/investments-desktop.png',fullPage:true});
 const metrics=await content.locator('.metrics').innerText();assert.match(metrics,/Invested[\s\S]*₹2\.9\d?L|Invested[\s\S]*2,90,000/);assert.match(metrics,/Value at last NAV/);

 // 3. A SIP name opens its transactions.
 await sips.locator('[data-recurring^="Alpha"]').click();await page.waitForURL(/\/transactions/);

 // 4. Phone layout: no sideways scrolling of the page.
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/investments');await content.locator('.funds-table').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal page scroll on a phone');
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/investments-phone.png',fullPage:true});
 assert.deepEqual(problems,[]);
 console.log('PASS: Investments page (empty state, sidebar route, SIPs from fund report and bank debits, next instalment dates, funds with stamp duty, units, average NAV and value, matched and unmatched bank payments, monthly bars, SIP drill-down, phone layout), no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
