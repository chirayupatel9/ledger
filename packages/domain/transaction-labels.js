// Readable labels are presentation only: never change the bank narration or classification.
const merchants=[['Swiggy',/\bswiggy\b/i],['Zomato',/\bzomato\b/i],['Amazon',/\bamazon\b/i],['Flipkart',/\bflipkart\b/i],['Netflix',/\bnetflix\b/i],['Airtel',/\bairtel\b/i],['BigBasket',/\bbigbasket\b/i],['Blinkit',/\bblinkit\b/i],['Uber',/\buber\b/i],['IRCTC',/\birctc\b/i],['Zerodha',/\bzerodha\b/i]];
const noise=/^(?:upi|p2a|p2m|dr|cr|inf|inft|neft|imps|rtgs|ach|nach|pos|ecom|transfer|payment|purchase|txn|ref|na|null|[a-z]*\d[a-z\d -]*)$/i;
const tidy=s=>s.replace(/\s+/g,' ').trim();
const shorten=s=>s.length>72?s.slice(0,69).trimEnd()+'…':s;
export function transactionLabel(transaction){
 const raw=tidy(String(transaction.description||''));
 const channel=raw.match(/\b(UPI|NEFT|IMPS|RTGS|NACH|ACH|ATM|POS)\b/i)?.[1].toUpperCase()||(/\bINFT\b/i.test(raw)?'Internal transfer':'');
 if(transaction.displayName?.trim())return {title:transaction.displayName.trim(),source:'Your label',channel};
 let title='';
 if(/\b(?:self[\s/-]*transfer|own[\s/-]*account)\b/i.test(raw))title='Self transfer';
 else if(/\b(?:credit card payment|cc payment)\b/i.test(raw))title='Credit card payment';
 else if(/\b(?:atm|cash withdrawal)\b/i.test(raw)&&!/\b(?:refund|reversal|deposit|fee|fees|charge|charges|failed|declined)\b/i.test(raw))title='Cash withdrawal';
 else {
  const merchant=merchants.find(([,pattern])=>pattern.test(raw))?.[0];
  if(merchant)title=(/\b(?:refund|reversal)\b/i.test(raw)?'Refund · ':'')+merchant;
  else if(/[/|]/.test(raw)&&channel){
   // Only use an explicit name segment, never infer a recipient from bank codes or reference IDs.
   const pieces=raw.split(/[/|]/).map(tidy).filter(s=>s&&!noise.test(s)&&!/@/.test(s)&&!/\d{4}|\b[A-Z]{4}0[A-Z0-9]{6}\b/.test(s));
   if(pieces.length===1&&pieces[0].length<=60)title=pieces[0];
  }
 }
 return {title:title||shorten(raw)||'Transaction',source:title&&title!==raw?'Suggested label':raw.length>72?'Shortened narration':'Bank narration',channel};
}
