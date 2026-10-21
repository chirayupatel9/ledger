import {summarizeInvestments,fundSchemes,schemeKey} from './investments.js';
import {transactionLabel} from './transaction-labels.js';
import {fmtDate,istDate} from './format.js';
// The Investments page: SIPs, funds and the bank payments behind them (the numbers come from investments.js). Today's
// official NAVs come from the server (/api/navs, from AMFI); each fund scheme is matched automatically when its name, plan and
// option are certain, and otherwise you choose the scheme (saved in the ledger as fundMatches).
export function createInvestmentViews({getState,money,esc,icon,api=null,save=null,render=()=>{},modal=null,bindModal=()=>{},toast=()=>{}}){
 const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
 const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th');
 const monthName=m=>new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'short'});
 const units=u=>(u/10000).toLocaleString('en-IN',{maximumFractionDigits:4});
 const rupees=v=>'₹'+v.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:4});
 const signed=v=>(v>0?'+':v<0?'−':'')+money(Math.abs(v)),pct=v=>{const r=Math.round(v*1000)/10;return (r>0?'+':r<0?'−':'')+Math.abs(r).toLocaleString('en-IN',{maximumFractionDigits:1})+'%';};
 const metric=(label,value,i,note,highlight=false)=>`<div class="metric ${highlight?'highlight':''}"><div class="metric-label">${label}<div class="metric-icon">${icon(i,15)}</div></div><div class="metric-value">${value}</div><div class="metric-foot">${note}</div></div>`;
 // Today's NAVs: fetched when the page shows funds, again when the schemes or your choices change, and hourly.
 let navs=null,navFor='',navAt=0,loading=false,failed=false;
 const wanted=()=>{const s=getState();return JSON.stringify([fundSchemes(s).map(f=>schemeKey(f.scheme)).sort(),s.fundMatches||[]]);};
 function loadNavs(){
  if(!api||loading)return;const key=wanted();if(key===navFor&&Date.now()-navAt<(failed?300000:3600000))return;
  loading=true;api('/api/navs').then(d=>{navs=d;failed=false}).catch(()=>{failed=true}).finally(()=>{loading=false;navFor=key;navAt=Date.now();if(globalThis.document?.querySelector('#page-content .funds-card'))render();});
 }
 const entry=scheme=>navs?.schemes.find(x=>schemeKey(x.scheme)===schemeKey(scheme))||null;
 const live=()=>navs?Object.fromEntries(navs.schemes.filter(x=>x.match).map(x=>[schemeKey(x.scheme),{...x.match,source:x.source}])):null;
 function metrics(s){
  const t=s.totals,c=t.current;
  return `<div class="metrics">${metric('Invested',money(t.invested,true),'investments',s.funds.length?`${plural(s.funds.length,'fund')}${t.stamp?` · ${money(t.stamp)} stamp duty`:''}`:'Paid from your bank accounts')}
   ${metric('Monthly SIPs',money(t.monthlySip,true),'calendar',t.activeSips?plural(t.activeSips,'active SIP'):'No active SIPs found')}
   ${metric('This financial year',money(t.fy,true),'leaf',`Invested in ${s.fy} so far`)}
   ${c?metric('Current value',money(c.value,true),'spark',`${signed(c.gain)}${c.xirr!==null?` · XIRR ${pct(c.xirr)}`:''} · NAV ${fmtDate(c.navDate)}${c.live<s.funds.length?` · ${c.live} of ${s.funds.length} funds at today’s NAV`:''}`,true)
    :t.value!==null?metric('Value at last NAV',money(t.value,true),'spark',`${t.valuedFunds<s.funds.length?`${t.valuedFunds} of ${s.funds.length} funds · `:''}NAVs up to ${fmtDate(t.navDate)}`,true)
    :metric('Redeemed',money(t.redeemed,true),'spark','Import a fund report to see units and value',true)}</div>`;
 }
 function strips(s){
  if(!s.hasFundAccount)return `<div class="review-strip"><div class="review-icon">${icon('upload',18)}</div><div><b>See each fund, its units and its value.</b><p>Add an account of type Investment, then upload the SIP or mutual fund transaction report (Excel) from your distributor, CAMS or KFintech, or for complete holdings a Consolidated Account Statement (CAS) PDF since inception from CAMS or KFintech. A CAS is password-protected: enter its password in the PDF password field. Ledger matches each purchase to the debit from your bank.</p></div><button class="btn" data-page="accounts">Add an Investment account ${icon('chevron',12)}</button></div>`;
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
 // Which AMFI scheme a fund is valued with, and a way to choose or correct it.
 function matchLine(f){
  const x=entry(f.scheme);if(!x)return '';const pick=label=>`<button class="text-link" data-fund-match="${esc(f.scheme)}">${label}</button>`;
  if(x.match){const m=x.match,old=!f.current&&f.unitsKnown&&!f.incomplete;return `<small class="fund-match">AMFI ${m.code} · ${esc([m.plan,m.option].filter(Boolean).join(' · ')||m.name)}${old?` · NAV of ${fmtDate(m.date)} is older than your report’s`:''} · ${pick(x.source==='chosen'?'Change':'Not right?')}</small>`;}
  if(x.source==='none')return `<small class="fund-match">Not matched to an AMFI scheme (your choice) · ${pick('Match')}</small>`;
  if(x.source==='missing')return `<small class="recurring-missing">${icon('alert',11)} The scheme you chose is no longer in AMFI’s list. ${pick('Choose again')}</small>`;
  if(x.ambiguous)return `<small class="recurring-missing">${icon('alert',11)} ${plural(x.fitting,'AMFI scheme')} could be this fund. ${pick('Choose yours')}</small>`;
  return `<small class="fund-match">No AMFI scheme with this name · ${pick('Find it')}</small>`;
 }
 function valueCell(f){
  if(f.current)return `${money(f.current.value)}<small>NAV ${rupees(f.current.nav)} · ${fmtDate(f.current.date)}</small>`;
  return f.value!==null?`${money(f.value)}<small>Report NAV ${rupees(f.nav)} · ${fmtDate(f.navDate)}</small>`:'—';
 }
 function fundsCard(s){
  const note=!api?'':!navs?(failed?' Today’s NAVs could not be loaded, so values use the latest NAV in your reports.':' Checking today’s NAVs…'):!navs.available?' Today’s NAVs from AMFI are not available yet, so values use the latest NAV in your reports.':'';
  return `<div class="card funds-card"><div class="table-toolbar"><div><h2>Your funds</h2><p class="sub">Values use today’s official NAV from AMFI for funds matched to an AMFI scheme, otherwise the latest NAV in your reports.${note} Units count only the transactions in the reports you imported: import reports from your first purchase for complete holdings. The simplest way is one Consolidated Account Statement (CAS) since inception from CAMS or KFintech, which covers every fund house.</p></div></div><div class="table-wrap"><table class="funds-table"><thead><tr><th>Fund</th><th class="amount">Invested</th><th class="amount">Redeemed</th><th class="amount">Units</th><th class="amount">Value</th><th class="amount">Gain</th></tr></thead><tbody>
   ${s.funds.map(f=>`<tr data-fund="${esc(f.scheme)}"><td><div class="desc">${esc(f.scheme)}</div><small>${f.folio?`Folio ${esc(f.folio)} · `:''}${esc(f.account)}${f.sip?` · SIP ${money(f.sip.amount)}/month`:''}</small>${matchLine(f)}</td>
    <td class="amount">${money(f.paid)}${f.stamp?`<small>incl. ${money(f.stamp)} stamp duty</small>`:''}</td><td class="amount">${f.redeemed?money(f.redeemed):'—'}</td>
    <td class="amount">${f.incomplete?'—<small class="units-missing">Earlier purchases are missing: request a CAS since inception from CAMS or KFintech and import it into this Investment account</small>':f.unitsKnown?units(f.units):'—'}${f.averageNav!==null?`<small>Average NAV ${rupees(Math.round(f.averageNav*10000)/10000)}</small>`:''}</td>
    <td class="amount fund-value">${valueCell(f)}</td><td class="amount fund-gain ${f.gain>0?'positive':''}">${f.gain!==null?`${signed(f.gain)}<small>${f.paid?pct(f.gain/f.paid):''}${f.xirr!==null?` · XIRR ${pct(f.xirr)}`:''}</small>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
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
   <li><b>From your SIP report or CAS.</b> Add an account of type Investment, then upload the transaction report (Excel) from your distributor, CAMS or KFintech, or the Consolidated Account Statement (CAS) PDF from CAMS or KFintech, to see each fund’s units, NAV and value. A CAS since inception gives complete holdings. It is password-protected: enter its password in the PDF password field as you upload.</li></ol>
   <div class="bank-actions"><button class="btn primary" data-page="accounts">Add an Investment account</button><button class="btn" data-action="upload">Upload a statement</button></div></div>`;
 }
 function page(){
  const s=summarizeInvestments(getState(),{today:istDate(),navs:live()});
  if(!s.funds.length&&!s.bank.length)return empty();
  if(s.funds.length)loadNavs();
  return metrics(s)+strips(s)+sipsCard(s)+(s.funds.length?fundsCard(s):'')+monthsCard(s)+bankCard(s);
 }
 // Choosing the AMFI scheme for a fund: the likeliest schemes, a search, or no match (value at the reports' NAV).
 const option=(m,checked)=>`<label class="pair-row nav-option"><input type="radio" name="nav-code" value="${m.code}" ${checked?'checked':''}><span><b>${esc(m.name)}</b><small>${esc([m.plan,m.option].filter(Boolean).join(' · ')||'Plan and option not listed')} · ${esc(m.amc)} · AMFI ${m.code}${m.isins?.length?` · ISIN ${esc(m.isins.join(', '))}`:''}</small></span><span class="amount">${rupees(m.nav)}<small>${fmtDate(m.date)}</small></span></label>`;
 const options=(list,code)=>(list.length?list.map(m=>option(m,m.code===code)).join(''):'<p class="sub">No AMFI scheme found. Try fewer words, the AMFI scheme code or the ISIN.</p>')+`<label class="pair-row nav-option"><input type="radio" name="nav-code" value="none" ${code===null?'checked':''}><span><b>Don’t match this fund</b><small>Value it at the latest NAV in your reports</small></span></label>`;
 function choose(scheme){
  const x=entry(scheme),f=fundSchemes(getState()).find(f=>schemeKey(f.scheme)===schemeKey(scheme));if(!x||!modal)return;
  const code=x.source==='none'?null:x.match?.code,shown=new Map(x.candidates.map(m=>[m.code,m]));
  modal('Match to an AMFI scheme',`<p class="sub"><b>${esc(scheme)}</b>${f?.nav?` · last NAV in your reports ${rupees(f.nav)} on ${fmtDate(f.navDate)}`:''}</p><p class="sub">Pick the scheme with the same plan (Direct or Regular) and option (Growth or IDCW). Its NAV should be close to the one in your report.</p>
   <form class="invite-form" id="nav-search"><input class="input" name="q" maxlength="100" placeholder="Scheme name, AMFI code or ISIN" aria-label="Search AMFI schemes"><button class="btn" type="submit">Search</button></form><div id="nav-options" role="radiogroup" aria-label="AMFI schemes">${options(x.candidates,code)}</div>`,
   `<button class="btn" data-action="close">Cancel</button><button class="btn primary" id="nav-save">Save match</button>`);
  bindModal();
  document.querySelector('#nav-search').onsubmit=async e=>{e.preventDefault();const q=new FormData(e.target).get('q').trim();if(!q)return;const box=document.querySelector('#nav-options');
   try{const r=await api('/api/navs/search?q='+encodeURIComponent(q));for(const m of r.schemes)shown.set(m.code,m);box.innerHTML=options(r.schemes,code);}catch(err){toast(err.message)}};
  document.querySelector('#nav-save').onclick=async()=>{
   const v=document.querySelector('#nav-options input[name="nav-code"]:checked')?.value;if(!v){toast('Choose a scheme, or that this fund should not be matched.');return}
   const s=getState(),next=v==='none'?null:+v;s.fundMatches=[...(s.fundMatches||[]).filter(m=>schemeKey(m.scheme)!==schemeKey(scheme)),{scheme:scheme.trim().replace(/\s+/g,' '),code:next}];
   if(!await save(next?'Fund matched to an AMFI scheme':'Fund set to use report NAVs'))return;
   // Shown straight away; the next /api/navs load confirms it.
   Object.assign(x,{match:next?shown.get(next)||null:null,source:next?'chosen':'none',ambiguous:false});navFor='';
   document.querySelector('#modal').close();render();toast(next?'Fund matched. Its value now uses this scheme’s NAV.':'This fund now uses the NAV in your reports.');
  };
 }
 function bind(){document.querySelectorAll('[data-fund-match]').forEach(el=>el.onclick=()=>choose(el.dataset.fundMatch));}
 return {page,bind};
}
