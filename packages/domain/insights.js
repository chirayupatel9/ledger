// Dashboard and report insights, computed in the browser from the ledger. Amounts are integer paise; months are YYYY-MM
// and "today" is Indian Standard Time. Spending is Expense rows net of Refunds; transfers between your own accounts and
// investments are not spending.
import {transactionLabel} from './transaction-labels.js';
import {detectRecurring,dismissedKeys} from './recurring.js';
import {taxSummary,financialYear} from './tax.js';
import {summarize} from './core.js';
import {statementBalances,addDays} from './books.js';
import {addMonths} from './investments.js';
import {budgetAlerts} from './budgets.js';
const istToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const monthsUpTo=(month,n)=>Array.from({length:n},(_,i)=>addMonths(month+'-01',i-n+1).slice(0,7));
const monthEnd=m=>addDays(addMonths(m+'-01',1),-1);
const spend=t=>t.type==='Expense'||t.type==='Refund'?-t.amount:0;
const byMonth=(rows,months,value)=>{const map=new Map(months.map(m=>[m,0]));for(const t of rows){const m=t.date.slice(0,7);if(map.has(m))map.set(m,map.get(m)+value(t));}return months.map(m=>map.get(m));};
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
// A payee name that only says how money moved ("UPI payment", "Automatic debit"): such payments are told apart by category.
export const genericPayee=/^(?:upi|card|bank|neft|imps|rtgs|automatic|cheque|wallet)\s+(?:payment|transfer|debit|credit|transaction)$|^payment$/i;
// The latest month that has transactions, so a ledger whose statements end last month still shows a full picture.
export const latestMonth=(rows,today=istToday())=>rows.reduce((m,t)=>t.date<=today&&t.date.slice(0,7)>m?t.date.slice(0,7):m,'')||today.slice(0,7);

// Balance of each bank and card account at the end of each month. A balance needs an anchor: the closing balance you
// confirmed for a statement, or one worked out from the statement's running balances. Investment accounts are left out
// (see netWorth). Card balances are negative when you owe money.
export function balanceHistory(state,{months}){
 const accounts=(state.accounts||[]).filter(a=>a.type!=='Investment'),out=[],unknown=[];
 for(const a of accounts){
  const txns=(state.transactions||[]).filter(t=>t.accountId===a.id).sort((x,y)=>x.date.localeCompare(y.date));if(!txns.length)continue;
  const through=date=>txns.reduce((v,t)=>t.date<=date?v+t.amount:v,0);
  let anchor=null;
  for(const s of (state.statements||[]).filter(s=>s.accountId===a.id).sort((x,y)=>(y.to||'').localeCompare(x.to||''))){
   if(Number.isSafeInteger(s.closing)&&s.to){anchor={date:s.to,balance:s.closing};break;}
   const rows=txns.filter(t=>t.statementId===s.id),order=(state.transactions||[]).filter(t=>t.statementId===s.id),b=order.length&&statementBalances(order);
   if(b&&rows.length){anchor={date:rows.at(-1).date,balance:b.closing};break;}
  }
  if(!anchor){unknown.push(a.name);continue;}
  const offset=anchor.balance-through(anchor.date),first=txns[0].date.slice(0,7);
  out.push({id:a.id,name:a.name,type:a.type,card:a.type==='Credit card',points:months.map(m=>m<first?null:offset+through(monthEnd(m))),latest:offset+through('9999-12-31')});
 }
 return {months,accounts:out,unknown};
}

// What you own minus what you owe: bank balances, card balances (negative when owed) and investments. Investments count
// at the amount invested (fund purchases less redemptions, plus SIP debits not matched to a fund report); the latest
// month uses today's value when the Investments page has one.
export function netWorth(state,{months,investments=null}){
 const history=balanceHistory(state,{months}),funded=new Set((state.accounts||[]).filter(a=>a.type==='Investment').map(a=>a.id));
 const fundRows=(state.transactions||[]).filter(t=>funded.has(t.accountId)),loose=(investments?.bank||[]).filter(t=>!t.matched);
 const fundCost=m=>fundRows.reduce((v,t)=>t.date<=monthEnd(m)?v+t.amount:v,0),looseCost=m=>loose.reduce((v,t)=>t.date<=monthEnd(m)?v-t.amount:v,0);
 const sum=(list,i)=>{const known=list.map(a=>a.points[i]).filter(v=>v!==null);return known.length?known.reduce((v,x)=>v+x,0):null;};
 const banks=history.accounts.filter(a=>!a.card),cards=history.accounts.filter(a=>a.card),worth=investments?.totals?.current?.value??investments?.totals?.value??null;
 const points=months.map((m,i)=>{const inv=(i===months.length-1&&worth!==null?worth:fundCost(m))+looseCost(m),b=sum(banks,i),c=sum(cards,i);
  return {month:m,banks:b,cards:c,investments:inv,total:b===null&&c===null&&!inv?null:(b||0)+(c||0)+inv};});
 return {points,unknown:history.unknown,latestIsValue:worth!==null,accounts:history.accounts};
}

// Regular payments (EMIs, SIPs, rent, subscriptions) due in the next `days`, from the recurring payments Ledger found.
// One that was due in the last three days and has not shown up yet is listed as due.
export function upcomingPayments(state,{today=istToday(),days=30}={}){
 const end=addDays(today,days),soon=addDays(today,-3),items=[];
 for(const s of detectRecurring(state.transactions||[],state.statements||[],state.titleRules||[],{dismissed:dismissedKeys(state)})){
  if(s.direction!=='out'||s.status==='missing')continue;
  const category=(state.transactions||[]).find(t=>t.id===s.ids.at(-1))?.category||null;
  for(let date=s.next,n=0;date<=end&&n<120;n++){if(date>=soon)items.push({date,key:s.key,payee:s.payee,category,account:s.account,accountId:s.accountId,amount:s.nextAmount,cadence:s.cadence,due:date<today});
   date=s.cadence==='weekly'?addDays(date,7):s.cadence==='monthly'?addMonths(date,1):s.cadence==='quarterly'?addMonths(date,3):addMonths(date,12);}
 }
 items.sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount);
 return {items,total:items.reduce((v,i)=>v+i.amount,0),from:today,to:end};
}

// Spending in the top categories each month, the rest as Other.
export function categoryTrend(rows,{months,top=5}){
 const totals=new Map();for(const t of rows){if(!spend(t)||!months.includes(t.date.slice(0,7)))continue;totals.set(t.category,(totals.get(t.category)||0)+spend(t));}
 const keys=[...totals].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k])=>k),shown=keys.slice(0,top),rest=new Set(keys.slice(top));
 const series=shown.map(k=>({key:k,values:byMonth(rows.filter(t=>t.category===k),months,spend)}));
 if(rest.size)series.push({key:'Other',values:byMonth(rows.filter(t=>rest.has(t.category)),months,spend)});
 return {months,series:series.map(s=>({...s,values:s.values.map(v=>Math.max(0,v))}))};
}

// Old-regime deductions this financial year against their limits, from the tax tags on your payments.
const limits={'80C':15000000,'80CCD(1B)':5000000,'80D':2500000,'24(b)':20000000};
export function taxProgress(rows,{fy}){
 const inYear=rows.filter(t=>financialYear(t.date)===fy),s=taxSummary(inYear),by=new Map(s.deductions.map(d=>[d.section,d]));
 const sections=['80C','80CCD(1B)','80D','24(b)','80E','80G','HRA / 80GG'];
 return {fy,items:sections.map(section=>{const d=by.get(section),amount=Math.max(0,d?.amount||0),limit=limits[section]??null;
  return {section,label:d?.label||section,amount,limit,remaining:limit===null?null:Math.max(0,limit-amount),suggested:d?.suggested||0,count:d?.count||0};}).filter(i=>i.amount||i.limit)};
}

// Income, spending and the share kept, month by month.
export function savingsTrend(rows,{months}){
 return months.map(m=>{const s=summarize(rows.filter(t=>t.date.startsWith(m)));return {month:m,income:s.income,expenses:s.expenses,rate:s.income>0?Math.round((s.income-s.expenses)/s.income*1000)/10:null};});
}

// Where the money goes, by payee (the transaction's readable name).
export function topPayees(rows,{titleRules=[],limit=10}={}){
 const map=new Map();
 for(const t of rows){const v=spend(t);if(!v)continue;const name=transactionLabel(t,titleRules).title,generic=genericPayee.test(name),key=generic?name+'|'+t.category:name,p=map.get(key)||{name,category:generic?t.category:null,total:0,count:0,last:''};p.total+=v;if(t.type==='Expense')p.count++;if(t.date>p.last)p.last=t.date;map.set(key,p);}
 const list=[...map.values()].filter(p=>p.total>0).sort((a,b)=>b.total-a.total),all=list.reduce((v,p)=>v+p.total,0);
 return {items:list.slice(0,limit).map(p=>({...p,share:all?Math.round(p.total/all*1000)/10:0})),total:all,payees:list.length};
}

// How you pay for what you spend: UPI, cards, bank transfers, automatic debits, cash, cheques.
export const methods=['UPI','Card','Bank transfer','Auto-debit','Cash','Cheque','Other'];
export function paymentMethod(t,accounts){
 const card=(accounts||[]).find(a=>a.id===t.accountId)?.type==='Credit card',channel=transactionLabel(t).channel;
 if(card||channel==='POS'||channel==='ECOM')return 'Card';
 return {UPI:'UPI',NEFT:'Bank transfer',IMPS:'Bank transfer',RTGS:'Bank transfer',NACH:'Auto-debit',ACH:'Auto-debit',ECS:'Auto-debit',ATM:'Cash',CHQ:'Cheque'}[channel]||(/\b(?:cash|atm|cdm)\b/i.test(t.description)?'Cash':'Other');
}
export function paymentMethods(rows,{months,accounts}){
 const out=t=>t.type==='Expense'||(t.amount<0&&t.category==='Cash withdrawal');
 const series=methods.map(key=>({key,values:byMonth(rows.filter(t=>out(t)&&paymentMethod(t,accounts)===key),months,t=>-t.amount)})).filter(s=>s.values.some(Boolean));
 return {months,series,totals:Object.fromEntries(series.map(s=>[s.key,s.values.reduce((v,x)=>v+x,0)]))};
}

// Spending by day, for a calendar heatmap: the `weeks` weeks (Monday to Sunday) ending on `end`.
export function spendingCalendar(rows,{end,weeks=26}){
 const last=new Date(end+'T00:00:00Z'),sunday=addDays(end,(7-last.getUTCDay())%7),start=addDays(sunday,-(weeks*7-1)),day=new Map();
 for(const t of rows){if(t.date<start||t.date>sunday)continue;const v=spend(t);if(v)day.set(t.date,(day.get(t.date)||0)+v);}
 const days=Array.from({length:weeks*7},(_,i)=>{const date=addDays(start,i);return {date,value:Math.max(0,day.get(date)||0),future:date>end};});
 const weekday=[0,1,2,3,4,5,6].map(d=>{const list=days.filter((x,i)=>i%7===d&&!x.future);return list.length?Math.round(list.reduce((v,x)=>v+x.value,0)/list.length):0;});
 return {start,end:sunday,days,weekday,max:Math.max(0,...days.map(d=>d.value))};
}

// One month of money, from the balance at the start to the balance at the end: income in, spending by category out,
// money moved to investments, and other transfers (to accounts without a known balance, cash and so on).
export function cashFlowWaterfall(state,rows,{month,top=5}){
 const inMonth=rows.filter(t=>t.date.startsWith(month)),s=summarize(inMonth),cats=new Map();
 for(const t of inMonth){const v=spend(t);if(v)cats.set(t.category,(cats.get(t.category)||0)+v);}
 const sorted=[...cats].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]),shown=sorted.slice(0,top),other=sorted.slice(top).reduce((v,[,x])=>v+x,0);
 const invested=-inMonth.filter(t=>t.category==='Investments'&&(state.accounts||[]).find(a=>a.id===t.accountId)?.type!=='Investment').reduce((v,t)=>v+t.amount,0);
 const history=balanceHistory(state,{months:[addMonths(month+'-01',-1).slice(0,7),month]}),known=history.accounts.filter(a=>a.points[0]!==null&&a.points[1]!==null);
 const opening=known.length?known.reduce((v,a)=>v+a.points[0],0):null,closing=known.length?known.reduce((v,a)=>v+a.points[1],0):null;
 const steps=[{label:'Income',value:s.income,kind:'up'},...shown.map(([k,v])=>({label:k,value:-v,kind:'down',category:k})),...(other?[{label:'Other spending',value:-other,kind:'down'}]:[]),...(invested?[{label:'Invested',value:-invested,kind:'down'}]:[])];
 if(opening!==null){const explained=steps.reduce((v,x)=>v+x.value,0),rest=closing-opening-explained;if(rest)steps.push({label:'Other transfers',value:rest,kind:rest>0?'up':'down'});}
 return {month,opening,closing,steps,income:s.income,expenses:s.expenses};
}

// Things worth a look: a payment far above what you usually pay that payee, a possible double charge, and a regular
// payment whose amount went up.
export function unusualActivity(state,{today=istToday(),titleRules=state.titleRules||[],days=60}={}){
 const since=addDays(today,-days),out=[],tx=(state.transactions||[]).filter(t=>t.type==='Expense'),name=t=>transactionLabel(t,titleRules).title,groups=new Map();
 for(const t of tx){const k=name(t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
 for(const [payee,list] of groups){
  const sorted=list.sort((a,b)=>a.date.localeCompare(b.date));
  for(const t of sorted.filter(t=>t.date>=since)){const before=sorted.filter(x=>x.date<t.date).map(x=>-x.amount);if(before.length<3)continue;const usual=median(before);
   if(-t.amount>usual*2.5&&-t.amount-usual>=200000)out.push({kind:'large',date:t.date,payee,amount:-t.amount,usual,id:t.id,account:t.account});}
  for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(b.date>=since&&a.accountId===b.accountId&&a.amount===b.amount&&-b.amount>=50000&&Math.abs(Date.parse(b.date)-Date.parse(a.date))<=2*864e5&&a.id!==b.id&&!(a.ref&&b.ref&&a.ref!==b.ref))out.push({kind:'duplicate',date:b.date,payee,amount:-b.amount,ids:[a.id,b.id],account:b.account});}
 }
 for(const s of detectRecurring(state.transactions||[],state.statements||[],titleRules,{dismissed:dismissedKeys(state)})){
  if(s.direction!=='out'||s.status==='missing'||s.last<since)continue;const list=(state.transactions||[]).filter(t=>s.ids.includes(t.id)).sort((a,b)=>a.date.localeCompare(b.date));if(list.length<3)continue;
  const now=-list.at(-1).amount,was=median(list.slice(0,-1).map(t=>-t.amount));if(now>was*1.1&&now-was>=5000)out.push({kind:'price',date:s.last,payee:s.payee,amount:now,usual:was,account:s.account});
 }
 return out.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
}

// Short plain sentences for the top of the dashboard: what changed since last month and what stands out.
export function insightCards(state,rows,{today=istToday(),titleRules=state.titleRules||[],label=c=>c}={}){
 const month=latestMonth(rows,today),prev=addMonths(month+'-01',-1).slice(0,7),cards=[],name=m=>new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'long'});
 const cat=m=>{const map=new Map();for(const t of rows){if(!t.date.startsWith(m))continue;const v=spend(t);if(v)map.set(t.category,(map.get(t.category)||0)+v);}return map;};
 const now=cat(month),before=cat(prev);
 const changes=[...new Set([...now.keys(),...before.keys()])].map(k=>({k,diff:(now.get(k)||0)-(before.get(k)||0),was:before.get(k)||0})).filter(c=>Math.abs(c.diff)>=100000&&(c.was===0||Math.abs(c.diff)/c.was>=.25)).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
 const up=changes.find(c=>c.diff>0),down=changes.find(c=>c.diff<0);
 if(up)cards.push({kind:'up',tone:'warn',category:up.k,amount:up.diff,text:`${label(up.k)}: ${up.was?'up':'new spending of'} {amount} in ${name(month)} compared with ${name(prev)}.`});
 if(down)cards.push({kind:'down',tone:'good',category:down.k,amount:-down.diff,text:`${label(down.k)}: down {amount} in ${name(month)} compared with ${name(prev)}.`});
 const a=summarize(rows.filter(t=>t.date.startsWith(month))),b=summarize(rows.filter(t=>t.date.startsWith(prev)));
 if(a.income>0&&b.income>0){const r=Math.round(a.savings),p=Math.round(b.savings);if(r!==p)cards.push({kind:'savings',tone:r>p?'good':'warn',text:`You kept ${r}% of your income in ${name(month)}, ${r>p?'up':'down'} from ${p}% in ${name(prev)}.`});}
 const biggest=rows.filter(t=>t.date.startsWith(month)&&t.type==='Expense').sort((x,y)=>x.amount-y.amount)[0];
 const called=t=>{const title=transactionLabel(t,titleRules).title;return genericPayee.test(title)?`${label(t.category)} (${title})`:title;};
 if(biggest)cards.push({kind:'largest',tone:'info',amount:-biggest.amount,text:`Largest expense in ${name(month)}: ${called(biggest)}, {amount}.`});
 // New means it started recently and at least two months after that account's records begin.
 const starts=new Map();for(const t of state.transactions||[])if(!starts.has(t.accountId)||t.date<starts.get(t.accountId))starts.set(t.accountId,t.date);
 const fresh=detectRecurring(state.transactions||[],state.statements||[],titleRules,{dismissed:dismissedKeys(state)}).filter(s=>s.direction==='out'&&s.status!=='missing'&&s.first>=addDays(today,-100)&&s.first>=addDays(starts.get(s.accountId)||s.first,60)).sort((x,y)=>y.monthly-x.monthly)[0];
 if(fresh)cards.push({kind:'new-regular',tone:'info',amount:fresh.monthly,text:`New regular payment: ${fresh.payee}, about {amount} a month since ${new Date(fresh.first+'T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',day:'numeric',month:'short'})}.`});
 const odd=unusualActivity(state,{today,titleRules})[0];
 if(odd)cards.push({kind:'unusual',tone:'warn',amount:odd.amount,usual:odd.usual,text:odd.kind==='large'?`${odd.payee} charged {amount}, much more than the usual {usual}.`:odd.kind==='duplicate'?`Possible double charge: ${odd.payee}, {amount} twice.`:`${odd.payee} went up to {amount} from {usual}.`});
 // Budgets you went over or nearly used up this month come first.
 return {month,previous:prev,cards:[...budgetAlerts(state,{today,label}).slice(0,2),...cards].slice(0,5)};
}
