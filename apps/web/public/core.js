import {transactionLabel} from './transaction-labels.js';
const palette={'Salary':'#426e59','Freelance & business':'#588d79','Interest':'#85aa91','Dividends':'#6f9a7f','Rental income':'#9fbf8f','Other income':'#b9cfa6','Shopping':'#8b93cc','Food & dining':'#d7a272','Groceries':'#aab786','Travel & transport':'#729db0','Bills & utilities':'#c9b480','Rent':'#b6a1c3','Health':'#c37f7c','Insurance':'#7fa3a0','Education':'#9c8fc4','Entertainment':'#8cacc1','Loan EMI':'#b98a6e','Taxes':'#a7705f','Fees & charges':'#c49a9a','Donations':'#d4a5b8','Cash withdrawal':'#b5ab8c','Investments':'#94a99c','Transfers':'#a0aaa7','Uncategorized':'#c5c8c6'};
export const categories=Object.keys(palette);
export const colors=categories.map(c=>palette[c]);
// [category, pattern, direction]. First match wins, so specific Indian narrations come before generic merchants.
const rules=[
 ['Taxes',/advance tax|self[- ]?assessment|income ?tax|\bitns ?2\d\d\b|\boltas\b|\bcbdt\b|tin[- ]?nsdl|e-?pay ?tax|\bcbic\b|gst (?:payment|challan)|property tax|professional tax|\btds\b/i,'out'],
 ['Fees & charges',/bank charges|service charges?|sms (?:alert )?(?:charges?|chgs?)|annual (?:fee|charges?)|\bamc\b|min(?:imum)?\.? ?bal|non[- ]?maint|penal|late (?:payment )?fee|cash handling|(?:atm|imps|neft|rtgs|dc|debit card|card) (?:fees?|chgs?|charges?)|\bchgs?\b|\bchrgs?\b|gst on (?:charges|fees?)/i,'out'],
 ['Cash withdrawal',/\batm\b|cash withdrawal|cash wdl|\bnwd\b|\batw\b|\bcwdr?\b|self withdrawal/i,'out'],
 ['Salary',/salary|payroll|\bsal\b/i,'in'],
 ['Dividends',/dividend|\bdiv\b/i,'in'],
 ['Interest',/interest|\bint\.? ?(?:paid|pd|cr|credit|coll)\b|\b(?:sb|fd|td|rd) int\b/i,'in'],
 ['Rental income',/\brent(?:al)?\b/i,'in'],
 ['Insurance',/insurance|\blic\b|star health|niva bupa|care health|hdfc ergo|icici lombard|icici pru|max life|sbi life|tata aia|bajaj allianz|aditya birla (?:health|sun life)|policybazaar|go digit|\backo\b/i,'out'],
 ['Loan EMI',/\bemi\b|\bloan\b|\bhsg\b|housing fin|bajaj fin|home credit|tata capital|hdb fin|l&t fin|muthoot/i,'out'],
 ['Investments',/zerodha|groww|upstox|angel ?one|kuvera|paytm money|icici ?direct|hdfc ?sec|kotak sec|mutual fund|\bsip\b|\bmf\b|\bnps\b|\bppf\b|\bcams\b|kfin|bse ?star|indian clearing|\biccl\b|nse clearing|smallcase|sovereign gold|\bsgb\b|\bnsdl\b/i],
 ['Donations',/donation|pm ?cares|charit|giveindia|ketto|milaap/i,'out'],
 ['Education',/school|college|universit|tuition|byju|unacademy|vedantu|coursera|udemy|exam fee/i,'out'],
 ['Food & dining',/swiggy(?! ?instamart)|zomato|starbucks|restaurant|\bcafe\b|coffee|domino|mcdonald|\bkfc\b|pizza|burger|chaayos|haldiram|eatsure|barbeque/i],
 ['Groceries',/bigbasket|blinkit|zepto|instamart|dmart|avenue supermarts|jiomart|reliance (?:fresh|smart)|more retail|spencer|nature.?s basket|grocery|groceries|kirana/i],
 ['Travel & transport',/uber|\bola\b|rapido|irctc|\bmetro\b|petrol|fuel|diesel|indigo|interglobe|air india|akasa|spicejet|redbus|makemytrip|goibibo|cleartrip|ixigo|yatra|fastag|\biocl?\b|indian oil|bpcl|bharat petroleum|hpcl|hindustan petroleum|parking/i],
 ['Bills & utilities',/airtel|\bjio\b|vodafone|bsnl|electricity|bescom|msedcl|tneb|tata power|adani (?:electricity|gas)|torrent power|mahanagar gas|indane|bharat ?gas|hp ?gas|water (?:bill|board)|broadband|fibernet|hathway|tata play|dish ?tv|\bdth\b|recharge|postpaid|\bbbps\b|\bbil\/(?:onl|bpay)\b|billdesk/i],
 ['Shopping',/amazon|flipkart|myntra|ikea|nykaa|ajio|meesho|tata ?cliq|croma|reliance digital|decathlon|lenskart|firstcry|shopping/i],
 ['Health',/apollo|pharmacy|hospital|clinic|medplus|netmeds|pharmeasy|\b1mg\b|practo|diagnostic|thyrocare|dr\.? ?lal|metropolis|medical/i],
 ['Entertainment',/netflix|spotify|hotstar|jiocinema|sonyliv|zee5|prime video|bookmyshow|\bpvr\b|\binox\b|cinema|youtube|google play|apple\.com/i],
 ['Rent',/\brent\b|nobroker/i,'out'],
];
export function classify(description,amount,custom=[]){
 const direction=amount>=0?'in':'out';
 const own=custom.find(r=>description.toLowerCase().includes(r.keyword.toLowerCase()));
 const found=own?.category||rules.find(([,re,d])=>(!d||d===direction)&&re.test(description))?.[0];
 const transfer=/self transfer|own account|credit card (?:payment|bill)|cc ?payment|\bccpay\b|cash dep|\bcdm\b|\bby cash\b/i.test(description)||found==='Transfers'||found==='Investments';
 const type=transfer?'Transfer':amount>=0?(/refund|reversal/i.test(description)?'Refund':'Income'):'Expense';
 const category=transfer?(found==='Investments'?found:'Transfers'):found||'Uncategorized';
 return {category,type,review:!found||transfer||(amount>0&&!['Salary','Interest','Dividends'].includes(category))};
}
export function parseMoney(raw){
 let s=String(raw??'').trim();if(!s||/^[-–—]+$/.test(s))return null;
 let neg=/^\(|^-|\bdr\.?$/i.test(s);s=s.replace(/₹|rs\.?|inr|cr\.?|dr\.?|[,\s()]/gi,'');
 if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s))return null;
 const v=Math.round(Number(s)*100);return neg?-Math.abs(v):v;
}
export function parseDate(raw){
 const s=String(raw??'').trim();let y,m,d;let a=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
 if(a){[,y,m,d]=a}else{a=s.match(/^(\d{1,2})[-/ .](\d{1,2}|[A-Za-z]{3,9})[-/ ,.]\s*(\d{2,4})/);if(!a)return null;[,d,m,y]=a;if(isNaN(+m))m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m.toLowerCase().slice(0,3))+1;if(String(y).length===2)y=2000+Number(y);}
 y=+y;m=+m;d=+d;const dt=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2100||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function tokenizeCSV(text){
 const sample=text.split(/\r?\n/).slice(0,8).join('\n');const delim=(sample.match(/\t/g)||[]).length>(sample.match(/,/g)||[]).length?'\t':(sample.match(/;/g)||[]).length>(sample.match(/,/g)||[]).length?';':',';
 let rows=[],row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++}else quote=!quote;}else if(c===delim&&!quote){row.push(field.trim());field=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field=''}else field+=c;}
 row.push(field.trim());if(row.some(Boolean))rows.push(row);if(quote)throw Error('The CSV contains an unclosed quoted field. Please export it again.');
 return rows;
}
const datePattern=String.raw`(\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3,9})[-/ ,.]\s*\d{2,4}|\d{4}-\d{2}-\d{2})`;
// Bank exports usually state the period above or below the table, e.g. "Statement From : 01/04/26 To : 30/06/26".
export function findPeriod(text){
 const t=String(text||'').replace(/\s+/g,' ');
 const m=t.match(new RegExp(String.raw`(?:from|period|between)\D{0,20}?${datePattern}\s*(?:to|till|until|and|-|–)\s*:?\s*${datePattern}`,'i'))||t.match(new RegExp(String.raw`start date\s*:?\s*${datePattern}.{0,80}?end date\s*:?\s*${datePattern}`,'i'));
 const from=m&&parseDate(m[1]),to=m&&parseDate(m[2]);return from&&to&&from<=to?{from,to}:null;
}
// Locate the transaction header row in CSV or spreadsheet rows, keeping preamble/footer text for period detection.
export function findTable(rows){
 const clean=rows.map(r=>r.map(c=>String(c??'').replace(/^﻿/,'').trim()));
 const h=clean.findIndex(r=>r.some(c=>/date/i.test(c))&&r.some(c=>/description|narration|particular|details|remark/i.test(c)));
 if(h<0)throw Error('No transaction header found. Include Date, Description, and Amount, or Debit and Credit columns.');
 const outside=[...clean.slice(0,h),...clean.slice(h+1).filter(r=>!r.some(c=>c.length<=24&&parseDate(c)))];
 return {headers:clean[h].map(s=>s.replace(/\s+/g,' ')),rows:clean.slice(h+1),period:findPeriod(outside.flat().join(' '))};
}
export function parseCSV(text){return findTable(tokenizeCSV(text));}
export function guessMapping(headers){
 const h=headers.map(s=>String(s).replace(/\s+/g,' ').trim()),used=new Set();
 const find=(...patterns)=>{for(const re of patterns){const i=h.findIndex((x,j)=>!used.has(j)&&re.test(x));if(i>=0){used.add(i);return i}}return -1};
 const direction=find(/^(?:type|dr ?\/? ?cr|cr ?\/? ?dr|debit ?\/ ?credit|credit ?\/ ?debit|transaction type|txn type)\.?$/i);
 const date=find(/^(?:transaction|txn|tran|trans|posting|post)\.? ?date$/i,/^date$/i,/date/i);
 const description=find(/narration|description|particulars?|details|remarks?/i);
 const debit=find(/withdrawal|debit|^dr\.?$|^dr\b|\(dr\)|paid out|money out/i);
 const credit=find(/deposit|credit|^cr\.?$|^cr\b|\(cr\)|paid in|money in/i);
 const amount=debit>=0&&credit>=0?-1:find(/^(?:transaction |txn )?(?:amount|amt)\b/i);
 const balance=find(/balance|^bal\.?$/i);
 return {date,description,amount,debit,credit,direction,balance};
}
export function mapRows(data,mapping,account,custom=[]){
 const transactions=[],invalid=[];let skipped=0,openingHint=null,closingHint=null,last=-2,footer=false;
 data.rows.forEach((r,i)=>{
  if(footer||r.every(c=>/^[\s*=_.\-–—]*$/.test(String(c??'')))){skipped++;return;}
  if(r.some(c=>/statement summary|end of statement|computer[- ]generated|system[- ]generated/i.test(String(c??'')))){footer=true;skipped++;return;}
  const cell=k=>mapping[k]>=0?String(r[mapping[k]]??'').trim():'';
  const date=parseDate(cell('date')),description=cell('description').replace(/\s+/g,' '),balance=parseMoney(cell('balance'));
  let amount=null,conflict=false;
  if(mapping.amount>=0){amount=parseMoney(cell('amount'));const dir=cell('direction');if(amount!==null&&/^(?:dr|debit|withdrawal|d)\.?$/i.test(dir))amount=-Math.abs(amount);else if(amount!==null&&/^(?:cr|credit|deposit|c)\.?$/i.test(dir))amount=Math.abs(amount);}
  else{const debit=parseMoney(cell('debit')),credit=parseMoney(cell('credit'));if(debit&&credit)conflict=true;else if(debit!==null||credit!==null)amount=Math.abs(credit||0)-Math.abs(debit||0);}
  if(!amount&&/^(?:opening|closing) bal|^balance (?:b\/f|c\/f|brought|carried|forward)|^[bc]\/f\b|brought forward|carried forward/i.test(description)){if(balance!==null){if(/opening|b\/f|brought/i.test(description))openingHint??=balance;else closingHint=balance;}skipped++;return;}
  if(!date||!description||!amount||conflict){
   const figures=['date','amount','debit','credit','balance'].some(k=>cell(k));
   if(!date&&!figures&&description){
    // A short text-only row right after a transaction continues its narration; other free text is not a transaction.
    if(last===i-1&&description.length<=80){transactions.at(-1).description+=' '+description;last=i;}else skipped++;
    return;
   }
   if(!date&&(!description||/^(?:grand |sub ?)?total\b/i.test(description)||/^(?:grand |sub ?)?total\b/i.test(cell('date')))){skipped++;return;}
   invalid.push(i+2);return;
  }
  transactions.push({id:crypto.randomUUID(),date,description,amount,account,...(balance!==null?{balance}:{}),...classify(description,amount,custom)});last=i;
 });
 return {transactions,invalid,skipped,openingHint,closingHint};
}
export function fingerprint(t){return [t.date,t.accountId||t.account.toLowerCase().trim(),t.description.toLowerCase().replace(/\s+/g,' ').trim(),t.amount].join('|')}
export function summarize(rows){let income=0,expenses=0,transfers=0;for(const t of rows){if(t.type==='Income')income+=t.amount;else if(t.type==='Expense'||t.type==='Refund')expenses-=t.amount;else transfers+=Math.abs(t.amount)}return {income,expenses,net:income-expenses,transfers,savings:income>0?(income-expenses)/income*100:0};}
export function csvExport(rows,extra={}){const fields=['date','description','readable_name','account','type','category','amount','balance','review','note',...Object.keys(extra)];return '﻿'+[fields.join(','),...rows.map(t=>fields.map(k=>{let s=String(k==='amount'||k==='balance'?(Number.isSafeInteger(t[k])?(t[k]/100).toFixed(2):''):k==='readable_name'?transactionLabel(t).title:k in extra?extra[k](t):t[k]??'');if(k!=='amount'&&k!=='balance'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(','))].join('\r\n');}
