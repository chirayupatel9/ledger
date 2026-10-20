// SIPs and mutual funds, from two sources:
// - fund reports imported into Investment accounts. Each row's description carries the scheme, folio, units and NAV
//   ("SIP Purchase · Scheme · Folio 123/45 · 13.027 units @ ₹1918.97"), and stamp duty is a row of its own;
// - Investments debits and credits in bank and card accounts (SIPs paid through NSE Clearing, ICCL, BSE or a fund house).
// A bank debit linked to a fund purchase is the same money, so it is counted once, on the fund side.
import {transactionLabel} from './transaction-labels.js';
const DAY=86400000,toDay=d=>Date.parse(d+'T00:00:00Z')/DAY;
const sipKind=/\bsip\b|systematic/i;
const istToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addMonths(date,months){const [y,m,d]=date.split('-').map(Number),t=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10);}
// Units are kept in ten-thousandths so sums stay exact.
export function parseFundRow(t){
 const parts=String(t.description||'').split(' · ').map(s=>s.trim()).filter(Boolean);if(!parts.length)return null;
 const stamp=/^stamp duty$/i.test(parts[0]),folio=(parts.find(p=>/^folio /i.test(p))||'').slice(6).trim();
 const m=parts.map(p=>p.match(/^([\d.]+) units @ ₹([\d.,]+)$/)).find(Boolean),rest=parts.slice(1).filter(p=>!/^folio /i.test(p)&&!/ units @ ₹/.test(p));
 return {stamp,kind:parts[0],scheme:(rest[0]||parts[0]).replace(/\s+/g,' '),folio,units:m?Math.round(parseFloat(m[1])*10000):null,nav:m?parseFloat(m[2].replace(/,/g,'')):null};
}
// A SIP is due a month after its last instalment. It is judged against how far the imported statements or reports
// reach (not today), so an old report does not make every SIP look missed.
function sipState(list,coveredTo){
 const last=list.at(-1),next=addMonths(last.date,1),end=toDay(coveredTo||last.date);
 const status=end<toDay(next)+7?'active':end<toDay(addMonths(last.date,2))+7?'missed':'stopped';
 return {amount:Math.abs(last.amount),day:+last.date.slice(8),count:list.length,first:list[0].date,last:last.date,next,status,coveredTo};
}
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export function summarizeInvestments(state,{today=istToday()}={}){
 const accounts=state.accounts||[],tx=state.transactions||[],names=new Map(accounts.map(a=>[a.id,a.name]));
 const funded=new Set(accounts.filter(a=>a.type==='Investment').map(a=>a.id));
 const coverage=new Map(),reach=(id,date)=>{if(date&&date>(coverage.get(id)||''))coverage.set(id,date);};
 for(const s of state.statements||[])reach(s.accountId,s.to);
 for(const t of tx)reach(t.accountId,t.date);
 // Funds, from Investment accounts.
 const funds=new Map();
 for(const t of tx.filter(t=>funded.has(t.accountId)).sort((a,b)=>a.date.localeCompare(b.date))){
  const r=parseFundRow(t);if(!r||!(r.stamp?t.amount<0:t.category==='Investments'))continue;
  const key=[t.accountId,r.scheme.toLowerCase(),r.folio].join('|');
  let f=funds.get(key);if(!f)funds.set(key,f={key,scheme:r.scheme,folio:r.folio,accountId:t.accountId,account:names.get(t.accountId)||t.account,paid:0,stamp:0,redeemed:0,units:0,bought:0,unitsKnown:true,nav:null,navDate:null,first:t.date,last:t.date,count:0,sipRows:[],ids:[]});
  f.ids.push(t.id);
  if(r.stamp){f.stamp+=-t.amount;continue;}
  f.count++;f.last=t.date;
  if(r.units===null)f.unitsKnown=false;
  if(t.amount>0){f.paid+=t.amount;f.units+=r.units||0;f.bought+=r.units||0;if(sipKind.test(r.kind))f.sipRows.push(t);}
  else{f.redeemed+=-t.amount;f.units-=r.units||0;}
  if(r.nav!==null){f.nav=r.nav;f.navDate=t.date;}
 }
 // Units count only what the imported reports show: a report that starts after the first purchase can redeem more units
 // than it bought (incomplete: import earlier reports), so no value is shown for it.
 const fundList=[...funds.values()].filter(f=>f.count).map(f=>{
  const net=f.paid-f.stamp,incomplete=f.unitsKnown&&f.units<0,known=f.unitsKnown&&!incomplete&&f.nav!==null;
  return {...f,net,incomplete,value:known?Math.round(f.units*f.nav/100):null,averageNav:f.unitsKnown&&f.bought?net/100/(f.bought/10000):null,sip:f.sipRows.length?sipState(f.sipRows,coverage.get(f.accountId)):null};
 }).sort((a,b)=>b.paid-a.paid);
 // Bank and card side. Linked to a fund purchase = already counted with the fund.
 const fundTransfer=new Set(tx.filter(t=>funded.has(t.accountId)&&t.transferId).map(t=>t.transferId));
 const bank=tx.filter(t=>!funded.has(t.accountId)&&t.category==='Investments').sort((a,b)=>b.date.localeCompare(a.date)).map(t=>({...t,matched:!!t.transferId&&fundTransfer.has(t.transferId)}));
 const loose=bank.filter(t=>!t.matched);
 // A bank SIP: the same payee and amount from the same account, about a month apart.
 const groups=new Map();
 for(const t of loose.filter(t=>t.amount<0)){const title=transactionLabel(t,state.titleRules||[]).title,k=[t.accountId,title.toLowerCase(),t.amount].join('|');if(!groups.has(k))groups.set(k,{title,list:[]});groups.get(k).list.push(t);}
 const bankSips=[];
 for(const {title,list} of groups.values()){
  const days=[...new Map([...list].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,t])).values()];if(days.length<2)continue;
  const gap=median(days.slice(1).map((t,i)=>toDay(t.date)-toDay(days[i].date)));if(gap<25||gap>36)continue;
  const t=days.at(-1);bankSips.push({source:'bank',name:title,account:names.get(t.accountId)||t.account,accountId:t.accountId,...sipState(days,coverage.get(t.accountId))});
 }
 const sips=[...fundList.filter(f=>f.sip).map(f=>({source:'fund',name:f.scheme,folio:f.folio,account:f.account,accountId:f.accountId,...f.sip})),...bankSips]
  .sort((a,b)=>(a.status==='stopped')-(b.status==='stopped')||b.amount-a.amount);
 // Totals, months and this financial year (April to March, Indian Standard Time).
 const [y,m]=today.split('-').map(Number),fyStart=`${m<4?y-1:y}-04-01`,fy=`FY ${m<4?y-1:y}–${String((m<4?y:y+1)%100).padStart(2,'0')}`;
 const paidIn=[...tx.filter(t=>funded.has(t.accountId)&&t.category==='Investments'&&t.amount>0),...loose.filter(t=>t.amount<0)].map(t=>({date:t.date,amount:Math.abs(t.amount)}));
 const months=[];for(let i=11;i>=0;i--){const d=addMonths(`${today.slice(0,7)}-01`,-i).slice(0,7);months.push({month:d,amount:paidIn.filter(p=>p.date.startsWith(d)).reduce((v,p)=>v+p.amount,0)});}
 const valued=fundList.filter(f=>f.value!==null);
 return {hasFundAccount:funded.size>0,funds:fundList,sips,bank,months,fy,
  totals:{invested:paidIn.reduce((v,p)=>v+p.amount,0),stamp:fundList.reduce((v,f)=>v+f.stamp,0),redeemed:fundList.reduce((v,f)=>v+f.redeemed,0)+loose.filter(t=>t.amount>0).reduce((v,t)=>v+t.amount,0),
   fy:paidIn.filter(p=>p.date>=fyStart).reduce((v,p)=>v+p.amount,0),monthlySip:sips.filter(s=>s.status==='active').reduce((v,s)=>v+s.amount,0),activeSips:sips.filter(s=>s.status==='active').length,
   value:valued.length?valued.reduce((v,f)=>v+f.value,0):null,valuedFunds:valued.length,navDate:valued.map(f=>f.navDate).sort().at(-1)||null,
   unmatched:loose.filter(t=>t.amount<0).length}};
}
