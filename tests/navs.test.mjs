import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNavFile,describeScheme,indexSchemes,matchScheme,searchSchemes,navsForLedger,nextNavUpdate} from '../packages/domain/navs.js';
import {xirr,summarizeInvestments,fundSchemes,parseFundRow} from '../packages/domain/investments.js';
import {createInvestmentViews} from '../apps/web/public/investments-views.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';
import {navFile,oldNavFile} from './fixtures/amfi-navs.mjs';

const index=indexSchemes(parseNavFile(navFile).schemes),match=(scheme,extra={})=>matchScheme({scheme,...extra},index);
const code=r=>r.match?.code??null;

test('AMFI NAV file: schemes with ISINs, plan, option, fund house, category, NAV and date; bad rows skipped',()=>{
 const {schemes,skipped}=parseNavFile(navFile);
 assert.equal(schemes.length,24);assert.equal(skipped,3,'N.A. and zero NAVs and an unreadable date');
 assert.deepEqual(schemes.find(s=>s.code===118954),{code:118954,isins:['INF179K01VL5','INF179K01VM3'],name:'HDFC Flexi Cap Fund',plan:'Direct Plan',option:'IDCW Option',amc:'HDFC Mutual Fund',category:'Equity Scheme - Flexi Cap Fund',nav:87.425,date:'2026-10-19'});
 assert.deepEqual(schemes.find(s=>s.code===153964).isins,['INF879O01308'],'a “-” ISIN is left out');
 assert.equal(schemes.find(s=>s.code===143263).date,'2026-10-20');assert.equal(schemes.find(s=>s.code===135762).category,'Solution Oriented Scheme - Children’s Fund');
 assert.equal(schemes.find(s=>s.code===112323).nav,92.8872,'a scheme listed twice keeps its latest NAV');
 const old=parseNavFile(oldNavFile).schemes;
 assert.deepEqual(old.map(s=>[s.code,s.name,s.plan,s.nav,s.date]),[[122639,'Parag Parikh Flexi Cap Fund - Direct Plan - Growth','',84.1022,'2025-10-17'],[122640,'Parag Parikh Flexi Cap Fund - Regular Plan - Growth','',77.0311,'2025-10-17']],'the older six-column layout');
 assert.deepEqual(parseNavFile('').schemes,[]);assert.deepEqual(parseNavFile('<html>Service unavailable</html>').schemes,[]);
});

test('scheme names are normalised: punctuation, plan and option wording, Dividend for IDCW, former names',()=>{
 const a=describeScheme('Axis ELSS- Tax Saver Fund','Direct Plan','Growth Option'),b=describeScheme('Axis ELSS Tax Saver Fund - Direct Growth');
 assert.deepEqual([a.key,a.plan,a.option],[b.key,b.plan,b.option]);assert.deepEqual([b.key,b.plan,b.option],['axis elss saver tax','direct','growth']);
 assert.equal(describeScheme('HDFC Mid-Cap Opportunities Fund - Regular Plan - Dividend Payout').option,'idcw');
 assert.equal(describeScheme('Parag Parikh Liquid Fund','Direct Plan','Daily Reinvestment of IDCW').often,'daily');
 assert.equal(describeScheme('X Fund - Payout of Income Distribution cum capital withdrawal option').option,'idcw');
 assert.equal(describeScheme('Kotak Midcap Fund - Direct Growth').key,describeScheme('Kotak Mid Cap Fund').key);
 assert.equal(describeScheme('Sundaram Large Cap Fund (Formerly Known as Sundaram Blue Chip Fund)').key,'cap large sundaram');
});

test('a fund matches only the scheme with the same name, plan and option',()=>{
 assert.equal(code(match('Parag Parikh Flexi Cap Fund - Direct Plan - Growth')),122639);
 assert.equal(code(match('Parag Parikh Flexi Cap Fund - Regular Plan Growth')),122640,'plan: Regular, not Direct');
 assert.equal(code(match('HDFC Flexi Cap Fund - Regular Plan - IDCW')),101763,'option: IDCW, not Growth');
 assert.equal(code(match('HDFC Flexi Cap Fund - Direct Plan - Dividend')),118954,'Dividend is the old name for IDCW');
 assert.equal(code(match('Axis ELSS Tax Saver Fund - Direct Growth')),120503);
 assert.equal(code(match('Parag Parikh Flexi Cap Fund - Direct Plan - IDCW')),153964,'the only IDCW option, whatever its frequency');
 assert.equal(code(match('Parag Parikh Liquid Fund - Direct Plan - Daily IDCW Reinvestment')),143263);
 assert.equal(code(match('ICICI Prudential Bluechip Fund - Direct Plan - Growth')),120586,'by its former name');
 assert.equal(code(match('Axis Gilt Fund - Direct Plan - Regular IDCW Option')),120449,'“Regular” IDCW in the Direct plan');
 assert.equal(code(match('Axis Gilt Fund - Direct Plan - Half Yearly IDCW')),120448);
 const r=match('Parag Parikh Flexi Cap Fund - Direct Plan - Growth');assert.equal(r.source,'name');assert.equal(r.ambiguous,false);
 assert.deepEqual(match('Some Fund - Growth',{isin:'INF179K01608'}).match.code,101762,'an ISIN in the report decides');
});

test('anything uncertain is left for you to choose, with the likeliest schemes first',()=>{
 const noPlan=match('HDFC Flexi Cap Fund - Growth');
 assert.equal(noPlan.match,null);assert.equal(noPlan.ambiguous,true);assert.deepEqual(noPlan.candidates.slice(0,2).map(s=>s.code).sort(),[101762,118955],'Direct and Regular Growth, not IDCW');
 const liquid=match('Parag Parikh Liquid Fund - Direct Plan - IDCW');assert.equal(liquid.match,null);assert.equal(liquid.ambiguous,true,'daily, weekly and monthly IDCW');
 assert.deepEqual(liquid.candidates.slice(0,3).map(s=>s.code).sort(),[143262,143263,143265]);
 const twins=match('Axis Children\'s Fund - Direct Plan - Growth');assert.equal(twins.match,null);assert.deepEqual(twins.candidates.slice(0,2).map(s=>s.code),[135762,135764]);
 const unlisted=match('Motilal Oswal Midcap Fund - Direct Plan - Growth',{nav:97.2});
 assert.equal(unlisted.match,null,'AMFI lists these without plan or option');assert.equal(unlisted.ambiguous,true);assert.equal(unlisted.candidates[0].code,127039,'nearest to the NAV in your report');
 const renamed=match('HDFC Flexi Cap Fund Opportunities - Regular Plan - Growth');assert.equal(renamed.match,null);assert.equal(renamed.ambiguous,false);assert.equal(renamed.candidates[0].code,101762,'a similar name is offered, not matched');
 assert.deepEqual(match('Alpha Flexi Cap Fund - Growth').match,null);assert.deepEqual(match('Growth').candidates,[]);
});

test('schemes can be searched by words, AMFI code or ISIN',()=>{
 assert.deepEqual(searchSchemes('parag flexi direct',index).map(s=>s.code),[122639,153964]);
 assert.deepEqual(searchSchemes('hdfc flexi regular growth',index).map(s=>s.code),[101762]);
 assert.deepEqual(searchSchemes('120586',index).map(s=>s.name),['ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)']);
 assert.deepEqual(searchSchemes('inf879o01308',index).map(s=>s.code),[153964]);
 assert.deepEqual(searchSchemes('',index),[]);assert.deepEqual(searchSchemes('nothing like this',index),[]);
});

const account=(id,name,type)=>({id,name,bank:'',type,last4:'',currency:'INR',archived:false});
let n=0;
const buy=(date,scheme,units,nav,amount,extra={})=>({id:'f'+(++n),statementId:'si',accountId:'i',account:'Mutual funds',date,description:`SIP Purchase · ${scheme} · Folio 111/01 · ${units} units @ ₹${nav}`,amount,category:'Investments',type:'Transfer',review:false,...extra});
function ledger(fundMatches){
 const ppfas='Parag Parikh Flexi Cap Fund - Direct Plan - Growth',hdfc='HDFC Flexi Cap Fund - Growth';
 return {schemaVersion:2,initialized:true,rules:[],accounts:[account('i','Mutual funds','Investment')],statements:[{id:'si',accountId:'i',account:'Mutual funds',name:'r.xlsx',count:3,created:'2026-10-01T00:00:00Z'}],
  transactions:[buy('2025-10-17',ppfas,'1189.0233','84.1022',10000000),buy('2026-04-17',ppfas,'1150.0','86.95',10000000),buy('2026-01-10',hdfc,'25.0','1900',4750000)],...(fundMatches?{fundMatches}:{})};
}

test('the server answers for each scheme in your ledger, honouring the scheme you chose',()=>{
 assert.deepEqual(fundSchemes(ledger()).map(f=>[f.scheme,f.nav,f.navDate]),[['Parag Parikh Flexi Cap Fund - Direct Plan - Growth',86.95,'2026-04-17'],['HDFC Flexi Cap Fund - Growth',1900,'2026-01-10']]);
 const auto=navsForLedger(ledger(),index);assert.deepEqual(auto.map(x=>[x.match?.code??null,x.source,x.ambiguous]),[[122639,'name',false],[null,null,true]]);
 const chosen=navsForLedger(ledger([{scheme:'hdfc flexi cap fund - growth',code:101762},{scheme:'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',code:null}]),index);
 assert.deepEqual(chosen.map(x=>[x.match?.code??null,x.source]),[[null,'none'],[101762,'chosen']]);
 assert.equal(navsForLedger(ledger([{scheme:'HDFC Flexi Cap Fund - Growth',code:1}]),index)[1].source,'missing');
 assert.deepEqual(parseFundRow({description:'Purchase · X Fund - Growth · ISIN inf179k01608 · Folio 1 · 1 units @ ₹10'}).isin,'INF179K01608');
 // A CAS on top of a distributor report: rows with and without the ISIN, under one scheme name and folio.
 const cas='HDFC Flexi Cap Fund - Growth',mixed=ledger();
 mixed.transactions.push({...buy('2026-02-10',cas,'25.0','1950',4875000),description:`SIP Purchase · ${cas} · ISIN INF179K01608 · Folio 111/01 · 25.0 units @ ₹1950`},
  {...buy('2026-02-10',cas,'1','1',-100),description:`Stamp duty · ${cas} · ISIN INF179K01608 · Folio 111/01`,category:'Taxes',type:'Expense'});
 assert.deepEqual(fundSchemes(mixed).map(f=>[f.scheme,f.isin]),[['Parag Parikh Flexi Cap Fund - Direct Plan - Growth',''],[cas,'INF179K01608']],'one ISIN covers the scheme');
 const [,hdfc]=navsForLedger(mixed,index);assert.deepEqual([hdfc.match.code,hdfc.source],[101762,'isin']);
 const fund=summarizeInvestments(mixed,{today:'2026-10-20',navs:{[cas.toLowerCase()]:{...hdfc.match}}}).funds.find(f=>f.scheme===cas);
 assert.deepEqual([fund.count,fund.units,fund.stamp,fund.current.nav],[2,500000,100,1961.801],'both rows and the stamp duty stay one fund');
});

test('XIRR matches known spreadsheet results',()=>{
 const near=(a,b,note='',eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${note} ${a} ≈ ${b}`);
 near(xirr([{date:'2008-01-01',amount:-10000},{date:'2008-03-01',amount:2750},{date:'2008-10-30',amount:4250},{date:'2009-02-15',amount:3250},{date:'2009-04-01',amount:2750}]),0.373362535,'Microsoft’s XIRR example');
 near(xirr([{date:'2025-01-01',amount:-10000},{date:'2026-01-01',amount:11000}]),0.1);
 near(xirr([{date:'2024-01-01',amount:-10000},{date:'2025-01-01',amount:11000}]),1.1**(365/366)-1,'a leap year is 366/365 years');
 near(xirr([{date:'2025-01-01',amount:-10000},{date:'2026-01-01',amount:5000}]),-0.5);
 near(xirr([{date:'2026-01-01',amount:11000},{date:'2025-01-01',amount:-10000}]),0.1,'order does not matter');
 const sip=[...Array(12)].map((_,i)=>({date:`2025-${String(i+1).padStart(2,'0')}-05`,amount:-500000})),r=xirr([...sip,{date:'2026-01-05',amount:6600000}]);
 near(sip.reduce((v,f)=>v+f.amount/(1+r)**((Date.parse(f.date)-Date.parse('2025-01-05'))/864e5/365),0)+6600000/(1+r)**(365/365),0,'the flows are worth nothing at that rate',1e-3);assert.ok(r>0.18&&r<0.19,'a 12-month SIP worth 10% more is about 18.6% a year');
 assert.equal(xirr([{date:'2025-01-01',amount:-10000}]),null);assert.equal(xirr([{date:'2025-01-01',amount:-10000},{date:'2025-01-01',amount:12000}]),null,'no time has passed');assert.equal(xirr([]),null);
});

test('funds are valued at today’s NAV when matched, with gain and XIRR, else at the reports’ NAV',()=>{
 const navs={'parag parikh flexi cap fund - direct plan - growth':{code:122639,nav:90.3546,date:'2026-10-19',source:'name'}};
 const s=summarizeInvestments(ledger(),{today:'2026-10-20',navs}),[ppfas,hdfc]=s.funds;
 assert.equal(ppfas.units,23390233);assert.deepEqual(ppfas.current,{nav:90.3546,date:'2026-10-19',value:Math.round(23390233*90.3546/100)});
 assert.equal(ppfas.worth,ppfas.current.value);assert.equal(ppfas.gain,ppfas.current.value-20000000);
 assert.ok(Math.abs(ppfas.xirr-xirr([{date:'2025-10-17',amount:-10000000},{date:'2026-04-17',amount:-10000000},{date:'2026-10-19',amount:ppfas.current.value}]))<1e-12);
 assert.equal(hdfc.current,null);assert.equal(hdfc.worth,hdfc.value);assert.equal(hdfc.value,Math.round(250000*1900/100));assert.equal(hdfc.worthDate,'2026-01-10');
 const c=s.totals.current;assert.deepEqual([c.value,c.funds,c.live,c.navDate,c.paid],[ppfas.worth+hdfc.worth,2,1,'2026-10-19',24750000]);assert.equal(c.gain,ppfas.gain+hdfc.gain);assert.ok(c.xirr>0);
 assert.equal(s.totals.value,Math.round(23390233*86.95/100)+hdfc.value,'value at the reports’ last NAV stays as it was');
 assert.equal(summarizeInvestments(ledger(),{today:'2026-10-20'}).totals.current,null,'no NAVs: no current value');
 const stale=summarizeInvestments(ledger(),{today:'2026-10-20',navs:{'parag parikh flexi cap fund - direct plan - growth':{code:122639,nav:80,date:'2026-01-01'}}}).funds[0];
 assert.equal(stale.current,null,'an AMFI NAV older than the report is not used');assert.equal(stale.live.code,122639);
});

test('fund matches are saved per scheme, validated and de-duplicated',()=>{
 assert.deepEqual(validateLedger(ledger()).fundMatches,[]);
 assert.deepEqual(validateLedger(ledger([{scheme:'  HDFC Flexi   Cap Fund - Growth ',code:101762},{scheme:'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',code:null}])).fundMatches,[{scheme:'HDFC Flexi Cap Fund - Growth',code:101762},{scheme:'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',code:null}]);
 for(const fundMatches of [{},[null],[{scheme:'',code:1}],[{scheme:'X',code:0}],[{scheme:'X',code:'101762'}],[{scheme:'X',code:1.5}],[{scheme:'X',code:1},{scheme:'x',code:2}],[{scheme:'X'.repeat(301),code:1}],Array.from({length:501},(_,i)=>({scheme:'S'+i,code:i+1}))])assert.throws(()=>validateLedger(ledger(fundMatches)),JSON.stringify(fundMatches).slice(0,60));
});

test('NAV updates run at 23:30 and 10:00 India time',()=>{
 assert.equal(nextNavUpdate(new Date('2026-10-20T12:00:00+05:30')).toISOString(),'2026-10-20T18:00:00.000Z');
 assert.equal(nextNavUpdate(new Date('2026-10-20T23:30:00+05:30')).toISOString(),'2026-10-21T04:30:00.000Z');
 assert.equal(nextNavUpdate(new Date('2026-10-21T02:00:00+05:30')).toISOString(),'2026-10-21T04:30:00.000Z');
 assert.equal(nextNavUpdate(new Date('2026-12-31T23:45:00+05:30')).toISOString(),'2027-01-01T04:30:00.000Z');
});

test('the Investments page shows today’s value, gain and XIRR, and asks when a match is unclear',async()=>{
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),money=v=>(v<0?'-':'')+'₹'+(Math.abs(v)/100).toFixed(2),icon=()=>'';
 let calls=0,answer=navsForLedger(ledger(),index);
 const api=async path=>{calls++;assert.equal(path,'/api/navs');return {updatedAt:'2026-10-19T18:00:00Z',available:true,schemes:answer};};
 const state=ledger(),view=createInvestmentViews({getState:()=>state,money,esc,icon,api});
 const before=view.page();assert.match(before,/Checking today’s NAVs/);assert.match(before,/Value at last NAV/);
 await new Promise(r=>setTimeout(r,0));const html=view.page();assert.equal(calls,1,'loaded once');
 assert.match(html,/Current value[\s\S]*XIRR[\s\S]*NAV 19 Oct 2026 · 1 of 2 funds at today’s NAV/);
 assert.match(html,/AMFI 122639 · Direct Plan · Growth/);assert.match(html,/NAV ₹90\.3546 · 19 Oct 2026/);
 assert.match(html,/2 AMFI schemes could be this fund\.[\s\S]*data-fund-match="HDFC Flexi Cap Fund - Growth"[\s\S]*Choose yours/);assert.match(html,/Report NAV ₹1,900\.00 · 10 Jan 2026/);
 assert.match(html,/Units count only the transactions in the reports you imported/);
 const offline=createInvestmentViews({getState:()=>state,money,esc,icon,api:async()=>{throw Error('down')}});offline.page();await new Promise(r=>setTimeout(r,0));
 assert.match(offline.page(),/Today’s NAVs could not be loaded/);
});
