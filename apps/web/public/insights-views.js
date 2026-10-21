import {genericPayee,netWorth,upcomingPayments,categoryTrend,taxProgress,savingsTrend,topPayees,paymentMethods,spendingCalendar,cashFlowWaterfall,unusualActivity,insightCards,monthsUpTo,latestMonth,balanceHistory} from './insights.js';
import {lineChart,stackedBars,barList,progressList,heatmap,waterfall,legend} from './charts.js';
import {categoryLookup} from './categories.js';
import {financialYear} from './tax.js';
import {fmtDate,istDate} from './format.js';
// The dashboard's insight cards and the extra Reports charts (numbers from insights.js, drawing from charts.js).
// They follow the account filter; time charts cover the selected month or financial year, else the last 12 months.
const palette=['#2c6554','#7c9cbf','#c5a15a','#b07a9e','#d88a5a','#6f9a4c','#8a948e','#4f8a8b'];
export function createInsightViews({getState,rows,accountFilter,period,money,esc,icon,investments=()=>null}){
 const today=()=>istDate(),fmt=(v,compact)=>money(v,compact),pct=v=>`${Math.round(v)}%`;
 const monthName=m=>new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'short'});
 const label=key=>key==='Other'?'Other':categoryLookup(getState())(key).label,colour=(key,i)=>key==='Other'?'#b9c0b8':categoryLookup(getState())(key).color||palette[i%palette.length];
 const scoped=()=>{const s=getState(),a=accountFilter();return a==='all'?s:{...s,accounts:s.accounts.filter(x=>x.id===a),transactions:s.transactions.filter(t=>t.accountId===a),statements:s.statements.filter(x=>x.accountId===a)};};
 function span(n=12){
  const p=period(),tx=scoped().transactions;
  if(/^\d{4}-\d{2}$/.test(p))return monthsUpTo(p,n);
  if(p.startsWith('fy-')){const y=+p.slice(3),end=latestMonth(tx.filter(t=>t.date>=`${y}-04-01`&&t.date<`${y+1}-04-01`),today()),last=end<`${y}-04`?`${y}-04`:end>`${y+1}-03`?`${y+1}-03`:end;return monthsUpTo(last,(Number(last.slice(0,4))-y)*12+Number(last.slice(5))-3);}
  const months=monthsUpTo(latestMonth(tx,today()),n),first=tx.reduce((m,t)=>!m||t.date<m?t.date:m,'').slice(0,7),from=months.findIndex(m=>m>=first);
  return from>0?months.slice(Math.min(from,months.length-2)):months;
 }
 const card=(id,title,sub,body,action='')=>`<div class="card insight-card" id="${id}"><div class="card-head"><div><h2>${title}</h2>${sub?`<p class="sub">${sub}</p>`:''}</div>${action}</div><div class="insight-body">${body}</div></div>`;
 const empty=text=>`<p class="sub insight-empty">${text}</p>`;
 // A payee that only names the channel ("UPI payment") is shown with its category, so you can tell what it is.
 const generic=genericPayee;
 // Dashboard
 function insightStrip(){
  const s=scoped(),c=insightCards(s,s.transactions,{today:today(),titleRules:s.titleRules||[],label});if(!c.cards.length)return '';
  const tone={warn:'alert',good:'check',info:'spark'};
  return `<div class="insight-chips" aria-label="What changed">${c.cards.map(x=>`<div class="insight-chip ${x.tone}">${icon(tone[x.tone],14)}<p>${esc(x.text).replace('{amount}',`<b>${esc(money(x.amount||0))}</b>`).replace('{usual}',esc(money(x.usual||0)))}</p></div>`).join('')}</div>`;
 }
 function upcomingCard(){
  const s=scoped(),u=upcomingPayments(s,{today:today()}),banks=balanceHistory(s,{months:[today().slice(0,7)]}).accounts.filter(a=>!a.card),balance=banks.length?banks.reduce((v,a)=>v+a.latest,0):null;
  const body=u.items.length?`<div class="upcoming-list">${u.items.map(i=>`<div class="report-line upcoming"><span><b class="upcoming-date">${esc(new Date(i.date+'T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',day:'numeric',month:'short'}))}</b> ${esc(generic.test(i.payee)&&i.category?`${label(i.category)} · ${i.payee}`:i.payee)}<small class="sub"> · ${esc(i.account)}${i.cadence!=='monthly'?` · ${esc(i.cadence)}`:''}</small>${i.due?' <span class="pill review">Due</span>':''}</span><span>${esc(money(i.amount))} <button class="icon-link not-recurring" data-not-recurring="${esc(i.key)}" data-payee="${esc(i.payee)}" title="Not a recurring payment" aria-label="${esc(i.payee)} is not a recurring payment">${icon('close',11)}</button></span></div>`).join('')}</div>
   <div class="insight-foot"><span>Total <b>${esc(money(u.total))}</b></span>${balance!==null?`<span>Bank balance after these <b>${esc(money(balance-u.total))}</b></span>`:''}</div>`:empty('Regular payments such as EMIs, SIPs, rent and subscriptions appear here once they repeat three times.');
  return card('upcoming-card','Coming up',`Regular payments due in the next 30 days`,body,icon('calendar',18));
 }
 function netWorthCard(){
  const months=span(),inv=accountFilter()==='all'?investments():null,w=netWorth(scoped(),{months,investments:inv}),p=w.points,last=p.at(-1),first=p.find(x=>x.total!==null);
  if(!last||last.total===null)return card('net-worth-card','Net worth','',empty('Add the opening or closing balance of a statement (or import statements with running balances) to see what you own minus what you owe.'));
  const series=[{name:'Net worth',color:'#2c6554',bold:true,values:p.map(x=>x.total)},{name:'Bank',color:'#7c9cbf',values:p.map(x=>x.banks)},{name:'Investments',color:'#b07a9e',values:p.map(x=>x.investments||null)},{name:'Cards owed',color:'#d88a5a',values:p.map(x=>x.cards)}].filter(s=>s.values.some(v=>v!==null&&v!==0));
  const change=first&&first!==last?last.total-first.total:null;
  return card('net-worth-card','Net worth',`<b class="insight-figure">${esc(money(last.total))}</b>${change!==null?` <span class="${change>=0?'up':'down'}">${change>=0?'+':'−'}${esc(money(Math.abs(change)))} since ${esc(monthName(first.month))}</span>`:''}`,
   lineChart({labels:months.map(monthName),series,format:fmt,label:'Net worth by month'})+legend(series)+`<p class="sub insight-note">What you own minus what you owe, at each month end. Investments count at the amount invested${w.latestIsValue?', and at today’s value for the latest month':''}.${w.unknown.length?` Not included (no known balance): ${esc(w.unknown.join(', '))}.`:''}</p>`);
 }
 function categoryTrendCard(){
  const months=span(6),t=categoryTrend(scoped().transactions,{months});
  if(!t.series.length)return card('category-trend-card','Spending by category','',empty('No spending in these months yet.'));
  const series=t.series.map((s,i)=>({name:label(s.key),color:colour(s.key,i),values:s.values}));
  return card('category-trend-card','Spending by category','Each month, your top categories',stackedBars({labels:months.map(monthName),series,format:fmt,label:'Spending by category each month'})+legend(series));
 }
 function taxCard(){
  const p=period(),fy=p.startsWith('fy-')?+p.slice(3):financialYear(today()),t=taxProgress(scoped().transactions,{fy});
  const notes={'80D':'Up to ₹25,000 for you and your family (₹50,000 if a senior citizen), plus as much again for parents.','24(b)':'Counts the whole EMI. Split principal (80C) and interest (24(b)) using your lender’s certificate.'};
  return card('tax-card',`Tax-saving progress · FY ${fy}–${String((fy+1)%100).padStart(2,'0')}`,'Old tax regime deductions, from the tax tags on your payments',
   progressList(t.items.map(i=>({label:i.section,value:i.amount,limit:i.limit,note:[i.limit&&i.remaining?`${money(i.remaining)} left to use before 31 March.`:i.limit&&!i.remaining?'Limit reached.':'',notes[i.section]||'',i.suggested?`${i.suggested} suggested tag${i.suggested>1?'s':''}: check them in Reports.`:''].filter(Boolean).join(' ')})),{format:fmt}),
   `<button class="text-link" data-page="reports">Tax summary ${icon('chevron',12)}</button>`);
 }
 function savingsCard(){
  const months=span(),s=savingsTrend(scoped().transactions,{months}),rates=s.map(x=>x.rate);
  if(!rates.some(v=>v!==null))return card('savings-trend-card','Savings rate','',empty('Your savings rate appears once income is recorded.'));
  const known=rates.filter(v=>v!==null),avg=known.reduce((v,x)=>v+x,0)/known.length;
  return card('savings-trend-card','Savings rate',`Share of income kept each month · average <b>${pct(avg)}</b>`,lineChart({labels:months.map(monthName),series:[{name:'Savings rate',color:'#2c6554',bold:true,values:rates}],format:v=>pct(v),label:'Savings rate by month'}));
 }
 // The chips go under the totals; the cards after the existing charts.
 function dashboard(prefs){
  return {chips:prefs.showInsights?insightStrip():'',cards:
   ((prefs.showNetWorth||prefs.showUpcoming)?`<div class="insight-grid">${prefs.showNetWorth?netWorthCard():''}${prefs.showUpcoming?upcomingCard():''}</div>`:'')+
   ((prefs.showCategoryTrend||prefs.showSavingsTrend)?`<div class="insight-grid">${prefs.showCategoryTrend?categoryTrendCard():''}${prefs.showSavingsTrend?savingsCard():''}</div>`:'')+
   (prefs.showTax?taxCard():'')};
 }
 // Reports
 function payeesCard(){const s=scoped(),p=topPayees(rows(),{titleRules:s.titleRules||[],limit:10});
  return card('payees-card','Top payees',p.payees?`Where the money went · ${p.payees} payees`:'',p.items.length?barList(p.items.map(i=>({label:i.category?`${label(i.category)} · ${i.name}`:i.name,value:i.total,sub:`${i.count} payment${i.count===1?'':'s'} · ${i.share}%`})),{format:fmt}):empty('No spending in this period.'));}
 function methodsCard(){const s=scoped(),months=span(),m=paymentMethods(s.transactions,{months,accounts:s.accounts}),colours={UPI:'#2c6554',Card:'#7c9cbf','Bank transfer':'#c5a15a','Auto-debit':'#b07a9e',Cash:'#d88a5a',Cheque:'#6f9a4c',Other:'#b9c0b8'};
  if(!m.series.length)return card('methods-card','How you pay','',empty('No spending in these months yet.'));
  const series=m.series.map(x=>({name:x.key,color:colours[x.key],values:x.values}));
  return card('methods-card','How you pay','UPI, cards, bank transfers, automatic debits and cash, each month',stackedBars({labels:months.map(monthName),series,format:fmt,label:'Spending by payment method'})+legend(series));}
 function balancesCard(){const months=span(),b=balanceHistory(scoped(),{months});
  if(!b.accounts.length)return card('balances-card','Account balances','',empty('Balances appear once a statement has running balances or a confirmed closing balance.'));
  const series=b.accounts.map((a,i)=>({name:a.name+(a.card?' (owed)':''),color:palette[i%palette.length],values:a.card?a.points.map(v=>v===null?null:-v):a.points}));
  return card('balances-card','Account balances','At each month end',lineChart({labels:months.map(monthName),series,format:fmt,label:'Account balances by month'})+legend(series)+(b.unknown.length?`<p class="sub insight-note">No known balance yet: ${esc(b.unknown.join(', '))}.</p>`:''));}
 function cardsCard(){const months=span(),cards=balanceHistory(scoped(),{months}).accounts.filter(a=>a.card);if(!cards.length)return '';
  const series=cards.map((a,i)=>({name:a.name,color:['#d88a5a','#b07a9e','#c5a15a'][i%3],values:a.points.map(v=>v===null?null:Math.max(0,-v))}));
  return card('cards-card','Credit cards','Amount owed at each month end',`<div class="insight-figures">${cards.map(a=>`<span>${esc(a.name)} <b>${esc(money(Math.max(0,-a.latest)))}</b> ${a.latest>0?'<small class="sub">in credit</small>':'<small class="sub">owed</small>'}</span>`).join('')}</div>`+lineChart({labels:months.map(monthName),series,format:fmt,label:'Credit card balances by month'})+legend(series));}
 function calendarCard(){const tx=scoped().transactions,end=tx.reduce((m,t)=>t.date<=today()&&t.date>m?t.date:m,'')||today(),c=spendingCalendar(tx,{end,weeks:26});
  if(!c.max)return card('calendar-card','Spending calendar','',empty('No spending in the last six months.'));
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return card('calendar-card','Spending calendar',`Each day’s spending, last 26 weeks to ${esc(fmtDate(end))}`,heatmap({days:c.days,max:c.max,format:fmt})+`<div class="insight-weekdays">${c.weekday.map((v,i)=>`<span>${days[i]}<b>${esc(money(v,true))}</b></span>`).join('')}</div><p class="sub insight-note">Average spending on each weekday.</p>`);}
 function waterfallCard(){const s=scoped(),p=period(),month=/^\d{4}-\d{2}$/.test(p)?p:latestMonth(s.transactions,today()),w=cashFlowWaterfall(s,s.transactions,{month});
  if(!w.steps.some(x=>x.value))return card('waterfall-card','Where the month went','',empty('No money in or out this month.'));
  return card('waterfall-card',`Where ${esc(new Date(month+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'long',year:'numeric'}))} went`,w.opening!==null?'From the opening to the closing balance':'Money in and out (add statement balances to see the opening and closing balance)',
   waterfall({opening:w.opening,closing:w.closing,steps:w.steps.map(x=>({...x,label:x.category?label(x.category):x.label})),format:fmt}));}
 function unusualCard(){const s=scoped(),u=unusualActivity(s,{today:today()});
  const kind={large:'Much more than usual',duplicate:'Possible double charge',price:'Price went up'};
  return card('unusual-card','Worth a look','Unusual payments in the last 60 days',u.length?`<div class="unusual-list">${u.map(x=>`<div class="report-line"><span><button class="text-link" data-recurring="${esc(x.payee)}">${esc(x.payee)}</button><small class="sub"> · ${esc(kind[x.kind])} · ${esc(fmtDate(x.date))}${x.usual?` · usually ${esc(money(x.usual))}`:''}</small></span><span>${esc(money(x.amount))}</span></div>`).join('')}</div>`:empty('Nothing unusual. Large one-off charges, possible double charges and price rises show up here.'));}
 function reports(){return `<div class="insight-grid">${payeesCard()}${methodsCard()}</div><div class="insight-grid">${waterfallCard()}${unusualCard()}</div><div class="insight-grid">${balancesCard()}${cardsCard()||calendarCard()}</div>${cardsCard()?calendarCard():''}`;}
 // Each card on its own, for the dashboard and Reports boards (in the order you choose with Customize).
 return {dashboard,reports,parts:{insights:insightStrip,netWorth:netWorthCard,upcoming:upcomingCard,categoryTrend:categoryTrendCard,savingsTrend:savingsCard,tax:taxCard,payees:payeesCard,methods:methodsCard,waterfall:waterfallCard,unusual:unusualCard,balances:balancesCard,cards:cardsCard,calendar:calendarCard}};
}
