import {summarizeInvestments} from './investments.js';
import {transactionLabel} from './transaction-labels.js';
import {fmtDate,istDate} from './format.js';
// The Investments page: SIPs, funds and the bank payments behind them (the numbers come from investments.js).
export function createInvestmentViews({getState,money,esc,icon}){
 const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
 const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');
 const monthName=m=>new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'short'});
 const units=u=>(u/10000).toLocaleString('en-IN',{maximumFractionDigits:4});
 const rupees=v=>'₹'+v.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:4});
 const metric=(label,value,i,note,highlight=false)=>`<div class="metric ${highlight?'highlight':''}"><div class="metric-label">${label}<div class="metric-icon">${icon(i,15)}</div></div><div class="metric-value">${value}</div><div class="metric-foot">${note}</div></div>`;
 function metrics(s){
  const t=s.totals;
  return `<div class="metrics">${metric('Invested',money(t.invested,true),'investments',s.funds.length?`${plural(s.funds.length,'fund')}${t.stamp?` · ${money(t.stamp)} stamp duty`:''}`:'Paid from your bank accounts')}
   ${metric('Monthly SIPs',money(t.monthlySip,true),'calendar',t.activeSips?plural(t.activeSips,'active SIP'):'No active SIPs found')}
   ${metric('This financial year',money(t.fy,true),'leaf',`Invested in ${s.fy} so far`)}
   ${t.value!==null?metric('Value at last NAV',money(t.value,true),'spark',`${t.valuedFunds<s.funds.length?`${t.valuedFunds} of ${s.funds.length} funds · `:''}NAVs up to ${fmtDate(t.navDate)}`,true)
    :metric('Redeemed',money(t.redeemed,true),'spark','Import a fund report to see units and value',true)}</div>`;
 }
 function strips(s){
  if(!s.hasFundAccount)return `<div class="review-strip"><div class="review-icon">${icon('upload',18)}</div><div><b>See each fund, its units and its value.</b><p>Add an account of type Investment, then upload the SIP or mutual fund transaction report (Excel) from your distributor, CAMS or KFintech. Ledger matches each purchase to the debit from your bank.</p></div><button class="btn" data-page="accounts">Add an Investment account ${icon('chevron',12)}</button></div>`;
  const n=s.totals.unmatched;
  return n?`<div class="review-strip transfer-strip"><div class="review-icon">${icon('transactions',18)}</div><div><b>${plural(n,'investment payment')} from your bank ${n===1?'is':'are'} not matched to a fund report.</b><p>Link each one to its purchase so the money is counted once. If a report for that period is missing, import it.</p></div><button class="btn" data-action="pair-transfers">Review and link ${icon('chevron',12)}</button></div>`:'';
 }
 function sipStatus(x){
  if(x.status==='missed')return `<small class="recurring-missing">${icon('alert',11)} Expected around ${fmtDate(x.next)}, but your ${x.source==='fund'?'report':'statement'} up to ${fmtDate(x.coveredTo)} does not show it. It may have been missed or paused.</small>`;
  if(x.status==='stopped')return `<small class="recurring-missing">${icon('alert',11)} No instalment since ${fmtDate(x.last)}. This SIP may have stopped.</small>`;
  return `<small class="sub recurring-next">Next instalment around ${fmtDate(x.next)}</small>`;
 }
 function sipsCard(s){
  const head=`<div class="table-toolbar"><div><h2>Your SIPs</h2><p class="sub">${s.sips.length?(s.totals.activeSips?`<b>${money(s.totals.monthlySip)}</b> a month across ${plural(s.totals.activeSips,'active SIP')}`:'None of your SIPs has a recent instalment.'):'SIPs appear here once a fund report lists SIP purchases, or your bank shows the same investment debit two months running.'}</p></div>${icon('calendar',18)}</div>`;
  return `<div class="card sips-card">${head}${s.sips.map(x=>`<div class="report-line recurring-line" data-sip="${esc(x.name)}"><span><button class="text-link" data-recurring="${esc(x.name)}">${esc(x.name)}</button><small class="sub"> · ${x.folio?`Folio ${esc(x.folio)} · `:''}${esc(x.account)} · ${ordinal(x.day)} of each month · ${plural(x.count,'instalment')} since ${fmtDate(x.first)}</small>${sipStatus(x)}</span><span>${money(x.amount)}<small class="sub">/month</small></span></div>`).join('')}</div>`;
 }
 function fundsCard(s){
  return `<div class="card funds-card"><div class="table-toolbar"><div><h2>Your funds</h2><p class="sub">Units and value count only the transactions in the reports you imported, at the latest NAV in them (not today’s). Import reports from your first purchase for complete holdings.</p></div></div><div class="table-wrap"><table class="funds-table"><thead><tr><th>Fund</th><th class="amount">Invested</th><th class="amount">Redeemed</th><th class="amount">Units</th><th class="amount">Average NAV</th><th class="amount">Value at last NAV</th></tr></thead><tbody>
   ${s.funds.map(f=>`<tr data-fund="${esc(f.scheme)}"><td><div class="desc">${esc(f.scheme)}</div><small>${f.folio?`Folio ${esc(f.folio)} · `:''}${esc(f.account)}${f.sip?` · SIP ${money(f.sip.amount)}/month`:''}</small></td>
    <td class="amount">${money(f.paid)}${f.stamp?`<small>incl. ${money(f.stamp)} stamp duty</small>`:''}</td><td class="amount">${f.redeemed?money(f.redeemed):'—'}</td>
    <td class="amount">${f.incomplete?'—<small>Import earlier reports</small>':f.unitsKnown?units(f.units):'—'}</td><td class="amount">${f.averageNav!==null?rupees(Math.round(f.averageNav*10000)/10000):'—'}</td>
    <td class="amount">${f.value!==null?`${money(f.value)}<small>NAV ${rupees(f.nav)} · ${fmtDate(f.navDate)}</small>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
 }
 function monthsCard(s){
  const max=Math.max(...s.months.map(m=>m.amount),1);
  return `<div class="card months-card"><div class="table-toolbar"><div><h2>Invested each month</h2><p class="sub">Last 12 months · fund purchases and investment debits from your bank, counted once</p></div></div><div class="inv-bars" role="img" aria-label="Amount invested in each of the last 12 months">${s.months.map(m=>`<div class="inv-bar" title="${monthName(m.month)} ${m.month.slice(0,4)}: ${money(m.amount)}"><span style="height:${m.amount?Math.max(3,Math.round(m.amount/max*100)):0}%"></span><small>${monthName(m.month)}</small></div>`).join('')}</div></div>`;
 }
 function bankCard(s){
  if(!s.bank.length)return '';const rules=getState().titleRules||[];
  return `<div class="card bank-investments"><div class="table-toolbar"><div><h2>Investment payments from your bank</h2><p class="sub">${plural(s.bank.length,'payment')} categorised as Investments${s.hasFundAccount?` · ${s.bank.filter(t=>t.matched).length} matched to a fund report`:''}</p></div><button class="text-link" data-page="transactions">View transactions ${icon('chevron',12)}</button></div>
   ${s.bank.slice(0,10).map(t=>`<div class="report-line"><span>${esc(transactionLabel(t,rules).title)}<small class="sub"> · ${esc(t.account)} · ${fmtDate(t.date)}</small></span><span>${money(t.amount)}${s.hasFundAccount?(t.matched?' <span class="pill ok">Matched</span>':' <span class="pill review">Not matched</span>'):''}</span></div>`).join('')}</div>`;
 }
 function empty(){
  return `<div class="card empty-investments"><div class="table-toolbar"><div><h2>No investments yet</h2><p class="sub">Your SIPs and mutual funds show up here in two ways.</p></div>${icon('investments',20)}</div>
   <ol class="inv-steps"><li><b>From your bank statements.</b> SIP debits through NSE Clearing, ICCL, BSE or a fund house are recognised as investments. The same amount two months running shows as a SIP.</li>
   <li><b>From your SIP report.</b> Add an account of type Investment, then upload the transaction report (Excel) from your distributor, CAMS or KFintech to see each fund’s units, NAV and value.</li></ol>
   <div class="bank-actions"><button class="btn primary" data-page="accounts">Add an Investment account</button><button class="btn" data-action="upload">Upload a statement</button></div></div>`;
 }
 function page(){
  const s=summarizeInvestments(getState(),{today:istDate()});
  if(!s.funds.length&&!s.bank.length)return empty();
  return metrics(s)+strips(s)+sipsCard(s)+(s.funds.length?fundsCard(s):'')+monthsCard(s)+bankCard(s);
 }
 return {page};
}
