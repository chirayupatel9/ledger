import test from 'node:test';
import assert from 'node:assert/strict';
import {guessMapping,mapRows,looksLikeInvestmentReport,investmentTotalsCheck,classify} from '../packages/domain/core.js';
import {findTransferPairs,linkTransfer} from '../packages/domain/transfers.js';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {taxTagFor} from '../packages/domain/tax.js';
import {readSpreadsheet} from '../apps/web/public/spreadsheet.js';
import {fundReport,fundRows} from './fixtures/fund-report.mjs';

const importFunds=async(rows,options)=>{const data=await readSpreadsheet(fundReport(rows,options));return {data,...mapRows(data,guessMapping(data.headers),'Mutual funds',[],{investment:true})};};
test('fund reports are recognised and mapped: scheme, transaction type, amount and stamp duty',async()=>{
 const data=await readSpreadsheet(fundReport());
 assert.equal(looksLikeInvestmentReport(data.headers),true);assert.deepEqual(data.period,{from:'2026-06-01',to:'2026-10-21'});
 const m=guessMapping(data.headers);assert.deepEqual([data.headers[m.date],data.headers[m.description],data.headers[m.amount],data.headers[m.direction],data.headers[m.charges]],['Transaction Date','Scheme Name','Amount','Transaction Type','Stamp Duty']);
 assert.equal(looksLikeInvestmentReport(['Date','Narration','Debit','Credit','Balance']),false);
});
test('purchases are booked at the bank debit with stamp duty as its own charge; redemptions are money out',async()=>{
 const {transactions,invalid,skipped,totals}=await importFunds();
 assert.deepEqual(invalid,[]);assert.ok(skipped>=1);
 assert.deepEqual(transactions.map(t=>[t.date,t.amount,t.type,t.category]),[
  ['2026-07-10',2500000,'Transfer','Investments'],['2026-07-10',-125,'Expense','Taxes'],['2026-07-10',2500000,'Transfer','Investments'],['2026-07-10',-125,'Expense','Taxes'],
  ['2026-07-10',2500000,'Transfer','Investments'],['2026-07-10',-125,'Expense','Taxes'],['2026-07-20',2000000,'Transfer','Investments'],['2026-07-20',-100,'Expense','Taxes'],
  ['2026-09-21',20000000,'Transfer','Investments'],['2026-09-21',-1000,'Expense','Taxes'],['2026-09-30',-3000000,'Transfer','Investments']]);
 assert.equal(transactions[0].description,'SIP Purchase · Alpha Flexi Cap Fund - Regular Plan - Growth · Folio 111/01 · 13.027 units @ ₹1918.97');
 assert.equal(transactionLabel(transactions[0]).title,'Alpha Flexi Cap Fund · SIP Purchase');assert.equal(transactionLabel(transactions[1]).title,'Alpha Flexi Cap Fund · Stamp duty');
 assert.equal(taxTagFor(transactions[1]),null,'stamp duty is not income tax');
 assert.equal(investmentTotalsCheck(transactions,totals),null,'with a redemption in the report the purchase-only total check does not apply');
});
test('the report total row checks that every purchase and stamp duty was read',async()=>{
 const rows=fundRows.slice(0,5),{transactions,totals}=await importFunds(rows);
 assert.deepEqual(investmentTotalsCheck(transactions,totals),{net:29498525,stamp:1475,expectedNet:29498525,expectedStamp:1475,ok:true});
 assert.equal(investmentTotalsCheck(transactions.filter(t=>t.date!=='2026-07-20'),totals).ok,false);
});
test('SIP purchases pair one-to-one with NSE Clearing debits, never with a same-day card payment',async()=>{
 const {transactions}=await importFunds(fundRows.slice(0,5)),mf=transactions.map((t,i)=>({...t,id:'mf'+i,accountId:'mf'}));
 const nach=(id,date,amount)=>({id,date,amount,accountId:'bank',account:'Bank',description:`NACH trxn ACH/NSECLEARINGLTDNSEINV/ICIC0000/${id}`,type:'Expense',category:'Uncategorized',review:true});
 const bank=[nach('n1','2026-07-10',-2500000),nach('n2','2026-07-10',-2500000),nach('n3','2026-07-10',-2500000),nach('n4','2026-07-20',-2000000),nach('n5','2026-09-21',-20000000),
  {id:'self',date:'2026-07-20',amount:-2000000,accountId:'bank',account:'Bank',description:'Self BIL/INFT/FHO1/Self',type:'Expense',category:'Uncategorized'},
  {id:'card',date:'2026-07-20',amount:2000000,accountId:'card',account:'Card',description:'INFINITY PAYMENT RECEIVED, THANK YOU',type:'Transfer',category:'Transfers'}];
 const all=[...bank,...mf],accounts=[{id:'bank',type:'Savings'},{id:'card',type:'Credit card'},{id:'mf',type:'Investment'}],r=findTransferPairs(all,{accounts});
 const pairs=r.pairs.map(p=>[p.debit.id,p.credit.id]);
 assert.equal(r.choices.length,0);assert.equal(r.ambiguous,0);
 assert.deepEqual(pairs.filter(([d])=>d.startsWith('n')).map(([d])=>d).sort(),['n1','n2','n3','n4','n5'],'every NSE debit pairs with one purchase');
 assert.equal(new Set(pairs.map(([,c])=>c)).size,pairs.length,'no purchase is used twice');
 assert.deepEqual(pairs.find(([d])=>d==='self'),['self','card'],'the self transfer still pays the card, not the SIP');
 assert.match(r.pairs.find(p=>p.debit.id==='n1').reason,/3 identical/);
 assert.equal(findTransferPairs(all).pairs.filter(p=>p.credit.accountId==='mf').length,0,'without an Investment account, investments are not paired');
 const [d,c]=[all.find(t=>t.id==='n4'),all.find(t=>t.id==='mf6')];linkTransfer(all,d,c,'L');assert.deepEqual([d.category,c.category,d.type],['Investments','Investments','Transfer']);
});
test('more fund-house debits are investments',()=>{
 for(const d of ['ACH D- BSE LIMITED/SIP','NACH/ADITYA BIRLA SUN LIFE AMC LTD','CAMSONLINE MF SIP','MF UTILITIES INDIA'])assert.equal(classify(d,-500000).category,'Investments',d);
});
