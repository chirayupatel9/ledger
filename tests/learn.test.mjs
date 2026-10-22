import test from 'node:test';
import assert from 'node:assert/strict';
import {payeeKeys,learnedCategories,suggestionFor,applyLearned,samePayee} from '../packages/domain/learn.js';
import {newFromPhone} from '../packages/domain/capture.js';

const tx=(id,description,amount,category,type,extra={})=>({id,accountId:'a',account:'HDFC',date:'2026-10-0'+(id.length%9+1),description,amount,category,type,review:false,...extra});
const swiggy=i=>`UPI-SWIGGY LIMITED-swiggy@axisbank-62851234567${i}`,ramesh=i=>`UPI-RAMESH KUMAR-ramesh.k@okhdfcbank-62853333444${i}-MILK`;
test('a payee is its UPI ID and its title, by direction; generic titles teach nothing',()=>{
 assert.deepEqual(payeeKeys(tx('x',swiggy(1),-100,'Food & dining','Expense')),['upi:swiggy@axisbank|out','title:swiggy|out']);
 assert.deepEqual(payeeKeys(tx('y',swiggy(1),100,'Refund','Refund')),['upi:swiggy@axisbank|in','title:swiggy|in']);
 assert.deepEqual(payeeKeys(tx('z','UPI/DR/628512345678',-100,'Uncategorized','Expense')),[]);
});
test('learned: the usual category of settled transactions, when clearly the usual one',()=>{
 const list=[tx('a1',ramesh(1),-6000,'Groceries','Expense'),tx('a2',ramesh(2),-6000,'Groceries','Expense'),tx('a3',ramesh(3),-6000,'Shopping','Expense'),
  tx('a4',ramesh(4),-6000,'Uncategorized','Expense',{review:true}),tx('b1',swiggy(1),-500,'Food & dining','Expense'),tx('b2',swiggy(2),-500,'Shopping','Expense')];
 const learned=learnedCategories(list);
 assert.deepEqual(learned.get('upi:ramesh.k@okhdfcbank|out'),{category:'Groceries',type:'Expense',count:2});
 assert.equal(learned.has('upi:swiggy@axisbank|out'),false,'one each: no clear habit');
 const s=suggestionFor(list[3],learned);assert.equal(s.category,'Groceries');assert.equal(s.payee,'Ramesh Kumar');
 assert.equal(suggestionFor(list[0],learned),null,'already in that category');
 assert.equal(suggestionFor(tx('r',ramesh(5),6000,'Uncategorized','Income',{review:true}),learned),null,'money in is a different habit');
});
test('new rows take the learned category; your own rules come first; one example keeps it in Needs review',()=>{
 const state={rules:[{keyword:'swiggy',category:'Entertainment'}],transactions:[tx('a1',ramesh(1),-6000,'Groceries','Expense'),tx('a2',ramesh(2),-6000,'Groceries','Expense'),tx('b1',swiggy(1),-500,'Food & dining','Expense'),tx('b2',swiggy(2),-500,'Food & dining','Expense'),tx('c1','UPI-ANITA SHARMA-anita@ybl-628512340001-TUITION',-3000,'Education','Expense')]};
 const rows=[tx('n1',ramesh(7),-6000,'Uncategorized','Expense',{review:true}),tx('n2',swiggy(7),-500,'Food & dining','Expense',{review:true}),tx('n3','UPI-ANITA SHARMA-anita@ybl-628512340009-TUITION',-3000,'Uncategorized','Expense',{review:true}),tx('n4','AMAZON PAY INDIA',-900,'Shopping','Expense')];
 const out=applyLearned(rows,state);assert.equal(out.count,2);
 assert.deepEqual([out.rows[0].category,out.rows[0].review],['Groceries',false],'seen twice: settled');
 assert.equal(out.rows[1].category,'Food & dining','a category rule of yours matches: untouched');
 assert.deepEqual([out.rows[2].category,out.rows[2].review],['Education',true],'seen once: suggested, still to review');
 assert.equal(out.rows[3],rows[3]);
});
test('a phone entry with the payee name gets the category from statement rows with that name',()=>{
 const state={accounts:[{id:'a',name:'HDFC',type:'Savings'}],rules:[],transactions:[tx('a1',ramesh(1),-6000,'Groceries','Expense'),tx('a2',ramesh(2),-6000,'Groceries','Expense')]};
 const t=newFromPhone(state,{accountId:'a',amount:-6000,date:'2026-10-20',payee:'Ramesh Kumar',ref:'628533334449',channel:'UPI',source:'message'});
 assert.deepEqual([t.category,t.review],['Groceries',true],'categorised, still waiting for its statement row');
});
test('the same payee’s other transactions, for “also put these in …”',()=>{
 const list=[tx('a1',ramesh(1),-6000,'Groceries','Expense'),tx('a2',ramesh(2),-6000,'Uncategorized','Expense'),tx('a3',ramesh(3),-6000,'Shopping','Expense'),tx('a4',ramesh(4),6000,'Uncategorized','Income'),tx('a5',ramesh(5),-6000,'Groceries','Expense',{transferId:'x'})];
 assert.deepEqual(samePayee(list,list[0]).map(t=>t.id),['a2','a3']);
});
