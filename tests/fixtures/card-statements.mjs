// Synthetic credit card statements modelled on Indian bank layouts. No real customer data.
// makePDF writes positioned Helvetica text so tests exercise pdf.js extraction, not hand-built line objects.
export function makePDF(pages){
 const esc=t=>t.replace(/[\\()]/g,c=>'\\'+c),objects=['<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],kids=[];
 for(const items of pages){const stream=items.map(([x,y,text,size=8])=>`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`).join('\n');
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`);kids.push(`${objects.length} 0 R`);}
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
 let out='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
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
export const expected={
 hdfc:{period:{from:'2026-08-24',to:'2026-09-23'},openingHint:-500000,closingHint:-997490,
  rows:[['2026-08-25','SWIGGY BANGALORE',-45000,'Food & dining','Expense'],['2026-08-28','NETBANKING TRANSFER (Ref# ST2608280012345)',500000,'Transfers','Transfer'],['2026-09-02','AMAZON PAY INDIA PRIVATE LIMITED MUMBAI',-129900,'Shopping','Expense'],['2026-09-10','AMAZON REFUND ORDER 402-1234',50000,'Shopping','Refund'],['2026-09-15','EMI 3/12 RELIANCE DIGITAL',-850000,'Loan EMI','Expense'],['2026-09-20','ANNUAL FEE',-20000,'Fees & charges','Expense'],['2026-09-20','IGST',-2590,'Fees & charges','Expense']]},
 sbi:{period:{from:'2026-08-15',to:'2026-09-14'},openingHint:-200000,closingHint:-345120,
  rows:[['2026-08-16','PAYMENT RECEIVED 000ICCMP1234',200000,'Transfers','Transfer'],['2026-08-18','ZOMATO LTD GURGAON',-64200,'Food & dining','Expense'],['2026-09-02','NETFLIX.COM SINGAPORE',-264900,'Entertainment','Expense'],['2026-09-02','MARKUP FEE ON INTL TXN',-9272,'Fees & charges','Expense'],['2026-09-02','GST @18%',-1669,'Fees & charges','Expense'],['2026-09-05','FUEL SURCHARGE WAIVER',5000,'Travel & transport','Refund'],['2026-09-06','INDIAN OIL PETROL PUMP',-10079,'Travel & transport','Expense']]},
 icici:{period:{from:'2026-08-16',to:'2026-09-15'},openingHint:0,closingHint:-144900,
  rows:[['2026-08-17','UBER INDIA SYSTEMS',-34900,'Travel & transport','Expense'],['2026-08-21','OPENAI CHATGPT SUBSCR',-210000,'Uncategorized','Expense'],['2026-09-01','BBPS Payment received',100000,'Transfers','Transfer']]},
};
