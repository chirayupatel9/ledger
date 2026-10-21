// A synthetic four-month ledger ending this month (IST): salary, rent, insurance, SIPs linked to a fund account, food,
// groceries, a credit card with Amazon and Netflix, and running balances. Used by the insights and customize live tests.
// Four months ending this month (IST), so "coming up" and "this month" line up with today.
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()),month=(k)=>{const d=new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7)-1-k,1));return d.toISOString().slice(0,7);};
const months=[3,2,1,0].map(month),day=(m,d)=>`${m}-${String(Math.min(d,Number(today.slice(8)))).padStart(2,'0')}`;
export function insightsLedger(){
 let n=0;const names={h:'HDFC Savings',c:'ICICI Card',i:'Mutual funds'},t=(accountId,date,description,amount,category,type,extra={})=>({id:'t'+(++n),statementId:'s-'+accountId,accountId,account:names[accountId],date,description,amount,category,type,review:false,...extra});
 const h=[],c=[],i=[],thisMonth=months.at(-1),d=(m,x)=>m===thisMonth?day(m,x):`${m}-${String(x).padStart(2,'0')}`;
 for(const m of months){
  h.push(t('h',d(m,1),'NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY',12500000,'Salary','Income'),t('h',d(m,2),'UPI-LANDLORD RAMESH KUMAR-ramesh.k@okhdfcbank-628533334444-RENT',-3500000,'Rent','Expense',{taxTag:'none'}),
   t('h',d(m,3),'ACH D- HDFC LIFE INSURANCE CO-PREMIUM',-450000,'Insurance','Expense',{taxTag:'80c'}),t('h',d(m,4),'ACH D- NSE CLEARING LTD-SIP',-2500000,'Investments','Transfer',{transferId:'sip-'+m,taxTag:'none'}),
   t('h',d(m,5),'UPI-SWIGGY LIMITED-swiggy@axisbank-628512345678',-64900,'Food & dining','Expense'),t('h',d(m,6),'UPI-RELIANCE RETAIL LTD-relianceretail@hdfcbank-628598765432',-342050,'Groceries','Expense'));
  c.push(t('c',d(m,7),'AMAZON PAY INDIA PRIVATE LIMITED',-189900,'Shopping','Expense'),t('c',d(m,8),'NETFLIX.COM MUMBAI',m===thisMonth?-64900:-49900,'Entertainment','Expense'));
  i.push(t('i',d(m,4),'SIP Purchase · Alpha Flexi Cap Fund · Folio 111/01 · 13.027 units @ ₹1918.97',2500000,'Investments','Transfer',{transferId:'sip-'+m}));
 }
 c.push(t('c',day(months.at(-1),9),'AMAZON PAY INDIA PRIVATE LIMITED',-1500000,'Shopping','Expense'));
 let bal=5000000;for(const x of h.sort((a,b)=>a.date.localeCompare(b.date))){bal+=x.amount;x.balance=bal;}
 const st=(id,accountId,count,extra={})=>({id,accountId,account:names[accountId],name:id+'.pdf',count,created:today+'T00:00:00Z',...extra});
 return {schemaVersion:2,initialized:true,rules:[],titleRules:[],accounts:[{id:'h',name:'HDFC Savings',bank:'HDFC Bank',type:'Savings',last4:'4821',currency:'INR',archived:false},{id:'c',name:'ICICI Card',bank:'ICICI Bank',type:'Credit card',last4:'9003',currency:'INR',archived:false},{id:'i',name:'Mutual funds',bank:'',type:'Investment',last4:'',currency:'INR',archived:false}],
  statements:[st('s-h','h',h.length),st('s-c','c',c.length,{from:months[0]+'-01',to:today,opening:0,closing:c.reduce((v,x)=>v+x.amount,0)}),st('s-i','i',i.length)],transactions:[...h,...c,...i]};
}
export const ledgerMonths=months;
