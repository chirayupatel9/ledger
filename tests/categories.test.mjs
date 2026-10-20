import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,categoryLookup,categoryOptions,categoryUsage,renameCustomCategory,deleteCustomCategory} from '../packages/domain/categories.js';
import {categories} from '../packages/domain/core.js';
import {csvExport} from '../packages/domain/core.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const tx=(id,category)=>({id,date:'2026-10-01',description:'X '+id,amount:-100,accountId:'a',account:'HDFC',statementId:'s',category,type:'Expense',review:true});
const state=()=>({transactions:[tx('1','Pets'),tx('2','Food & dining')],rules:[{keyword:'vet',category:'Pets'}],customCategories:[{id:'c1',name:'Pets',color:'#aa5500',kind:'expense'}],categoryOverrides:{'Food & dining':{label:'Eating out',color:'#112233'},Entertainment:{hidden:true}}});

test('the catalogue has every built-in plus your own, with labels, colours, kinds and hidden flags',()=>{
 const all=catalog(state());assert.equal(all.length,categories.length+1);
 const look=categoryLookup(state());
 assert.deepEqual([look('Food & dining').label,look('Food & dining').color,look('Food & dining').builtin],['Eating out','#112233',true]);
 assert.deepEqual([look('Pets').label,look('Pets').kind,look('Pets').builtin],['Pets','expense',false]);
 assert.equal(look('Salary').kind,'income');assert.equal(look('Transfers').kind,'other');assert.equal(look('Entertainment').hidden,true);
 assert.equal(look('Old backup category').label,'Old backup category','unknown names still render');
});
test('pickers group by kind, use labels, and leave out hidden categories unless selected',()=>{
 const html=categoryOptions(state());
 assert.match(html,/<optgroup label="Spending">[\s\S]*value="Food &amp; dining"[^>]*>Eating out<[\s\S]*value="Pets"/);assert.match(html,/<optgroup label="Income">/);
 assert.doesNotMatch(html,/value="Entertainment"/);assert.match(categoryOptions(state(),'Entertainment'),/value="Entertainment" selected/);
});
test('renaming a custom category moves its transactions and rules; deleting asks where they go',()=>{
 const s=state();renameCustomCategory(s,'c1',{name:'Pet care',color:'#aa5500',kind:'expense'});
 assert.equal(s.transactions[0].category,'Pet care');assert.equal(s.rules[0].category,'Pet care');assert.deepEqual(categoryUsage(s,'Pet care'),{transactions:1,rules:1});
 assert.throws(()=>deleteCustomCategory(s,'c1'),/Choose where/);
 deleteCustomCategory(s,'c1','Shopping');assert.equal(s.transactions[0].category,'Shopping');assert.equal(s.rules[0].category,'Shopping');assert.equal(s.customCategories.length,0);
 const unused={...state(),transactions:[],rules:[]};deleteCustomCategory(unused,'c1');assert.equal(unused.customCategories.length,0);
});
test('CSV exports show category labels without duplicating the column',()=>{
 const csv=csvExport([tx('2','Food & dining')],{category:t=>categoryLookup(state())(t.category).label});
 const header=csv.split('\r\n')[0];assert.equal(header.split(',').filter(h=>h==='category').length,1);assert.match(csv,/"Eating out"/);
});
const ledger=extra=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:1,created:'2026-10-16T00:00:00Z'}],transactions:[tx('1','Shopping')],...extra});
test('server keeps custom categories and relabels, and allows them on transactions and rules',()=>{
 const v=validateLedger(ledger({...state(),transactions:[tx('1','Pets'),tx('2','Food & dining')],rules:[{keyword:'vet',category:'Pets'}]}));
 assert.deepEqual(v.customCategories,[{id:'c1',name:'Pets',color:'#aa5500',kind:'expense'}]);
 assert.deepEqual(v.categoryOverrides,{'Food & dining':{label:'Eating out',color:'#112233'},Entertainment:{hidden:true}});
 assert.equal(v.transactions[0].category,'Pets');assert.equal(v.rules[0].category,'Pets');
 assert.deepEqual(validateLedger(ledger()).customCategories,[]);assert.deepEqual(validateLedger(ledger({categoryOverrides:{Rent:{label:'Rent'}}})).categoryOverrides,{},'a label equal to the original is not stored');
});
test('server rejects clashing names, bad colours, unknown categories and hiding Uncategorized',()=>{
 const bad=[
  {customCategories:[{id:'c1',name:'shopping',color:'#aa5500',kind:'expense'}]},
  {categoryOverrides:{Rent:{label:'Groceries'}}},
  {categoryOverrides:{Rent:{label:'Home'}},customCategories:[{id:'c1',name:'home',color:'#aa5500',kind:'expense'}]},
  {customCategories:[{id:'c1',name:'Pets',color:'red',kind:'expense'}]},
  {customCategories:[{id:'c1',name:'Pets',color:'#aa5500',kind:'transfer'}]},
  {customCategories:[{id:'c1',name:'Pets',color:'#aa5500',kind:'expense'},{id:'c1',name:'Vet',color:'#aa5500',kind:'expense'}]},
  {categoryOverrides:{Uncategorized:{hidden:true}}},{categoryOverrides:{NotACategory:{label:'X'}}},
  {transactions:[tx('1','Pets')]},{rules:[{keyword:'x',category:'Pets'}]},
  {customCategories:Array.from({length:101},(_,i)=>({id:'c'+i,name:'C'+i,color:'#aa5500',kind:'expense'}))},
 ];
 for(const extra of bad)assert.throws(()=>validateLedger(ledger(extra)),JSON.stringify(extra).slice(0,80));
});
