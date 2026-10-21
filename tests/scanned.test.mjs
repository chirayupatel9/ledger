import test from 'node:test';
import assert from 'node:assert/strict';
import {ocrLines,parsePDFLines} from '../apps/web/public/pdf.js';

// OCR words as Tesseract returns them: pixel boxes from the top left. Words on one printed row sit a few pixels apart.
const word=(text,x,y,w=text.length*14,h=26)=>({text,x,y,w,h,confidence:90});
const row=(y,cells)=>cells.flatMap(([x,text],i)=>text.split(' ').reduce((out,t)=>{const at=out.at(-1);out.push(word(t,at?at.x+at.w+12:x,y+(i%2?3:-2)));return out;},[]));
const scale=4,height=3400;

test('OCR words are grouped into rows and given text-PDF positions',()=>{
 const lines=ocrLines([word('Withdrawal',1200,402),word('Date',40,400),word('Narration',200,404),word('01/10/2026',40,503),word('450.00',1230,498)],{scale,height});
 assert.equal(lines.length,2);assert.deepEqual(lines[0].items.map(i=>i.text),['Date','Narration','Withdrawal'],'a row reads left to right');
 assert.equal(lines[0].items[0].x,10);assert.equal(lines[0].items[2].x,300);assert.ok(Math.abs(lines[0].y-(height-415)/scale)<1,'points from the bottom of the page');
 assert.ok(lines[0].y>lines[1].y,'rows run down the page');assert.deepEqual(lines[1].items.map(i=>i.text),['01/10/2026','450.00']);
 assert.deepEqual(ocrLines([word('  ',10,10)],{scale,height}),[]);
});

test('a scanned bank statement read by OCR goes through the normal bank parser',()=>{
 const words=[...row(120,[[40,'HDFC BANK LIMITED']]),...row(200,[[40,'Opening Balance 10,000.00']]),
  ...row(300,[[40,'Date'],[260,'Narration'],[1200,'Withdrawal'],[1500,'Deposit'],[1800,'Balance']]),
  ...row(380,[[40,'01/10/2026'],[260,'NEFT CR ACME TECHNOLOGIES SALARY'],[1530,'1,25,000.00'],[1830,'1,35,000.00']]),
  ...row(440,[[40,'03/10/2026'],[260,'UPI SWIGGY 628512345678'],[1230,'450.00'],[1830,'1,34,550.00']]),
  ...row(500,[[40,'10/10/2026'],[260,'ACH D- NSE CLEARING SIP'],[1230,'25,000.00'],[1830,'1,09,550.00']]),
  ...row(600,[[40,'Closing Balance 1,09,550.00']])];
 const r=parsePDFLines([ocrLines(words,{scale,height})],'HDFC Savings',[]);
 assert.deepEqual(r.transactions.map(t=>[t.date,t.amount,t.balance]),[['2026-10-01',12500000,13500000],['2026-10-03',-45000,13455000],['2026-10-10',-2500000,10955000]]);
 assert.match(r.transactions[1].description,/UPI SWIGGY 628512345678/);assert.deepEqual(r.invalid,[]);
 assert.equal(r.openingHint,1000000);assert.equal(r.closingHint,10955000);
});
