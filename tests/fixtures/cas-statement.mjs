// Synthetic mutual fund Consolidated Account Statement in the CAMS / KFintech layout. No real investor data.
// Alpha: monthly SIPs and a lump sum across a page break. Beta Mid Cap: a SIP, a switch in (with stamp duty) and a
// redemption with STT; its scheme name wraps onto the ISIN line. Beta Liquid shares the folio, carries units in from
// before the period and switches out. Gamma: a purchase, a note row and an IDCW reinvestment.
const num=(right,y,text)=>[right-text.length*4.45,y,text];
const row=(y,date,text,amount,units,nav,balance)=>[[40,y,date],[96,y,text],...[[330,amount],[392,units],[452,nav],[520,balance]].filter(([,v])=>v).map(([right,v])=>num(right,y,v))];
const columns=y=>[[40,y,'Date'],[96,y,'Transaction'],[300,y,'Amount'],[365,y,'Units'],[430,y,'NAV'],[495,y,'Unit'],[300,y-10,'(INR)'],[430,y-10,'(INR)'],[495,y-10,'Balance']];
const header=(page,of)=>[[170,812,'Consolidated Account Statement',14],[270,24,`Page ${page} of ${of}`]];
const folio=(y,no)=>[[40,y,`Folio No: ${no}`],[200,y,'PAN: ABCDE1234F'],[320,y,'KYC: OK'],[380,y,'PAN: OK'],[40,y-12,'TEST INVESTOR']];
const closing=(y,units,nav,cost,value)=>[[40,y,`Closing Unit Balance: ${units}`],[220,y,`NAV on 17-Oct-2026: INR ${nav}`],[40,y-12,`Total Cost Value: ${cost}`],[220,y-12,`Market Value on 17-Oct-2026: INR ${value}`]];
export const casPages=[
 [...header(1,3),[215,796,'01-May-2026 To 20-Oct-2026',9],[40,772,'Email Id: investor@example.test'],[40,758,'TEST INVESTOR'],[40,746,'1 EXAMPLE ROAD, TESTNAGAR 400001'],
  [40,716,'PORTFOLIO SUMMARY',9],[40,702,'Mutual Fund'],[330,702,'Cost Value (INR)'],[450,702,'Market Value (INR)'],
  [40,690,'Alpha Mutual Fund'],num(395,690,'3,25,000.00'),num(520,690,'3,35,022.42'),[40,678,'Beta Mutual Fund'],num(395,678,'45,580.23'),num(520,678,'54,961.36'),
  [40,666,'Gamma Mutual Fund'],num(395,666,'10,138.63'),num(520,666,'10,403.94'),[40,654,'Total'],num(395,654,'3,80,718.86'),num(520,654,'4,00,387.72'),
  ...columns(626),[40,600,'Alpha Mutual Fund',9],...folio(586,'111 / 01'),
  [40,562,'A1FCG-Alpha Flexi Cap Fund - Regular Growth (Non-Demat) - ISIN: INF000A01AA1(Advisor: ARN-000000) Registrar : CAMS'],
  [40,550,'Nominee 1: TEST NOMINEE'],[220,550,'Nominee 2:'],[340,550,'Nominee 3:'],[40,538,'Opening Unit Balance: 0.000'],
  ...row(524,'10-May-2026','Systematic Investment (1/60)','24,998.75','13.512','1,850.10','13.512'),...row(512,'10-May-2026','*** Stamp Duty ***','1.25'),
  ...row(500,'10-Jun-2026','Systematic Investment (2/60)','24,998.75','13.293','1,880.55','26.805'),...row(488,'10-Jun-2026','*** Stamp Duty ***','1.25'),
  ...row(476,'10-Jul-2026','Systematic Investment (3/60)','24,998.75','13.027','1,918.97','39.832'),...row(464,'10-Jul-2026','*** Stamp Duty ***','1.25')],
 [...header(2,3),...columns(780),
  ...row(756,'10-Aug-2026','Systematic Investment (4/60)','24,998.75','12.820','1,950.00','52.652'),...row(744,'10-Aug-2026','*** Stamp Duty ***','1.25'),
  ...row(732,'10-Sep-2026','Systematic Investment (5/60)','24,998.75','12.560','1,990.40','65.212'),...row(720,'10-Sep-2026','*** Stamp Duty ***','1.25'),
  ...row(708,'21-Sep-2026','Purchase','1,99,990.00','98.110','2,038.43','163.322'),...row(696,'21-Sep-2026','*** Stamp Duty ***','10.00'),
  ...closing(678,'163.322','2,051.30','3,25,000.00','3,35,022.42'),
  [40,640,'Beta Mutual Fund',9],...folio(626,'222/02'),
  [40,602,'B12MG-Beta Mid Cap Fund - Regular Growth (Non-Demat) -'],[40,590,'ISIN: INF000B01BB2(Advisor: DIRECT) Registrar : KFINTECH'],[40,578,'Opening Unit Balance: 0.000'],
  ...row(564,'10-Jul-2026','Systematic Investment (1/24)','24,998.75','54.582','458.0033','54.582'),...row(552,'10-Jul-2026','*** Stamp Duty ***','1.25'),
  ...row(540,'10-Aug-2026','Switch-In - From Beta Liquid Fund','49,997.50','106.355','470.10','160.937'),...row(528,'10-Aug-2026','*** Stamp Duty ***','2.50'),
  ...row(516,'30-Sep-2026','Redemption','(30,000.00)','(61.200)','490.20','99.737'),...row(504,'30-Sep-2026','*** STT Paid ***','0.30'),
  ...closing(486,'99.737','495.12','35,580.23','49,381.79')],
 [...header(3,3),...columns(780),...folio(756,'222/02'),
  [40,732,'B03LG-Beta Liquid Fund - Regular Growth - ISIN: INF000B01CC3(Advisor: DIRECT) Registrar : KFINTECH'],[40,720,'Opening Unit Balance: 20.000'],
  ...row(706,'10-Aug-2026','Switch-Out - To Beta Mid Cap Fund','(50,000.00)','(18.000)','2,777.7778','2.000'),
  ...closing(688,'2.000','2,790.10','10,000.00','5,580.20'),
  [40,650,'Gamma Mutual Fund',9],...folio(636,'333/03'),
  [40,612,'G7LMD-Gamma Large and Mid Cap Fund - Direct Plan - IDCW - ISIN: INF000G01DD4(Advisor: DIRECT) Registrar : CAMS'],[40,600,'Opening Unit Balance: 0.000'],
  ...row(586,'05-Jun-2026','Purchase','9,999.50','92.417','108.20','92.417'),...row(574,'05-Jun-2026','*** Stamp Duty ***','0.50'),
  ...row(562,'15-Jul-2026','*** Address Updated from KRA Data ***'),
  ...row(550,'20-Aug-2026','IDCW Reinvestment @ Rs. 1.50 per unit','138.63','1.261','109.94','93.678'),
  ...closing(532,'93.678','111.05','10,138.63','10,403.94'),
  [40,480,'This Consolidated Account Statement is brought to you by CAMS and KFintech as an investor friendly initiative.'],[40,468,'Mutual fund investments are subject to market risks.']],
];
// The same statement with each line in one text run, as some PDF generators write it.
export const casRuns=casPages.map(items=>{const lines=new Map();for(const [x,y,text,size] of items){const l=lines.get(y)||lines.set(y,[]).get(y);l.push([x,text,size]);}
 return [...lines].map(([y,l])=>{l.sort((a,b)=>a[0]-b[0]);return [l[0][0],y,l.map(i=>i[1]).join('  '),l[0][2]];});});
export const casPassword='ABCDE1234F';
