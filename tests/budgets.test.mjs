import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetStatus,budgetAlerts} from '../packages/domain/budgets.js';
import {insightCards} from '../packages/domain/insights.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

const tx=(id,date,amount,category,type='Expense')=>({id,statementId:'s',accountId:'a',account:'HDFC',date,description:'POS '+id,amount,category,type,review:false});
const state=budgets=>({accounts:[{id:'a',name:'HDFC',type:'Savings'}],statements:[],titleRules:[],budgets,transactions:[
 tx('f1','2026-10-02',-300000,'Food & dining'),tx('f2','2026-10-08',-150000,'Food & dining'),tx('f3','2026-10-09',20000,'Food & dining','Refund'),
 tx('s1','2026-10-03',-1200000,'Shopping'),tx('g1','2026-10-04',-100000,'Groceries'),tx('t1','2026-10-05',-5000000,'Transfers','Transfer'),tx('o1','2026-09-20',-900000,'Food & dining')]});
test('budget progress: spent after refunds, left, and whether it is over, nearly used, on pace to go over or fine',()=>{
 const s=budgetStatus(state([{category:'',amount:3000000},{category:'Food & dining',amount:500000},{category:'Shopping',amount:1000000},{category:'Groceries',amount:600000}]),{month:'2026-10',today:'2026-10-10'});
 assert.deepEqual(s.map(b=>[b.category,b.spent,b.status]),[['',1730000,'pace'],['Shopping',1200000,'over'],['Food & dining',430000,'near'],['Groceries',100000,'ok']],'all spending first, then by share used; transfers and September do not count');
 assert.equal(s[0].daysLeft,21);assert.equal(s[1].left,-200000);
 const pace=budgetStatus(state([{category:'Groceries',amount:250000}]),{month:'2026-10',today:'2026-10-10'})[0];
 assert.deepEqual([pace.status,pace.projected],['pace',310000],'₹1,000 in 10 days is on pace for ₹3,100 by the 31st');
 assert.equal(budgetStatus(state([{category:'Groceries',amount:250000}]),{month:'2026-10',today:'2026-10-03'})[0].status,'ok','too early in the month to judge the pace');
 assert.equal(budgetStatus(state([{category:'Food & dining',amount:500000}]),{month:'2026-09',today:'2026-10-10'})[0].status,'over','a past month is judged on what was spent');
 assert.deepEqual(budgetStatus(state([]),{month:'2026-10',today:'2026-10-10'}),[]);
});
test('budget alerts lead the dashboard notes: over first, then nearly used',()=>{
 const s=state([{category:'Food & dining',amount:500000},{category:'Shopping',amount:1000000}]);
 assert.deepEqual(budgetAlerts(s,{today:'2026-10-10'}).map(a=>[a.category,a.amount,a.text]),[['Shopping',200000,'Shopping: {amount} over this month’s budget.'],['Food & dining',70000,'Food & dining: {amount} left of this month’s budget, with 21 days to go.']]);
 const cards=insightCards(s,s.transactions,{today:'2026-10-10'}).cards;assert.deepEqual(cards.slice(0,2).map(c=>c.kind),['budget','budget']);assert.ok(cards.length<=5);
});
const ledger=budgets=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:1,created:'2026-10-01T00:00:00Z'}],transactions:[tx('f1','2026-10-02',-300000,'Food & dining')],...(budgets?{budgets}:{})});
test('the server keeps budgets for known categories and refuses bad ones',()=>{
 assert.deepEqual(validateLedger(ledger([{category:'',amount:3000000},{category:'Food & dining',amount:500000}])).budgets,[{category:'',amount:3000000},{category:'Food & dining',amount:500000}]);
 assert.deepEqual(validateLedger(ledger()).budgets,[]);
 for(const budgets of [[{category:'Nope',amount:100}],[{category:'Rent',amount:0}],[{category:'Rent',amount:1.5}],[{category:'Rent',amount:100},{category:'Rent',amount:200}],'x'])assert.throws(()=>validateLedger(ledger(budgets)),/budget/i,JSON.stringify(budgets));
});
