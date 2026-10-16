// Presentation only. Original narration, classification, amounts and duplicate keys never change.
const merchants=[['Swiggy',/\bswiggy\b/i],['Zomato',/\bzomato\b/i],['Amazon',/\bamazon\b/i],['Flipkart',/\bflipkart\b/i],['Netflix',/\bnetflix\b/i],['Airtel',/\bairtel\b/i],['BigBasket',/\bbigbasket\b/i],['Blinkit',/\bblinkit\b/i],['Uber',/\buber\b/i],['IRCTC',/\birctc\b/i],['Zerodha',/\bzerodha\b/i]];
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
export function transactionLabel(transaction){
 const raw=tidy(String(transaction.description||'')),channel=paymentChannel(raw);
 if(transaction.displayName?.trim())return {title:transaction.displayName.trim(),source:'Your label',channel};
 const reversal=/\b(?:reversal|reversed|rev)\b/i.test(raw),refund=/\brefund\b/i.test(raw),failed=/\b(?:failed|declined)\b/i.test(raw);
 const event=reversal?'Reversal':refund?'Refund':failed?'Failed transaction':'';
 let title='';
 if(/\b(?:self[\s/-]*transfer|own[\s/-]*account)\b/i.test(raw))title='Self transfer';
 else if(/\b(?:credit card payment|cc payment)\b/i.test(raw))title='Credit card payment';
 else if(transaction.type==='Transfer'&&transaction.amount>0&&/payment received|thank you for (?:the |your )?payment|netbanking transfer|bbps payment|autopay/i.test(raw))title='Card bill payment';
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
  const name=merchant||(channel&&explicitName(raw,channel));
  if(name)title=name;
  else if(channel==='UPI')title=transaction.amount>0?'UPI credit':transaction.amount<0?'UPI payment':'UPI transaction';
  else if(['NEFT','IMPS','RTGS','Internal transfer'].includes(channel))title=channel==='Internal transfer'?channel:channel+' transfer';
  else if(['NACH','ACH','ECS'].includes(channel))title=transaction.amount<0?'Automatic debit':transaction.amount>0?'Automatic credit':'Automatic payment';
  else if(['POS','ECOM'].includes(channel))title=transaction.amount>0?'Card credit':'Card payment';
  else if(channel==='CHQ')title=transaction.amount<0?'Cheque payment':transaction.amount>0?'Cheque credit':'Cheque transaction';
  else if(channel==='ATM')title='ATM transaction';
 }
 if(event&&title)title=event+' · '+title;
 return {title:title||shorten(raw)||'Transaction',source:title&&title!==raw?'Suggested label':raw.length>72?'Shortened narration':'Bank narration',channel};
}
