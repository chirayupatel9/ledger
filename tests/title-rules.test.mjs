import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionLabel,automaticTitle,sameTitle} from '../packages/domain/transaction-labels.js';
import {titleRuleMatches} from '../packages/domain/preferences.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const self={description:'IMPS-SELF TRANSFER TO XX9910-800112345',amount:-100000,type:'Transfer'};
const alias={id:'a',mode:'title',keyword:'self  TRANSFER',title:'Between my accounts'};
test('a rule on the automatic title renames every transaction that gets it',()=>{
 assert.equal(transactionLabel(self).title,'Self transfer');
 assert.deepEqual([transactionLabel(self,[alias]).title,transactionLabel(self,[alias]).source],['Between my accounts','Title rule']);
 assert.equal(transactionLabel({...self,description:'NEFT DR-SELF TRANSFER-XX9950-9001234'},[alias]).title,'Between my accounts','a later import with another narration follows');
 assert.equal(transactionLabel({description:'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345671',amount:-100},[alias]).title,'Swiggy','other titles are left alone');
});
test('your own title and narration rules come first; the automatic title ignores both',()=>{
 assert.equal(transactionLabel({...self,displayName:'Rent float'},[alias]).title,'Rent float');
 assert.equal(transactionLabel(self,[alias,{id:'b',mode:'contains',keyword:'xx9910',title:'To my RD'}]).title,'To my RD');
 assert.equal(automaticTitle({...self,displayName:'Rent float'}),'Self transfer');
 assert.equal(titleRuleMatches(alias,self),false,'narration matching skips title rules');
 assert.ok(sameTitle(' Self   transfer ','self transfer'));assert.equal(sameTitle('Self transfer','Self transfers'),false);
});
const ledger=titleRules=>({schemaVersion:2,initialized:true,rules:[],titleRules,accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:1,created:'2026-10-01T00:00:00Z'}],
 transactions:[{id:'t',statementId:'s',accountId:'a',account:'HDFC',date:'2026-10-05',description:self.description,amount:-100000,category:'Transfers',type:'Transfer',review:false}]});
test('the server accepts rules on an automatic title, once per title',()=>{
 assert.deepEqual(validateLedger(ledger([alias])).titleRules,[{id:'a',mode:'title',keyword:'self TRANSFER',title:'Between my accounts'}]);
 assert.throws(()=>validateLedger(ledger([alias,{...alias,id:'b',keyword:'Self transfer'}])),/already uses that match/);
 assert.throws(()=>validateLedger(ledger([{...alias,mode:'regex'}])),/Invalid title rule/);
});
