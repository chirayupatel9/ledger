import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanTag,validTags,parseTags,addTags,removeTag,hasTag,tagSummary,allTags,renameTag,deleteTag,maxTags} from '../packages/domain/tags.js';
import {carryOver} from '../packages/domain/capture.js';
import {csvExport} from '../packages/domain/core.js';
import {reportCards,cardLayout,defaultPreferences} from '../packages/domain/preferences.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const tx=(id,amount,type,tags)=>({id,amount,type,...(tags?{tags}:{})});

test('typed tags are tidied, split on commas and reuse the spelling already in the ledger',()=>{
 assert.equal(cleanTag('  #Goa   trip '),'Goa trip');assert.equal(cleanTag('a,b'),'a b');assert.equal(cleanTag('x'.repeat(50)).length,40);assert.equal(cleanTag('###'),'');
 assert.deepEqual(parseTags('goa trip, #Reimbursable,, GOA TRIP',['Goa trip']),['Goa trip','Reimbursable']);
 assert.deepEqual(parseTags(''),[]);
 assert.ok(validTags(['Goa trip','work']));
 for(const bad of [['a,b'],['#a'],[' a'],['a  b'],[''],['x'.repeat(41)],['Work','work'],[1],'work',Array.from({length:maxTags+1},(_,i)=>'t'+i)])assert.equal(validTags(bad),false,JSON.stringify(bad));
});

test('adding, removing and checking tags on a transaction',()=>{
 const t=tx('a',-100,'Expense');
 addTags(t,['Goa trip','goa TRIP','work']);assert.deepEqual(t.tags,['Goa trip','work']);
 assert.ok(hasTag(t,'GOA trip'));assert.ok(hasTag(t,'#work'));assert.equal(hasTag(t,'home'),false);
 removeTag(t,'WORK');assert.deepEqual(t.tags,['Goa trip']);removeTag(t,'goa trip');assert.equal('tags' in t,false,'no empty tag list is left behind');
 addTags(t,Array.from({length:30},(_,i)=>'t'+i));assert.equal(t.tags.length,maxTags);
});

test('tag totals: spent after refunds, received, and every tag on a transaction counts',()=>{
 const list=[tx('1',-500000,'Expense',['Goa trip','Work']),tx('2',-200000,'Expense',['Goa trip']),tx('3',50000,'Refund',['goa trip']),tx('4',300000,'Income',['Work']),tx('5',-100000,'Transfer',['Work']),tx('6',-900,'Expense')];
 assert.deepEqual(tagSummary(list),[{name:'Goa trip',count:3,spent:650000,received:0},{name:'Work',count:3,spent:500000,received:300000}]);
 assert.deepEqual(allTags(list),['Goa trip','Work']);
});

test('renaming a tag everywhere, merging into one you already use, and deleting it',()=>{
 const list=[tx('1',-1,'Expense',['goa','trip']),tx('2',-1,'Expense',['Goa','Trip 2026']),tx('3',-1,'Expense',['Trip 2026'])];
 assert.equal(renameTag(list,'GOA','Goa 2026'),2);assert.deepEqual(list.map(t=>t.tags),[['Goa 2026','trip'],['Goa 2026','Trip 2026'],['Trip 2026']]);
 assert.equal(renameTag(list,'trip','trip 2026'),1,'renaming onto an existing tag merges, keeping its spelling');assert.deepEqual(list[0].tags,['Goa 2026','Trip 2026']);
 assert.equal(renameTag(list,'Goa 2026','trip 2026'),2);assert.deepEqual(list.map(t=>t.tags),[['Trip 2026'],['Trip 2026'],['Trip 2026']],'a transaction never ends up with the same tag twice');
 assert.equal(renameTag(list,'Trip 2026','  '),0);
 assert.equal(deleteTag(list,'trip 2026'),3);assert.ok(list.every(t=>!t.tags));
});

test('tags survive a statement import replacing a phone entry, appear in the CSV and on Reports',()=>{
 const row={id:'r',date:'2026-10-01',description:'UPI/x',amount:-100,category:'Uncategorized',type:'Expense',review:true};
 assert.deepEqual(carryOver({...row,id:'p',tags:['Goa trip'],review:true},row).tags,['Goa trip']);
 const csv=csvExport([{...row,account:'HDFC',tags:['Goa trip','work']}],{tags:t=>(t.tags||[]).join(', ')});
 assert.match(csv,/,tags\r?\n/);assert.match(csv,/"Goa trip, work"/);
 assert.ok(reportCards.some(c=>c.id==='tags'));assert.ok(cardLayout('reports',{...defaultPreferences,reportsOrder:['statement','payees']}).some(c=>c.id==='tags'&&c.visible),'people with a saved Reports layout still get the new card');
});

const ledger=tags=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:1,created:'2026-10-01T00:00:00Z'}],
 transactions:[{id:'t',statementId:'s',accountId:'a',account:'HDFC',date:'2026-10-05',description:'SWIGGY',amount:-45000,category:'Food & dining',type:'Expense',review:false,...(tags===undefined?{}:{tags})}]});
test('the server keeps valid tags and refuses malformed ones',()=>{
 assert.deepEqual(validateLedger(ledger(['Goa trip','Work'])).transactions[0].tags,['Goa trip','Work']);
 assert.equal('tags' in validateLedger(ledger([])).transactions[0],false);assert.equal('tags' in validateLedger(ledger()).transactions[0],false);
 for(const tags of [['a,b'],['Work','WORK'],[''],['x'.repeat(41)],'Work',[{}],Array.from({length:21},(_,i)=>'t'+i)])assert.throws(()=>validateLedger(ledger(tags)),/tags/,JSON.stringify(tags));
});

import {tagRuleMatches,applyTagRules} from '../packages/domain/tags.js';
import {newFromPhone} from '../packages/domain/capture.js';
test('tag rules match the narration or the title, and add their tag once',()=>{
 const irctc={description:'POS IRCTC WEB BOOKING 12345',amount:-150000,type:'Expense'},swiggy={description:'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345671',amount:-50000,type:'Expense'};
 assert.ok(tagRuleMatches({mode:'contains',keyword:'irctc',tag:'Travel'},irctc));assert.equal(tagRuleMatches({mode:'exact',keyword:'irctc',tag:'Travel'},irctc),false);
 assert.ok(tagRuleMatches({mode:'title',keyword:'swiggy',tag:'Food'},swiggy));assert.equal(tagRuleMatches({mode:'title',keyword:'swig',tag:'Food'},swiggy),false);
 const rules=[{mode:'contains',keyword:'irctc',tag:'Travel'},{mode:'contains',keyword:'booking',tag:'Goa trip'},{mode:'title',keyword:'Swiggy',tag:'Food'}],rows=[{...irctc},{...swiggy},{...irctc,tags:['travel']}];
 assert.equal(applyTagRules(rows,rules),3);assert.deepEqual(rows.map(t=>t.tags),[['Travel','Goa trip'],['Food'],['travel','Goa trip']]);
 assert.equal(applyTagRules(rows,rules),0,'nothing to add the second time');
 const state={accounts:[{id:'a',name:'HDFC',type:'Savings'}],rules:[],transactions:[],tagRules:[{id:'r',mode:'contains',keyword:'irctc',tag:'Travel'}]};
 assert.deepEqual(newFromPhone(state,{accountId:'a',amount:-150000,date:'2026-10-20',payee:'IRCTC',channel:'UPI',source:'message'}).tags,['Travel'],'phone entries too');
});
test('the server keeps tag rules and refuses malformed or repeated ones',()=>{
 const rule={id:'r1',mode:'contains',keyword:' irctc  web ',tag:'Travel'};
 assert.deepEqual(validateLedger({...ledger([]),tagRules:[rule]}).tagRules,[{id:'r1',mode:'contains',keyword:'irctc web',tag:'Travel'}]);
 assert.deepEqual(validateLedger(ledger([])).tagRules,[]);
 for(const tagRules of [[{...rule,mode:'regex'}],[{...rule,tag:'a,b'}],[{...rule,keyword:' '}],[rule,{...rule,id:'r2',tag:'travel'}],'x'])assert.throws(()=>validateLedger({...ledger([]),tagRules}),/tag rule/i,JSON.stringify(tagRules));
});
