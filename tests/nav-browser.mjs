// Live checks for today's fund values on the Investments page. The real NAV endpoints are checked first (sign-in required,
// AMFI data loaded, a real scheme matched automatically, an ambiguous one left to choose, your choice saved and kept by an
// older tab). The page then runs against a stubbed NAV source (page.route on /api/navs and /api/navs/search) so values, gain
// and XIRR are exact: value at today's NAV, choosing a scheme, not matching one, reload, phone layout. Synthetic data on a
// disposable account.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {xirr} from '../packages/domain/investments.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'NAV QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(script,input){return new Promise((resolve,reject)=>{const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example\\.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`],user);
let n=0;
const account=(id,name,type)=>({id,name,bank:'',type,last4:'',currency:'INR',archived:false});
const tx=(date,description,amount,extra={})=>({id:'t'+(++n),statementId:'si',accountId:'i',account:'Mutual funds',date,description,amount,category:'Investments',type:'Transfer',review:false,...extra});
const buy=(date,scheme,folio,units,nav,amount,stamp=0)=>[tx(date,`SIP Purchase · ${scheme} · Folio ${folio} · ${units} units @ ₹${nav}`,amount),...(stamp?[tx(date,`Stamp duty · ${scheme} · Folio ${folio}`,-stamp,{category:'Taxes',type:'Expense'})]:[])];
const ppfasName='Parag Parikh Flexi Cap Fund - Direct Plan - Growth',hdfcName='HDFC Flexi Cap Fund - Growth',alphaName='Alpha Flexi Cap Fund - Growth';
const transactions=[...buy('2025-10-17',ppfasName,'111/01','1189.0233','84.1022',10000000,500),...buy('2026-04-17',ppfasName,'111/01','1150.0','86.95',10000000,500),
 ...buy('2026-01-10',hdfcName,'222/02','25.0','1900',4750000),...['2026-07-10','2026-08-10','2026-09-10'].flatMap(d=>buy(d,alphaName,'333/03','13.027','1918.97',2500000))];
const state={accounts:[account('i','Mutual funds','Investment')],statements:[{id:'si',accountId:'i',account:'Mutual funds',name:'fund-report.xlsx',count:transactions.length,created:'2026-10-06T00:00:00Z',from:'2025-10-01',to:'2026-10-05'}],transactions};
// The stubbed NAV source: what /api/navs would answer for these schemes on 19 Oct 2026, following the choices the page saves.
const scheme=(code,name,plan,option,nav,amc)=>({code,isins:[],name,plan,option,amc,category:'Equity Scheme - Flexi Cap Fund',nav,date:'2026-10-19'});
const ppfas=scheme(122639,'Parag Parikh Flexi Cap Fund','Direct Plan','Growth',90.3546,'PPFAS Mutual Fund'),hdfcDirect=scheme(118955,'HDFC Flexi Cap Fund','Direct Plan','Growth Option',2162.161,'HDFC Mutual Fund');
const hdfcRegular=scheme(101762,'HDFC Flexi Cap Fund','Regular Plan','Growth Option',1961.801,'HDFC Mutual Fund'),alphaLike=scheme(900001,'Alpha Flexi Cap Fund','Regular Plan','Growth',2050.5,'Alpha Mutual Fund');
let choices=new Map();
function navAnswer(){
 const entry=(name,auto,ambiguous,fitting,candidates)=>{const c=choices.get(name.toLowerCase());if(c===undefined)return {scheme:name,match:auto,source:auto?'name':null,ambiguous,fitting,candidates};
  return {scheme:name,match:c?[...candidates,alphaLike].find(s=>s.code===c)||null:null,source:c?'chosen':'none',ambiguous:false,fitting,candidates};};
 return {updatedAt:'2026-10-19T18:00:00.000Z',available:true,schemes:[entry(ppfasName,ppfas,false,1,[ppfas]),entry(hdfcName,null,true,2,[hdfcDirect,hdfcRegular]),entry(alphaName,null,false,0,[])]};
}
const inr=(v,compact=false)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:compact?0:2,minimumFractionDigits:compact?0:2}).format(v/100);
const signed=v=>(v>0?'+':v<0?'−':'')+inr(Math.abs(v)),pct=v=>(v>0?'+':v<0?'−':'')+Math.abs(v*100).toLocaleString('en-IN',{maximumFractionDigits:1})+'%',re=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 assert.equal((await fetch(base+'/api/navs')).status,401,'NAVs need a signed-in account');
 await operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);created=true;
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 assert.equal((await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const load=async()=>(await(await context.request.get(base+'/api/ledger')).json()),find=(list,name)=>list.schemes.find(x=>x.scheme===name);
 const put=async next=>{const data=await load();data.state={schemaVersion:2,initialized:true,rules:[],...next};assert.equal((await context.request.put(base+'/api/ledger',{headers:{Origin:base},data})).status(),200);};
 await put(state);

 // 1. The real endpoints: AMFI's NAVs are loaded and matched to the schemes in this ledger.
 let real;for(let i=0;i<18;i++){real=await(await context.request.get(base+'/api/navs')).json();if(real.available)break;await new Promise(r=>setTimeout(r,5000));}
 assert.equal(real.available,true,'the server has downloaded AMFI NAVs');
 const week=new Date(Date.now()-10*864e5).toISOString().slice(0,10);
 const realPpfas=find(real,ppfasName);assert.deepEqual([realPpfas.match?.code,realPpfas.source,realPpfas.match?.plan],[122639,'name','Direct Plan']);assert.ok(realPpfas.match.date>=week&&realPpfas.match.nav>0,'a recent official NAV');
 const realHdfc=find(real,hdfcName);assert.deepEqual([realHdfc.match,realHdfc.ambiguous,realHdfc.fitting],[null,true,2],'no plan in the report: Direct or Regular');
 assert.equal(find(real,alphaName).match,null);
 const search=await(await context.request.get(base+'/api/navs/search?q='+encodeURIComponent('hdfc flexi regular growth'))).json();assert.ok(search.schemes.some(s=>s.code===101762));

 // 2. The page with the stubbed NAV source.
 await page.route(u=>new URL(u).pathname==='/api/navs',route=>route.fulfill({json:navAnswer()}));
 await page.route(u=>new URL(u).pathname==='/api/navs/search',route=>route.fulfill({json:{schemes:/alpha/i.test(new URL(route.request().url()).searchParams.get('q')||'')?[alphaLike]:[]}}));
 page.on('request',r=>{if(r.method()==='PUT'&&new URL(r.url()).pathname==='/api/ledger'){const fm=r.postDataJSON()?.state?.fundMatches;if(fm)choices=new Map(fm.map(m=>[m.scheme.toLowerCase(),m.code]));}});
 await page.goto(base+'/investments');const content=page.locator('#page-content'),row=name=>content.locator(`.funds-table tr[data-fund="${name}"]`);
 await row(ppfasName).locator('.fund-match').waitFor();
 const units={ppfas:23390233,hdfc:250000,alpha:390810},paid={ppfas:20000000,hdfc:4750000,alpha:7500000};
 const value={ppfas:Math.round(units.ppfas*90.3546/100),hdfc:Math.round(units.hdfc*1900/100),alpha:Math.round(units.alpha*1918.97/100)};
 const ppfasXirr=xirr([{date:'2025-10-17',amount:-10000000},{date:'2026-04-17',amount:-10000000},{date:'2026-10-19',amount:value.ppfas}]);
 assert.match(await row(ppfasName).innerText(),new RegExp(`AMFI 122639 · Direct Plan · Growth[\\s\\S]*${re(inr(value.ppfas))}[\\s\\S]*NAV ₹90\\.3546 · 19 Oct 2026[\\s\\S]*${re(signed(value.ppfas-paid.ppfas))}[\\s\\S]*${re(pct((value.ppfas-paid.ppfas)/paid.ppfas))} · XIRR ${re(pct(ppfasXirr))}`));
 assert.match(await row(hdfcName).innerText(),/2 AMFI schemes could be this fund\. Choose yours[\s\S]*₹47,500\.00[\s\S]*Report NAV ₹1,900\.00 · 10 Jan 2026/);
 assert.match(await row(alphaName).innerText(),new RegExp(`No AMFI scheme with this name · Find it[\\s\\S]*${re(inr(value.alpha))}[\\s\\S]*Report NAV ₹1,918\\.97 · 10 Sept? 2026`));
 const total=value.ppfas+value.hdfc+value.alpha,gain=total-paid.ppfas-paid.hdfc-paid.alpha;
 assert.match(await content.locator('.metric.highlight').innerText(),new RegExp(`Current value[\\s\\S]*${re(inr(total,true))}[\\s\\S]*${re(signed(gain))} · XIRR [+−][\\d.]+% · NAV 19 Oct 2026 · 1 of 3 funds at today’s NAV`));
 assert.match(await content.locator('.funds-card .sub').first().innerText(),/today’s official NAV from AMFI[\s\S]*Units count only the transactions in the reports you imported[\s\S]*The simplest way is one Consolidated Account Statement \(CAS\) since inception/);
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/navs-desktop.png',fullPage:true});

 // 3. Choosing the scheme for the ambiguous fund: saved to the ledger and honoured by the real endpoint.
 await row(hdfcName).getByRole('button',{name:'Choose yours'}).click();const dialog=page.locator('#modal');
 await dialog.getByText('Match to an AMFI scheme').waitFor();assert.equal(await dialog.locator('.nav-option').count(),3,'two schemes and “Don’t match”');
 assert.match(await dialog.innerText(),/last NAV in your reports ₹1,900\.00 on 10 Jan 2026[\s\S]*Regular Plan · Growth Option · HDFC Mutual Fund · AMFI 101762/);
 await dialog.locator('input[value="101762"]').check();await dialog.locator('#nav-save').click();
 await row(hdfcName).getByText('AMFI 101762 · Regular Plan · Growth Option').waitFor();
 const hdfcValue=Math.round(units.hdfc*1961.801/100);assert.match(await row(hdfcName).innerText(),new RegExp(`${re(inr(hdfcValue))}[\\s\\S]*NAV ₹1,961\\.801 · 19 Oct 2026`));
 assert.match(await content.locator('.metric.highlight').innerText(),/2 of 3 funds at today’s NAV/);
 assert.deepEqual((await load()).state.fundMatches,[{scheme:hdfcName,code:101762}]);
 const chosen=find(await(await context.request.get(base+'/api/navs')).json(),hdfcName);assert.deepEqual([chosen.source,chosen.match?.code],['chosen',101762]);

 // 4. Searching, then choosing not to match a fund: it keeps the value at the reports' NAV.
 await row(alphaName).getByRole('button',{name:'Find it'}).click();await dialog.getByText('Match to an AMFI scheme').waitFor();
 await dialog.locator('#nav-search input').fill('alpha flexi');await dialog.locator('#nav-search button').click();await dialog.getByText('AMFI 900001').waitFor();
 await dialog.locator('input[value="none"]').check();await dialog.locator('#nav-save').click();
 await row(alphaName).getByText('Not matched to an AMFI scheme (your choice)').waitFor();
 assert.deepEqual((await load()).state.fundMatches,[{scheme:hdfcName,code:101762},{scheme:alphaName,code:null}]);

 // 5. An older tab that saves without fundMatches keeps them; a reload shows the same matches.
 await put(state);assert.equal((await load()).state.fundMatches.length,2,'merged server-side like preferences');
 await page.reload();await row(hdfcName).getByText('AMFI 101762').waitFor();assert.match(await row(alphaName).innerText(),/Not matched to an AMFI scheme/);

 // 6. Phone layout: no sideways page scroll, and the scheme picker fits.
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/investments');await row(ppfasName).locator('.fund-match').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal page scroll on a phone');
 await row(hdfcName).getByRole('button',{name:'Change'}).click();await dialog.getByText('Match to an AMFI scheme').waitFor();
 assert.ok(await dialog.evaluate(d=>d.getBoundingClientRect().right<=window.innerWidth+1&&d.scrollWidth<=d.clientWidth+1),'the picker fits a phone');
 if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/navs-phone-picker.png'});
 assert.deepEqual(problems,[]);
 console.log('PASS: live NAVs (sign-in required, AMFI NAVs loaded, real automatic and ambiguous matches, search), Investments page with a stubbed NAV source (value at today’s NAV, gain, XIRR, report-NAV fallback, choosing a scheme, not matching, saved and kept by an older tab, reload, phone layout and picker), no CSP violations.');
}finally{await browser.close();if(created)await remove().catch(()=>{});}
