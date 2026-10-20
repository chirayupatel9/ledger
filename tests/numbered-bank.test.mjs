import test from 'node:test';
import assert from 'node:assert/strict';
import {readPDF} from '../apps/web/public/pdf.js';
import {statementBalances} from '../packages/domain/books.js';
import {makePDF} from './fixtures/card-statements.mjs';
import {numberedBank} from './fixtures/numbered-bank.mjs';
const parse=pages=>readPDF(new Uint8Array(makePDF(pages)),null,'Savings',[]);

test('numbered multi-page bank PDF preserves all rows, long narrations, dates, signs and balances',async()=>{
 const r=await parse(numberedBank);
 assert.deepEqual(r.invalid,[]);assert.equal(r.transactions.length,4);
 assert.deepEqual(r.period,{from:'2026-04-01',to:'2026-10-20'});
 assert.deepEqual(r.transactions.map(t=>[t.date,t.amount,t.balance]),[
  ['2026-04-08',-64900,935100],['2026-04-09',100000000000,100000935100],
  ['2026-10-20',10000,100000945100],['2026-10-20',-5000,100000940100],
 ]);
 assert.equal(r.transactions[0].description,'NETFLIX CO UPI/NETFLIX CO/netflix@example/Monthly BANK/100000000001/REFERENCE PART-2/ PART-3/ PART-4/ PART-5/ END/');
 assert.deepEqual(r.transactions.slice(1).map(t=>t.description),['Salary NEFT/EMPLOYER/REFERENCE','Refund UPI/REFUND/REFERENCE','Self transfer NEFT/SELF/REFERENCE']);
 assert.ok(r.transactions.every(t=>t.review&&!t.ref),'row numbers and cheque column must not become duplicate identifiers');
 const b=statementBalances(r.transactions);assert.equal(b.opening,1000000);assert.equal(b.checked,4);assert.deepEqual(b.mismatches,[]);
});
test('numbered PDF flags missing pages and nonconsecutive transaction numbers',async()=>{
 const pages=structuredClone(numberedBank);pages[1].find(i=>i[2]==='3')[2]='5';
 assert.match((await parse(pages)).warnings.join(' '),/not consecutive/);
 pages[1]=[[30,700,'Unsupported page contents']];
 assert.match((await parse(pages)).invalid.join(' '),/page 2.*header missing/);
});
test('numbered PDF rejects ambiguous amounts, invalid dates and missing balances',async()=>{
 const pages=structuredClone(numberedBank);
 pages[0].push([490,722,'100.00']); // First row now has both a debit and a credit.
 pages[0].find(i=>i[2]==='09.04.2026')[2]='31.04.2026';
 pages[1]=pages[1].filter(i=>i[2]!=='1000009451.00');
 const r=await parse(pages);
 assert.equal(r.invalid.length,3);assert.equal(r.transactions.length,1);
 assert.equal(r.transactions[0].description,'Self transfer NEFT/SELF/REFERENCE');
});
