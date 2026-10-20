// Mutual fund Consolidated Account Statements (CAS) from CAMS and KFintech. Each scheme section has a folio, the scheme
// name with its ISIN, an opening unit balance, dated rows (amount, units, NAV, unit balance; brackets are negative) and
// a closing unit balance. Rows come out in the fund report format ("SIP Purchase · Scheme · Folio 123/45 · 13.027 units
// @ ₹1918.97", stamp duty as its own row), so the Investments page reads them like any other fund report.
import {parseDate} from './core.js';
import {parseFundRow} from './investments.js';
const lineText=line=>line.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
const casDate=/^(\d{1,2}[-/](?:[A-Za-z]{3}|\d{2})[-/]\d{4})\s+(.*)$/,figure=/^\(?-?[\d,]*\d\.\d+\)?$/,schemeCode=/^(?=[A-Z]*\d)[A-Z0-9]{1,12}\s*-\s*(?=[A-Za-z])/;
const signed=t=>(/^[(-]/.test(t)?-1:1)*Number(t.replace(/[(),\s-]/g,'')),paise=t=>Math.abs(Math.round(signed(t)*100)),units=t=>Math.round(signed(t)*10000);
export const looksLikeCAS=text=>/consolidated account statement/i.test(text)&&/opening unit balance/i.test(text)&&/closing unit balance/i.test(text)||/consolidated account summary/i.test(text)&&/folio/i.test(text);
// "A1FCG-Alpha Flexi Cap Fund - Regular Growth (Non-Demat) - ISIN: INF000A01AA1(Advisor: ARN-1) Registrar : CAMS".
const schemeName=s=>s.split(/\bISIN\b/i)[0].replace(/\((?:non-demat|demat)\)|\(formerly[^)]*\)/gi,' ').replace(schemeCode,'').replace(/·/g,'-').replace(/\s+/g,' ').replace(/[\s-]+$/,'').trim();
// The fund report's words for each kind of row, so labels, SIP detection and bank matching treat both sources alike.
// A purchase that takes units away is a reversal.
const kinds=[['Switch',/switch|lateral shift/i],['STP',/\bstp\b|systematic transfer/i],['SWP',/\bswp\b|systematic withdrawal/i,-1],['Dividend Reinvestment',/reinvest/i,1],['SIP Purchase',/\bsip\b|systematic/i,1],['Redemption',/redemption|redeem|repurchase/i,-1],['Purchase',/purchase|investment/i,1]];
function kindOf(text,sign){const k=kinds.find(([,re])=>re.test(text));if(!k)return text||'Transaction';const [name,,natural]=k;
 if(!natural){const into=/\bin\b|-in\b/i.test(text)?1:/\bout\b|-out\b/i.test(text)?-1:sign;return `${name} ${into>0?'In':'Out'}${into!==sign?' reversal':''}`;}
 return natural===sign?name:name+' reversal';}
const taxOf=text=>/stamp duty/i.test(text)?'Stamp duty':/\bstt\b|securities transaction tax/i.test(text)?'STT':/\btds\b|tax deducted/i.test(text)?'TDS':null;
export function parseCASLines(pages,account){
 const text=pages.flat().map(lineText).join('\n'),schemes=[],invalid=[],left={payouts:0,other:0};let folio='',open=null,prev='';
 const p=text.match(/(\d{1,2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i),from=p&&parseDate(p[1]),to=p&&parseDate(p[2]);
 pages.forEach((lines,pi)=>lines.forEach((line,li)=>{const t=lineText(line),where=`page ${pi+1}, line ${li+1}`;
  if(/^folio\s*no\b/i.test(t)){folio=(t.match(/^folio\s*no\.?\s*:?\s*([\w-]+(?:\s*\/\s*[\w-]+)?)/i)?.[1]||'').replace(/\s+/g,'');open=null;}
  // A long scheme name can wrap: its first line starts with the scheme code, the ISIN is on the next.
  else if(folio&&/\bISIN\b/i.test(t))schemes.push(open={folio,scheme:schemeName(!schemeCode.test(t)&&schemeCode.test(prev)?prev+' '+t:t),opening:0,closing:null,rows:[]});
  else if(open&&/opening unit balance/i.test(t))open.opening=units(t.match(/opening unit balance\s*:?\s*(\(?-?[\d,]*\.?\d+\)?)/i)?.[1]||'0');
  else if(open&&/closing unit balance/i.test(t)){const m=t.match(/closing unit balance\s*:?\s*(\(?-?[\d,]*\.?\d+\)?)/i);open.closing=m?units(m[1]):null;open=null;}
  else if(open&&casDate.test(t)){
   const [,d,rest]=t.match(casDate),date=parseDate(d),tokens=rest.split(' '),nums=[];
   while(nums.length<4&&tokens.length&&figure.test(tokens.at(-1)))nums.unshift(tokens.pop());
   const words=tokens.join(' ').replace(/\*+/g,' ').replace(/·/g,'-').replace(/\s+/g,' ').trim();
   if(/^to\b/i.test(words)||!nums.length){prev=t;return;} // A period line, or a note such as "*** Address updated ***".
   if(!date||(nums.length!==1&&nums.length!==4)){invalid.push(where);prev=t;return;}
   if(nums.length===1){const tax=taxOf(words);if(tax)open.rows.push({date,where,words,tax,amount:paise(nums[0])});else left[/idcw|dividend|payout/i.test(words)?'payouts':'other']++;prev=t;return;}
   const [amount,count,nav,balance]=nums;open.rows.push({date,where,words,amount:paise(amount),negative:/^[(-]/.test(amount),units:units(count),unitsText:count.replace(/[(),\s-]/g,''),nav:nav.replace(/[(),\s]/g,''),balance:units(balance)});
  }
  prev=t;
 }));
 // Units decide the direction. The running unit balance settles it when a statement leaves the units unbracketed.
 // Stamp duty belongs to a purchase on the same day, STT and TDS to a redemption: the nearest such row in the scheme.
 for(const s of schemes){let last=s.opening;s.breaks=0;
  for(const r of s.rows)if(!r.tax){const u=Math.abs(r.units);r.sign=last-u===r.balance?-1:last+u===r.balance?1:r.units<0||r.negative?-1:1;if(last+r.sign*u!==r.balance)s.breaks++;last=r.balance;}
  s.rows.forEach((r,i)=>{if(!r.tax)return;const want=r.tax==='Stamp duty'?1:-1;let best=null;
   s.rows.forEach((x,j)=>{if(x.tax||!x.units||x.sign!==want||x.date!==r.date||x.taxed?.[r.tax])return;const d=Math.abs(j-i)+(j>i?0.5:0);if(!best||d<best.d)best={x,d};});
   if(best){best.x.taxed={...best.x.taxed,[r.tax]:true};best.x.taxes=(best.x.taxes||0)+r.amount;}});
 }
 const transactions=[],folioPart=s=>s.folio?['Folio '+s.folio]:[];
 const checks=schemes.map(s=>{const own=[];
  for(const r of s.rows){
   if(r.tax){own.push({id:crypto.randomUUID(),date:r.date,description:[r.tax,s.scheme,...folioPart(s)].join(' · '),amount:-r.amount,account,category:'Taxes',type:'Expense',review:false});continue;}
   if(!r.units||!r.amount||!r.date){invalid.push(r.where);continue;}
   const net=r.amount-(r.taxes||0),amount=r.sign>0?r.amount+(r.taxes||0):-(net>0?net:r.amount);
   own.push({id:crypto.randomUUID(),date:r.date,description:[kindOf(r.words,r.sign),s.scheme,...folioPart(s),`${r.unitsText} units @ ₹${r.nav}`].join(' · '),amount,account,category:'Investments',type:'Transfer',review:true});
  }
  transactions.push(...own);
  // Read the units back the way the Investments page will, from the descriptions just written.
  const total=own.reduce((v,t)=>{const f=parseFundRow(t);return t.category==='Investments'&&f.units!==null?v+(t.amount>0?f.units:-f.units):v;},s.opening);
  return {scheme:s.scheme,folio:s.folio,opening:s.opening,closing:s.closing,units:total,rows:own.length,breaks:s.breaks,ok:s.closing!==null&&total===s.closing};
 });
 const warnings=[`Mutual fund Consolidated Account Statement: ${schemes.length} scheme${schemes.length===1?'':'s'} in ${new Set(schemes.map(s=>s.folio)).size} folio${new Set(schemes.map(s=>s.folio)).size===1?'':'s'}. Purchases are recorded at the amount debited from your bank (amount plus stamp duty), with stamp duty as its own charge; redemptions and switches out are money out, net of STT. All rows are marked for review.`];
 if(!schemes.length)warnings.push('No scheme sections with transactions were found. Request the detailed CAS (not the summary) from CAMS or KFintech.');
 if(left.payouts)warnings.push(`${left.payouts} IDCW (dividend) payout${left.payouts===1?' was':'s were'} left out: payouts don’t change your units, and the money is recorded when it reaches your bank account.`);
 if(left.other)warnings.push(`${left.other} row${left.other===1?'':'s'} with an amount but no units ${left.other===1?'was':'were'} left out. Check the original statement if you expected a transaction there.`);
 return {transactions,invalid,warnings,layout:'cas',cas:checks,period:from&&to&&from<=to?{from,to}:null,openingHint:null,closingHint:null};
}
// A fund report and a CAS name the same purchase differently ("Alpha Flexi Cap Fund - Regular Plan - Growth" and
// "Alpha Flexi Cap Fund - Regular Growth"). Rows of one account with the same date, folio, direction and units (stamp
// duty: the same amount) are the same transaction. Imported rows take the scheme name already in the ledger, so a fund
// is not split in two.
export function matchFundRows(existing,incoming){
 const key=(t,r)=>r&&(r.stamp||r.units!==null&&t.category==='Investments')?[t.accountId,t.date,r.folio.replace(/\s+/g,'').split('/')[0].toLowerCase(),r.stamp?'stamp '+t.amount:(t.amount>0?'+':'-')+r.units].join('|'):null;
 const seen=new Map();for(const t of existing){const r=parseFundRow(t),k=key(t,r);if(k)(seen.get(k)||seen.set(k,[]).get(k)).push(r.scheme);}
 const names=new Map(),rows=incoming.map(t=>{const r=parseFundRow(t),k=key(t,r),match=k?seen.get(k)?.shift():undefined;if(match&&!r.stamp)names.set(r.scheme.toLowerCase()+'|'+r.folio,match);return {t,r,duplicate:match!==undefined};});
 return rows.map(({t,r,duplicate})=>{const name=r&&names.get(r.scheme.toLowerCase()+'|'+r.folio),parts=t.description.split(' · ');if(name&&parts[1]?.trim()===r.scheme)parts[1]=name;return {...t,description:parts.join(' · '),duplicate};});
}
