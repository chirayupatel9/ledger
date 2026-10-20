import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanImportReport,importReportEmail} from '../packages/domain/import-report.js';
import {statementIssuer} from '../apps/web/public/pdf.js';
import {createImportReporter,reportedNote} from '../apps/web/public/import-reports.js';

const hash='a'.repeat(64);
const page=lines=>lines.map((text,i)=>({y:800-i*12,items:text.split(' ').map((t,j)=>({text:t,x:j*40}))}));

test('import failure reports are validated and trimmed on the server',()=>{
 for(const bad of [null,'x',{},{kind:'empty',fileHash:hash},{kind:'nope',fileHash:hash,fileName:'a.pdf'},{kind:'empty',fileHash:'abc',fileName:'a.pdf'},{kind:'empty',fileHash:hash,fileName:'  '}])assert.equal(cleanImportReport(bad),null);
 const r=cleanImportReport({kind:'partial',fileHash:hash,fileName:'stmt\r\nBcc: x@y.z.pdf',fileType:'Zip',fileSize:-5,pages:3,extracted:40,invalid:2.5,headers:[...Array(40)].map((_,i)=>'Col '+i),warnings:['a','b','c','d','e','f'],accountName:'x'.repeat(200),transactions:[{amount:-500}]});
 assert.equal(r.fileName,'stmt Bcc: x@y.z.pdf','control characters and line breaks are removed');
 assert.equal(r.fileType,'Other');assert.equal(r.fileSize,undefined);assert.equal(r.invalid,undefined);assert.equal(r.extracted,40);
 assert.equal(r.headers.length,30);assert.equal(r.warnings.length,5);assert.equal(r.accountName.length,80);
 assert.equal('transactions' in r,false,'unknown fields such as rows are dropped');
});

test('the operator email describes the statement without its contents',()=>{
 const r=cleanImportReport({kind:'empty',fileHash:hash,fileName:'OpTransactionHistory.pdf',fileType:'PDF',fileSize:184320,pages:3,issuer:'ICICI Bank',accountName:'ICICI Savings',accountType:'Savings',message:'No transactions could be read from this PDF.',warnings:['No dated rows found. This may be a scanned PDF or an unsupported date layout.']});
 const {subject,body}=importReportEmail(r,{reporter:{name:'Chirayu',email:'me@example.com'},when:new Date('2026-10-20T14:45:00Z')});
 assert.equal(subject,'Ledger found no transactions in a statement: ICICI Bank PDF');
 assert.match(body,/^What happened: No transactions could be read from this PDF\.$/m);
 assert.match(body,/^Parser note: No dated rows found/m);
 assert.match(body,/^File: OpTransactionHistory\.pdf \(PDF, 3 pages, 180 KB\)$/m);
 assert.match(body,/^Looks like: ICICI Bank$/m);assert.match(body,/^Imported into: ICICI Savings \(Savings\)$/m);
 assert.match(body,/^Imported by: Chirayu <me@example\.com>$/m);assert.match(body,/^When: 20 Oct 2026, 8:15\s?pm IST$/im);
 assert.match(body,/not attached and was not saved/);assert.doesNotMatch(body,/Rows:|Columns found:/);
 const csv=importReportEmail(cleanImportReport({kind:'partial',fileHash:hash,fileName:'hdfc.csv',fileType:'CSV',fileSize:900,headers:['Date','Narration','Withdrawal Amt.'],extracted:12,invalid:3}));
 assert.equal(csv.subject,'Ledger only partly read a statement: CSV statement');
 assert.match(csv.body,/^Rows: 12 read, 3 could not be read$/m);assert.match(csv.body,/^Columns found: Date · Narration · Withdrawal Amt\.$/m);
 assert.match(csv.body,/^What happened: Some rows could not be read and were left out\.$/m);
 const other=importReportEmail(cleanImportReport({kind:'unsupported',fileHash:hash,fileName:'export.OFX',fileType:'Other',fileSize:2048}));
 assert.equal(other.subject,'Ledger could not open a statement file: .ofx file');assert.match(other.body,/^File: export\.OFX \(\.ofx file, 2 KB\)$/m);
});

test('the issuing bank is the one named first on the first page',()=>{
 assert.equal(statementIssuer([page(['ICICI Bank Limited','Statement of account','NEFT HDFC BANK salary credit'])]),'ICICI Bank');
 assert.equal(statementIssuer([page(['STATE BANK OF INDIA','Account statement'])]),'State Bank of India');
 assert.equal(statementIssuer([page(['Union Bank of India'])]),'Union Bank of India');
 assert.equal(statementIssuer([page(['Statement period'])]),'');assert.equal(statementIssuer([]),'');
 assert.equal(statementIssuer([page(['Welcome']),page(['HDFC BANK'])]),'','only the first page counts');
});

test('the browser reports a file once, sends only its description, and never throws',async()=>{
 const calls=[];let fail=false;
 const api=async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});if(fail)throw Error('offline');return {reported:true}};
 const reporter=createImportReporter({api}),file=new File(['Date,Narration,Amount\n01/10/2026,UPI-SWIGGY,-450\n'],'odd.csv');
 const details={file,bankAccount:{id:'b1',name:'HDFC Savings',type:'Savings',number:'1234'},message:'No transaction header found.',warnings:['PDF extraction is provisional. All PDF transactions are marked for review.','No dated rows found.'],headers:['Txn','Info']};
 assert.equal(await reporter.report('unreadable',details),true);
 assert.equal(await reporter.report('unreadable',details),true);assert.equal(calls.length,1,'the same file and failure is sent once');
 const sent=calls[0].body;
 assert.equal(calls[0].path,'/api/import-failures');assert.match(sent.fileHash,/^[0-9a-f]{64}$/);
 assert.deepEqual(Object.keys(sent).sort(),['accountName','accountType','extracted','fileHash','fileName','fileSize','fileType','headers','invalid','issuer','kind','message','pages','warnings'].filter(k=>k in sent).sort());
 assert.equal(sent.fileType,'CSV');assert.equal(sent.accountName,'HDFC Savings');assert.equal('number' in sent,false);
 assert.deepEqual(sent.warnings,['No dated rows found.'],'the generic provisional note is left out');
 assert.doesNotMatch(JSON.stringify(sent),/SWIGGY|450/,'file contents are never sent');
 fail=true;assert.equal(await reporter.report('partial',details),false,'a failed report resolves false');
 fail=false;assert.equal(await reporter.report('partial',details),true,'and is retried next time');assert.equal(calls.length,3);
 assert.match(reportedNote,/transactions were not shared/);
});
