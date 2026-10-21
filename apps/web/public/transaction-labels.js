import {titleRuleMatches} from './preferences.js';
// Presentation only. Original narration, classification, amounts and duplicate keys never change.
// "Self BIL/INFT/…/Self", "UPI/…/SELF": money moved to your own account. A self cheque without a transfer channel is cash.
export const isSelfTransfer=raw=>/(?:^|[\s/])self(?:[\s/.,]|$)/i.test(raw)&&/\b(?:inft|ift|neft|imps|rtgs|upi|bil|mmt|trf|transfer|fund)\b/i.test(raw);
const merchants=[['NSE Clearing',/nse ?clearing/i],['BSE Clearing',/bse ?clearing/i],['Swiggy',/\bswiggy\b|bundl technolog/i],['Zomato',/\bzomato\b/i],['Amazon',/\bamazon\b/i],['Flipkart',/\bflipkart\b/i],['Netflix',/\bnetflix\b/i],['Airtel',/\bairtel\b/i],['BigBasket',/\bbigbasket\b|innovative retail concepts|supermarket grocery supplies/i],['Blinkit',/\bblinkit\b|grofers/i],['Zepto',/\bzepto\b|kiranakart/i],['DMart',/\bd ?mart\b|avenue supermarts/i],['Uber',/\buber\b/i],['Ola',/\bola cabs\b|ani technolog/i],['Rapido',/\brapido\b|roppen transportation/i],['IRCTC',/\birctc\b/i],['Zerodha',/\bzerodha\b/i],['Paytm',/one ?97 communication/i],['BookMyShow',/bookmyshow|bigtree entertainment/i],['Myntra',/\bmyntra\b/i],['Nykaa',/\bnykaa\b|fsn e-?commerce/i],['Jio',/reliance jio|\bjio ?(?:prepaid|postpaid|fiber)\b/i],['Apollo Pharmacy',/apollo pharmac/i],['MedPlus',/\bmedplus\b|optival health/i],['Starbucks',/\bstarbucks\b|tata starbucks/i],['Domino’s',/\bdomino'?s\b|jubilant foodworks/i],['McDonald’s',/\bmcdonald|hardcastle restaurants|connaught plaza restaurants/i],['IndiGo',/\bindigo\b|interglobe aviation/i],['MakeMyTrip',/makemytrip/i],['CRED',/\bcred\b|dreamplug/i]];
const noise=/^(?:upi|up|p2a|p2m|dr|cr|inf|inft|neft(?:\s+(?:cr|dr))?|imps|rtgs|ach|nach|ecs|pos|ecom|chq|cheque|transfer|payment|purchase|txn|ref|refund|reversal|rev|return|failed|declined|na|null|sent|received|upi payment|[a-z]*\d[a-z\d .*-]*)$/i;
const bank=/^(?:ICIC[I]?|HDFC|SBI[N]?|UTIB|AXIS|YESB|YES|BARB|KKBK|KOTAK|PUNB|PNB|CNRB|CANARA|BKID|BOI|INDB|INDUSIND|FDRL|FEDERAL|IDIB|IOBA|UBIN|UNION|IDFB|IDFC)(?:\s+BANK)?$/i;
const tidy=s=>s.replace(/\s+/g,' ').trim();
const shorten=s=>s.length>72?s.slice(0,69).trimEnd()+'…':s;
function paymentChannel(raw){
 const match=raw.match(/\b(UPI|NEFT|IMPS|RTGS|NACH|ACH|ECS|ATM|POS|ECOM|CHQ|CHEQUE)\b/i)?.[1].toUpperCase();
 if(match)return match==='CHEQUE'?'CHQ':match;
 // Some statements abbreviate UPI to UP. Require a structured payment prefix.
 if(/^UP\s*[/|-]\s*(?:DR|CR|P2A|P2M|\d{6,})\b/i.test(raw))return 'UPI';
 return /\bINFT\b/i.test(raw)?'Internal transfer':'';
}
function explicitName(raw,channel){
 const structuredHyphen=/^(?:UPI|UP|NEFT|IMPS|RTGS|NACH|ACH|ECS|POS|ECOM|CHQ)(?:\s+(?:CR|DR))?\s*-/i.test(raw);
 const parts=raw.split(structuredHyphen?/[/|]|\s*-\s*/:/[/|]/).map(tidy);
 if(parts.length<2)return '';
 const candidates=parts.filter(s=>s&&!noise.test(s)&&!bank.test(s)&&s.toUpperCase()!==channel&&
  !/^(?:UPI|NEFT|IMPS|RTGS|NACH|ACH|ECS|ATM|POS|ECOM|CHQ)\s+(?:DR|CR|REVERSAL|REFUND|FAILED|DECLINED)\b/i.test(s)&&
  !/@|\d{4}|\b[A-Z]{4}0[A-Z0-9]{6}\b/i.test(s)&&
  !/^(?:payment|paid|sent|received|transfer)\s+(?:for|via|from|to)\b/i.test(s));
 const unique=candidates.filter((s,i)=>candidates.findIndex(other=>other.toLowerCase()===s.toLowerCase())===i);
 // Multiple possible names are deliberately left unresolved.
 return unique.length===1&&unique[0].length<=60?unique[0]:'';
}
// UPI narrations name who you paid (or who paid you), their UPI ID and your note, in a bank-specific order:
//   ICICI  UPI/RAMESH KUMAR/ramesh@ybl/Rent/YES BANK LIMITED/628512345678/YBL0f3a…
//   HDFC   UPI-RAMESH KUMAR-ramesh@ybl-YESB0000001-628512345678-Rent
//   SBI    UPI/DR/628512345678/RAMESH KUM/YESB/ramesh@yb/Rent
//   Axis   UPI/P2A/628512345678/RAMESH KUMAR/Rent/YES BANK
//   Kotak  UPI/RAMESH KUMAR/628512345678/Rent
// Fields are recognised by what they look like (UPI ID, reference number, IFSC, bank), not only by position. The first
// name-like field is the payee; a later one is your note, unless it is a default such as "UPI" or "Payment".
const upiDefaultNote=/^(?:upi|up|na|null|nil|-|send money|transfer|p2p|p2m|p2a|collect\b.*|(?:amazon|google|phone ?pe|whatsapp|mobikwik|freecharge|cred|slice|navi|bhim|airtel|jio|tata neu|super\.?money) ?pay(?:ment)?|upi (?:payment|transfer|txn)|no remarks?|money (?:sent|transfer)|fund transfer|txn|request|(?:payment|paid|pay|sent)(?: (?:fo|fr|f|from|to|via|for|using|by|t)\b.*)?)$/i;
const upiBank=/^(?:[A-Z]{4}\d?|(?:the )?(?:[a-z.&]+ ){0,4}(?:bank|banking)(?: (?:ltd|limited|of india|of baroda|of maharashtra|corporation))*\.?|(?:paytm|airtel|jio|fino|india post) payments?(?: bank)?(?: ltd| limited)?)$/i;
const upiCodes=/^(?:HDFC|SBIN|SBI|ICIC|ICICI|UTIB|AXIS|YESB|KKBK|PUNB|BARB|CNRB|IDFB|INDB|PYTM|AIRP|FDRL|UBIN|IOBA|BKID|MAHB|CBIN|IDIB|UCBA|CIUB|KVBL|SIBL|TMBL|DBSS|HSBC|SCBL|CITI|RATN|ESFB|AUBL|JSFB|FINO|JIOP|NSPB|IPOS|DLXB|KARB|CSBK|PSIB|BDBL|DCBL|SVCB|COSB|USFB|SURY|UJVN)$/i;
// Bank names in narrations are often cut short to fit the column ("YES BANK L", "KOTAK MAHINDRA B").
const isBank=f=>upiCodes.test(f)||/\bbank\b/i.test(f)||/^(?:the )?(?:yes|axis|hdfc|icici|kotak|state|punjab|canara|union|indian|federal|idfc|indusind|bandhan|paytm|airtel|jio|fino|au|equitas|ujjivan|rbl|dbs|hsbc|citi|standard|karnataka|karur|south|city|tamilnad|central|bank)\b.*\b(?:b|ba|ban|banki?n?g?|l|lt|ltd|li|lim|limit|limited|payments?|pay)\.?$/i.test(f);
const looksLikeId=f=>/@/.test(f)||(/^[a-z0-9._-]+$/i.test(f)&&/\d/.test(f)&&/[a-z]/i.test(f)&&f.length>=8&&!/\s/.test(f))||/^q\d{6,}$/i.test(f)||/^paytmqr/i.test(f);
function prettyName(raw){
 let s=tidy(raw).replace(/^(?:mr|mrs|ms|m\/s|dr)\.?\s+/i,'').replace(/[^\p{L}\p{N}&.,'’() -]/gu,' ').replace(/\s+/g,' ').trim();
 if(!s)return '';if(s===s.toUpperCase()||s===s.toLowerCase())s=s.toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu,(m,p,c)=>p+c.toUpperCase()).replace(/\b(Upi|Atm|Ifsc|Lic|Sbi|Hdfc|Icici|Idfc|Hp|Bpcl|Iocl|Ola|Uber)\b/g,w=>w.length<=5?w.toUpperCase():w);
 return s.length>60?s.slice(0,57).trimEnd()+'…':s;
}
// A UPI ID's own name: "ramesh.k@okhdfcbank" → "Ramesh K". QR and phone-number IDs have none.
function nameFromId(id){const local=String(id||'').split('@')[0];if(!local||/^\d+$/.test(local)||/^q\d+$|^paytmqr|^bharatpe|^upi\d/i.test(local)||/\d{5,}/.test(local))return '';return prettyName(local.replace(/[._-]+/g,' ').replace(/\d+/g,' '));}
export function parseUPI(raw){
 const text=tidy(String(raw||'')),at=text.search(/(?:^|[\s/-])UPI?\s*[\/-]/i);if(at<0)return null;
 const rest=text.slice(at).replace(/^[\s/-]*UPI?\s*/i,''),sep=rest[0];if(sep!=='/'&&sep!=='-')return null;
 const fields=rest.slice(1).split(sep==='/'?/\s*\/\s*/:/\s+-\s+|-(?=\S)/).map(f=>f.trim()).filter(f=>f&&!/^-+$/.test(f));
 // ICICI: name / UPI ID / note / payee's bank / reference / app code. Read by position: the ID may have no "@".
 const c=fields.map(f=>f.replace(/[-_.,]+$/,'').trim());
 if(sep==='/'&&c.length>=5&&/^\d{9,16}$/.test(c[4])&&isBank(c[3])&&!/^\d+$/.test(c[0])&&!/^(?:DR|CR|P2A|P2M)$/i.test(c[0])){
  const id=/\s/.test(c[1])?'':c[1],note=c[2]&&/\p{L}/u.test(c[2])&&!upiDefaultNote.test(c[2])&&c[2].toLowerCase()!==c[0].toLowerCase()?tidy(c[2]).slice(0,80):'';
  return {payee:upiDefaultNote.test(c[0])?nameFromId(id):prettyName(c[0]),id,note,reference:c[4],bank:c[3]};
 }
 let id='',reference='',bank='';const words=[];
 for(const raw of fields){const f=raw.replace(/[-_.,]+$/,'').trim();if(!f)continue;
  if(/^(?:DR|CR|P2A|P2M|P2P|PAY|COLLECT|REV|RRN|REFUND|REVERSAL|REVERSED|FAILED|DECLINED|RET|RETURN)$/i.test(f))continue;
  if(/^\d{9,16}$/.test(f)){if(!reference)reference=f;continue;}
  if(/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(f)){bank||=f.slice(0,4).toUpperCase();continue;}
  if(looksLikeId(f)&&!/\s/.test(f)){if(/@/.test(f)||!id)id||=f;continue;}
  const first=f.split(/\s+/)[0];
  if(reference&&/^[A-Z]{3,4}[A-Za-z0-9]*$/.test(first)&&/\d/.test(first))continue; // after the reference: the payment app's own code
  if(isBank(f)||(upiBank.test(f)&&/bank|payments/i.test(f))){bank||=f;continue;}
  if(/^\d+$/.test(f.replace(/\s/g,'')))continue;
  words.push(f);
 }
 const payee=words[0]||'',note=words.slice(1).reverse().find(w=>!upiDefaultNote.test(w)&&w.toLowerCase()!==payee.toLowerCase()&&!payee.toLowerCase().startsWith(w.toLowerCase()))||'';
 const name=payee&&!upiDefaultNote.test(payee)?prettyName(payee):nameFromId(id);
 return {payee:name,id,note:note?tidy(note).slice(0,80):'',reference,bank};
}
export function transactionLabel(transaction,rules=[]){
 const raw=tidy(String(transaction.description||'')),channel=paymentChannel(raw),upi=channel==='UPI'?parseUPI(raw):null,extra=upi&&(upi.id||upi.note)?{upi}:{};
 if(transaction.displayName?.trim())return {title:transaction.displayName.trim(),source:'Your label',channel,...extra};
 const rule=rules.find(r=>titleRuleMatches(r,transaction));
 if(rule)return {title:rule.title,source:'Title rule',channel,...extra};
 const reversal=/\b(?:reversal|reversed|rev)\b/i.test(raw),refund=/\brefund\b/i.test(raw),failed=/\b(?:failed|declined)\b/i.test(raw);
 const event=reversal?'Reversal':refund?'Refund':failed?'Failed transaction':'';
 let title='';
 if(/\b(?:self[\s/-]*transfer|own[\s/-]*account)\b/i.test(raw)||isSelfTransfer(raw))title='Self transfer';
 else if(/\b(?:credit card payment|cc payment)\b/i.test(raw))title='Credit card payment';
 else if(transaction.type==='Transfer'&&transaction.amount>0&&/payment received|thank you for (?:the |your )?payment|netbanking transfer|bbps payment|autopay/i.test(raw))title='Card bill payment';
 else if(/wallet load|wallet top-?up|load(?:ed)? (?:to |money )?wallet/i.test(raw)){const merchant=merchants.find(([,pattern])=>pattern.test(raw))?.[0];title=merchant?merchant+' wallet top-up':'Wallet top-up';}
 else if(/^(?:stamp duty|stt|tds|(?:(?:sip |additional |new )?purchase|sip|redemption|switch[ -]?(?:in|out)|stp[ -]?(?:in|out)|swp|dividend (?:payout|reinvestment))(?: reversal)?) · /i.test(raw)){const [kind,scheme]=raw.split(' · ');title=`${scheme.replace(/\s*-\s*(?:regular|direct)\b.*$/i,'').trim()} · ${kind.replace(/ reversal$/i,'')}`;}
 else if(/\bfinance charges?\b|\binterest charges?\b/i.test(raw))title='Finance charges';
 else if(/\blate (?:payment )?fee\b/i.test(raw))title='Late payment fee';
 else if(/\bmark-?up fee\b|\bforex (?:fee|markup)\b|\bcross[- ]currency\b/i.test(raw))title='Foreign currency markup';
 else if(/^(?:[cis]?gst)\b/i.test(raw))title='GST on charges';
 else if(/\bemi\s*\d{1,3}\s*\/\s*\d{1,3}\b/i.test(raw)){const [match,n,of]=raw.match(/\bemi\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/i),rest=tidy(raw.replace(match,'')).replace(/^[-:·|]\s*/,''),merchant=merchants.find(([,pattern])=>pattern.test(raw))?.[0];title=`EMI ${n} of ${of}`+(merchant||rest?' · '+(merchant||shorten(rest)):'');}
 else if(/\b(?:bank charges|service charges?|(?:sms|atm|neft|imps|annual|maintenance|minimum balance|amb)\s+(?:charges?|chgs?|chrg|fees?))\b/i.test(raw))title='Bank charges';
 else if(/\bcash deposit\b/i.test(raw))title='Cash deposit';
 else if(/\bcash withdrawal\b/i.test(raw)||(channel==='ATM'&&transaction.amount<0&&!/\b(?:fee|fees|charge|charges|deposit)\b/i.test(raw)))title='Cash withdrawal';
 else {
  const merchant=merchants.find(([,pattern])=>pattern.test(raw))?.[0];
  // With no name in the narration, the UPI ID itself says who was paid (a phone number or QR code ID).
  const name=merchant||(channel==='UPI'&&(upi?.payee||upi?.id))||(channel&&explicitName(raw,channel));
  if(name)title=name;
  else if(channel==='UPI')title=transaction.amount>0?'UPI credit':transaction.amount<0?'UPI payment':'UPI transaction';
  else if(['NEFT','IMPS','RTGS','Internal transfer'].includes(channel))title=channel==='Internal transfer'?channel:channel+' transfer';
  else if(['NACH','ACH','ECS'].includes(channel))title=transaction.amount<0?'Automatic debit':transaction.amount>0?'Automatic credit':'Automatic payment';
  else if(['POS','ECOM'].includes(channel))title=transaction.amount>0?'Card credit':'Card payment';
  else if(channel==='CHQ')title=transaction.amount<0?'Cheque payment':transaction.amount>0?'Cheque credit':'Cheque transaction';
  else if(channel==='ATM')title='ATM transaction';
 }
 if(event&&title)title=event+' · '+title;
 const auto={title:title||shorten(raw)||'Transaction',source:title&&title!==raw?'Suggested label':raw.length>72?'Shortened narration':'Bank narration',channel,...extra};
 // A rule on the automatic title (“Self transfer” → “Between my accounts”) renames every transaction that gets it, now and later.
 const alias=rules.find(r=>r.mode==='title'&&sameTitle(r.keyword,auto.title));
 return alias?{...auto,title:alias.title,source:'Title rule'}:auto;
}
export const sameTitle=(a,b)=>String(a??'').trim().replace(/\s+/g,' ').toLowerCase()===String(b??'').trim().replace(/\s+/g,' ').toLowerCase();
// The title Ledger would give a transaction on its own, without your titles or naming rules.
export const automaticTitle=t=>transactionLabel({...t,displayName:''},[]).title;
