export const defaultPreferences=Object.freeze({
 theme:'light',fontSize:16,fontFamily:'sans',density:'comfortable',
 showChart:true,showCategories:true,showRecent:true,showBalances:true,showLabelSource:true,expandNarration:false,
 showInsights:true,showNetWorth:true,showUpcoming:true,showCategoryTrend:true,showSavingsTrend:true,showTax:true,
});
export function preferencesFor(value){return {...defaultPreferences,...value};}
export function titleRuleMatches(rule,transaction){
 const text=transaction.description.trim().replace(/\s+/g,' ').toLowerCase(),keyword=rule.keyword.trim().replace(/\s+/g,' ').toLowerCase();
 return !!keyword&&(rule.mode==='exact'?text===keyword:text.includes(keyword));
}
