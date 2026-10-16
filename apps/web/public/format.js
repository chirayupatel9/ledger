export const fmtDate=d=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
// A card balance is owed when negative; show it the way the card statement does.
export const balanceParts=(amount,card)=>card?(amount<=0?['Outstanding',-amount]:['Credit balance',amount]):['Bank balance',amount];
export const isCard=account=>account?.type==='Credit card';
