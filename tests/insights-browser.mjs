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
// Four months ending this month (IST), so "coming up" and "this month" line up with today.
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()),month=(k)=>{const d=new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7)-1-k,1));return d.toISOString().slice(0,7);};
const months=[3,2,1,0].map(month),day=(m,d)=>`${m}-${String(Math.min(d,Number(today.slice(8)))).padStart(2,'0')}`;
function ledger(){
 let n=0;const names={h:'HDFC Savings',c:'ICICI Card',i:'Mutual funds'},t=(accountId,date,description,amount,category,type,extra={})=>({id:'t'+(++n),statementId:'s-'+accountId,accountId,account:names[accountId],date,description,amount,category,type,review:false,...extra});
 const h=[],c=[],i=[],thisMonth=months.at(-1),d=(m,x)=>m===thisMonth?day(m,x):`${m}-${String(x).padStart(2,'0')}`;
 for(const m of months){
  h.push(t('h',d(m,1),'NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY',12500000,'Salary','Income'),t('h',d(m,2),'UPI-LANDLORD RAMESH KUMAR-ramesh.k@okhdfcbank-628533334444-RENT',-3500000,'Rent','Expense',{taxTag:'none'}),
   t('h',d(m,3),'ACH D- HDFC LIFE INSURANCE CO-PREMIUM',-450000,'Insurance','Expense',{taxTag:'80c'}),t('h',d(m,4),'ACH D- NSE CLEARING LTD-SIP',-2500000,'Investments','Transfer',{transferId:'sip-'+m,taxTag:'none'}),
   t('h',d(m,5),'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345678',-64900,'Food & dining','Expense'),t('h',d(m,6),'UPI-RELIANCE RETAIL LTD-relianceretail@hdfcbank-628598765432',-342050,'Groceries','Expense'));
  c.push(t('c',d(m,7),'AMAZON PAY INDIA PRIVATE LIMITED',-189900,'Shopping','Expense'),t('c',d(m,8),'NETFLIX.COM MUMBAI',m===thisMonth?-64900:-49900,'Entertainment','Expense'));
  i.push(t('i',d(m,4),'SIP Purchase · Alpha Flexi Cap Fund · Folio 111/01 · 13.027 units @ ₹1918.97',2500000,'Investments','Transfer',{transferId:'sip-'+m}));
 }
 c.push(t('c',day(months.at(-1),9),'AMAZON PAY INDIA PRIVATE LIMITED',-1500000,'Shopping','Expense'));
 let bal=5000000;for(const x of h.sort((a,b)=>a.date.localeCompare(b.date))){bal+=x.amount;x.balance=bal;}
 const st=(id,accountId,count,extra={})=>({id,accountId,account:names[accountId],name:id+'.pdf',count,created:today+'T00:00:00Z',...extra});
 return {schemaVersion:2,initialized:true,rules:[],titleRules:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false},{id:'c',name:'ICICI Card',bank:'ICICI Bank',type:'Credit card',last4:'9003',currency:'INR',archived:false},{id:'i',name:'Mutual funds',bank:'',type:'Investment',last4:'',currency:'INR',archived:false}],
  statements:[st('s-h','h',h.length),st('s-c','c',c.length,{from:months[0]+'-01',to:today,opening:0,closing:c.reduce((v,x)=>v+x.amount,0)}),st('s-i','i',i.length)],transactions:[...h,...c,...i]};
}
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
 assert.match(await content.locator('#upcoming-card').innerText(),/Coming up[\s\S]*Rent · UPI payment[\s\S]*₹35,000/);
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
