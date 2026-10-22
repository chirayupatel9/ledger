// Monthly budgets: a limit for a spending category, or for all spending (category ''). Spending is expenses net of
// refunds, as on the dashboard; transfers and investments do not count.
const spend=t=>t.type==='Expense'||t.type==='Refund'?-t.amount:0;
const daysIn=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();
export const nearShare=0.8;
// Each budget for a month: spent, left, share used, and for the current month the pace it is on.
// status: over (spent more), near (80% or more used), pace (on course to go over by month end), ok.
export function budgetStatus(state,{month,today}){
 const budgets=state.budgets||[];if(!budgets.length)return [];
 const rows=(state.transactions||[]).filter(t=>t.date.startsWith(month)),current=today.slice(0,7)===month,days=daysIn(month),day=current?Number(today.slice(8,10)):days;
 return budgets.map(b=>{
  const spent=rows.filter(t=>!b.category||t.category===b.category).reduce((v,t)=>v+spend(t),0),share=spent/b.amount,projected=current&&day<days?Math.round(spent/day*days):spent;
  const status=spent>b.amount?'over':share>=nearShare?'near':current&&day>=7&&projected>b.amount?'pace':'ok';
  return {category:b.category,amount:b.amount,spent,left:b.amount-spent,share,projected,status,daysLeft:current?days-day:0};
 }).sort((a,b)=>(a.category?1:0)-(b.category?1:0)||b.share-a.share);
}
// Dashboard notes for this month: budgets you went over, then ones nearly used up.
export function budgetAlerts(state,{today,label=c=>c}){
 const named=b=>b.category?label(b.category):'All spending';
 return budgetStatus(state,{month:today.slice(0,7),today}).filter(b=>b.status==='over'||b.status==='near').sort((a,b)=>(a.status==='over'?0:1)-(b.status==='over'?0:1)||b.share-a.share)
  .map(b=>b.status==='over'?{kind:'budget',tone:'warn',category:b.category,amount:b.spent-b.amount,text:`${named(b)}: {amount} over this month’s budget.`}
   :{kind:'budget',tone:'warn',category:b.category,amount:b.left,text:`${named(b)}: {amount} left of this month’s budget, with ${b.daysLeft} day${b.daysLeft===1?'':'s'} to go.`});
}
