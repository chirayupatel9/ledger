import test from 'node:test';
import assert from 'node:assert/strict';
import {cardAmount,cardBalance,looksLikeCardStatement,classify,parseCSV,guessMapping,mapRows,parseDate} from '../packages/domain/core.js';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {taxTagFor} from '../packages/domain/tax.js';
import {extractPageLines,parsePDFLines} from '../apps/web/public/pdf.js';
import {makePDF,hdfc,sbi,icici,iciciApp,iciciEstatement,expected} from './fixtures/card-statements.mjs';

const warn=console.warn;console.warn=m=>{if(!String(m).includes('legacy'))warn(m)};
const pdfjs=await import('../apps/web/public/vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../apps/web/public/vendor/pdf.worker.mjs',import.meta.url).href;
// Real pdf.js text extraction, the same path the browser uses.
async function pdfLines(pages){const doc=await pdfjs.getDocument({data:new Uint8Array(makePDF(pages)),isEvalSupported:false,useSystemFonts:true}).promise,out=[];for(let p=1;p<=doc.numPages;p++)out.push(extractPageLines((await (await doc.getPage(p)).getTextContent()).items));await doc.destroy();return out;}

for(const [name,pages] of Object.entries({hdfc,sbi,icici,iciciApp,iciciEstatement}))test(`${name}-style card statement imports with signs, categories, period and amount due`,async()=>{
 const r=parsePDFLines(await pdfLines(pages),'Card',[],{card:true}),e=expected[name];
 assert.equal(r.layout,'card');assert.deepEqual(r.invalid,[]);assert.deepEqual(r.period,e.period);
 assert.equal(r.openingHint,e.openingHint);assert.equal(r.closingHint,e.closingHint);
 assert.deepEqual(r.transactions.map(t=>[t.date,t.description,t.amount,t.category,t.type]),e.rows);
 assert.equal(r.openingHint+r.transactions.reduce((v,t)=>v+t.amount,0),r.closingHint,'previous due + rows = total due');
 assert.ok(r.transactions.every(t=>t.review));
});
test('card statements are recognised on a non-card account; bank tables are not',async()=>{
 const r=parsePDFLines(await pdfLines(hdfc),'Savings');assert.equal(r.layout,'card');assert.equal(r.cardLike,true);
 const bank=parsePDFLines([[{items:[{text:'Date',x:20},{text:'Narration',x:100},{text:'Debit',x:300},{text:'Credit',x:400},{text:'Balance',x:500}]},{items:[{text:'01/10/2026',x:20},{text:'Salary',x:100},{text:'100.00',x:400},{text:'100.00',x:500}]}]],'HDFC',[],{card:true});
 assert.equal(bank.layout,undefined);assert.equal(bank.transactions[0].amount,10000);
});
test('card amounts and balances: unsigned charges, Cr/C/+/− credits, amount due is owed',()=>{
 assert.deepEqual(['1,299.00','450.00 D','450.00 Dr','5,000.00 Cr','2,000.00 C','-1,000.00','+ 120.00','(75.00)','₹ 99.00'].map(cardAmount),[-129900,-45000,-45000,500000,200000,100000,12000,7500,-9900]);
 assert.deepEqual(['9,974.90','500.00 Cr','0.00','-250.00'].map(cardBalance),[-997490,50000,0,25000]);
 assert.equal(cardAmount('0.00'),null);assert.equal(cardAmount('abc'),null);
 assert.equal(looksLikeCardStatement('Total Dues 1,000.00 Minimum Amount Due 100.00'),true);assert.equal(looksLikeCardStatement('CREDIT CARD PAYMENT HDFC'),false);
 assert.equal(parseDate('September 15, 2026'),'2026-09-15');assert.equal(parseDate('Smarch 15, 2026'),null);
});
test('card CSV exports with one unsigned amount column',()=>{
 const data=parseCSV('Date,Transaction Details,Amount\n25/08/2026,SWIGGY,450.00\n28/08/2026,PAYMENT RECEIVED,"5,000.00 Cr"\n');
 assert.deepEqual(mapRows(data,guessMapping(data.headers),'Card',[],{card:true}).transactions.map(t=>[t.amount,t.type]),[[-45000,'Expense'],[500000,'Transfer']]);
 assert.deepEqual(mapRows(data,guessMapping(data.headers),'Savings').transactions.map(t=>t.amount),[45000,500000],'bank accounts keep bank signs');
});
test('bank-side card bill payments are transfers; card credits split into payments, refunds and cashback',()=>{
 for(const d of ['CC 000XXXX1234 AUTOPAY','BIL/ONL/000123/HDFC CREDIT CARD','CRED CLUB BILL PAYMENT','IMPS-CREDIT CARD BILL-SBI CARD'])assert.equal(classify(d,-500000).type,'Transfer',d);
 assert.equal(classify('PAYMENT RECEIVED FROM CLIENT',500000).type,'Income');
 assert.deepEqual(['PAYMENT RECEIVED 000ICC','AMAZON REFUND','CASHBACK CREDIT','FUEL SURCHARGE WAIVER'].map(d=>classify(d,10000,[],{card:true}).type),['Transfer','Refund','Income','Refund']);
 assert.equal(classify('CASHBACK CREDIT',10000,[],{card:true}).category,'Other income');
 assert.deepEqual(['FINANCE CHARGES','LATE PAYMENT FEE','IGST','OVERLIMIT FEE'].map(d=>classify(d,-10000,[],{card:true}).category),Array(4).fill('Fees & charges'));
});
test('card rows get readable labels and GST on charges is tagged',()=>{
 assert.equal(transactionLabel({description:'EMI 3/12 RELIANCE DIGITAL',amount:-850000}).title,'EMI 3 of 12 · RELIANCE DIGITAL');
 assert.equal(transactionLabel({description:'EMI 1/6 AMAZON PAY',amount:-50000}).title,'EMI 1 of 6 · Amazon');
 assert.equal(transactionLabel({description:'BBPS Payment received',amount:100000,type:'Transfer'}).title,'Card bill payment');
 assert.equal(transactionLabel({description:'PAYMENT RECEIVED FROM CLIENT',amount:100000,type:'Income'}).title,'PAYMENT RECEIVED FROM CLIENT');
 assert.equal(transactionLabel({description:'FINANCE CHARGES',amount:-50000}).title,'Finance charges');
 assert.equal(taxTagFor({description:'IGST',amount:-2590,category:'Fees & charges',type:'Expense'}).id,'gst-paid');
});
test('the same card statement in two formats shares bank references, so a second import is a duplicate',async()=>{
 const app=parsePDFLines(await pdfLines(iciciApp),'Card',[],{card:true}).transactions,web=parsePDFLines(await pdfLines(iciciEstatement),'Card',[],{card:true}).transactions;
 const key=t=>[t.ref,t.amount].join('|');assert.ok(app.every(t=>/^9000000000\d$/.test(t.ref)));assert.deepEqual(new Set(web.map(key)),new Set(app.map(key)));
 assert.notDeepEqual(app.map(t=>t.description).sort(),web.map(t=>t.description).sort(),'descriptions differ between formats');
 assert.equal(transactionLabel(app.find(t=>t.ref==='90000000001')).title,'Amazon wallet top-up');
});
