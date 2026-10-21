import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {fingerprint,csvExport} from '../packages/domain/core.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';
const raw='BRANCH - CITY INF/INFT/000111222333/Self transfer /PERSONALICICI INF/NEFT/IN00000000000000/BARB0TESTING/self transfer';
test('self transfers become readable without inventing a bank direction or changing source',()=>{
 const t={description:raw,amount:-50000};assert.deepEqual(transactionLabel(t),{title:'Self transfer',source:'Suggested label',channel:'NEFT'});assert.equal(t.description,raw);
});
test('recognizes merchants, refunds, names and common payment markers conservatively',()=>{
 assert.equal(transactionLabel({description:'UPI/DR/123456789012/SWIGGY/ICIC0001234'}).title,'Swiggy');
 assert.equal(transactionLabel({description:'UPI/REFUND/123456789012/AMAZON'}).title,'Refund · Amazon');
 assert.equal(transactionLabel({description:'UPI/RAHUL/883421'}).title,'Rahul');
 assert.equal(transactionLabel({description:'ATM/CASH WITHDRAWAL/123456'}).title,'Cash withdrawal');
 assert.notEqual(transactionLabel({description:'ATM REVERSAL/123456'}).title,'Cash withdrawal');assert.notEqual(transactionLabel({description:'ATM annual fee/123456'}).title,'Cash withdrawal');
 assert.equal(transactionLabel({description:'UPI/ALICE/BOB/123456'}).title,'Alice','the first name is the payee, the next one the note');
 assert.equal(transactionLabel({description:'Salary · Acme Technologies'}).title,'Salary · Acme Technologies');
 const unknown='UNKNOWN BANK NARRATION '.repeat(20);assert.ok(transactionLabel({description:unknown}).title.length<=72);assert.equal(transactionLabel({description:unknown}).source,'Shortened narration');
});
test('custom labels remain separate from duplicate fingerprints and exports include both',()=>{
 const t={description:raw,displayName:'Move to savings',date:'2026-10-01',amount:-50000,account:'ICICI',accountId:'a'};
 assert.equal(transactionLabel(t).title,'Move to savings');assert.equal(fingerprint(t),fingerprint({...t,displayName:'Another label'}));
 const csv=csvExport([t]);assert.ok(csv.includes(raw));assert.ok(csv.includes('Move to savings'));assert.ok(csv.includes('readable_name'));
 assert.ok(csvExport([{...t,displayName:'=HYPERLINK("evil")'}]).includes("'=HYPERLINK"));
});
test('server preserves bounded custom names and rejects invalid input',()=>{
 const data={accounts:[{id:'a',name:'ICICI',bank:'ICICI',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',name:'test.csv',account:'ICICI',accountId:'a',count:1,created:'2026-10-01'}],transactions:[{id:'t',statementId:'s',description:raw,displayName:'  Move to savings  ',date:'2026-10-01',amount:-50000,account:'ICICI',accountId:'a',category:'Transfers',type:'Transfer',review:true}],rules:[]};
 assert.equal(validateLedger(data).transactions[0].displayName,'Move to savings');assert.equal(validateLedger(data).transactions[0].description,raw);
 for(const displayName of ['x'.repeat(161),{},5,null])assert.throws(()=>validateLedger({...data,transactions:[{...data.transactions[0],displayName}]}));
 const old={...data,transactions:[{...data.transactions[0]}]};delete old.transactions[0].displayName;assert.equal(validateLedger(old).transactions[0].displayName,undefined);
});
test('browser and server narration logic remain identical',()=>{
 for(const file of ['core.js','transaction-labels.js'])assert.equal(readFileSync(new URL('../packages/domain/'+file,import.meta.url),'utf8'),readFileSync(new URL('../apps/web/public/'+file,import.meta.url),'utf8'));
});

test('UPI and abbreviated UP narrations remove references, bank codes and handles',()=>{
 for(const description of ['UPI/DR/000111222333/RAHUL SHARMA/HDFC/rahul@okhdfcbank/Payment','UPI-000111222333-RAHUL SHARMA-HDFC-rahul@okhdfcbank','UP/DR/000111222333/RAHUL SHARMA/ICICI/Payment','UPI/RAHUL SHARMA/rahul sharma/000111222333']){
  const t={description,amount:-50000};assert.equal(transactionLabel(t).title,'Rahul Sharma');assert.equal(transactionLabel(t).channel,'UPI');assert.equal(t.description,description);
 }
 assert.equal(transactionLabel({description:'UPI/CR/000111222333/HDFC/1234567890@upi',amount:50000}).title,'1234567890@upi','no name: the UPI ID says who paid');
 assert.equal(transactionLabel({description:'UPI/CR/000111222333/HDFC',amount:50000}).title,'UPI credit');
 assert.equal(transactionLabel({description:'UPI/DR/000111222333/ALICE/BOB',amount:-50000}).title,'Alice');assert.equal(transactionLabel({description:'UPI/DR/000111222333',amount:-50000}).title,'UPI payment');
 assert.equal(transactionLabel({description:'UP hardware store',amount:-50000}).channel,'');
});
test('other payment formats get useful names without treating credits as income',()=>{
 const fixtures=[
 ['NEFT CR-HDFC0000123-ACME PRIVATE LTD-N000111222333',50000,'ACME PRIVATE LTD'],
 ['IMPS/P2A/000111222333/ANITA/ICIC0000123',-50000,'ANITA'],
 ['RTGS/000111222333/HDFC0000123',-50000,'RTGS transfer'],
 ['POS/000111222333/LOCAL GROCERY',-50000,'LOCAL GROCERY'],
 ['ECOM/000111222333',-50000,'Card payment'],
 ['NACH/000111222333',-50000,'Automatic debit'],
 ['ECS/000111222333',50000,'Automatic credit'],
 ['CHQ/000111222333',50000,'Cheque credit'],
 ['ATM/000111222333',-50000,'Cash withdrawal'],
 ['ATM/CASH DEPOSIT/000111222333',50000,'Cash deposit'],
 ['ATM annual fee/000111222333',-50000,'Bank charges'],
 ['UPI/REV/000111222333/SWIGGY',50000,'Reversal · Swiggy'],
 ['UPI/REFUND/000111222333/RAHUL/HDFC',50000,'Refund · Rahul'],
 ['UPI/FAILED/000111222333',-50000,'Failed transaction · UPI payment']
 ];
 for(const [description,amount,title] of fixtures){const t={description,amount,type:'Transfer',review:true};assert.equal(transactionLabel(t).title,title,description);assert.equal(t.type,'Transfer');assert.equal(t.review,true);}
 assert.equal(transactionLabel({description:'UPI/DR/000111222333/RAHUL',displayName:'My custom name'}).title,'My custom name');
});
