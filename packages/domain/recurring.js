// Recurring series: the same payee, in the same account and direction, at a regular cadence.
// "Missing" is judged against the dates the account's statements cover, not today, so old imports are not flagged.
import {transactionLabel} from './transaction-labels.js';
const cadences=[{name:'weekly',days:7,months:0,tolerance:2},{name:'monthly',days:30.44,months:1,tolerance:5},{name:'quarterly',days:91.31,months:3,tolerance:10},{name:'yearly',days:365.25,months:12,tolerance:20}];
// Labels that name a channel rather than a payee only group together at an identical amount.
const generic=/^(?:upi (?:payment|credit|transaction)|(?:neft|imps|rtgs) transfer|internal transfer|card (?:payment|credit|bill payment)|automatic (?:debit|credit|payment)|cheque (?:payment|credit|transaction)|atm transaction|cash withdrawal|cash deposit|transaction|bank charges)$/i;
const DAY=86400000,toDay=d=>Date.parse(d+'T00:00:00Z')/DAY,fromDay=n=>new Date(n*DAY).toISOString().slice(0,10);
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function addMonths(date,months){const [y,m,d]=date.split('-').map(Number),t=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10);}
const nextDate=(date,c)=>c.months?addMonths(date,c.months):fromDay(toDay(date)+c.days);
export function seriesKey(t,titleRules=[]){const title=transactionLabel(t,titleRules).title,name=title.toLowerCase().replace(/[^a-z ]+/g,' ').replace(/\s+/g,' ').trim();return name?[t.accountId,t.amount<0?'out':'in',name,generic.test(title)?Math.abs(t.amount):''].join('|'):null;}
function cadenceOf(dates){
 const gaps=dates.slice(1).map((d,i)=>toDay(d)-toDay(dates[i])),typical=median(gaps);
 for(const c of cadences){if(Math.abs(typical-c.days)>c.tolerance)continue;
  // Every gap is one cycle, or two when a single occurrence is absent; most gaps must be a single cycle.
  const steps=gaps.map(g=>{const k=Math.round(g/c.days);return k>=1&&k<=2&&Math.abs(g-k*c.days)<=c.tolerance*k?k:0;});
  if(steps.every(Boolean)&&steps.filter(k=>k===1).length>=Math.ceil(gaps.length*.6))return {...c,skipped:steps.filter(k=>k===2).length};}
 return null;
}
// statements (optional) tell an expected payment that fell between statements from one that is truly absent.
export function detectRecurring(transactions,statements=[],titleRules=[]){
 const groups=new Map(),coverage=new Map(),spans=new Map();
 for(const t of transactions){const s=spans.get(t.statementId);if(!s)spans.set(t.statementId,{from:t.date,to:t.date});else{if(t.date<s.from)s.from=t.date;if(t.date>s.to)s.to=t.date;}}
 const periods=statements.map(s=>({accountId:s.accountId,...(s.from&&s.to?{from:s.from,to:s.to}:spans.get(s.id)||{})})).filter(p=>p.from);
 // A statement can cover days with no activity, including a missing payment or an empty later month.
 for(const p of periods)if(p.to>(coverage.get(p.accountId)||''))coverage.set(p.accountId,p.to);
 const covered=(accountId,date)=>!periods.length||periods.some(p=>p.accountId===accountId&&p.from<=date&&date<=p.to);
 for(const t of transactions){if(t.date>(coverage.get(t.accountId)||''))coverage.set(t.accountId,t.date);const k=seriesKey(t,titleRules);if(k)groups.set(k,[...(groups.get(k)||[]),t]);}
 const series=[];
 for(const [key,list] of groups){
  // One occurrence per day: several same-day orders are not a cadence.
  const byDay=[...new Map([...list].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t])).values()];
  if(byDay.length<2)continue;const c=cadenceOf(byDay.map(t=>t.date));if(!c||byDay.length<(c.name==='yearly'?2:3))continue;
  const amounts=byDay.map(t=>Math.abs(t.amount)),typical=Math.round(median(amounts)),last=byDay.at(-1),next=nextDate(last.date,c),end=coverage.get(last.accountId);
  const expected=toDay(next)+c.tolerance<toDay(end),status=!expected?'active':covered(last.accountId,next)?'missing':'uncovered';
  series.push({key,payee:transactionLabel(last,titleRules).title,accountId:last.accountId,account:last.account,direction:last.amount<0?'out':'in',cadence:c.name,count:byDay.length,skipped:c.skipped,
   typical,varies:Math.max(...amounts)>Math.min(...amounts)*1.15,monthly:Math.round(typical*30.44/c.days),first:byDay[0].date,last:last.date,next,nextAmount:Math.abs(last.amount),
   status,ids:list.map(t=>t.id)});
 }
 return series.sort((a,b)=>a.status.localeCompare(b.status)||b.monthly-a.monthly);
}
