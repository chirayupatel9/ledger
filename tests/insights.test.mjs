import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {balanceHistory,netWorth,upcomingPayments,categoryTrend,taxProgress,savingsTrend,topPayees,paymentMethods,spendingCalendar,cashFlowWaterfall,unusualActivity,insightCards,monthsUpTo,latestMonth} from '../packages/domain/insights.js';

// Four months of a salaried person's money: a savings account with running balances, a credit card with a confirmed
// closing balance, and SIPs into a fund account linked to the bank debits.
const today='2026-10-21',months=monthsUpTo('2026-10',4);
function ledger(){
 let n=0;const t=(accountId,date,description,amount,category,type,extra={})=>({id:'t'+(++n),statementId:'s-'+accountId,accountId,account:{h:'HDFC Savings',c:'ICICI Card',i:'Mutual funds'}[accountId],date,description,amount,category,type,review:false,...extra});
 const h=[],c=[],i=[];
 for(const m of ['07','08','09','10']){
  h.push(t('h',`2026-${m}-01`,'NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY',12500000,'Salary','Income'),t('h',`2026-${m}-03`,'UPI-LANDLORD RAMESH KUMAR-ramesh.k@okhdfcbank-628533334444-RENT',-3500000,'Rent','Expense',{taxTag:'none'}),
   t('h',`2026-${m}-05`,'ACH D- HDFC LIFE INSURANCE CO-PREMIUM',-450000,'Insurance','Expense',{taxTag:'80c'}),t('h',`2026-${m}-10`,'ACH D- NSE CLEARING LTD-SIP',-2500000,'Investments','Transfer',{transferId:'sip-'+m,taxTag:'none'}),
   t('h',`2026-${m}-12`,'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345678',-64900,'Food & dining','Expense'),t('h',`2026-${m}-15`,'UPI-RELIANCE RETAIL LTD-relianceretail@hdfcbank-628598765432',-342050,'Groceries','Expense'));
  c.push(t('c',`2026-${m}-18`,'AMAZON PAY INDIA PRIVATE LIMITED',-189900,'Shopping','Expense'),t('c',`2026-${m}-20`,'NETFLIX.COM MUMBAI',m==='10'?-64900:-49900,'Entertainment','Expense'));
  i.push(t('i',`2026-${m}-10`,'SIP Purchase · Alpha Flexi Cap Fund · Folio 111/01 · 13.027 units @ ₹1918.97',2500000,'Investments','Transfer',{transferId:'sip-'+m}));
 }
 h.push(t('h','2026-10-14','UPI-ZOMATO LTD-zomato@hdfcbank-628500001111',-320000,'Food & dining','Expense'));
 c.push(t('c','2026-10-19','AMAZON PAY INDIA PRIVATE LIMITED',-1500000,'Shopping','Expense'),t('c','2026-10-16','POS 4532XXXX9003 SHELL INDIA',-280000,'Travel & transport','Expense'),t('c','2026-10-17','POS 4532XXXX9003 SHELL INDIA',-280000,'Travel & transport','Expense'));
 // Running balances on the savings account, starting from ₹50,000.
 let bal=5000000;for(const x of h.sort((a,b)=>a.date.localeCompare(b.date))){bal+=x.amount;x.balance=bal;}
 const cardClosing=c.reduce((v,x)=>v+x.amount,0)-1000000;
 return {accounts:[{id:'h',name:'HDFC Savings',type:'Savings'},{id:'c',name:'ICICI Card',type:'Credit card'},{id:'i',name:'Mutual funds',type:'Investment'}],
  statements:[{id:'s-h',accountId:'h',from:'2026-07-01',to:'2026-10-20'},{id:'s-c',accountId:'c',from:'2026-07-01',to:'2026-10-20',closing:cardClosing},{id:'s-i',accountId:'i'}],
  transactions:[...h,...c,...i],titleRules:[],rules:[]};
}
const sum=list=>list.reduce((v,x)=>v+x,0);

test('balances at each month end come from running balances or a confirmed closing balance',()=>{
 const s=ledger(),b=balanceHistory(s,{months});
 assert.deepEqual(b.accounts.map(a=>a.name),['HDFC Savings','ICICI Card']);
 assert.deepEqual(b.accounts[0].points,[10643050,16286100,21929150,27252200],'₹50,000 plus each month');
 assert.equal(b.accounts[1].points[3],s.statements[1].closing,'card closing balance at the statement end');
 assert.equal(b.accounts[1].points[0],s.statements[1].closing-sum(s.transactions.filter(t=>t.accountId==='c'&&t.date>'2026-07-31').map(t=>t.amount)));
 assert.deepEqual(balanceHistory({...s,statements:[]},{months}).unknown,['HDFC Savings','ICICI Card'],'no anchor, no balance');
});

test('net worth adds bank balances, card balances (owed) and investments',()=>{
 const s=ledger(),w=netWorth(s,{months});
 const oct=w.points.at(-1);assert.equal(oct.banks,27252200);assert.equal(oct.cards,s.statements[1].closing);assert.equal(oct.investments,10000000,'four SIPs at cost');
 assert.equal(oct.total,oct.banks+oct.cards+oct.investments);assert.equal(w.points[0].investments,2500000);
 const valued=netWorth(s,{months,investments:{totals:{current:{value:10600000}},bank:[{amount:-500000,date:'2026-09-01',matched:false}]}});
 assert.equal(valued.points.at(-1).investments,10600000+500000,'today’s fund value plus SIP debits not in a fund report');assert.equal(valued.latestIsValue,true);
});

test('upcoming payments: the next 30 days of regular payments, from what repeats',()=>{
 const u=upcomingPayments(ledger(),{today});
 assert.deepEqual(u.items.map(i=>[i.date,i.amount]),[['2026-11-03',3500000],['2026-11-05',450000],['2026-11-10',2500000],['2026-11-12',64900],['2026-11-15',342050],['2026-11-20',64900]]);
 assert.equal(u.total,sum(u.items.map(i=>i.amount)));assert.ok(u.items.every(i=>!i.due));
 assert.ok(!u.items.some(i=>/acme/i.test(i.payee)),'income is not a bill');
});

test('spending by category each month, the rest as Other',()=>{
 const rows=ledger().transactions,t=categoryTrend(rows,{months});
 assert.deepEqual(t.series.map(s=>s.key),['Rent','Shopping','Insurance','Groceries','Food & dining','Other']);
 assert.deepEqual(t.series.find(s=>s.key==='Shopping').values,[189900,189900,189900,1689900]);
 assert.deepEqual(t.series.at(-1).values,[49900,49900,49900,624900],'Netflix and fuel');
});

test('tax-saving progress against old-regime limits',()=>{
 const p=taxProgress(ledger().transactions,{fy:2026}),c80=p.items.find(i=>i.section==='80C');
 assert.equal(c80.amount,1800000);assert.equal(c80.limit,15000000);assert.equal(c80.remaining,13200000);
 assert.deepEqual(p.items.filter(i=>i.limit).map(i=>i.section),['80C','80CCD(1B)','80D','24(b)']);
 assert.equal(taxProgress(ledger().transactions,{fy:2025}).items.find(i=>i.section==='80C').amount,0);
});

test('savings rate, payees, payment methods and the spending calendar',()=>{
 const rows=ledger().transactions,s=savingsTrend(rows,{months});
 assert.equal(s[0].rate,Math.round((12500000-4596750)/12500000*1000)/10);assert.equal(s[3].expenses,6991750);
 const p=topPayees(rows,{limit:3});assert.equal(p.items[0].total,14000000);assert.equal(p.items[0].count,4);assert.equal(p.items.length,3);
 const m=paymentMethods(rows,{months,accounts:ledger().accounts});
 assert.equal(m.totals.UPI,4*(3500000+64900+342050)+320000);assert.equal(m.totals['Auto-debit'],4*450000);assert.equal(m.totals.Card,4*189900+3*49900+64900+1500000+560000);
 const cal=spendingCalendar(rows,{end:today,weeks:4});
 assert.equal(cal.days.length,28);assert.equal(new Date(cal.start+'T00:00:00Z').getUTCDay(),1,'weeks start on Monday');
 assert.equal(cal.days.find(d=>d.date==='2026-10-19').value,1500000);assert.equal(cal.days.find(d=>d.date==='2026-10-25').future,true);
});

test('cash-flow waterfall: from the opening to the closing balance, every rupee accounted for',()=>{
 const s=ledger(),w=cashFlowWaterfall(s,s.transactions,{month:'2026-10'});
 assert.equal(w.steps[0].label,'Income');assert.equal(w.steps[0].value,12500000);
 assert.equal(w.steps.find(x=>x.label==='Invested').value,-2500000);
 assert.equal(w.opening+sum(w.steps.map(x=>x.value)),w.closing,'the steps add up');
});

test('unusual activity and the insight cards',()=>{
 const s=ledger(),u=unusualActivity(s,{today});
 assert.ok(u.some(x=>x.kind==='large'&&x.amount===1500000&&x.usual===189900),'a ₹15,000 Amazon order against a usual ₹1,899');
 assert.ok(u.some(x=>x.kind==='duplicate'&&x.amount===280000),'two ₹2,800 fuel charges a day apart');
 assert.ok(u.some(x=>x.kind==='price'&&x.amount===64900&&x.usual===49900),'Netflix went up');
 const c=insightCards(s,s.transactions,{today});
 assert.equal(c.month,'2026-10');assert.equal(c.previous,'2026-09');
 assert.equal(c.cards[0].kind,'up');assert.equal(c.cards[0].category,'Shopping');assert.equal(c.cards[0].amount,1500000);
 assert.ok(c.cards.some(x=>x.kind==='savings'&&/down from 63%/.test(x.text)));
 assert.ok(c.cards.some(x=>x.kind==='largest'&&x.amount===3500000&&/Rent \(UPI payment\)/.test(x.text)));assert.ok(!c.cards.some(x=>x.kind==='new-regular'),'nothing started after the records began');
 assert.equal(latestMonth([{date:'2026-09-30'}],today),'2026-09');
});

test('the browser copy of the insights module is identical',()=>{
 assert.equal(readFileSync(new URL('../apps/web/public/insights.js',import.meta.url),'utf8'),readFileSync(new URL('../packages/domain/insights.js',import.meta.url),'utf8'));
});
