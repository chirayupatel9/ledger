// Synthetic data only: multi-line headers and narrations in numbered savings-account PDFs.
export const numberedHeader=y=>[
 [60,y,'Transaction'],[399,y,'Withdrawal'],[474,y,'Deposit'],[532,y,'Balance'],
 [23,y-5,'S No.'],[122,y-5,'Cheque Number'],[247,y-5,'Transaction Remarks'],
 [74,y-10,'Date'],[396,y-10,'Amount (INR)'],[462,y-10,'Amount (INR)'],[538,y-10,'(INR)'],
];
const money=(right,y,text)=>[right-text.length*4.8,y,text,8.64];
export function numberedRow(serial,y,date,words,debit,credit,balance){
 return [[25,y,String(serial)],[61,y,date],[125,y,'123456'],
  ...(debit?[money(453,y,debit)]:[]),...(credit?[money(519,y,credit)]:[]),money(571,y,balance),
  ...words.map((text,i)=>[192,y+5-i*10,text])];
}
export const numberedBank=[
 [[30,800,'Statement of Transactions in Saving Account in INR for the period April 1, 2026 - October 20, 2026'],
  ...numberedHeader(752),
  ...numberedRow(1,722,'08.04.2026',['NETFLIX CO','UPI/NETFLIX CO/netflix@example/Monthly','BANK/100000000001/REFERENCE','PART-2/','PART-3/','PART-4/','PART-5/','END/'],'649.00',null,'9351.00'),
  ...numberedRow(2,612,'09.04.2026',['Salary','NEFT/EMPLOYER/REFERENCE'],null,'1000000000.00','1000009351.00'),
  [192,550,'Page footer must not become narration']],
 [[418,800,'2'],...numberedHeader(752),
  ...numberedRow(3,722,'20.10.2026',['Refund','UPI/REFUND/REFERENCE'],null,'100.00','1000009451.00'),
  ...numberedRow(4,682,'20.10.2026',['Self transfer','NEFT/SELF/REFERENCE'],'50.00',null,'1000009401.00'),
  [19,624,'Sincerely,'],[192,580,'Customer information and bank terms']],
];
