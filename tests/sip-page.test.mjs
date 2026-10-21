import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeInvestments,parseFundRow,addMonths} from '../packages/domain/investments.js';
import {mapRows,guessMapping} from '../packages/domain/core.js';
import {readSpreadsheet} from '../apps/web/public/spreadsheet.js';
import {createInvestmentViews} from '../apps/web/public/investments-views.js';
import {fundReport} from './fixtures/fund-report.mjs';

let n=0;
const tx=(accountId,date,description,amount,extra={})=>({id:'t'+(++n),accountId,account:accountId==='i'?'Mutual funds':'HDFC Savings',date,description,amount,category:'Investments',type:'Transfer',...extra});
const sip=(date,scheme,folio,units,nav,amount=2500000,stamp=125,kind='SIP Purchase')=>[tx('i',date,`${kind} · ${scheme} · Folio ${folio} · ${units} units @ ₹${nav}`,amount),tx('i',date,`Stamp duty · ${scheme} · Folio ${folio}`,-stamp,{category:'Taxes',type:'Expense'})];
function ledger(){
 n=0;const alpha='Alpha Flexi Cap Fund - Growth',beta='Beta Mid Cap Fund - Growth';
 const fund=[...sip('2026-07-10',alpha,'111/01','13.027','1918.97'),...sip('2026-08-10',alpha,'111/01','13.027','1918.97'),...sip('2026-09-10',alpha,'111/01','13.027','1918.97'),
  ...sip('2026-09-21',alpha,'111/01','98.11','2038.43',20000000,1000,'Purchase'),...sip('2026-07-10',beta,'222/02','54.582','458.0033'),
  tx('i','2026-09-30',`Redemption · ${beta} · Folio 222/02 · 61.2 units @ ₹490.2`,-3000000)];
 const nse=d=>tx('b',d,'ACH D- NSE CLEARING LTD SIP',-2500000),iccl=d=>tx('b',d,'ICCL MUTUAL FUND SIP',-500000);
 const bank=[nse('2026-07-10'),nse('2026-08-10'),nse('2026-09-10'),iccl('2026-08-05'),iccl('2026-09-05'),iccl('2026-10-05')];
 // July and August debits are linked to their fund purchases; September is not.
 for(const [b,f] of [[bank[0],fund[0]],[bank[1],fund[2]]])b.transferId=f.transferId='link-'+b.date;
 return {accounts:[{id:'b',name:'HDFC Savings',type:'Savings'},{id:'i',name:'Mutual funds',type:'Investment'}],
  statements:[{id:'s1',accountId:'i',from:'2026-06-01',to:'2026-10-05'},{id:'s2',accountId:'b',from:'2026-07-01',to:'2026-10-31'}],
  transactions:[...fund,...bank],titleRules:[]};
}

test('fund report rows are read back from what the importer writes',async()=>{
 const data=await readSpreadsheet(fundReport());const {transactions}=mapRows(data,guessMapping(data.headers),'MF',[],{investment:true});
 const rows=transactions.map(parseFundRow),buys=rows.filter(r=>!r.stamp);
 assert.deepEqual(buys[0],{stamp:false,kind:'SIP Purchase',scheme:'Alpha Flexi Cap Fund - Regular Plan - Growth',folio:'111/01',units:130270,nav:1918.97});
 assert.equal(rows.filter(r=>r.stamp).length,5);assert.ok(rows.filter(r=>r.stamp).every(r=>r.scheme&&r.folio));
 assert.equal(buys.find(r=>r.kind==='Redemption').units,612000);
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');
});

test('funds add up purchases, stamp duty, units and value at the last NAV',()=>{
 const s=summarizeInvestments(ledger(),{today:'2026-10-21'}),[alpha,beta]=s.funds;
 assert.equal(s.funds.length,2);assert.equal(alpha.scheme,'Alpha Flexi Cap Fund - Growth');
 assert.equal(alpha.paid,27500000);assert.equal(alpha.stamp,1375);assert.equal(alpha.net,27498625);assert.equal(alpha.units,1371910);
 assert.equal(alpha.nav,2038.43);assert.equal(alpha.navDate,'2026-09-21');assert.equal(alpha.value,Math.round(1371910*2038.43/100));
 assert.ok(Math.abs(alpha.averageNav-274986.25/137.191)<1e-9);
 assert.equal(beta.redeemed,3000000);assert.equal(beta.incomplete,true,'redeemed more units than the reports bought');assert.equal(beta.value,null);
 assert.equal(s.totals.value,alpha.value);assert.equal(s.totals.valuedFunds,1);assert.equal(s.totals.navDate,'2026-09-21');
});

test('SIPs come from fund reports and from repeated bank debits, judged against what the statements cover',()=>{
 const s=summarizeInvestments(ledger(),{today:'2026-10-21'});
 const alpha=s.sips.find(x=>x.name.startsWith('Alpha')),beta=s.sips.find(x=>x.name.startsWith('Beta')),bank=s.sips.find(x=>x.source==='bank');
 assert.deepEqual({amount:alpha.amount,day:alpha.day,count:alpha.count,next:alpha.next,status:alpha.status},{amount:2500000,day:10,count:3,next:'2026-10-10',status:'active'},'report reaches 5 Oct, before the October instalment is due');
 assert.equal(beta.status,'stopped');assert.equal(s.sips.at(-1),beta,'stopped SIPs are listed last');
 assert.deepEqual({amount:bank.amount,day:bank.day,count:bank.count,next:bank.next,status:bank.status,account:bank.account},{amount:500000,day:5,count:3,next:'2026-11-05',status:'active',account:'HDFC Savings'});
 assert.equal(s.sips.filter(x=>x.source==='bank').length,1,'the unmatched September NSE debit alone is not a SIP');
 assert.equal(s.totals.monthlySip,3000000);assert.equal(s.totals.activeSips,2);
 const later=summarizeInvestments({...ledger(),statements:[{id:'s1',accountId:'i',from:'2026-06-01',to:'2026-10-20'}]},{today:'2026-10-21'});
 assert.equal(later.sips.find(x=>x.name.startsWith('Alpha')).status,'missed','a report reaching past the due date without it');
});

test('a bank debit linked to a fund purchase is counted once',()=>{
 const s=summarizeInvestments(ledger(),{today:'2026-10-21'});
 assert.equal(s.bank.length,6);assert.equal(s.bank.filter(t=>t.matched).length,2);assert.equal(s.totals.unmatched,4);
 assert.equal(s.totals.invested,27500000+2500000+2500000+1500000);assert.equal(s.totals.redeemed,3000000);assert.equal(s.totals.stamp,1500);
 assert.equal(s.months.length,12);assert.equal(s.months.at(-1).month,'2026-10');assert.equal(s.months.at(-2).amount,2500000+20000000+2500000+500000);
 assert.equal(s.fy,'FY 2026–27');assert.equal(s.totals.fy,s.totals.invested);
 const next=summarizeInvestments(ledger(),{today:'2027-05-02'});assert.equal(next.fy,'FY 2027–28');assert.equal(next.totals.fy,0);
 assert.equal(summarizeInvestments(ledger(),{today:'2027-02-01'}).fy,'FY 2026–27');
});

test('the Investments page explains how to start, then shows SIPs, funds and bank payments',()=>{
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),money=v=>'₹'+(v/100).toFixed(2),icon=()=>'';
 let state={accounts:[],statements:[],transactions:[]};const view=createInvestmentViews({getState:()=>state,money,esc,icon});
 assert.match(view.page(),/No investments yet[\s\S]*transaction report \(Excel\)[\s\S]*Consolidated Account Statement \(CAS\) PDF[\s\S]*PDF password field[\s\S]*Add an Investment account/);
 state=ledger();const html=view.page();
 assert.match(html,/Your SIPs/);assert.match(html,/10th of each month · 3 instalments since/);assert.match(html,/This SIP may have stopped/);
 assert.match(html,/Your funds/);assert.match(html,/Earlier purchases are missing: request a CAS since inception from CAMS or KFintech and import it into this Investment account/);assert.match(html,/import reports from your first purchase for complete holdings\. The simplest way is one Consolidated Account Statement \(CAS\) since inception/);assert.match(html,/4 investment payments from your bank are not matched/);
 assert.match(html,/<span class="pill ok">Matched<\/span>/);assert.match(html,/Invested each month/);
 state={...ledger(),accounts:[{id:'b',name:'HDFC Savings',type:'Savings'}],transactions:ledger().transactions.filter(t=>t.accountId==='b').map(({transferId,...t})=>t)};
 const bankOnly=view.page();assert.match(bankOnly,/See each fund, its units and its value[\s\S]*CAS\) PDF since inception[\s\S]*PDF password field/);assert.doesNotMatch(bankOnly,/Your funds|Not matched/);
});
