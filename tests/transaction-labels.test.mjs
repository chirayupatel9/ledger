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
 assert.equal(transactionLabel({description:'UPI/RAHUL/883421'}).title,'RAHUL');
 assert.equal(transactionLabel({description:'ATM/CASH WITHDRAWAL/123456'}).title,'Cash withdrawal');
 assert.notEqual(transactionLabel({description:'ATM REVERSAL/123456'}).title,'Cash withdrawal');assert.notEqual(transactionLabel({description:'ATM annual fee/123456'}).title,'Cash withdrawal');
 assert.equal(transactionLabel({description:'UPI/ALICE/BOB/123456'}).source,'Bank narration');
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
