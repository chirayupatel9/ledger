// Official daily NAVs from AMFI (https://www.amfiindia.com/spages/NAVAll.txt) and matching them to the funds in your reports.
// The file is semicolon-separated: a header row, then a heading line for each category and fund house followed by its schemes
// (code; ISIN growth or IDCW payout; ISIN IDCW reinvestment; name; plan; option; NAV; date). Older files have no plan or option.
import {fundSchemes,schemeKey} from './investments.js';
const months={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
function navDate(s){const m=String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})$/);if(!m)return null;const mm=months[m[2].toLowerCase()]||(/^\d+$/.test(m[2])?m[2].padStart(2,'0'):''),iso=`${m[3]}-${mm}-${m[1].padStart(2,'0')}`;return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso?iso:null;}
const isin=s=>/^IN[A-Z0-9]{10}$/.test(s)?s:'',clean=(s,max)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,max);
// Fund houses publish the day's NAVs by 11 PM, a few (overseas funds of funds) the next morning: update at 23:30 and 10:00 IST
// (18:00 and 04:30 UTC; India has no daylight saving).
export function nextNavUpdate(now=new Date()){
 const runs=[[4,30],[18,0]].flatMap(([h,m])=>[0,1].map(d=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+d,h,m)));
 return new Date(Math.min(...runs.filter(t=>t>now.getTime())));
}
export function parseNavFile(text){
 const schemes=new Map();let cols={code:0,isin:1,reinvest:2,name:3,plan:-1,option:-1,nav:4,date:5},amc='',category='',skipped=0;
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;const f=line.split(';').map(s=>s.trim());
  if(f.length<4){const heading=line.match(/schemes?\s*\((.*)\)$/i);if(heading)category=clean(heading[1],120);else amc=clean(line,120);continue;}
  if(/^scheme code$/i.test(f[0])){const at=re=>f.findIndex(h=>re.test(h));cols={code:0,isin:at(/isin.*(?:growth|payout)/i),reinvest:at(/isin.*reinvest/i),name:at(/scheme name/i),plan:at(/^plan$/i),option:at(/^option$/i),nav:at(/net asset value|^nav$/i),date:at(/^date$/i)};continue;}
  const code=/^\d{1,8}$/.test(f[cols.code])?+f[cols.code]:0,nav=/^\d+(?:\.\d+)?$/.test(f[cols.nav]||'')?+f[cols.nav]:0,date=navDate(f[cols.date]||''),name=clean(f[cols.name],300);
  if(!code||!(nav>0)||!date||!name){skipped++;continue;}
  if(schemes.get(code)?.date>date)continue;
  schemes.set(code,{code,isins:[isin(f[cols.isin]||''),isin(f[cols.reinvest]||'')].filter(Boolean),name,plan:clean(f[cols.plan],60),option:clean(f[cols.option],120),amc,category,nav,date});
 }
 return {schemes:[...schemes.values()],skipped};
}
// Names are compared as sets of words once the plan (Direct or Regular), option (Growth, IDCW or Bonus), IDCW frequency and
// payout or reinvestment are read out: "Axis ELSS- Tax Saver Fund; Direct Plan; Growth Option" and "Axis ELSS Tax Saver Fund -
// Direct Growth" are the same scheme. Dividend is the old name for IDCW. "Direct Plan" or "Regular Plan" wins over a bare
// "Regular" elsewhere ("Axis Gilt Fund - Direct Plan - Regular IDCW" is the Direct plan).
const joined={midcap:'mid cap',smallcap:'small cap',largecap:'large cap',multicap:'multi cap',flexicap:'flexi cap',taxsaver:'tax saver'};
const plans={direct:'direct',dir:'direct',regular:'regular',reg:'regular'},options={growth:'growth',gr:'growth',cumulative:'growth',idcw:'idcw',dividend:'idcw',div:'idcw',bonus:'bonus'};
const often={daily:'daily',weekly:'weekly',fortnightly:'fortnightly',monthly:'monthly',quarterly:'quarterly',halfyearly:'halfyearly',annual:'annual',annually:'annual',yearly:'annual',periodic:'periodic'};
const how={payout:'payout',reinvestment:'reinvest',reinvest:'reinvest',transfer:'transfer'},noise=new Set(['plan','plans','option','options','opt','fund','scheme','the','mutual','mf','and','of','an','open','ended']);
export function describeScheme(...parts){
 const words=parts.join(' ').toLowerCase().replace(/&/g,' and ').replace(/\((?:formerly|erstwhile|earlier|previously)[^)]*\)?/g,' ').replace(/income distribution (?:cum|and) capital withdrawal/g,' idcw ').replace(/half[\s-]*yearly/g,' halfyearly ').replace(/[^a-z0-9]+/g,' ').trim().split(' ').flatMap(w=>(joined[w]||w).split(' ')).filter(Boolean);
 let plan='',named='',option='';const freq=new Set(),soft=new Set(),base=new Set();
 words.forEach((w,i)=>{if(plans[w]){plan=plans[w];if(words[i+1]==='plan')named=plan;}else if(options[w])option=options[w];else if(often[w])freq.add(often[w]);else if(how[w])soft.add(how[w]);else if(!noise.has(w))base.add(w);});
 return {plan:named||plan,option,freq,often:[...freq].sort().join(' '),soft,base,key:[...base].sort().join(' ')};
}
// For AMFI rows the plan and option columns win over words in the name ("ICICI Prudential Regular Savings Fund; Direct Plan").
// A former name in the scheme name, "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)", matches too.
const former=/\(\s*(?:formerly(?: known| know)?(?: as)?|erstwhile|earlier|previously)\s+([^)]*)\)?/i;
export function indexSchemes(schemes){
 const list=schemes.map(s=>{
  const d=describeScheme(s.name,s.plan,s.option),was=s.name.match(former);d.plan=describeScheme(s.plan).plan||d.plan;d.option=describeScheme(s.option).option||d.option;
  d.aka=was?describeScheme(s.amc.replace(/mutual fund$/i,''),was[1]).key:'';return {s,d};
 });
 const latest=schemes.reduce((v,s)=>s.date>v?s.date:v,''),recent=latest?new Date(Date.parse(latest+'T00:00:00Z')-30*86400000).toISOString().slice(0,10):'';
 return {list,recent,byCode:new Map(schemes.map(s=>[s.code,s])),byIsin:new Map(schemes.flatMap(s=>s.isins.map(i=>[i,s])))};
}
const dice=(a,b)=>{let n=0;for(const w of a)if(b.has(w))n++;return a.size+b.size?2*n/(a.size+b.size):0;};
// Same name, plan and option. An IDCW without a frequency fits any frequency (and is then ambiguous if there are several).
const fits=(a,b)=>a.plan===b.plan&&a.option===b.option&&(a.often===b.often||(a.option==='idcw'&&[...a.freq].every(f=>b.freq.has(f))));
// The AMFI scheme for a fund in your reports: by ISIN when the report has one, otherwise the one scheme with the same name,
// plan and option (preferring the same IDCW frequency and payout, then schemes with a NAV in the last 30 days). Anything less
// certain is not matched. The same name with the plan or option unstated on either side (AMFI lists some schemes without
// them) makes the match ambiguous: those schemes come first, nearest to the NAV in your report, then similar names.
export function matchScheme({scheme,isin='',nav=null},index,{limit=6}={}){
 const byIsin=isin&&index.byIsin.get(isin);if(byIsin)return {match:byIsin,source:'isin',ambiguous:false,fitting:1,candidates:[byIsin]};
 const want=describeScheme(scheme),active=e=>e.s.date>=index.recent;if(!want.key)return {match:null,source:null,ambiguous:false,fitting:0,candidates:[]};
 const rank=e=>(e.d.often===want.often?4:0)+([...want.soft].every(w=>e.d.soft.has(w))?2:0)+(active(e)?1:0),gap=e=>nav?Math.abs(Math.log(e.s.nav/nav)):0;
 const named=index.list.filter(e=>e.d.key===want.key||e.d.aka===want.key),exact=named.filter(e=>fits(want,e.d)).sort((a,b)=>rank(b)-rank(a)||b.s.date.localeCompare(a.s.date));
 const sure=exact.length===1||(exact.length>1&&rank(exact[0])>rank(exact[1]))?exact[0].s:null;
 const open=(a,b)=>!a||!b||a===b,close=named.filter(e=>!exact.includes(e)&&open(want.plan,e.d.plan)&&open(want.option,e.d.option)).sort((a,b)=>active(b)-active(a)||gap(a)-gap(b));
 const score=e=>dice(want.base,e.d.base)+(e.d.plan===want.plan?.2:0)+(e.d.option===want.option?.2:0)+(e.d.often===want.often?.05:0)+(active(e)?.05:0);
 const first=[...exact,...close],near=index.list.filter(e=>!first.includes(e)&&dice(want.base,e.d.base)>=.5).map(e=>[score(e),e]).sort((a,b)=>b[0]-a[0]).map(([,e])=>e);
 return {match:sure,source:sure?'name':null,ambiguous:!sure&&first.length>0,fitting:first.length,candidates:[...first,...near].slice(0,Math.max(limit,first.length)).map(e=>e.s)};
}
// Search by scheme code, ISIN or words (each word must start a word of the name); recent NAVs first.
export function searchSchemes(query,index,{limit=20}={}){
 const q=String(query||'').trim().slice(0,100);if(!q)return [];
 if(/^\d{1,8}$/.test(q))return index.byCode.has(+q)?[index.byCode.get(+q)]:[];
 if(/^IN[A-Z0-9]{10}$/i.test(q))return index.byIsin.has(q.toUpperCase())?[index.byIsin.get(q.toUpperCase())]:[];
 const want=describeScheme(q),words=[...want.base];if(!words.length)return [];
 return index.list.filter(e=>(!want.plan||e.d.plan===want.plan)&&(!want.option||e.d.option===want.option)&&words.every(w=>[...e.d.base].some(b=>b.startsWith(w))))
  .sort((a,b)=>(b.s.date>=index.recent)-(a.s.date>=index.recent)||a.s.name.localeCompare(b.s.name)||a.d.plan.localeCompare(b.d.plan)||a.d.option.localeCompare(b.d.option)).slice(0,limit).map(e=>e.s);
}
// What the Investments page needs for each fund scheme in your ledger: your own choice (fundMatches; code null = do not
// match), else the automatic match, with the closest schemes to choose from.
export function navsForLedger(state,index){
 const chosen=new Map((state.fundMatches||[]).map(m=>[schemeKey(m.scheme),m.code]));
 // Each distinct fund is matched against the whole AMFI index (~14k schemes), so cap the number processed per call: a
 // real portfolio has at most a few dozen, and without this a ledger stuffed with thousands of unique scheme names
 // would block the single-threaded API for seconds per request.
 return fundSchemes(state).slice(0,400).map(f=>{
  const r=matchScheme(f,index),key=schemeKey(f.scheme);
  if(!chosen.has(key))return {scheme:f.scheme,...r};
  const code=chosen.get(key),s=code?index.byCode.get(code)||null:null;
  return {scheme:f.scheme,match:s,source:code?(s?'chosen':'missing'):'none',ambiguous:false,candidates:s&&!r.candidates.includes(s)?[s,...r.candidates]:r.candidates};
 });
}
