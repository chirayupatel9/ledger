export const defaultPreferences=Object.freeze({
 theme:'light',fontSize:16,fontFamily:'sans',density:'comfortable',
 showChart:true,showCategories:true,showRecent:true,showBalances:true,showLabelSource:true,expandNarration:false,
 showInsights:true,showNetWorth:true,showUpcoming:true,showBudgets:true,showCategoryTrend:true,showSavingsTrend:true,showTax:true,
 dashboardOrder:[],reportsOrder:[],reportsHidden:[],
});
// The cards you can show, hide and reorder (Customize on the dashboard and Reports). Dashboard cards are shown or hidden
// with their show… preference; Reports cards with reportsHidden. Wide cards take the full width.
export const dashboardCards=[{id:'insights',label:'What changed',pref:'showInsights',wide:true},{id:'cashflow',label:'Money in, money out',pref:'showChart'},{id:'categories',label:'Where it all goes',pref:'showCategories'},
 {id:'netWorth',label:'Net worth',pref:'showNetWorth'},{id:'upcoming',label:'Coming up',pref:'showUpcoming'},{id:'budgets',label:'Budgets',pref:'showBudgets'},{id:'categoryTrend',label:'Spending by category',pref:'showCategoryTrend'},{id:'savingsTrend',label:'Savings rate',pref:'showSavingsTrend'},
 {id:'tax',label:'Tax-saving progress',pref:'showTax',wide:true},{id:'recent',label:'Recent transactions',pref:'showRecent',wide:true}];
export const reportCards=[{id:'statement',label:'Cash flow statement',wide:true},{id:'transfers',label:'Transfers between your accounts',wide:true},{id:'tax',label:'Tax summary',wide:true},{id:'recurring',label:'Recurring payments and income',wide:true},{id:'tags',label:'Spending by tag'},
 {id:'payees',label:'Top payees'},{id:'methods',label:'How you pay'},{id:'waterfall',label:'Where the month went'},{id:'unusual',label:'Worth a look'},{id:'balances',label:'Account balances'},{id:'cards',label:'Credit cards'},{id:'calendar',label:'Spending calendar',wide:true}];
// Cards in your order: saved ids first, then any card you have not placed yet (new cards appear in their default spot).
export function cardLayout(kind,prefs){const cards=kind==='dashboard'?dashboardCards:reportCards,order=(kind==='dashboard'?prefs?.dashboardOrder:prefs?.reportsOrder)||[],hidden=new Set(prefs?.reportsHidden||[]);
 return [...order.map(id=>cards.find(c=>c.id===id)).filter(Boolean),...cards.filter(c=>!order.includes(c.id))].map(c=>({...c,visible:kind==='dashboard'?prefs?.[c.pref]!==false:!hidden.has(c.id)}));}
export function preferencesFor(value){return {...defaultPreferences,...value};}
export function titleRuleMatches(rule,transaction){
 // “Automatic title is” rules (mode title) are applied by transactionLabel, after it works out the automatic title.
 if(rule.mode==='title')return false;
 const text=transaction.description.trim().replace(/\s+/g,' ').toLowerCase(),keyword=rule.keyword.trim().replace(/\s+/g,' ').toLowerCase();
 return !!keyword&&(rule.mode==='exact'?text===keyword:text.includes(keyword));
}
