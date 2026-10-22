// Learning categories from payees: what you settled for a payee (its UPI ID, else its title) is used for that payee's
// other payments — on import, as a suggestion in Needs review, and when you change one of them.
import {transactionLabel} from './transaction-labels.js';
import {genericPayee} from './insights.js';
const typeAllowed=(type,amount)=>!((type==='Expense'&&amount>0)||(['Income','Refund'].includes(type)&&amount<0));
// Who a transaction was with, and which way the money went: its UPI ID and its title, most precise first. Generic
// titles ("UPI payment") say nothing about the payee. A phone entry has the payee's name but rarely the UPI ID.
export function payeeKeys(t,titleRules=[]){
 const label=transactionLabel(t,titleRules),way=t.amount<0?'out':'in',id=label.upi?.id?.toLowerCase(),title=label.title.trim().toLowerCase();
 return [...(id?[`upi:${id}|${way}`]:[]),...(title&&!genericPayee.test(title)?[`title:${title}|${way}`]:[])];
}
export const payeeKey=(t,titleRules=[])=>payeeKeys(t,titleRules)[0]||'';
// For each payee, the category you use for it: from settled transactions (not in Needs review, not Uncategorized,
// not a linked transfer), when one category is clearly the usual one (at least two thirds of them).
export function learnedCategories(transactions,titleRules=[]){
 const seen=new Map();
 for(const t of transactions){
  if(t.review||t.category==='Uncategorized'||t.transferId)continue;const pick=t.category+'\u0000'+t.type;
  for(const key of payeeKeys(t,titleRules)){const counts=seen.get(key)||new Map();counts.set(pick,(counts.get(pick)||0)+1);seen.set(key,counts);}
 }
 const learned=new Map();
 for(const [key,counts] of seen){const total=[...counts.values()].reduce((v,n)=>v+n,0),[pick,count]=[...counts].sort((a,b)=>b[1]-a[1])[0];
  if(count/total>=2/3){const [category,type]=pick.split('\u0000');learned.set(key,{category,type,count});}}
 return learned;
}
// The learned category for a transaction, when it differs from the one it has and fits its direction.
export function suggestionFor(t,learned,titleRules=[]){
 const key=payeeKeys(t,titleRules).find(k=>learned.has(k)),l=key&&learned.get(key);
 if(!l||(l.category===t.category&&l.type===t.type)||!typeAllowed(l.type,t.amount))return null;
 return {...l,key,payee:transactionLabel(t,titleRules).title};
}
// New rows (an import, a phone entry) take the learned category; seen twice or more, they also leave Needs review.
// Your own category rules still come first.
export function applyLearned(rows,state){
 const titleRules=state.titleRules||[],learned=learnedCategories(state.transactions||[],titleRules),rules=state.rules||[];let n=0;
 const byRule=t=>rules.some(r=>String(t.description||'').toLowerCase().includes(String(r.keyword||'').toLowerCase()));
 const out=rows.map(t=>{if(byRule(t))return t;const s=suggestionFor(t,learned,titleRules);if(!s)return t;n++;return {...t,category:s.category,type:s.type,review:s.count<2};});
 return {rows:out,count:n};
}
// Other transactions from the same payee that do not have this category yet.
export function samePayee(transactions,t,titleRules=[]){
 const key=payeeKey(t,titleRules);if(!key)return [];
 return transactions.filter(x=>x!==t&&x.id!==t.id&&!x.transferId&&x.category!==t.category&&typeAllowed(t.type,x.amount)&&payeeKey(x,titleRules)===key);
}
