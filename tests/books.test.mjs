import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCSV,guessMapping,mapRows,findPeriod,classify,categories,colors} from '../packages/domain/core.js';
import {statementBalances,accountBooks,addDays} from '../packages/domain/books.js';
import {taxTagFor,taxSummary,financialYear} from '../packages/domain/tax.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';
import {readSpreadsheet} from '../apps/web/public/spreadsheet.js';
import * as XLSX from '../apps/web/public/vendor/xlsx.mjs';

const headers={
 hdfc:['Date','Narration','Chq./Ref.No.','Value Dt','Withdrawal Amt.','Deposit Amt.','Closing Balance'],
 icici:['S No.','Value Date','Transaction Date','Cheque Number','Transaction Remarks','Withdrawal Amount (INR )','Deposit Amount (INR )','Balance (INR )'],
 sbi:['Txn Date','Value Date','Description','Ref No./Cheque No.','Debit','Credit','Balance'],
 axis:['Tran Date','CHQNO','PARTICULARS','DR','CR','BAL','SOL'],
 kotak:['Sl. No.','Transaction Date','Value Date','Description','Chq / Ref No.','Amount','Dr / Cr','Balance'],
};
test('column detection covers SBI, HDFC, ICICI, Axis and Kotak exports',()=>{
 assert.deepEqual(guessMapping(headers.hdfc),{date:0,description:1,amount:-1,debit:4,credit:5,direction:-1,balance:6,charges:-1});
 assert.deepEqual(guessMapping(headers.icici),{date:2,description:4,amount:-1,debit:5,credit:6,direction:-1,balance:7,charges:-1});
 assert.deepEqual(guessMapping(headers.sbi),{date:0,description:2,amount:-1,debit:4,credit:5,direction:-1,balance:6,charges:-1});
 assert.deepEqual(guessMapping(headers.axis),{date:0,description:2,amount:-1,debit:3,credit:4,direction:-1,balance:5,charges:-1});
 assert.deepEqual(guessMapping(headers.kotak),{date:1,description:3,amount:5,debit:-1,credit:-1,direction:6,balance:7,charges:-1});
});
test('bank preamble period, separators, footers, continuation lines and running balances',()=>{
 const csv=['Statement From : 01/10/26 To : 31/10/26','Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance','********,********,********,********,********,********,********',
  '01/10/26,Opening Balance,,,,,"10,000.00"','01/10/26,UPI-SWIGGY-swiggy@icici,0000123,01/10/26,450.00,,"9,550.00"',',PAYMENT FOR ORDER,,,,,','02/10/26,SALARY ACME,,02/10/26,,"50,000.00","59,550.00"',
  ',,,,,,','STATEMENT SUMMARY :-,,,,,,','Total,,,,450.00,"50,000.00",'].join('\n');
 const data=parseCSV(csv);assert.deepEqual(data.period,{from:'2026-10-01',to:'2026-10-31'});
 const r=mapRows(data,guessMapping(data.headers),'HDFC');
 assert.equal(r.transactions.length,2);assert.equal(r.invalid.length,0);assert.ok(r.skipped>=3);assert.equal(r.openingHint,1000000);
 assert.equal(r.transactions[0].description,'UPI-SWIGGY-swiggy@icici PAYMENT FOR ORDER');assert.equal(r.transactions[0].balance,955000);
 assert.equal(r.transactions[1].category,'Salary');
 assert.deepEqual(findPeriod('Account Statement  Start Date : 1 Apr 2026 ... End Date : 30 Jun 2026'),{from:'2026-04-01',to:'2026-06-30'});
});
test('running balance reconciles oldest-first and newest-first statements and pinpoints a missing row',()=>{
 const asc=[{date:'2026-10-01',amount:-45000,balance:955000},{date:'2026-10-02',amount:5000000,balance:5955000},{date:'2026-10-03',amount:-5000,balance:5950000}];
 assert.deepEqual(statementBalances(asc),{opening:1000000,closing:5950000,ascending:true,mismatches:[],checked:3});
 assert.deepEqual(statementBalances([...asc].reverse()),{opening:1000000,closing:5950000,ascending:false,mismatches:[],checked:3});
 const missing=[asc[0],asc[2]];assert.deepEqual(statementBalances(missing).mismatches,[1]);
 assert.equal(statementBalances([{date:'2026-10-01',amount:-100}]),null);
});
test('books check finds missing periods, balance breaks and statement differences',()=>{
 const account={id:'a',name:'HDFC',bank:'HDFC',type:'Savings',last4:'',currency:'INR',archived:false};
 const t=(id,statementId,date,amount)=>({id,statementId,date,amount,accountId:'a',account:'HDFC',description:'x',category:'Uncategorized',type:amount>0?'Income':'Expense',review:true});
 const state={accounts:[account],statements:[
  {id:'apr',accountId:'a',from:'2026-04-01',to:'2026-04-30',opening:100000,closing:150000},
  {id:'may',accountId:'a',from:'2026-05-01',to:'2026-05-31',opening:150000,closing:120000},
  {id:'jul',accountId:'a',from:'2026-07-01',to:'2026-07-31',opening:90000,closing:95000}],
  transactions:[t('1','apr','2026-04-10',50000),t('2','may','2026-05-10',-30000),t('3','jul','2026-07-05',5000)]};
 let b=accountBooks(state,'a');
 assert.deepEqual(b.gaps,[{from:'2026-06-01',to:'2026-06-30'}]);assert.equal(b.breaks[0].difference,-30000);
 assert.deepEqual(b.checks,{apr:0,may:0,jul:0});assert.equal(b.status,'attention');assert.deepEqual(b.balance,{amount:95000,date:'2026-07-31'});
 state.statements.push({id:'jun',accountId:'a',from:'2026-06-01',to:'2026-06-30',opening:120000,closing:90000});state.transactions.push(t('4','jun','2026-06-20',-30000));
 b=accountBooks(state,'a');assert.equal(b.status,'balanced');assert.equal(b.issues,0);assert.equal(b.overall,0);
 state.transactions=state.transactions.filter(x=>x.id!=='4');b=accountBooks(state,'a');assert.equal(b.checks.jun,-30000);assert.equal(b.status,'attention');
 assert.equal(addDays('2026-02-28',1),'2026-03-01');
});
test('statements without confirmed periods only report long gaps',()=>{
 const tx=(id,s,date)=>({id,statementId:s,date,amount:-100,accountId:'a'});
 const state={statements:[{id:'s1',accountId:'a'},{id:'s2',accountId:'a'},{id:'s3',accountId:'a'}],transactions:[tx('1','s1','2026-04-03'),tx('2','s1','2026-04-28'),tx('3','s2','2026-05-02'),tx('4','s2','2026-05-29'),tx('5','s3','2026-07-02')]};
 const b=accountBooks(state,'a');assert.deepEqual(b.gaps,[{from:'2026-05-30',to:'2026-07-01'}]);assert.equal(b.status,'attention');
});
test('Indian narrations map to bookkeeping categories by direction',()=>{
 assert.equal(categories.length,colors.length);
 const c=(d,a)=>classify(d,a).category;
 assert.equal(c('ATW-512345XXXXXX1234-S1ANMU12-MUMBAI',-500000),'Cash withdrawal');
 assert.equal(c('NACH-DR-LIC OF INDIA-123',-1200000),'Insurance');
 assert.equal(c('ACH D- BAJAJ FINANCE LTD-EMI',-850000),'Loan EMI');
 assert.equal(c('ITNS 280 ADVANCE TAX',-2500000),'Taxes');
 assert.equal(c('SMS CHRGS FOR QTR',-1770),'Fees & charges');
 assert.equal(c('ACH C- INFOSYS LTD DIV',150000),'Dividends');
 assert.equal(c('INT.PD:01-07-2026 TO 30-09-2026',23400),'Interest');
 assert.equal(c('BIL/ONL/0012/TATA POWER',-180000),'Bills & utilities');
 assert.equal(c('UPI/DR/1234/SWIGGY INSTAMART/YESB',-50000),'Groceries');
 assert.equal(c('RENT FOR OCT',-2500000),'Rent');assert.equal(c('RENT FROM TENANT',2500000),'Rental income');
 assert.equal(classify('CASH DEP CDM MUMBAI',1000000).type,'Transfer');
});
test('tax tags suggest ITR heads and deductions, and explicit tags win',()=>{
 const t=(description,amount,category,extra={})=>({description,amount,category,type:amount>0?'Income':'Expense',...extra});
 assert.equal(taxTagFor(t('SALARY ACME',10000000,'Salary')).id,'salary');
 assert.equal(taxTagFor(t('FD INT CR',50000,'Interest')).id,'interest-deposit');
 assert.equal(taxTagFor(t('SB INT',5000,'Interest')).id,'interest-savings');
 assert.equal(taxTagFor(t('STAR HEALTH PREMIUM',-2500000,'Insurance')).id,'80d');
 assert.equal(taxTagFor(t('ICICI LOMBARD MOTOR',-900000,'Insurance')),null);
 assert.equal(taxTagFor(t('PPF DEPOSIT',-15000000,'Investments')).id,'80c');
 assert.equal(taxTagFor(t('HOME LOAN EMI HDFC',-4500000,'Loan EMI')).id,'24b');
 assert.equal(taxTagFor(t('SALARY ACME',10000000,'Salary',{taxTag:'none'})),null);
 assert.equal(taxTagFor(t('Client',500000,'Uncategorized',{taxTag:'business'})).source,'Your tag');
 const s=taxSummary([t('SALARY',10000000,'Salary'),t('UPI FROM FRIEND',200000,'Uncategorized'),t('PPF',-15000000,'Investments'),t('LIC',-1000000,'Insurance')]);
 assert.equal(s.income[0].amount,10000000);assert.deepEqual(s.untagged,{amount:200000,count:1});assert.equal(s.deductions[0].id,'80c');assert.equal(s.deductions[0].amount,16000000);assert.equal(s.deductions[0].suggested,2);
 assert.equal(financialYear('2026-03-31'),2025);assert.equal(financialYear('2026-04-01'),2026);
});
const ledger=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'HDFC',type:'Savings',last4:'',currency:'INR',archived:false}],
 statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.xlsx',count:1,created:'2026-10-16T00:00:00Z',from:'2026-10-01',to:'2026-10-31',opening:-50000,closing:100000}],
 transactions:[{id:'t',statementId:'s',accountId:'a',account:'HDFC',date:'2026-10-02',description:'PPF',amount:-10000,balance:90000,category:'Investments',type:'Transfer',review:false,taxTag:'80c'}]});
test('server keeps statement periods, balances and tax tags, and rejects malformed values',()=>{
 const v=validateLedger(ledger());assert.deepEqual([v.statements[0].from,v.statements[0].to,v.statements[0].opening,v.statements[0].closing],['2026-10-01','2026-10-31',-50000,100000]);
 assert.equal(v.transactions[0].balance,90000);assert.equal(v.transactions[0].taxTag,'80c');
 const blank=ledger();blank.transactions[0].taxTag='';assert.equal(validateLedger(blank).transactions[0].taxTag,undefined);
 for(const change of [s=>{s.statements[0].from='2026-11-01'},s=>{delete s.statements[0].to},s=>{s.statements[0].opening=1.5},s=>{s.transactions[0].balance='90000'},s=>{s.transactions[0].taxTag='80Z'}]){const s=ledger();change(s);assert.throws(()=>validateLedger(s));}
});
test('Excel statements: XLSX date cells and legacy XLS text rows import with balances',async()=>{
 const rows=[['HDFC BANK Ltd.'],['Statement From : 01/10/2026 To : 31/10/2026'],headers.hdfc,['**','**'],[{t:'n',v:46296,z:'m/d/yy'},'UPI-RAHUL SHARMA-rahul@okhdfcbank','0000123',{t:'n',v:46296,z:'m/d/yy'},1250.5,'',8749.5],[{t:'n',v:46298,z:'m/d/yy'},'NEFT CR-ACME PRIVATE LTD','N123',{t:'n',v:46298,z:'m/d/yy'},'',50000,58749.5]];
 const sheet=XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>typeof c==='object'?null:c)));
 for(const [r,c] of [[4,0],[4,3],[5,0],[5,3]])sheet[XLSX.utils.encode_cell({r,c})]={t:'n',v:rows[r][c].v,z:'m/d/yy'};
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Statement');
 for(const bookType of ['xlsx','biff8']){
  const data=await readSpreadsheet(XLSX.write(book,{type:'array',bookType}));
  assert.deepEqual(data.period,{from:'2026-10-01',to:'2026-10-31'});
  const r=mapRows(data,guessMapping(data.headers),'HDFC');
  assert.deepEqual(r.transactions.map(t=>[t.date,t.amount,t.balance]),[['2026-10-01',-125050,874950],['2026-10-03',5000000,5874950]],bookType);
  assert.deepEqual(statementBalances(r.transactions).mismatches,[]);
 }
 await assert.rejects(readSpreadsheet(new TextEncoder().encode('not a workbook at all').buffer));
});
test('browser copies of shared domain modules are identical',()=>{
 for(const file of ['books.js','tax.js','accounts.js','transfers.js','recurring.js','preferences.js'])assert.equal(readFileSync(new URL('../packages/domain/'+file,import.meta.url),'utf8'),readFileSync(new URL('../apps/web/public/'+file,import.meta.url),'utf8'),file);
});
test('review fixes: unreadable rows with figures are reported, footers stop parsing, period ignores narrations',()=>{
 const data=parseCSV(['Date,Narration,Debit,Credit,Balance','2026.10.01,COFFEE,"1.234,56",,','01/10/2026,RENT FROM 01/09/2026 TO 30/09/2026,,500.00,500.00','STATEMENT SUMMARY,,,,','01/10/2026,Should not import,1.00,,'].join('\n'));
 assert.equal(data.period,null);
 const r=mapRows(data,guessMapping(data.headers),'HDFC');assert.deepEqual(r.invalid,[2]);assert.equal(r.transactions.length,1);
 const s=taxSummary([{description:'GIFT FROM PARENT',amount:500000,category:'Uncategorized',type:'Income',taxTag:'none'}]);assert.deepEqual(s.untagged,{amount:0,count:0});
});
