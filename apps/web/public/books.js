// Bookkeeping checks on imported statements. All amounts are integer paise; dates are YYYY-MM-DD.
const DAY=86400000;
export const addDays=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*DAY).toISOString().slice(0,10);
const daysBetween=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);
const known=v=>Number.isSafeInteger(v);
// Walk the running balance in file order. Banks list oldest-first or newest-first; dates decide, balances break ties.
export function statementBalances(rows){
 const idx=rows.map((t,i)=>known(t.balance)?i:-1).filter(i=>i>=0);if(!idx.length)return null;
 const sum=(a,b)=>{let s=0;for(let i=a;i<=b;i++)s+=rows[i].amount;return s};
 const breaks=asc=>{const bad=[];for(let k=1;k<idx.length;k++){const p=idx[k-1],i=idx[k];if((asc?rows[p].balance+sum(p+1,i):rows[p].balance-sum(p,i-1))!==rows[i].balance)bad.push(i)}return bad};
 const asc=breaks(true),desc=breaks(false),first=rows[0].date,last=rows.at(-1).date;
 const ascending=first<last?true:first>last?false:asc.length<=desc.length,n=rows.length-1,top=idx[0],bottom=idx.at(-1);
 return ascending?{opening:rows[top].balance-sum(0,top),closing:rows[bottom].balance+sum(bottom+1,n),ascending,mismatches:asc,checked:idx.length}
  :{opening:rows[bottom].balance-sum(bottom,n),closing:rows[top].balance+sum(0,top-1),ascending,mismatches:desc,checked:idx.length};
}
export function datesSpan(rows){const dates=rows.map(t=>t.date).filter(Boolean).sort();return dates.length?{from:dates[0],to:dates.at(-1)}:null;}
// Per-account coverage and reconciliation. Statements without a confirmed period use their transaction dates,
// which may start or end a few days inside the real period, so only longer gaps are reported for them.
export function accountBooks(state,accountId){
 // Prefix sums over date-sorted amounts keep every range sum O(log n) for large ledgers.
 const txns=state.transactions.filter(t=>t.accountId===accountId).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0),cum=[0],spans={};
 for(const t of txns){cum.push(cum.at(-1)+t.amount);const s=spans[t.statementId];if(!s)spans[t.statementId]={from:t.date,to:t.date};else s.to=t.date;}
 const index=(date,inclusive)=>{let lo=0,hi=txns.length;while(lo<hi){const m=(lo+hi)>>1;if(txns[m].date<date||(inclusive&&txns[m].date===date))lo=m+1;else hi=m}return lo};
 const sumBetween=(from,to)=>from>to?0:cum[index(to,true)]-cum[index(from,false)];
 const statements=state.statements.filter(s=>s.accountId===accountId).map(s=>{
  const confirmed=!!(s.from&&s.to),span=confirmed?{from:s.from,to:s.to}:spans[s.id];
  return span&&{id:s.id,name:s.name,...span,confirmed,opening:s.opening,closing:s.closing};
 }).filter(Boolean).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 const gaps=[],breaks=[];let end=null,endConfirmed=true;
 for(const s of statements){
  if(end&&s.from>addDays(end,1)){const gap={from:addDays(end,1),to:addDays(s.from,-1)};if(endConfirmed&&s.confirmed||daysBetween(gap.from,gap.to)>=7)gaps.push(gap);}
  if(!end||s.to>end){end=s.to;endConfirmed=s.confirmed;}
 }
 for(let i=1;i<statements.length;i++){const a=statements[i-1],b=statements[i];
  if(b.from>a.to&&known(a.closing)&&known(b.opening)){const difference=b.opening-a.closing-sumBetween(addDays(a.to,1),addDays(b.from,-1));if(difference)breaks.push({after:a.id,before:b.id,from:a.to,to:b.from,difference});}}
 const checks=Object.fromEntries(statements.map(s=>[s.id,known(s.opening)&&known(s.closing)?s.closing-s.opening-sumBetween(s.from,s.to):null]));
 const start=statements.find(s=>known(s.opening)),latest=[...statements].reverse().find(s=>known(s.closing));
 const overall=start&&latest&&latest.to>=start.from?latest.closing-start.opening-sumBetween(start.from,latest.to):null;
 const explained=gaps.length+breaks.length+Object.values(checks).filter(d=>d).length,issues=explained+(overall&&!explained?1:0);
 return {statements,gaps,breaks,checks,overall,issues,from:statements[0]?.from||null,to:end,
  balance:latest?{amount:latest.closing,date:latest.to}:null,
  status:!statements.length?'empty':issues?'attention':start&&latest?'balanced':'unverified'};
}
