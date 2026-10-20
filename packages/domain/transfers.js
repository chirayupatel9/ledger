// Transfers between the user's own accounts: a debit in one account and a credit of the same amount in another.
// A link is a shared transferId on exactly two Transfer legs; anything else is treated as unlinked.
import {classify} from './core.js';
const DAY=86400000,days=(a,b)=>Math.round(Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/DAY);
// UPI RRNs, NEFT/IMPS UTRs and card payment references: runs of 8+ digits, ignoring masked card numbers.
const references=t=>new Set((String(t.description).match(/\d{8,}/g)||[]));
export function validLink(a,b){return !!(a&&b&&a.accountId!==b.accountId&&a.amount===-b.amount&&a.type==='Transfer'&&b.type==='Transfer');}
export function transferIndex(transactions){const legs=new Map();for(const t of transactions)if(t.transferId)legs.set(t.transferId,[...(legs.get(t.transferId)||[]),t]);return legs;}
export function partnerOf(t,index){const legs=t.transferId&&index.get(t.transferId);return legs?.length===2?legs.find(x=>x!==t):null;}
// Drop links that are not exactly two valid legs. Used by the server before saving and safe to run anywhere.
export function normalizeTransfers(transactions){for(const legs of transferIndex(transactions).values())if(legs.length!==2||!validLink(...legs))for(const t of legs)delete t.transferId;return transactions;}
export function unlinkTransfer(transactions,t){const id=t?.transferId;if(!id)return;for(const x of transactions)if(x.transferId===id)delete x.transferId;}
export function linkTransfer(transactions,a,b,id=crypto.randomUUID()){
 if(!a||!b||a.accountId===b.accountId||a.amount!==-b.amount)throw Error('Only a debit and a credit of the same amount in two different accounts can be linked.');
 unlinkTransfer(transactions,a);unlinkTransfer(transactions,b);
 for(const t of [a,b]){t.transferId=id;t.type='Transfer';if(t.category!=='Investments')t.category='Transfers';t.review=false;}
}
// Legs that could pair with t, for manual linking: other account, opposite equal amount, within a week.
export function linkCandidates(transactions,t,window=7){return transactions.filter(x=>x!==t&&x.accountId!==t.accountId&&x.amount===-t.amount&&days(x.date,t.date)<=window).sort((x,y)=>days(x.date,t.date)-days(y.date,t.date));}
// Narrations are re-read with today's rules, so rows imported before a rule existed still count as transfers or investments.
function hints(t,memo){let h=memo.get(t);if(!h){const c=t.type==='Transfer'?t:classify(String(t.description||''),t.amount),investment=t.category==='Investments'||c.category==='Investments';h={investment,transfer:!investment&&(t.type==='Transfer'||c.type==='Transfer')};memo.set(t,h);}return h;}
function score(debit,credit,maxDays,ctx){
 const gap=days(debit.date,credit.date);if(gap>maxDays)return null;
 const d=hints(debit,ctx.memo),c=hints(credit,ctx.memo);
 // Money sent to a broker or fund never pays a card bill or reaches a bank account, unless that account is an Investment account you track.
 if((d.investment||c.investment)&&!ctx.investmentAccounts.has(debit.accountId)&&!ctx.investmentAccounts.has(credit.accountId))return null;
 const shared=[...references(debit)].find(r=>references(credit).has(r)),transfers=d.transfer+c.transfer;
 // Equal amounts alone are common (rent, splits); require a Transfer leg or a shared reference.
 if(!shared&&!transfers)return null;
 return {debit,credit,value:(shared?5:0)+transfers*2+(gap===0?2:gap===1?1:0),reason:shared?`Same reference ${shared}`:gap===0?'Same day':`${gap} day${gap>1?'s':''} apart`};
}
// Proposes pairs that are each other's single best match. Ties come back as choices for the user to settle.
export function findTransferPairs(transactions,{maxDays=3,accounts=[]}={}){
 const ctx={memo:new Map(),investmentAccounts:new Set(accounts.filter(a=>a.type==='Investment').map(a=>a.id))};
 const open=transactions.filter(t=>!t.transferId),credits=new Map();
 for(const t of open)if(t.amount>0)credits.set(t.amount,[...(credits.get(t.amount)||[]),t]);
 let edges=[];for(const debit of open)if(debit.amount<0)for(const credit of credits.get(-debit.amount)||[])if(credit.accountId!==debit.accountId){const e=score(debit,credit,maxDays,ctx);if(e)edges.push(e);}
 const pairs=[];let changed=true;
 while(changed){changed=false;
  const best=new Map();for(const e of edges)for(const t of [e.debit,e.credit]){const b=best.get(t);if(!b||e.value>b.value)best.set(t,{value:e.value,edge:e,tie:false});else if(e.value===b.value)b.tie=true;}
  const taken=new Set();
  for(const e of edges){const d=best.get(e.debit),c=best.get(e.credit);if(d.edge===e&&c.edge===e&&!d.tie&&!c.tie){pairs.push(e);taken.add(e.debit).add(e.credit);changed=true;}}
  edges=edges.filter(e=>!taken.has(e.debit)&&!taken.has(e.credit));
 }
 const ambiguous=new Set(edges.flatMap(e=>[e.debit,e.credit])).size;
 // Group what is left by the transaction that has several candidates, best candidates first.
 const choices=[],seen=new Set(),group=side=>{const m=new Map();for(const e of edges)m.set(e[side],[...(m.get(e[side])||[]),e]);return [...m];};
 for(const [anchor,list] of [...group('credit'),...group('debit')]){if(list.length<2||seen.has(anchor))continue;seen.add(anchor);const other=anchor.amount>0?'debit':'credit';
  choices.push({anchor,options:list.sort((a,b)=>b.value-a.value||days(a[other].date,anchor.date)-days(b[other].date,anchor.date)).map(e=>({other:e[other],debit:e.debit,credit:e.credit,reason:e.reason}))});}
 return {pairs:pairs.sort((a,b)=>a.debit.date.localeCompare(b.debit.date)),ambiguous,choices:choices.sort((a,b)=>a.anchor.date.localeCompare(b.anchor.date))};
}
export function unpairedTransfers(transactions){return transactions.filter(t=>t.type==='Transfer'&&t.category==='Transfers'&&!t.transferId);}
// Money moved between your own accounts: linked legs cancel out (net 0 when both legs are in view).
export function transferSummary(transactions){
 const s={linkedOut:0,linkedIn:0,linkedPairs:0,unlinkedOut:0,unlinkedIn:0,unlinked:0};
 for(const t of transactions)if(t.type==='Transfer'){if(t.transferId){if(t.amount<0)s.linkedOut-=t.amount;else{s.linkedIn+=t.amount;s.linkedPairs++;}}else if(t.category==='Transfers'){s.unlinked++;if(t.amount<0)s.unlinkedOut-=t.amount;else s.unlinkedIn+=t.amount;}}
 return {...s,net:s.linkedIn-s.linkedOut};
}
// Proposed pairs that involve at least one of the given transaction ids (for example, rows just imported).
export function pairsInvolving(transactions,ids,options){const set=new Set(ids);return findTransferPairs(transactions,options).pairs.filter(p=>set.has(p.debit.id)||set.has(p.credit.id));}
// Pairs and choices touching the given ids, used to prompt right after an import.
export function suggestionsInvolving(transactions,ids,options){const set=new Set(ids),r=findTransferPairs(transactions,options),touches=(...t)=>t.some(x=>set.has(x.id));
 return {pairs:r.pairs.filter(p=>touches(p.debit,p.credit)),choices:r.choices.filter(g=>touches(g.anchor,...g.options.map(o=>o.other)))};}
