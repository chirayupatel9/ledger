// Built-in categories plus your own. A transaction stores a category name: a built-in's fixed name (classification and
// tax suggestions depend on it, so built-ins can be relabelled, recoloured or hidden but not renamed) or a custom name.
import {categories as builtins,colors as builtinColors} from './core.js';
export const incomeBuiltins=['Salary','Freelance & business','Interest','Dividends','Rental income','Other income'];
export const neutralBuiltins=['Investments','Transfers','Uncategorized'];
export const unhideable=['Uncategorized','Transfers'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function catalog(state){
 const o=state.categoryOverrides||{};
 const built=builtins.map((name,i)=>({key:name,name,label:o[name]?.label||name,color:o[name]?.color||builtinColors[i],defaultColor:builtinColors[i],hidden:!!o[name]?.hidden,builtin:true,kind:incomeBuiltins.includes(name)?'income':neutralBuiltins.includes(name)?'other':'expense'}));
 return [...built,...(state.customCategories||[]).map(c=>({key:c.name,name:c.name,label:c.name,color:c.color,hidden:!!c.hidden,builtin:false,kind:c.kind,id:c.id}))];
}
// key → {label,color,…}; unknown keys (an old backup) still render with their own name.
export function categoryLookup(state){const map=new Map(catalog(state).map(c=>[c.key,c]));return key=>map.get(key)||{key,label:key,color:'#a0aaa7',hidden:false,kind:'expense'};}
// <option>s grouped by kind, without hidden categories unless one is the current value.
export function categoryOptions(state,selected=''){
 const groups=[['expense','Spending'],['income','Income'],['other','Transfers and other']],list=catalog(state).filter(c=>!c.hidden||c.key===selected);
 return groups.map(([kind,title])=>{const items=list.filter(c=>c.kind===kind).sort((a,b)=>a.builtin===b.builtin?0:a.builtin?-1:1);return items.length?`<optgroup label="${title}">${items.map(c=>`<option value="${escape(c.key)}" ${c.key===selected?'selected':''}>${escape(c.label)}</option>`).join('')}</optgroup>`:'';}).join('');
}
export const categoryUsage=(state,key)=>({transactions:state.transactions.filter(t=>t.category===key).length,rules:(state.rules||[]).filter(r=>r.category===key).length});
// Renaming or deleting a custom category rewrites its transactions and category rules in the same save.
export function renameCustomCategory(state,id,changes){
 const c=(state.customCategories||[]).find(c=>c.id===id);if(!c)throw Error('Category not found.');const old=c.name;Object.assign(c,changes);
 if(c.name!==old)for(const r of [...state.transactions,...(state.rules||[])])if(r.category===old)r.category=c.name;
}
export function deleteCustomCategory(state,id,moveTo){
 const c=(state.customCategories||[]).find(c=>c.id===id);if(!c)throw Error('Category not found.');
 const used=categoryUsage(state,c.name);if((used.transactions||used.rules)&&(!moveTo||moveTo===c.name))throw Error('Choose where to move this category’s transactions and rules.');
 for(const r of [...state.transactions,...(state.rules||[])])if(r.category===c.name)r.category=moveTo;
 state.customCategories=state.customCategories.filter(x=>x.id!==id);
}
