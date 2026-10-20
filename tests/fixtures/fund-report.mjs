// Synthetic mutual fund transaction report in a distributor's Excel layout (no real customer data).
import * as XLSX from '../../apps/web/public/vendor/xlsx.mjs';
export const fundRows=[
 ['10-07-2026','Alpha Flexi Cap Fund - Regular Plan - Growth','111/01','SIP Purchase','24998.75','13.027','1918.97','1.25'],
 ['10-07-2026','Beta Mid Cap Fund - Regular Plan - Growth','222/02','SIP Purchase','24998.75','54.582','458.0033','1.25'],
 ['10-07-2026','Gamma Large and Mid Cap Fund - Regular Plan - Growth','333/03','SIP Purchase','24998.75','227.241','110.01','1.25'],
 ['20-07-2026','Delta Small Cap Fund - Regular Plan - Growth','444/04','SIP Purchase','19999','396.122','50.487','1'],
 ['21-09-2026','Alpha Flexi Cap Fund - Regular Plan - Growth','111/01','Purchase','199990','98.11','2038.43','10'],
 ['30-09-2026','Beta Mid Cap Fund - Regular Plan - Growth','222/02','Redemption','30000','61.2','490.2','0'],
];
export function fundReport(rows=fundRows,{total=true}={}){
 const net=rows.reduce((v,r)=>v+Number(r[4]),0),stamp=rows.reduce((v,r)=>v+Number(r[7]),0);
 const aoa=[[],['TEST INVESTOR (ABCDE1234F)','','','','','Example Investment Services'],['Detailed Transaction Report From 01/06/2026 To 21/10/2026'],
  ['Sr. No.','Client Name','PAN Number','Transaction Date','Scheme Name','Asset Type','Folio No.','Transaction Type','Amount','Unit','Nav','TDS','Stamp Duty'],
  ...rows.map(([date,scheme,folio,type,amount,units,nav,stampDuty],i)=>[String(i+1),'TEST INVESTOR','ABCDE1234F',date,scheme,'Equity',folio,type,Number(amount),Number(units),Number(nav),0,Number(stampDuty)]),
  ...(total?[['Total','','','','','','','',net,'','','0',stamp]]:[]),[],['Disclaimer - Mutual Funds Investments are subject to market risk.']];
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(aoa),'TEST INVESTOR');
 return Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
}
