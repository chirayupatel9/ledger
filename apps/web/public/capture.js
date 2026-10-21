// Adding to the ledger from a phone: a bank or UPI message (SMS or app notification), or a photo of a bill. Both are
// read into the same shape and matched to the transaction they describe. When the statement is not imported yet, the
// payment is added now (source "message" or "receipt") and the statement's own row replaces it on import, keeping the
// name, note, tax tag and receipts. Nothing here touches the network; bill photos are read on the device.
import {classify} from './core.js';
const DAY=86400000,toDay=d=>Date.parse(d+'T00:00:00Z')/DAY,gap=(a,b)=>Math.abs(toDay(a)-toDay(b));
const istToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const paise=s=>Math.round(parseFloat(String(s).replace(/,/g,''))*100);
// Dates in Indian messages and bills: 20-10-26, 20/10/2026, 20-Oct-26, 20 Oct 2026, 20Oct26, Oct 20, 2026, 2026-10-20.
// A date after tomorrow or more than two years back is ignored (it is more likely a reference number or due date).
export function findDate(text,today=istToday()){
 const valid=(y,m,d)=>{if(y<100)y+=2000;const t=new Date(Date.UTC(y,m-1,d));if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return null;const iso=t.toISOString().slice(0,10),diff=toDay(iso)-toDay(today);return diff<=1&&diff>=-731?iso:null;};
 const patterns=[[/\b(\d{4})-(\d{2})-(\d{2})\b/g,m=>valid(+m[1],+m[2],+m[3])],
  [/\b(\d{1,2})[-/ .]?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[-/ ,.']*(\d{4}|\d{2})(?!\d)/gi,m=>valid(+m[3],months[m[2].slice(0,3).toLowerCase()],+m[1])],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[ .]+(\d{1,2}),?[ ]+(\d{4})\b/gi,m=>valid(+m[3],months[m[1].slice(0,3).toLowerCase()],+m[2])],
  [/(?<![\d/.-])(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?![\d/-]|\.\d)/g,m=>valid(+m[3],+m[2],+m[1])]];
 const found=[];for(const [re,read] of patterns)for(const m of text.matchAll(re)){const d=read(m);if(d)found.push({at:m.index,d});}
 return found.sort((a,b)=>a.at-b.at)[0]?.d||null;
}
const banks=[['HDFC Bank',/\bhdfc\b/i],['ICICI Bank',/\bicici\b/i],['State Bank of India',/\bsbi\b|state bank/i],['Axis Bank',/\baxis\b/i],['Kotak Mahindra Bank',/\bkotak\b/i],['Yes Bank',/\byes bank\b/i],['IDFC FIRST Bank',/\bidfc\b/i],['IndusInd Bank',/\bindusind\b/i],['Punjab National Bank',/\bpnb\b|punjab national/i],['Bank of Baroda',/\bbob\b|bank of baroda/i],['Canara Bank',/\bcanara\b/i],['Union Bank of India',/\bunion bank\b/i],['Federal Bank',/\bfederal bank\b/i],['AU Small Finance Bank',/\bau bank\b|au small/i]];
// "SWIGGY" → "Swiggy", "swiggy.stores@axisbank" → "Swiggy Stores"; names already in mixed case stay as written.
export function prettyPayee(raw){
 let s=String(raw||'').trim();if(!s)return '';
 if(/@/.test(s))s=s.split('@')[0].replace(/[._-]+/g,' ').replace(/\d+/g,' ');
 s=s.replace(/\s+/g,' ').replace(/^(?:vpa|mr\.?|ms\.?|m\/s\.?)\s+/i,'').trim().slice(0,80);
 return s===s.toUpperCase()||s===s.toLowerCase()?s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()):s;
}
export function parseBankMessage(raw,{today=istToday()}={}){
 const text=String(raw||'').replace(/\r/g,'').slice(0,2000);
 let amount=null;
 for(const m of text.matchAll(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi)){if(/(?:bal(?:ance)?|lmt|limit)[^\d]{0,14}$/i.test(text.slice(Math.max(0,m.index-18),m.index)))continue;amount=paise(m[1]);break;}
 if(amount===null){const m=text.match(/\b(?:debited|credited|sent|paid|spent|received)\s+(?:by|for|with|of)?\s*([\d,]+(?:\.\d{1,2})?)\b/i);if(m)amount=paise(m[1]);}
 const word=text.match(/\b(debited|debit|sent|paid|spent|withdrawn|purchase|credited|credit|received|deposited|refund(?:ed)?|reversed)\b/i)?.[1].toLowerCase();
 const direction=!word?null:/^(?:credited|credit|received|deposited|refund|refunded|reversed)$/.test(word)?'credit':'debit';
 const last4=text.match(/(?:a\/c|acct|account|\bac\b|card)(?:\s*(?:no\.?|number|ending(?:\s+(?:with|in))?))?[\s:.-]*[x*]*\s*[x*]*(\d{3,4})\b/i)?.[1]||null;
 const ref=(text.match(/(?:upi[\s:/-]*(?:ref(?:erence)?)?(?:\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number|id)?|refno|rrn|txn\s*id|transaction\s*id|utr)[\s:.#-]*(?=[A-Za-z0-9]*\d)([A-Za-z0-9]{10,22})\b/i)||text.match(/\b(\d{12})\b/))?.[1]||null;
 const vpa=text.match(/\b([\w.-]{2,}@[a-z][\w.]{1,})\b/i)?.[1]||null;
 const stop='(?=\\s+(?:on|ref|refno|upi|via|using|avl|bal|not you)\\b|[\\n;(]|\\.\\s|\\.?$)';
 const at=()=>text.match(new RegExp('\\bat\\s+([A-Za-z0-9][^\\n;(]*?)'+stop,'i'));
 const named=direction==='credit'
  ?text.match(new RegExp('\\bfrom\\s+(?!a\\/c|acct|account|your)(?:vpa\\s+)?([A-Za-z0-9][^\\n;(]*?)'+stop,'i'))
  :(text.match(/;\s*([^;.\n]+?)\s+credited/i)||text.match(/UPI\/[A-Z0-9]+\/\d+\/([^\n/]+)/i)||(/\bspent\b|\bcard\b/i.test(text)&&at())||text.match(new RegExp('\\b(?:trf to|transfer to|paid to|sent to|to)\\s+(?!your|a\\/c|acct|account|dispute|report|block|stop|call|know)(?:vpa\\s+)?([A-Za-z0-9][^\\n;(]*?)'+stop,'i'))||at());
 const payee=prettyPayee(named?.[1]&&!/^(?:vpa|upi)$/i.test(named[1].trim())?named[1]:vpa);
 const channel=/\bupi\b|vpa|@/i.test(text)?'UPI':/\bcard\b/i.test(text)?'Card':/\bneft\b/i.test(text)?'NEFT':/\bimps\b/i.test(text)?'IMPS':/\batm\b|withdrawn/i.test(text)?'ATM':null;
 const parsed={amount:amount&&direction?(direction==='debit'?-amount:amount):amount,direction,last4,date:findDate(text,today),payee,vpa,ref,channel,bank:banks.find(([,re])=>re.test(text))?.[0]||null};
 return {...parsed,missing:['amount','direction','date'].filter(k=>!parsed[k])};
}
// Bills: the total is the amount on the line that says so (grand total, net payable, amount paid…), else the largest
// amount with paise. OCR often reads ₹ as a stray symbol, so the amount itself carries the signal.
export function parseReceiptText(raw,{today=istToday()}={}){
 const lines=String(raw||'').split(/\n+/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
 const amounts=l=>[...l.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d{1,7}\.\d{2}|\d{1,7})(?![\d,]|\.\d)/g)].map(m=>({v:paise(m[1]),decimal:/\.\d{2}$/.test(m[1])})).filter(a=>a.v>0);
 const pick=list=>(list.filter(a=>a.decimal).at(-1)||list.at(-1))?.v;
 let total=null;
 for(const re of [/grand\s*total|net\s*(?:payable|amount|total)|amount\s*(?:payable|due|paid)|total\s*(?:payable|amount|due|inr|rs|paid)|bill\s*amount|to\s*pay|you\s*paid|paid\s*amount/i,/\btotal\b/i]){
  for(let i=0;i<lines.length&&total===null;i++){const l=lines[i];if(!re.test(l)||/sub\s*-?\s*total|total\s*(?:qty|quantity|items?|savings?|discount|tax|gst|cgst|sgst|igst)/i.test(l))continue;total=pick(amounts(l.replace(re,' ')))??pick(amounts(lines[i+1]||''))??null;}
  if(total!==null)break;
 }
 if(total===null){const all=lines.filter(l=>!/gstin|phone|ph\b|mob|tel|fssai|invoice\s*no|bill\s*no|order/i.test(l)).flatMap(amounts).filter(a=>a.decimal);total=all.length?Math.max(...all.map(a=>a.v)):null;}
 const merchant=prettyPayee(lines.find(l=>/[a-z]{3,}/i.test(l)&&!/tax\s*invoice|invoice|receipt|^bill\b|cash\s*memo|gstin|original|duplicate|welcome|thank|^date|^time|^[\d\W]+$/i.test(l))?.replace(/[^\p{L}\p{N}&.,'() -]/gu,'').trim()||'');
 const gstin=String(raw||'').match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/)?.[0]||null;
 return {total,date:findDate(lines.join('\n'),today),merchant,gstin};
}
// Accounts a message names by its last digits (statements and messages may show three or four).
export const accountsFor=(state,last4)=>!last4?[]:(state.accounts||[]).filter(a=>!a.archived&&a.last4&&(String(a.last4).endsWith(last4)||last4.endsWith(String(a.last4))));
// Transactions a message or bill may describe: same amount (bills: a rupee either way), close in date, the named account
// first; the same UPI reference is a certain match.
export function findMatches(state,{amount,date,last4,ref,accountId,days=3,tolerance=0}){
 if(!amount)return [];const named=new Set(accountsFor(state,last4).map(a=>a.id));
 return (state.transactions||[]).filter(t=>(!accountId||t.accountId===accountId)&&Math.abs(t.amount-amount)<=tolerance&&(!date||gap(t.date,date)<=days)&&Math.sign(t.amount)===Math.sign(amount))
  .map(t=>{const sure=!!ref&&(t.ref===ref||String(t.description).includes(ref));return {t,sure,score:(sure?1000:0)+(named.has(t.accountId)?100:0)+(t.amount===amount?50:0)-(date?gap(t.date,date)*10:0)};})
  .sort((a,b)=>b.score-a.score);
}
export function enrichFromMessage(t,parsed){
 if(parsed.ref&&!t.ref&&/^[A-Za-z0-9-]{1,40}$/.test(parsed.ref))t.ref=parsed.ref;
 if(parsed.payee&&!t.displayName)t.displayName=parsed.payee.slice(0,160);
 return t;
}
export function newFromPhone(state,{accountId,amount,date,payee,ref,channel,source}){
 const a=(state.accounts||[]).find(x=>x.id===accountId);if(!a)throw Error('Choose the account this payment was made from.');
 if(!Number.isSafeInteger(amount)||!amount)throw Error('Enter the amount.');if(!date)throw Error('Enter the date.');
 const description=[source==='receipt'?'Bill':channel||'Payment',payee,ref].filter(Boolean).join(' / ').slice(0,4000);
 return {id:crypto.randomUUID(),accountId,account:a.name,date,description,amount,...classify(description,amount,state.rules||[],{card:a.type==='Credit card'}),review:true,source,...(ref&&/^[A-Za-z0-9-]{1,40}$/.test(ref)?{ref}:{}),...(payee?{displayName:payee.slice(0,160)}:{})};
}
// On a statement import: which incoming rows replace a transaction added from the phone (incoming id → phone id).
export function phoneReplacements(existing,incoming){
 const phone=existing.filter(t=>t.source),used=new Set(),map=new Map();
 for(const row of incoming){const p=phone.find(p=>!used.has(p.id)&&p.accountId===row.accountId&&p.ref&&(row.ref===p.ref||String(row.description).includes(p.ref)));if(p){used.add(p.id);map.set(row.id,p.id);}}
 for(const row of incoming){if(map.has(row.id))continue;const p=phone.filter(p=>!used.has(p.id)&&p.accountId===row.accountId&&p.amount===row.amount&&gap(p.date,row.date)<=3).sort((a,b)=>gap(a.date,row.date)-gap(b.date,row.date))[0];if(p){used.add(p.id);map.set(row.id,p.id);}}
 return map;
}
export function carryOver(phone,row){
 return {...row,...(phone.displayName?{displayName:phone.displayName}:{}),...(phone.note?{note:phone.note}:{}),...(phone.taxTag?{taxTag:phone.taxTag}:{}),...(phone.receipts?.length?{receipts:phone.receipts}:{}),
  ...(!phone.review?{category:phone.category,type:phone.type,review:false}:{}),...(phone.transferId?{transferId:phone.transferId,type:'Transfer'}:{})};
}
