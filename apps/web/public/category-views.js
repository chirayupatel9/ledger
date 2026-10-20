import {catalog,categoryUsage,categoryOptions,renameCustomCategory,deleteCustomCategory,unhideable} from './categories.js';
// "Your categories" on the Categories page: add your own, relabel/recolour/hide built-ins, rename or delete custom ones.
export function createCategoryViews({getState,save,render,toast,modal,bindModal,esc,icon}){
 let editing=null,adding=false,error='';
 const state=()=>getState(),find=key=>catalog(state()).find(c=>c.key===key);
 const swatch=c=>`<i class="category-swatch" style="background:${esc(c.color)}"></i>`;
 function form(c){
  const custom=!c||!c.builtin;
  return `<form id="category-form" class="category-form"><div class="form-grid"><label class="field">${c?.builtin?'Label':'Name'}<input class="input" name="name" maxlength="40" required value="${esc(c?c.label:'')}" placeholder="${c?.builtin?esc(c.name):'e.g. Pets'}"></label>
   <label class="field">Colour<input class="input color-input" type="color" name="color" value="${esc(c?.color||'#7c9cbf')}"></label>
   ${custom?`<label class="field">Kind<select class="input" name="kind"><option value="expense" ${c?.kind!=='income'?'selected':''}>Spending</option><option value="income" ${c?.kind==='income'?'selected':''}>Income</option></select></label>`:''}
   ${c&&!unhideable.includes(c.key)?`<label class="review-check"><input type="checkbox" name="hidden" ${c.hidden?'checked':''}> Hide from category pickers (transactions keep it)</label>`:''}</div>
   ${c?.builtin?`<p class="sub">Built-in categories keep working with automatic suggestions and tax tags; only how they look changes. Leave the label as “${esc(c.name)}” to use the original.</p>`:''}
   ${error?`<p class="notice error" role="alert">${esc(error)}</p>`:''}<div class="bank-actions"><button class="btn primary" type="submit">${c?'Save category':'Add category'}</button><button class="btn" type="button" data-category-cancel>Cancel</button></div></form>`;
 }
 function row(c){const used=categoryUsage(state(),c.key);return `<div class="category-row ${c.hidden?'hidden-category':''}" data-category-row="${esc(c.key)}">${swatch(c)}<div><b>${esc(c.label)}</b><p class="sub">${c.builtin?(c.label!==c.name?`Built-in “${esc(c.name)}”`:'Built-in'):'Your category'} · ${used.transactions} transaction${used.transactions===1?'':'s'}${used.rules?` · ${used.rules} rule${used.rules===1?'':'s'}`:''}${c.hidden?' · hidden':''}</p></div><div class="bank-actions"><button class="btn" data-category-edit="${esc(c.key)}">Edit</button>${c.builtin?'':`<button class="btn danger" data-category-delete="${esc(c.key)}">Delete</button>`}</div></div>${editing===c.key?form(c):''}`;}
 function card(){
  const all=catalog(state()),group=(kind,title)=>{const list=all.filter(c=>c.kind===kind);return list.length?`<div class="report-label">${title}</div>${list.map(row).join('')}`:''};
  return `<div class="card categories-card"><div class="table-toolbar"><div><h2>Your categories</h2><p class="sub">Add your own, or rename, recolour and hide the built-in ones.</p></div><button class="btn primary" id="category-add">${icon('plus',12)} Add category</button></div>${adding?form(null):''}${group('expense','Spending')}${group('income','Income')}${group('other','Transfers and other')}</div>`;
 }
 const values=f=>Object.fromEntries(new FormData(f));
 async function persist(action){if(await save(action)){editing=null;adding=false;error='';render();toast(action);return true}error='Not saved. Check the name is unique and retry.';render();return false}
 function bind(){
  const add=document.querySelector('#category-add');if(add)add.onclick=()=>{adding=true;editing=null;error='';render();document.querySelector('#category-form input')?.focus()};
  document.querySelectorAll('[data-category-edit]').forEach(el=>el.onclick=()=>{editing=el.dataset.categoryEdit;adding=false;error='';render();document.querySelector('#category-form input')?.focus()});
  document.querySelectorAll('[data-category-cancel]').forEach(el=>el.onclick=()=>{editing=null;adding=false;error='';render()});
  const f=document.querySelector('#category-form');
  if(f)f.onsubmit=async e=>{e.preventDefault();const v=values(f),name=String(v.name||'').trim().replace(/\s+/g,' '),s=state(),c=editing&&find(editing);
   const clash=catalog(s).find(x=>x.key!==c?.key&&(x.label.toLowerCase()===name.toLowerCase()||x.key.toLowerCase()===name.toLowerCase()));
   if(!name||clash){error=name?`“${name}” is already a category.`:'Enter a name.';render();return}
   if(!c){s.customCategories=[...(s.customCategories||[]),{id:crypto.randomUUID(),name,color:v.color,kind:v.kind==='income'?'income':'expense'}];await persist('Category added');return}
   if(c.builtin){const o={...(s.categoryOverrides||{})},next={...(name!==c.name?{label:name}:{}),...(v.color!==c.defaultColor?{color:v.color}:{}),...(v.hidden?{hidden:true}:{})};if(Object.keys(next).length)o[c.name]=next;else delete o[c.name];s.categoryOverrides=o;await persist('Category updated');return}
   renameCustomCategory(s,c.id,{name,color:v.color,kind:v.kind==='income'?'income':'expense',...(v.hidden?{hidden:true}:{hidden:false})});await persist('Category updated');};
  document.querySelectorAll('[data-category-delete]').forEach(el=>el.onclick=()=>{
   const c=find(el.dataset.categoryDelete);if(!c)return;const used=categoryUsage(state(),c.key),inUse=used.transactions||used.rules;
   modal('Delete category?',`<p class="sub">Delete <b>${esc(c.label)}</b>?${inUse?` It is used by ${used.transactions} transaction${used.transactions===1?'':'s'}${used.rules?` and ${used.rules} rule${used.rules===1?'':'s'}`:''}. Choose where they should go.`:' Nothing uses it.'}</p>${inUse?`<label class="field">Move them to<select class="input" id="category-move">${categoryOptions({...state(),customCategories:(state().customCategories||[]).filter(x=>x.id!==c.id)},'Uncategorized')}</select></label>`:''}`,`<button class="btn" data-action="close">Cancel</button><button class="btn danger" id="category-delete-confirm">Delete category</button>`);bindModal();
   document.querySelector('#category-delete-confirm').onclick=async()=>{try{deleteCustomCategory(state(),c.id,document.querySelector('#category-move')?.value)}catch(e){toast(e.message);return}if(await save('Category deleted')){document.querySelector('#modal').close();editing=null;render();toast('Category deleted')}};
  });
 }
 return {card,bind,isEditing:()=>!!(editing||adding)};
}
