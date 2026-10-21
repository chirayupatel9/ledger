import test from 'node:test';
import assert from 'node:assert/strict';
import {cardLayout,dashboardCards,reportCards,defaultPreferences} from '../packages/domain/preferences.js';
import {detectRecurring,dismissedKeys} from '../packages/domain/recurring.js';
import {upcomingPayments,insightCards} from '../packages/domain/insights.js';
import {validateLedger} from '../apps/api/dist/packages/domain/ledger-validation.js';

test('your card order and hidden cards, with new cards in their default spot',()=>{
 assert.deepEqual(cardLayout('dashboard',defaultPreferences).map(c=>c.id),dashboardCards.map(c=>c.id));
 const d=cardLayout('dashboard',{...defaultPreferences,dashboardOrder:['upcoming','tax'],showTax:false});
 assert.deepEqual(d.slice(0,3).map(c=>[c.id,c.visible]),[['upcoming',true],['tax',false],['insights',true]]);assert.equal(d.length,dashboardCards.length,'cards you have not placed still appear');
 const r=cardLayout('reports',{...defaultPreferences,reportsOrder:['payees','gone'],reportsHidden:['calendar']});
 assert.equal(r[0].id,'payees');assert.equal(r.find(c=>c.id==='calendar').visible,false);assert.equal(r.length,reportCards.length);
});

const base=()=>({schemaVersion:2,initialized:true,rules:[],accounts:[{id:'a',name:'HDFC',bank:'',type:'Savings',last4:'',currency:'INR',archived:false}],statements:[{id:'s',accountId:'a',account:'HDFC',name:'s.csv',count:3,created:'2026-10-01T00:00:00Z'}],
 transactions:['2026-07-05','2026-08-05','2026-09-05'].map((date,i)=>({id:'t'+i,statementId:'s',accountId:'a',account:'HDFC',date,description:'NETFLIX.COM',amount:-64900,category:'Entertainment',type:'Expense',review:false}))});
test('the server accepts card layouts of known cards and marks of non-recurring payments',()=>{
 const ok=validateLedger({...base(),preferences:{dashboardOrder:['tax','recent'],reportsOrder:['payees'],reportsHidden:['calendar','cards']},recurringDismissed:[{key:'a|out|netflix|',payee:'Netflix',at:'2026-10-21T10:00:00Z'}]});
 assert.deepEqual(ok.preferences.dashboardOrder,['tax','recent']);assert.equal(ok.recurringDismissed[0].payee,'Netflix');assert.deepEqual(validateLedger(base()).recurringDismissed,[]);
 for(const preferences of [{dashboardOrder:['nope']},{dashboardOrder:['tax','tax']},{reportsHidden:'calendar'},{reportsOrder:[1]}])assert.throws(()=>validateLedger({...base(),preferences}),/layout/);
 for(const recurringDismissed of [[{key:'',payee:'x',at:'2026-10-21'}],[{key:'k',payee:'x',at:'nope'}],[{key:'k',payee:'x',at:'2026-10-21'},{key:'k',payee:'y',at:'2026-10-21'}],'x'])assert.throws(()=>validateLedger({...base(),recurringDismissed}));
});

test('a payment marked not recurring leaves the list, Coming up and the insights',()=>{
 const s=base(),[series]=detectRecurring(s.transactions,s.statements);assert.equal(series.payee,'Netflix');
 assert.equal(upcomingPayments(s,{today:'2026-09-20'}).items.length,1);
 const marked={...s,recurringDismissed:[{key:series.key,payee:'Netflix',at:'2026-10-21T10:00:00Z'}]};
 assert.deepEqual(dismissedKeys(marked),[series.key]);assert.deepEqual(detectRecurring(s.transactions,s.statements,[],{dismissed:dismissedKeys(marked)}),[]);
 assert.equal(upcomingPayments(marked,{today:'2026-09-20'}).items.length,0);assert.equal(upcomingPayments(s,{today:'2026-09-20'}).items[0].key,series.key);
 assert.ok(!insightCards(marked,marked.transactions,{today:'2026-09-20'}).cards.some(c=>c.kind==='new-regular'));
});
