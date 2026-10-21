import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBankMessage,parseReceiptText,findDate,findMatches,accountsFor,enrichFromMessage,newFromPhone,phoneReplacements,carryOver,prettyPayee} from '../packages/domain/capture.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const today='2026-10-21',read=text=>parseBankMessage(text,{today});
const pick=p=>({amount:p.amount,last4:p.last4,date:p.date,payee:p.payee,ref:p.ref,channel:p.channel});

test('UPI and card messages from Indian banks are read into amount, account, date, payee and reference',()=>{
 const swiggy={amount:-45000,last4:'4821',date:'2026-10-20',payee:'Swiggy',ref:'628512345678',channel:'UPI'};
 assert.deepEqual(pick(read('Sent Rs.450.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 20/10/26\nRef 628512345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808')),swiggy);
 assert.deepEqual(pick(read('Rs.450.00 debited from a/c **4821 on 20-10-26 to VPA swiggy.stores@axisbank(UPI Ref No 628512345678). Not you? Call on 18002586161 to report')),{...swiggy,payee:'Swiggy Stores'});
 assert.deepEqual(pick(read('Dear UPI user A/C X4821 debited by 450.0 on date 20Oct26 trf to SWIGGY Refno 628512345678. If not u? call 1800111109. -SBI')),swiggy);
 assert.deepEqual(pick(read('INR 450.00 debited\nA/c no. XX4821\n20-10-26, 14:32:10\nUPI/P2M/628512345678/SWIGGY\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank')),swiggy);
 assert.deepEqual(pick(read('Sent Rs.450.00 from Kotak Bank AC X4821 to swiggy.stores@axisbank on 20-10-26.UPI Ref 628512345678. Not you, https://kotak.com/KBANKT/Fraud')),{...swiggy,payee:'Swiggy Stores'});
 assert.deepEqual(pick(read('ICICI Bank Acct XX821 debited for Rs 450.00 on 20-Oct-26; SWIGGY credited. UPI:628512345678. Call 18002662 for dispute. SMS BLOCK 821 to 9215676766.')),{...swiggy,last4:'821'});
 assert.deepEqual(pick(read('Rs.12500.00 credited to HDFC Bank A/c XX4821 on 20-10-26 from VPA ramesh.k@okhdfcbank (UPI 628512345679)')),{amount:1250000,last4:'4821',date:'2026-10-20',payee:'Ramesh K',ref:'628512345679',channel:'UPI'});
 assert.deepEqual(pick(read('Dear Customer, Acct XX821 is credited with Rs 5000.00 on 20-Oct-26 from RAMESH KUMAR. UPI:628512345680-ICICI Bank.')),{amount:500000,last4:'821',date:'2026-10-20',payee:'Ramesh Kumar',ref:'628512345680',channel:'UPI'});
 assert.deepEqual(pick(read('Rs.1,899.00 spent on ICICI Bank Card XX9003 on 20-Oct-26 at AMAZON PAY INDIA. Avl Lmt: Rs 1,23,456.00. To dispute call 18002662.')),{amount:-189900,last4:'9003',date:'2026-10-20',payee:'Amazon Pay India',ref:null,channel:'Card'});
 const gpay=read('₹450 paid to Swiggy\nUPI transaction ID: 628512345678');
 assert.deepEqual(pick(gpay),{amount:-45000,last4:null,date:null,payee:'Swiggy',ref:'628512345678',channel:'UPI'});assert.deepEqual(gpay.missing,['date']);
 assert.equal(read('Your OTP is 123456').amount,null);assert.equal(read('Avl Bal Rs 5,000.00 in A/c XX4821').amount,null,'a balance is not the payment');
});

test('dates: Indian formats, nothing in the future or years back, phone numbers are not dates',()=>{
 for(const [text,date] of [['on 20/10/2026','2026-10-20'],['20-Oct-26','2026-10-20'],['20 October 2026','2026-10-20'],['Oct 20, 2026','2026-10-20'],['2026-10-20:14:32','2026-10-20'],['20Oct26','2026-10-20'],['on 20-10-26.UPI','2026-10-20']])assert.equal(findDate(text,today),date,text);
 assert.equal(findDate('due 25/10/2026',today),null,'after tomorrow');assert.equal(findDate('since 01/01/2020',today),null,'more than two years back');assert.equal(findDate('call 1800-11-1109',today),null);
 assert.equal(prettyPayee('SWIGGY LIMITED'),'Swiggy Limited');assert.equal(prettyPayee('McDonald’s'),'McDonald’s');assert.equal(prettyPayee('ramesh_k99@ybl'),'Ramesh K');
});

test('bills: the total on the total line, the shop and the date',()=>{
 assert.deepEqual(parseReceiptText('RELIANCE SMART\nTAX INVOICE\nGSTIN: 27AAACR5055K1Z7\nDate: 20/10/2026 18:42\nBill No: 1234567\nToor Dal 1kg  2  189.00  378.00\nRice 5kg  1  425.50  425.50\nSub Total  803.50\nCGST 2.5%  20.09\nSGST 2.5%  20.09\nGrand Total  843.68\nPaid by UPI  843.68\nThank you',{today}),{total:84368,date:'2026-10-20',merchant:'Reliance Smart',gstin:'27AAACR5055K1Z7'});
 assert.deepEqual(parseReceiptText('Cafe Coffee Day\nOct 19, 2026\nCappuccino 180.00\nTotal Rs 212.40',{today}),{total:21240,date:'2026-10-19',merchant:'Cafe Coffee Day',gstin:null});
 assert.equal(parseReceiptText('Apollo Pharmacy\nItems 3  Total Qty 5\nNet Payable\n1,245.00',{today}).total,124500,'amount on the line after the label');
 assert.equal(parseReceiptText('Some shop\nPaneer 240.00\nNaan 60.00\nPhone 9876543210',{today}).total,24000,'no total line: the largest amount with paise');
 assert.deepEqual(parseReceiptText('',{today}),{total:null,date:null,merchant:'',gstin:null});
});

function ledger(){
 const tx=(id,accountId,date,amount,extra={})=>({id,accountId,account:accountId==='h'?'HDFC Savings':'ICICI Card',date,description:'UPI-SWIGGY-628512345678',amount,category:'Food & dining',type:'Expense',review:false,statementId:accountId==='h'?'sh':'sc',...extra});
 return {schemaVersion:2,initialized:true,rules:[],titleRules:[],
  accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false},{id:'c',name:'ICICI Card',bank:'ICICI Bank',type:'Credit card',last4:'9003',currency:'INR',archived:false}],
  statements:[{id:'sh',accountId:'h',account:'HDFC Savings',name:'h.csv',count:2,created:'2026-10-21T00:00:00Z'},{id:'sc',accountId:'c',account:'ICICI Card',name:'c.pdf',count:1,created:'2026-10-21T00:00:00Z'}],
  transactions:[tx('a','h','2026-10-20',-45000),tx('b','h','2026-10-18',-45000,{description:'UPI-ZOMATO'}),tx('d','c','2026-10-20',-45000,{description:'AMAZON'})]};
}

test('matching: the same UPI reference is certain; otherwise the named account and the nearest date come first',()=>{
 const s=ledger();
 assert.deepEqual(accountsFor(s,'821').map(a=>a.id),['h']);
 const m=findMatches(s,{amount:-45000,date:'2026-10-20',last4:'4821',ref:'628512345678'});
 assert.deepEqual(m.map(x=>x.t.id),['a','b','d']);assert.equal(m[0].sure,true);assert.equal(m[1].sure,false);
 assert.deepEqual(findMatches(s,{amount:-45000,date:'2026-10-20',accountId:'c'}).map(x=>x.t.id),['d']);
 assert.deepEqual(findMatches(s,{amount:45000,date:'2026-10-20'}),[],'a credit never matches a debit');
 assert.deepEqual(findMatches(s,{amount:-45050,date:'2026-10-20',days:5,tolerance:100}).map(x=>x.t.id),['a','d','b'],'bills allow a rupee either way');
 const t=enrichFromMessage({...s.transactions[1]},{ref:'628599990000',payee:'Zomato'});assert.equal(t.ref,'628599990000');assert.equal(t.displayName,'Zomato');
 assert.equal(enrichFromMessage({...s.transactions[1],displayName:'Dinner'},{payee:'Zomato'}).displayName,'Dinner','your own name is kept');
});

test('payments added from the phone are valid ledger records and are replaced by the statement row on import',()=>{
 const s=ledger();
 const msg=newFromPhone(s,{accountId:'h',amount:-30000,date:'2026-10-21',payee:'Chai Point',ref:'628511112222',channel:'UPI',source:'message'});
 assert.equal(msg.source,'message');assert.equal(msg.statementId,undefined);assert.equal(msg.review,true);assert.equal(msg.displayName,'Chai Point');assert.match(msg.description,/^UPI \/ Chai Point \/ 628511112222$/);
 const bill={...newFromPhone(s,{accountId:'c',amount:-84368,date:'2026-10-20',payee:'Reliance Smart',source:'receipt'}),receipts:[{id:'file-1',name:'bill.jpg',addedAt:'2026-10-21T10:00:00Z'}],note:'Monthly groceries',category:'Groceries',type:'Expense',review:false};
 assert.throws(()=>newFromPhone(s,{accountId:'nope',amount:-1,date:'2026-10-20'}),/Choose the account/);
 s.transactions.push(msg,bill);s.receipts=[{id:'r1',fileId:'file-2',name:'later.jpg',addedAt:'2026-10-21T10:00:00Z',merchant:'Apollo',total:124500,date:'2026-10-19'}];
 const valid=validateLedger(structuredClone(s));
 assert.equal(valid.transactions.find(t=>t.id===msg.id).source,'message');assert.deepEqual(valid.transactions.find(t=>t.id===bill.id).receipts,bill.receipts);assert.deepEqual(valid.receipts,s.receipts);
 for(const broken of [{...msg,statementId:'sh'},{...msg,source:'email'},{...bill,receipts:Array(6).fill(bill.receipts[0])},{...bill,receipts:[{id:'../x',name:'a',addedAt:'2026-10-21T10:00:00Z'}]},(({source,...t})=>t)(msg)])
  assert.throws(()=>validateLedger({...structuredClone(s),transactions:[...s.transactions.filter(t=>t.id!==broken.id),broken]}),/Invalid transaction/);
 assert.throws(()=>validateLedger({...structuredClone(s),receipts:[{...s.receipts[0],total:-5}]}),/Invalid receipt/);
 // The statement arrives: one row by UPI reference, one by amount within three days.
 const incoming=[{id:'n1',accountId:'h',date:'2026-10-21',description:'UPI-CHAI POINT-628511112222',amount:-30000,category:'Uncategorized',type:'Expense',review:true},{id:'n2',accountId:'c',date:'2026-10-22',description:'RELIANCE RETAIL',amount:-84368,category:'Shopping',type:'Expense',review:true},{id:'n3',accountId:'h',date:'2026-10-22',description:'OTHER',amount:-30000,category:'Uncategorized',type:'Expense',review:true}];
 const map=phoneReplacements(s.transactions,incoming);
 assert.deepEqual([...map],[['n1',msg.id],['n2',bill.id]],'each phone payment is replaced once');
 const merged=carryOver(bill,incoming[1]);
 assert.deepEqual({name:merged.displayName,note:merged.note,receipts:merged.receipts,category:merged.category,review:merged.review,source:merged.source},{name:'Reliance Smart',note:'Monthly groceries',receipts:bill.receipts,category:'Groceries',review:false,source:undefined});
 assert.equal(carryOver(msg,incoming[0]).category,'Uncategorized','an unreviewed phone category does not override the statement');
});

test('PDF invoices: invoice totals, the seller on a "Sold by" line, and taxable values ignored',()=>{
 assert.deepEqual(parseReceiptText('Tax Invoice/Bill of Supply/Cash Memo\n(Original for Recipient)\nSold By :\nCloudtail India Private Limited, Bengaluru\nOrder Number: 402-1234567-8901234\nOrder Date: 18.10.2026\nInvoice Date : 18.10.2026\nSl. No Description Unit Price Qty Net Amount Tax Rate Tax Type Tax Amount Total Amount\n1 Boat Airdopes 1,016.10 1 1,016.10 18% IGST 182.90 ₹1,199.00\nTOTAL: ₹182.90 ₹1,199.00\nAmount in Words: One Thousand One Hundred Ninety-nine only',{today}),{total:119900,date:'2026-10-18',merchant:'Cloudtail India Private Limited',gstin:null});
 assert.deepEqual(parseReceiptText('Sold By: Swiggy Limited\nInvoice Date 19-Oct-2026\nTotal Taxable Value 380.95\nCGST 9.52\nSGST 9.52\nInvoice Value 400.00',{today}),{total:40000,date:'2026-10-19',merchant:'Swiggy Limited',gstin:null});
 assert.equal(parseReceiptText('BESCOM\nBill Date: 05/10/2026\nUnits 245\nAmount Payable Rs. 1,845.00',{today}).total,184500);
 assert.equal(parseReceiptText('Order Summary\nItems 2\nOrder Total ₹ 2,499.00',{today}).total,249900);
});
