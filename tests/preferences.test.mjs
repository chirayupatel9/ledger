import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPreferences,preferencesFor,titleRuleMatches} from '../packages/domain/preferences.js';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {csvExport} from '../packages/domain/core.js';
import {detectRecurring} from '../packages/domain/recurring.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const rule=(id,keyword,title,mode='contains')=>({id,mode,keyword,title});
const tx=(id,description,extra={})=>({id,description,amount:-64900,date:'2026-10-05',accountId:'a',account:'HDFC',statementId:'s',category:'Uncategorized',type:'Expense',review:true,...extra});

test('preferences fill in defaults without sharing the frozen default object',()=>{
 assert.deepEqual(preferencesFor(undefined),defaultPreferences);assert.equal(preferencesFor({fontSize:20}).fontSize,20);assert.equal(preferencesFor({fontSize:20}).theme,'light');
 assert.ok(Object.isFrozen(defaultPreferences));
});
test('naming rules match original narrations by contained or exact text, ignoring case and spacing',()=>{
 assert.equal(titleRuleMatches(rule('r','netflixupi','Netflix'),tx('t','UPI/DR/123/NETFLIXUPI/HDFC')),true);
 assert.equal(titleRuleMatches(rule('r','upi/dr/123/netflixupi/hdfc','Netflix','exact'),tx('t','UPI/DR/123/NETFLIXUPI/HDFC')),true);
 assert.equal(titleRuleMatches(rule('r','upi/dr/123','Netflix','exact'),tx('t','UPI/DR/123/NETFLIXUPI/HDFC')),false);
 assert.equal(titleRuleMatches(rule('r','  big   bazaar ','Big Bazaar'),tx('t','POS BIG BAZAAR MUMBAI')),true);
 assert.equal(titleRuleMatches(rule('r','   ','Blank'),tx('t','ANYTHING')),false);
});
test('your own title beats naming rules, the first matching rule wins, and the narration stays intact',()=>{
 const rules=[rule('1','netflix','Netflix subscription'),rule('2','upi','Some UPI payment')],t=tx('t','UPI/DR/123/NETFLIXUPI/HDFC');
 assert.deepEqual(transactionLabel(t,rules),{title:'Netflix subscription',source:'Title rule',channel:'UPI'});
 assert.equal(transactionLabel(t,[...rules].reverse()).title,'Some UPI payment');
 assert.equal(transactionLabel({...t,displayName:'Family Netflix'},rules).source,'Your label');
 assert.equal(transactionLabel(t).source,'Suggested label');assert.equal(t.description,'UPI/DR/123/NETFLIXUPI/HDFC');
});
test('CSV export and recurring payments use the naming rules',()=>{
 const rules=[rule('1','netflixupi','Netflix subscription')];
 assert.match(csvExport([tx('t','UPI/DR/123/NETFLIXUPI/HDFC')],{},rules),/"Netflix subscription"/);
 const series=detectRecurring(['2026-07-05','2026-08-05','2026-09-05'].map((date,i)=>tx('n'+i,`UPI/DR/${1000+i}/NETFLIXUPI/HDFC`,{date})),[],rules);
 assert.deepEqual(series.map(s=>[s.payee,s.cadence,s.count]),[['Netflix subscription','monthly',3]]);
});
const ledger=extra=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:1,created:'2026-10-16T00:00:00Z'}],transactions:[tx('t','NETFLIX')],...extra});
test('server applies default preferences and validates them strictly',()=>{
 assert.deepEqual(validateLedger(ledger()).preferences,defaultPreferences);assert.deepEqual(validateLedger(ledger()).titleRules,[]);
 assert.equal(validateLedger(ledger({preferences:{theme:'dark',fontSize:20}})).preferences.fontSize,20);
 for(const preferences of [{theme:'neon'},{fontSize:15},{fontFamily:'comic'},{density:'tight'},{showChart:'yes'},{unknown:true},[],null])assert.throws(()=>validateLedger(ledger({preferences})),JSON.stringify(preferences));
});
test('server validates, trims and de-duplicates naming rules',()=>{
 const saved=validateLedger(ledger({titleRules:[rule('r1','  netflix   upi ','  Netflix  ')]})).titleRules[0];
 assert.deepEqual(saved,{id:'r1',mode:'contains',keyword:'netflix upi',title:'Netflix'});
 for(const titleRules of [[rule('r1','x','')],[rule('r1','','X')],[rule('bad id!','x','X')],[{...rule('r1','x','X'),mode:'regex'}],[rule('r1','Netflix','A'),rule('r2','netflix','B')],Array.from({length:501},(_,i)=>rule('r'+i,'k'+i,'T')),{}])assert.throws(()=>validateLedger(ledger({titleRules})));
 assert.equal(validateLedger(ledger({titleRules:[rule('r1','netflix','A'),rule('r2','netflix','B','exact')]})).titleRules.length,2,'contains and exact on the same text are different rules');
});
