// Synthetic credit card statements modelled on Indian bank layouts. No real customer data.
// makePDF writes positioned Helvetica text so tests exercise pdf.js extraction, not hand-built line objects.
// With a password the content is encrypted (standard security handler, RC4, revision 2), like a bank's or CAS PDF.
import {createHash} from 'node:crypto';
const md5=(...parts)=>createHash('md5').update(Buffer.concat(parts)).digest();
function rc4(key,data){const S=[...Array(256).keys()];for(let i=0,j=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}
 const out=Buffer.alloc(data.length);for(let k=0,i=0,j=0;k<data.length;k++){i=(i+1)&255;j=(j+S[i])&255;[S[i],S[j]]=[S[j],S[i]];out[k]=data[k]^S[(S[i]+S[j])&255];}return out;}
function encryption(password){
 const PAD=Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a','hex'),pad=p=>Buffer.concat([Buffer.from(p,'latin1'),PAD]).subarray(0,32);
 const owner=rc4(md5(pad(password+'-owner')).subarray(0,5),pad(password)),perms=Buffer.alloc(4),id=md5(Buffer.from('ledger synthetic statement'));perms.writeInt32LE(-4);
 const key=md5(pad(password),owner,perms,id).subarray(0,5),hex=b=>b.toString('hex');
 return {id:hex(id),dictionary:`<< /Filter /Standard /V 1 /R 2 /O <${hex(owner)}> /U <${hex(rc4(key,PAD))}> /P -4 >>`,
  stream:(object,text)=>rc4(md5(key,Buffer.from([object&255,object>>8&255,object>>16&255,0,0])).subarray(0,10),Buffer.from(text,'latin1')).toString('latin1')};
}
export function makePDF(pages,{password}={}){
 const esc=t=>t.replace(/[\\()]/g,c=>'\\'+c),objects=['<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],kids=[],crypt=password&&encryption(password);
 for(const items of pages){let stream=items.map(([x,y,text,size=8])=>`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`).join('\n');if(crypt)stream=crypt.stream(objects.length+1,stream);
  objects.push(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`);kids.push(`${objects.length} 0 R`);}
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;if(crypt)objects.push(crypt.dictionary);
 let out='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R${crypt?` /Encrypt ${objects.length} 0 R /ID [<${crypt.id}> <${crypt.id}>]`:''} >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
// HDFC-style: summary labels in one row with values underneath, "Cr" attached or separate, wrapped description.
export const hdfc=[[
 [40,800,'HDFC Bank Credit Card Statement',12],[40,780,'Billing Period 24 Aug, 2026 - 23 Sep, 2026'],[40,766,'Payment Due Date 13/10/2026'],
 [40,740,'Opening Balance'],[140,740,'Payment/Credits'],[240,740,'Purchase/Debits'],[340,740,'Finance Charges'],[440,740,'Total Dues'],[520,740,'Minimum Amount Due'],
 [40,728,'5,000.00'],[140,728,'5,500.00'],[240,728,'10,474.90'],[340,728,'0.00'],[440,728,'9,974.90'],[520,728,'500.00'],
 [40,700,'Date'],[110,700,'Transaction Description'],[480,700,'Amount (in Rs.)'],
 [40,686,'25/08/2026'],[110,686,'SWIGGY BANGALORE'],[480,686,'450.00'],
 [40,672,'28/08/2026'],[110,672,'NETBANKING TRANSFER (Ref# ST2608280012345)'],[480,672,'5,000.00'],[515,672,'Cr'],
 [40,658,'02/09/2026'],[110,658,'AMAZON PAY INDIA PRIVATE LIMITED'],[480,658,'1,299.00'],
 [110,648,'MUMBAI'],
 [40,634,'10/09/2026'],[110,634,'AMAZON REFUND ORDER 402-1234'],[480,634,'500.00 Cr'],
 [40,620,'15/09/2026'],[110,620,'EMI 3/12 RELIANCE DIGITAL'],[480,620,'8,500.00'],
 [40,606,'20/09/2026'],[110,606,'ANNUAL FEE'],[480,606,'200.00'],
 [40,592,'20/09/2026'],[110,592,'IGST'],[480,592,'25.90'],
]];
// SBI Card-style: inline summary, D/C markers in their own column, short year dates, GST and forex markup.
export const sbi=[[
 [40,800,'SBI Card Statement',12],[40,780,'Statement Period : 15 Aug 26 to 14 Sep 26'],
 [40,766,'Previous Balance : 2,000.00'],[300,766,'Total Outstanding : Rs. 3,451.20'],[40,752,'Minimum Amount Due : 200.00'],
 [40,720,'Date'],[110,720,'Transaction Details'],[470,720,'Amount (Rs.)'],
 [40,706,'16 Aug 26'],[110,706,'PAYMENT RECEIVED 000ICCMP1234'],[470,706,'2,000.00'],[520,706,'C'],
 [40,692,'18 Aug 26'],[110,692,'ZOMATO LTD GURGAON'],[470,692,'642.00'],[520,692,'D'],
 [40,678,'02 Sep 26'],[110,678,'NETFLIX.COM SINGAPORE'],[470,678,'2,649.00'],[520,678,'D'],
 [40,664,'02 Sep 26'],[110,664,'MARKUP FEE ON INTL TXN'],[470,664,'92.72'],[520,664,'D'],
 [40,650,'02 Sep 26'],[110,650,'GST @18%'],[470,650,'16.69'],[520,650,'D'],
 [40,636,'05 Sep 26'],[110,636,'FUEL SURCHARGE WAIVER'],[470,636,'50.00'],[520,636,'C'],
 [40,622,'06 Sep 26'],[110,622,'INDIAN OIL PETROL PUMP'],[470,622,'100.79'],[520,622,'D'],
]];
// ICICI-style: serial numbers, reward points and a foreign-currency column; month-name period; minus for credits.
export const icici=[[
 [40,800,'ICICI Bank Credit Card',12],[40,780,'Statement period : August 16, 2026 to September 15, 2026'],
 [40,766,'Total Amount due'],[160,766,'Minimum Amount due'],[280,766,'Payment Due Date'],
 [40,754,'1,449.00'],[160,754,'100.00'],[280,754,'03/10/2026'],
 [40,740,'Previous Balance 0.00'],
 [40,710,'Date'],[100,710,'SerNo.'],[170,710,'Transaction Details'],[360,710,'Reward Points'],[420,710,'Intl.# amount'],[500,710,'Amount (in Rs.)'],
 [40,696,'17/08/2026'],[100,696,'11223344556'],[170,696,'UBER INDIA SYSTEMS'],[360,696,'4'],[500,696,'349.00'],
 [40,682,'21/08/2026'],[100,682,'11223344557'],[170,682,'OPENAI CHATGPT SUBSCR'],[360,682,'22'],[420,682,'USD 23.60'],[500,682,'2,100.00'],
 [40,668,'01/09/2026'],[100,668,'11223344558'],[170,668,'BBPS Payment received'],[360,668,'0'],[500,668,'-1,000.00'],
]];
// ICICI Amazon Pay layouts (synthetic data). App "last statement": inline summary, amount before reward and
// reference columns, whole-rupee amounts, "Dr."/"Cr." beside the amount, wrapped descriptions.
export const iciciApp=[[
 [292,800,'VIEW LAST STATEMENT',10],[40,770,'Card Holder Name'],[228,770,'TEST USER'],[416,770,'Card Type'],[604,770,'primary'],
 [40,740,'Previous Balance'],[228,740,'INR'],[246,740,'10000.00'],[416,740,'Statement Date'],[520,740,'13-10-2026'],
 [40,720,'Purchases and Other Charges'],[228,720,'INR'],[246,720,'4500.50'],[416,720,'Payment Due Date'],[520,720,'30-10-2026'],
 [40,700,'Payments and Other Credits'],[228,700,'INR'],[246,700,'10000.00'],[416,700,'Total Credit Limit'],[520,700,'INR 50000'],
 [40,680,'Total Amount Due'],[228,680,'INR'],[246,680,'4500.50'],[40,660,'Minimum Amount Due'],[228,660,'INR'],[246,660,'230'],
 [40,640,'Cash Advances'],[228,640,'INR'],[246,640,'0'],[416,640,'Statement Period'],[490,640,'14-09-2026'],[535,640,'TO'],[548,640,'13-10-2026'],
 [40,600,'Transaction Details'],[45,580,'Transaction Date'],[204,580,'Details'],[363,580,'Amount (INR)'],[440,580,'Reward Points'],[500,580,'Reference Number'],
 [45,560,'05-10-2026'],[204,560,'AMAZON PAY IN E'],[363,560,'3000'],[393,560,'Dr.'],[440,560,'150'],[500,560,'90000000003'],[204,548,'COMMERC - BANGALORE'],
 [45,530,'28-09-2026'],[204,530,'BANK PAYMENT'],[363,530,'10000.00'],[405,530,'Cr.'],[440,530,'0'],[500,530,'90000000002'],[204,518,'RECEIVED, THANK YOU'],
 [45,500,'14-09-2026'],[204,500,'AMAZON PAY WALLET'],[363,500,'1500.50'],[405,500,'Dr.'],[440,500,'30'],[500,500,'90000000001'],[204,488,'LOAD - BANGALORE'],
]];
// Same statement as an e-statement: summary labels with values on later lines, ₹ extracted as a backtick,
// a chart label in front of one row's date, serial numbers, and month-name period at the foot.
export const iciciEstatement=[[
 [38,780,'CREDIT CARD STATEMENT',10],
 [81,700,'Total Amount due'],[221,700,'Previous Balance'],[306,700,'Purchases / Charges'],[404,700,'Cash Advances'],[488,700,'Payments / Credits'],
 [189,691,'='],[285,691,'+'],[378,691,'+'],[471,691,'-'],[90,685,'`'],[95,685,'4,500.50'],
 [229,681,'`'],[233,681,'10,000.00'],[318,681,'`'],[322,681,'4,500.50'],[418,681,'`'],[422,681,'0.00'],[496,681,'`10,000.00'],
 [73,660,'Minimum Amount due'],[96,650,'`'],[101,650,'230.00'],
 [89,600,'SPENDS OVERVIEW'],[208,600,'Date'],[262,600,'SerNo.'],[305,600,'Transaction Details'],[443,600,'Reward'],[486,600,'Intl.'],[522,600,'Amount (in'],[552,600,'`'],[555,600,')'],
 [445,595,'Points'],[481,595,'amount'],[208,580,'XXXXXXXXXXXX1234'],
 [208,566,'14/09/2026'],[252,566,'90000000001'],[305,566,'AMAZON PAY WALLET LOAD BANGALORE'],[450,566,'30'],[533,566,'1,500.50'],[305,559,'IN'],
 [48,546,'100%'],[208,546,'28/09/2026'],[252,546,'90000000002'],[305,546,'BANK PAYMENT RECEIVED, THANK YOU'],[452,546,'0'],[520,546,'10,000.00 CR'],
 [208,526,'05/10/2026'],[252,526,'90000000003'],[305,526,'AMAZON PAY IN E COMMERC BANGALORE'],[449,526,'150'],[533,526,'3,000.00'],[53,519,'Others-100%'],[305,519,'IN'],
 [205,500,'#'],[209,500,'International Spends'],[40,60,'Statement period : September 13, 2026 to October 12, 2026'],
]];
export const expected={
 hdfc:{period:{from:'2026-08-24',to:'2026-09-23'},openingHint:-500000,closingHint:-997490,
  rows:[['2026-08-25','SWIGGY BANGALORE',-45000,'Food & dining','Expense'],['2026-08-28','NETBANKING TRANSFER (Ref# ST2608280012345)',500000,'Transfers','Transfer'],['2026-09-02','AMAZON PAY INDIA PRIVATE LIMITED MUMBAI',-129900,'Shopping','Expense'],['2026-09-10','AMAZON REFUND ORDER 402-1234',50000,'Shopping','Refund'],['2026-09-15','EMI 3/12 RELIANCE DIGITAL',-850000,'Loan EMI','Expense'],['2026-09-20','ANNUAL FEE',-20000,'Fees & charges','Expense'],['2026-09-20','IGST',-2590,'Fees & charges','Expense']]},
 sbi:{period:{from:'2026-08-15',to:'2026-09-14'},openingHint:-200000,closingHint:-345120,
  rows:[['2026-08-16','PAYMENT RECEIVED 000ICCMP1234',200000,'Transfers','Transfer'],['2026-08-18','ZOMATO LTD GURGAON',-64200,'Food & dining','Expense'],['2026-09-02','NETFLIX.COM SINGAPORE',-264900,'Entertainment','Expense'],['2026-09-02','MARKUP FEE ON INTL TXN',-9272,'Fees & charges','Expense'],['2026-09-02','GST @18%',-1669,'Fees & charges','Expense'],['2026-09-05','FUEL SURCHARGE WAIVER',5000,'Travel & transport','Refund'],['2026-09-06','INDIAN OIL PETROL PUMP',-10079,'Travel & transport','Expense']]},
 icici:{period:{from:'2026-08-16',to:'2026-09-15'},openingHint:0,closingHint:-144900,
  rows:[['2026-08-17','UBER INDIA SYSTEMS',-34900,'Travel & transport','Expense'],['2026-08-21','OPENAI CHATGPT SUBSCR',-210000,'Uncategorized','Expense'],['2026-09-01','BBPS Payment received',100000,'Transfers','Transfer']]},
 iciciApp:{period:{from:'2026-09-14',to:'2026-10-13'},openingHint:-1000000,closingHint:-450050,
  rows:[['2026-10-05','AMAZON PAY IN E COMMERC - BANGALORE',-300000,'Shopping','Expense'],['2026-09-28','BANK PAYMENT RECEIVED, THANK YOU',1000000,'Transfers','Transfer'],['2026-09-14','AMAZON PAY WALLET LOAD - BANGALORE',-150050,'Transfers','Transfer']]},
 iciciEstatement:{period:{from:'2026-09-13',to:'2026-10-12'},openingHint:-1000000,closingHint:-450050,
  rows:[['2026-09-14','AMAZON PAY WALLET LOAD BANGALORE IN',-150050,'Transfers','Transfer'],['2026-09-28','BANK PAYMENT RECEIVED, THANK YOU',1000000,'Transfers','Transfer'],['2026-10-05','AMAZON PAY IN E COMMERC BANGALORE IN',-300000,'Shopping','Expense']]},
};
