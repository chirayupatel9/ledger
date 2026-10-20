import test from 'node:test';
import assert from 'node:assert/strict';
import {findTransferPairs,linkTransfer,unlinkTransfer,normalizeTransfers,linkCandidates,unpairedTransfers,transferIndex,partnerOf,transferSummary,pairsInvolving,suggestionsInvolving} from '../packages/domain/transfers.js';
import {classify} from '../packages/domain/core.js';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const t=(id,accountId,date,amount,type='Transfer',description='TRANSFER')=>({id,accountId,date,amount,type,description,category:type==='Transfer'?'Transfers':'Shopping',review:true});
const ids=r=>r.pairs.map(p=>[p.debit.id,p.credit.id]);

test('bank-to-card and bank-to-bank transfers pair; equal amounts without a transfer signal do not',()=>{
 const r=findTransferPairs([t('b1','hdfc','2026-08-28',-500000,'Transfer','CC 000XXXX9876 AUTOPAY'),t('c1','card','2026-08-28',500000,'Transfer','NETBANKING TRANSFER'),
  t('rent','hdfc','2026-09-01',-2500000,'Expense','RENT'),t('pay','sbi','2026-09-01',2500000,'Income','SALARY')]);
 assert.deepEqual(ids(r),[['b1','c1']]);assert.equal(r.pairs[0].reason,'Same day');assert.equal(r.ambiguous,0);
});
test('a shared UPI/NEFT reference pairs legs even when neither side is typed Transfer yet',()=>{
 const r=findTransferPairs([t('u1','hdfc','2026-10-01',-250000,'Expense','UPI/DR/123456789012/SELF'),t('u2','sbi','2026-10-03',250000,'Income','UPI/CR/123456789012/HDFC')]);
 assert.deepEqual(ids(r),[['u1','u2']]);assert.equal(r.pairs[0].reason,'Same reference 123456789012');
});
test('never pairs within one account, and only within 3 days',()=>{
 assert.deepEqual(ids(findTransferPairs([t('a','hdfc','2026-10-01',-100),t('b','hdfc','2026-10-01',100)])),[]);
 assert.deepEqual(ids(findTransferPairs([t('a','hdfc','2026-10-01',-100),t('b','sbi','2026-10-05',100)])),[]);
 assert.deepEqual(ids(findTransferPairs([t('a','hdfc','2026-10-01',-100),t('b','sbi','2026-10-04',100)])),[['a','b']]);
});
test('ties stay unpaired for the user; a stronger signal or an earlier pair resolves them',()=>{
 const tie=findTransferPairs([t('h','hdfc','2026-10-01',-1000000),t('s','sbi','2026-10-01',-1000000),t('c','card','2026-10-01',1000000)]);
 assert.deepEqual(ids(tie),[]);assert.equal(tie.ambiguous,3);
 assert.deepEqual(ids(findTransferPairs([t('h','hdfc','2026-10-01',-1000000,'Transfer','IMPS 99887766554'),t('s','sbi','2026-10-01',-1000000),t('c','card','2026-10-01',1000000,'Transfer','PAYMENT 99887766554')])),[['h','c']]);
 assert.deepEqual(ids(findTransferPairs([t('d1','hdfc','2026-10-01',-5000),t('d2','hdfc','2026-10-02',-5000),t('c1','sbi','2026-10-01',5000),t('c2','sbi','2026-10-02',5000)])),[['d1','c1'],['d2','c2']]);
});
test('already linked legs are not proposed again; linking and unlinking keep both sides consistent',()=>{
 const tx=[t('a','hdfc','2026-10-01',-500,'Expense'),t('b','card','2026-10-01',500,'Income'),t('c','sbi','2026-10-02',500,'Income')];
 linkTransfer(tx,tx[0],tx[1],'link-1');
 assert.deepEqual(tx.slice(0,2).map(x=>[x.transferId,x.type,x.category,x.review]),[['link-1','Transfer','Transfers',false],['link-1','Transfer','Transfers',false]]);
 assert.deepEqual(ids(findTransferPairs(tx)),[]);assert.equal(partnerOf(tx[0],transferIndex(tx)).id,'b');
 assert.deepEqual(linkCandidates(tx,tx[0]).map(x=>x.id),['b','c']);
 linkTransfer(tx,tx[0],tx[2],'link-2');assert.equal(tx[1].transferId,undefined,'relinking frees the old partner');
 unlinkTransfer(tx,tx[0]);assert.ok(tx.every(x=>!x.transferId));
 assert.throws(()=>linkTransfer(tx,tx[0],t('z','hdfc','2026-10-01',500)));assert.throws(()=>linkTransfer(tx,tx[0],t('z','sbi','2026-10-01',600)));
 assert.deepEqual(unpairedTransfers(tx).map(x=>x.id),['a','b','c']);
});
test('broken links are dropped: missing partner, three legs, same account, unequal amounts, non-transfer type',()=>{
 const cases=[[t('a','x','2026-10-01',-5)],[t('a','x','2026-10-01',-5),t('b','y','2026-10-01',5),t('c','z','2026-10-01',5)],[t('a','x','2026-10-01',-5),t('b','x','2026-10-01',5)],[t('a','x','2026-10-01',-5),t('b','y','2026-10-01',6)],[t('a','x','2026-10-01',-5),t('b','y','2026-10-01',5,'Income')]];
 for(const legs of cases){for(const l of legs)l.transferId='L';assert.ok(normalizeTransfers(legs).every(l=>!l.transferId));}
 const ok=[t('a','x','2026-10-01',-5),t('b','y','2026-10-01',5)];for(const l of ok)l.transferId='L';assert.ok(normalizeTransfers(ok).every(l=>l.transferId==='L'));
});
test('server keeps valid links, drops broken ones, and rejects malformed ids',()=>{
 const ledger=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'hdfc',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false},{id:'card',name:'Card',bank:'',type:'Credit card',last4:'',currency:'INR',archived:false}],
  statements:[{id:'s1',accountId:'hdfc',account:'HDFC',name:'a.csv',count:1,created:'2026-10-16T00:00:00Z'},{id:'s2',accountId:'card',account:'Card',name:'b.pdf',count:1,created:'2026-10-16T00:00:00Z'}],
  transactions:[{id:'a',statementId:'s1',accountId:'hdfc',account:'HDFC',date:'2026-10-01',description:'CC AUTOPAY',amount:-500000,category:'Transfers',type:'Transfer',review:false,transferId:'link-1'},{id:'b',statementId:'s2',accountId:'card',account:'Card',date:'2026-10-01',description:'PAYMENT RECEIVED',amount:500000,category:'Transfers',type:'Transfer',review:false,transferId:'link-1'}]});
 assert.deepEqual(validateLedger(ledger()).transactions.map(x=>x.transferId),['link-1','link-1']);
 const removed=ledger();removed.transactions.pop();removed.statements.pop();assert.equal(validateLedger(removed).transactions[0].transferId,undefined);
 const retyped=ledger();retyped.transactions[1].type='Income';assert.ok(validateLedger(retyped).transactions.every(x=>!x.transferId));
 const bad=ledger();bad.transactions[0].transferId='not valid!';assert.throws(()=>validateLedger(bad));
});
test('linked transfers net to zero; unlinked transfers are counted separately',()=>{
 const tx=[t('a','hdfc','2026-10-01',-500000),t('b','card','2026-10-01',500000),t('c','sbi','2026-10-03',-20000),t('d','hdfc','2026-10-04',-9900,'Expense')];
 linkTransfer(tx,tx[0],tx[1],'L');
 assert.deepEqual(transferSummary(tx),{linkedOut:500000,linkedIn:500000,linkedPairs:1,unlinkedOut:20000,unlinkedIn:0,unlinked:1,net:0});
 assert.equal(transferSummary([tx[0]]).net,-500000,'one leg alone does not net to zero');
});
test('only pairs touching the just-imported rows are offered after an import',()=>{
 const old=[t('o1','hdfc','2026-09-01',-1000),t('o2','sbi','2026-09-01',1000)],fresh=[t('n1','hdfc','2026-10-01',-2000),t('n2','card','2026-10-01',2000)];
 assert.deepEqual(pairsInvolving([...old,...fresh],['n2']).map(p=>[p.debit.id,p.credit.id]),[['n1','n2']]);
 assert.deepEqual(pairsInvolving(old,['n2']),[]);
});
test('a card payment pairs with the self transfer, not with same-day investment debits',()=>{
 const card=t('card','amazon-card','2026-08-20',2000000,'Transfer','INFINITY PAYMENT RECEIVED, THANK YOU');
 const nse=['n1','n2'].map(id=>t(id,'icici','2026-08-20',-2000000,'Expense','NACH trxn ACH/NSECLEARINGLTDNSEINV/ICIC702250626200 5403/769'));
 const self=t('self','icici','2026-08-20',-2000000,'Expense','Self BIL/INFT/FHO9148004/Self');
 const r=findTransferPairs([card,...nse,self]);
 assert.deepEqual(ids(r),[['self','card']]);assert.deepEqual(r.choices,[]);assert.equal(r.ambiguous,0);
});
test('investment debits only match an Investment account you track',()=>{
 const sip=t('sip','icici','2026-09-01',-500000,'Expense','NACH/NSECLEARINGLTD/SIP'),broker=t('broker','zerodha','2026-09-01',500000,'Transfer','FUNDS ADDED');
 assert.deepEqual(ids(findTransferPairs([sip,broker])),[]);
 assert.deepEqual(ids(findTransferPairs([sip,broker],{accounts:[{id:'zerodha',type:'Investment'}]})),[['sip','broker']]);
});
test('equally likely matches come back as choices, best and closest first',()=>{
 const card=t('card','card','2026-08-30',700000,'Transfer','PAYMENT RECEIVED');
 const a=t('a','hdfc','2026-08-30',-700000,'Expense','Self BIL/INFT/AAA111/Self'),b=t('b','sbi','2026-08-30',-700000,'Expense','Self BIL/INFT/BBB222/Self'),late=t('late','hdfc','2026-09-01',-700000,'Transfer','TRANSFER');
 const r=findTransferPairs([card,a,b,late]);
 assert.deepEqual(ids(r),[]);assert.equal(r.choices.length,1);assert.equal(r.choices[0].anchor.id,'card');
 assert.deepEqual(r.choices[0].options.map(o=>o.other.id),['a','b','late']);assert.deepEqual(r.choices[0].options.map(o=>[o.debit.id,o.credit.id]),[['a','card'],['b','card'],['late','card']]);
 assert.deepEqual(suggestionsInvolving([card,a,b,late],['b']).choices.length,1);assert.deepEqual(suggestionsInvolving([card,a,b,late],['zzz']),{pairs:[],choices:[]});
});
test('self transfers and NSE Clearing debits are classified and named',()=>{
 assert.deepEqual([classify('Self BIL/INFT/FHO9148004/Self',-2000000).type,classify('Self BIL/INFT/FHO9148004/Self',-2000000).category],['Transfer','Transfers']);
 assert.deepEqual([classify('UPI/DR/123456789012/SELF/HDFC',-100).type,classify('NACH trxn ACH/NSECLEARINGLTDNSEINV/X',-2000000).category],['Transfer','Investments']);
 assert.equal(classify('CHQ PAID SELF',-500000).type,'Expense','a self cheque without a transfer channel is cash, not a transfer');
 assert.equal(transactionLabel({description:'Self BIL/INFT/FHO9148004/Self',amount:-2000000}).title,'Self transfer');
 assert.equal(transactionLabel({description:'NACH trxn ACH/NSECLEARINGLTDNSEINV/X',amount:-2000000}).title,'NSE Clearing');
});
test('identical legs pair automatically only when nothing is left out, except SIPs into an Investment account',()=>{
 const card=t('card','card','2026-08-30',700000,'Transfer','PAYMENT RECEIVED');
 const two=['AAA111','BBB222'].map(r=>t(r,'hdfc','2026-08-30',-700000,'Expense',`Self BIL/INFT/${r}/Self`));
 let r=findTransferPairs([card,...two]);assert.deepEqual(ids(r),[]);assert.equal(r.choices[0].options.length,2,'two self transfers for one card payment: you choose');
 const c2=t('card2','card','2026-08-30',700000,'Transfer','PAYMENT RECEIVED');r=findTransferPairs([card,c2,...two]);assert.equal(ids(r).length,2,'two and two are interchangeable');
 const sips=[1,2,3].map(i=>t('s'+i,'bank','2026-07-10',-2500000,'Expense','NACH/NSECLEARINGLTD/'+i)),buys=[1,2].map(i=>({...t('b'+i,'mf','2026-07-10',2500000,'Transfer','SIP Purchase · Fund'),category:'Investments'}));
 r=findTransferPairs([...sips,...buys],{accounts:[{id:'mf',type:'Investment'}]});assert.equal(ids(r).length,2,'SIP purchases pair even when one bank debit has no purchase in this report');
});
