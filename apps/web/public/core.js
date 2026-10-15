export const categories=['Salary','Freelance & business','Interest','Shopping','Food & dining','Groceries','Travel & transport','Bills & utilities','Rent','Health','Entertainment','Investments','Transfers','Uncategorized'];
export const colors=['#426e59','#588d79','#85aa91','#8b93cc','#d7a272','#aab786','#729db0','#c9b480','#b6a1c3','#c37f7c','#8cacc1','#94a99c','#a0aaa7','#c5c8c6'];
const rules=[['Salary',/salary|payroll/i],['Interest',/interest credit|int\.paid/i],['Food & dining',/swiggy|zomato|starbucks|restaurant|cafe|coffee/i],['Groceries',/bigbasket|blinkit|zepto|dmart|grocery|groceries/i],['Travel & transport',/uber|ola\b|irctc|metro|petrol|fuel|indigo/i],['Shopping',/amazon|flipkart|myntra|ikea|shopping/i],['Bills & utilities',/airtel|jio\b|electricity|broadband|bescom/i],['Rent',/\brent\b/i],['Health',/apollo|pharmacy|hospital|clinic/i],['Entertainment',/netflix|spotify|hotstar|cinema/i],['Investments',/zerodha|groww|mutual fund|\bsip\b/i]];
export function classify(description,amount,custom=[]){
 const own=custom.find(r=>description.toLowerCase().includes(r.keyword.toLowerCase()));
 const found=own?.category||rules.find(([,re])=>re.test(description))?.[0];
 const transfer=/self transfer|own account|credit card payment|cc payment/i.test(description)||found==='Transfers'||found==='Investments';
 const type=transfer?'Transfer':amount>=0?(/refund|reversal/i.test(description)?'Refund':'Income'):'Expense';
 const category=transfer?(found==='Investments'?found:'Transfers'):found||'Uncategorized';
 return {category,type,review:!found||transfer||(amount>0&&!['Salary','Interest'].includes(category))};
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
export function parseCSV(text){
 const sample=text.split(/\r?\n/).slice(0,8).join('\n');const delim=(sample.match(/\t/g)||[]).length>(sample.match(/,/g)||[]).length?'\t':(sample.match(/;/g)||[]).length>(sample.match(/,/g)||[]).length?';':',';
 let rows=[],row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++}else quote=!quote;}else if(c===delim&&!quote){row.push(field.trim());field=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field=''}else field+=c;}
 row.push(field.trim());if(row.some(Boolean))rows.push(row);if(quote)throw Error('The CSV contains an unclosed quoted field. Please export it again.');
 const h=rows.findIndex(r=>r.some(c=>/date/i.test(c))&&r.some(c=>/description|narration|particular|details|remark/i.test(c)));
 if(h<0)throw Error('No transaction header found. Include Date, Description, and Amount, or Debit and Credit columns.');return {headers:rows[h].map(s=>s.replace(/^\uFEFF/,'')),rows:rows.slice(h+1)};
}
export function guessMapping(headers){
 const find=(re)=>headers.findIndex(h=>re.test(h));return {date:find(/^(transaction |txn |tran )?date|^date/i),description:find(/description|narration|particular|details|remark/i),amount:find(/^amount$|transaction amount/i),debit:find(/debit|withdrawal/i),credit:find(/credit|deposit/i),direction:find(/^(type|dr.?cr|cr.?dr|transaction type)$/i)};
}
export function mapRows(data,mapping,account,custom=[]){
 let transactions=[],invalid=[];
 data.rows.forEach((r,i)=>{const date=parseDate(r[mapping.date]),description=r[mapping.description]?.trim();let amount=null;
 if(mapping.amount>=0){amount=parseMoney(r[mapping.amount]);const dir=String(r[mapping.direction]||'');if(amount!==null&&/^(dr|debit|withdrawal)$/i.test(dir))amount=-Math.abs(amount);}
 else {const debit=parseMoney(r[mapping.debit]),credit=parseMoney(r[mapping.credit]);if(debit!==null&&credit!==null&&debit!==0&&credit!==0){invalid.push(i+2);return;}if(debit!==null||credit!==null)amount=Math.abs(credit||0)-Math.abs(debit||0);}
 if(!date||!description||amount===null||amount===0){invalid.push(i+2);return;}
 transactions.push({id:crypto.randomUUID(),date,description,amount,account,...classify(description,amount,custom)});
 });return {transactions,invalid};
}
export function fingerprint(t){return [t.date,t.accountId||t.account.toLowerCase().trim(),t.description.toLowerCase().replace(/\s+/g,' ').trim(),t.amount].join('|')}
export function summarize(rows){let income=0,expenses=0,transfers=0;for(const t of rows){if(t.type==='Income')income+=t.amount;else if(t.type==='Expense'||t.type==='Refund')expenses-=t.amount;else transfers+=Math.abs(t.amount)}return {income,expenses,net:income-expenses,transfers,savings:income>0?(income-expenses)/income*100:0};}
export function csvExport(rows){const fields=['date','description','account','type','category','amount','review','note'];return '\uFEFF'+[fields.join(','),...rows.map(t=>fields.map(k=>{let s=String(k==='amount'?(t.amount/100).toFixed(2):t[k]??'');if(k!=='amount'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(','))].join('\r\n');}
