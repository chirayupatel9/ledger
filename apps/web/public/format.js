// Ledger keeps Indian Standard Time whatever the device's time zone: "today", the financial year and every timestamp.
export const IST='Asia/Kolkata';
const istParts=new Intl.DateTimeFormat('en-CA',{timeZone:IST,year:'numeric',month:'2-digit',day:'2-digit'});
// The IST calendar date (YYYY-MM-DD) of an instant: a Date, epoch milliseconds or an ISO timestamp.
export const istDate=(at=Date.now())=>istParts.format(new Date(at));
export const fmtDate=d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
export const fmtDateTime=at=>new Date(at).toLocaleString('en-IN',{timeZone:IST,day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
// A card balance is owed when negative; show it the way the card statement does.
export const balanceParts=(amount,card)=>card?(amount<=0?['Outstanding',-amount]:['Credit balance',amount]):['Bank balance',amount];
export const isCard=account=>account?.type==='Credit card';
