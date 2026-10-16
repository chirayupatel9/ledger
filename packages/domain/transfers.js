// Transfers between the user's own accounts: a debit in one account and a credit of the same amount in another.
// A link is a shared transferId on exactly two Transfer legs; anything else is treated as unlinked.
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
function score(debit,credit,maxDays){
 const gap=days(debit.date,credit.date);if(gap>maxDays)return null;
 const shared=[...references(debit)].find(r=>references(credit).has(r)),transfers=(debit.type==='Transfer')+(credit.type==='Transfer');
 // Equal amounts alone are common (rent, splits); require a Transfer leg or a shared reference.
 if(!shared&&!transfers)return null;
 return {debit,credit,value:(shared?5:0)+transfers*2+(gap===0?2:gap===1?1:0),reason:shared?`Same reference ${shared}`:gap===0?'Same day':`${gap} day${gap>1?'s':''} apart`};
}
// Proposes pairs that are each other's single best match; ties are left for the user to link by hand.
export function findTransferPairs(transactions,{maxDays=3}={}){
 const open=transactions.filter(t=>!t.transferId),credits=new Map();
 for(const t of open)if(t.amount>0)credits.set(t.amount,[...(credits.get(t.amount)||[]),t]);
 let edges=[];for(const debit of open)if(debit.amount<0)for(const credit of credits.get(-debit.amount)||[])if(credit.accountId!==debit.accountId){const e=score(debit,credit,maxDays);if(e)edges.push(e);}
 const pairs=[];let changed=true;
 while(changed){changed=false;
  const best=new Map();for(const e of edges)for(const t of [e.debit,e.credit]){const b=best.get(t);if(!b||e.value>b.value)best.set(t,{value:e.value,edge:e,tie:false});else if(e.value===b.value)b.tie=true;}
  const taken=new Set();
  for(const e of edges){const d=best.get(e.debit),c=best.get(e.credit);if(d.edge===e&&c.edge===e&&!d.tie&&!c.tie){pairs.push(e);taken.add(e.debit).add(e.credit);changed=true;}}
  edges=edges.filter(e=>!taken.has(e.debit)&&!taken.has(e.credit));
 }
 const ambiguous=new Set(edges.flatMap(e=>[e.debit,e.credit])).size;
 return {pairs:pairs.sort((a,b)=>a.debit.date.localeCompare(b.debit.date)),ambiguous};
}
export function unpairedTransfers(transactions){return transactions.filter(t=>t.type==='Transfer'&&t.category==='Transfers'&&!t.transferId);}
