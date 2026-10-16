import {transactionLabel} from './transaction-labels.js';
import {categories,colors} from './core.js';
const editable=t=>({displayName:t.displayName||'',category:t.category,type:t.type,note:t.note||'',review:!!t.review});
const signature=t=>JSON.stringify(editable(t));
export function createTransactionViews({getState,isDemo,esc,icon,money,save,render,toast}){
 let editing=null,busy=false;
 const dirty=()=>editing&&signature(editing.draft)!==editing.before;
 function leave(){if(busy){toast('Saving your transaction. Please wait.');return false;}if(dirty()&&!confirm('Discard your unsaved transaction changes?'))return false;editing=null;return true;}
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 function editor(t){const d=editing.draft;return `<tr class="transaction-editor"><td colspan="6"><form id="inline-transaction-form"><div class="inline-fields"><label class="field">Readable name<input class="input" name="displayName" maxlength="160" value="${esc(d.displayName)}" placeholder="${esc(transactionLabel({...t,displayName:''}).title)}"><small>Leave blank to use the suggested label.</small></label><label class="field">Category<select class="input" name="category" aria-label="Category">${categories.map(c=>`<option ${c===d.category?'selected':''}>${c}</option>`).join('')}</select></label><label class="field">Transaction type<select class="input" name="type" aria-label="Transaction type">${['Income','Expense','Transfer','Refund'].map(c=>`<option ${c===d.type?'selected':''} ${((c==='Expense'&&t.amount>0)||(['Income','Refund'].includes(c)&&t.amount<0))?'disabled':''}>${c}</option>`).join('')}</select></label><label class="field inline-note">Note<input class="input" name="note" maxlength="4000" value="${esc(d.note)}" placeholder="Add context for your records"></label></div><label class="review-check"><input type="checkbox" name="reviewed" ${!d.review?'checked':''}> Reviewed — I checked this transaction</label><p class="sub">Date, amount, account and bank narration stay linked to the original statement. Mark movements between your own accounts as Transfer on both sides.</p><p class="notice error" role="alert" ${editing.error?'':'hidden'}>${esc(editing.error)}</p><div class="bank-actions"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" data-cancel-edit>Cancel</button></div></form></td></tr>`;}
 function table(list){if(editing&&!list.some(t=>t.id===editing.id))list=[editing.record,...list];if(!list.length)return `<div class="empty">${icon('transactions',32)}<h3>No transactions here yet</h3>Upload a bank statement or adjust your filters.</div>`;
 return `<div class="table-wrap transaction-table"><table><thead><tr><th>Transaction</th><th>Date</th><th>Category / type</th><th>Status</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>${list.map(t=>{const label=transactionLabel(t);return `<tr data-transaction="${t.id}"><td><div class="merchant"><span class="merchant-icon">${icon(t.type==='Transfer'?'transactions':t.amount>0?'arrow':'wallet',15)}</span><div class="transaction-copy"><strong class="transaction-name">${esc(label.title)}</strong><small>${esc(t.account)}${label.channel?' · '+esc(label.channel):''}</small><small class="label-source">${esc(label.source)}</small><details class="bank-narration"><summary>Original narration</summary><p>${esc(t.description)}</p>${t.note?`<p><b>Your note:</b> ${esc(t.note)}</p>`:''}</details></div></div></td><td>${new Date(t.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td><td><span class="pill"><i class="dot" style="background:${colors[categories.indexOf(t.category)]||'#a0aaa7'}"></i>${esc(t.category)}</span><small class="transaction-type">${esc(t.type)}</small></td><td><span class="pill ${t.review?'review':'ok'}">${icon(t.review?'spark':'check',10)}${t.review?'Needs review':'Categorized'}</span></td><td class="amount ${t.amount>0?'positive':''}" style="text-align:right">${t.amount>0?'+':'−'}${money(Math.abs(t.amount))}</td><td><button class="btn" data-edit="${t.id}" aria-label="Edit ${esc(label.title)}" aria-expanded="${editing?.id===t.id}">Edit</button></td></tr>${editing?.id===t.id?editor(t):''}`}).join('')}</tbody></table></div>`;
 }
 function bind(){
  document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>{
   if(isDemo()){toast('Sample workspace is read-only.');return;}
   if(editing?.id===el.dataset.edit){document.querySelector('#inline-transaction-form input')?.focus();return;}
   if(!leave())return;
   const t=getState().transactions.find(t=>t.id===el.dataset.edit);if(!t)return;
   editing={id:t.id,record:{...t},draft:editable(t),before:signature(t),error:''};render();document.querySelector('#inline-transaction-form input')?.focus();
  });
  const form=document.querySelector('#inline-transaction-form');if(!form)return;
  const capture=()=>{const values=Object.fromEntries(new FormData(form));editing.draft={displayName:values.displayName,category:values.category,type:values.type,note:values.note,review:!values.reviewed};};
  form.oninput=capture;form.onchange=capture;
  form.querySelector('[data-cancel-edit]').onclick=()=>{editing=null;render();};
  form.onsubmit=async e=>{
   e.preventDefault();if(busy)return;capture();const current=getState().transactions.find(t=>t.id===editing.id);
   if(!current||signature(current)!==editing.before){editing.error=current?'This transaction changed in another session. Your draft is still here. Copy any changes you need, then Cancel and reopen the latest transaction.':'This transaction was removed in another session. Copy any draft details you need, then Cancel.';render();return;}
   const draft={...editing.draft,displayName:editing.draft.displayName.trim(),note:editing.draft.note.trim()};
   Object.assign(current,draft);
   let saved;busy=true;try{saved=await save('Transaction edited');}finally{busy=false;}
   if(saved){editing=null;render();toast('Transaction saved');}
   else{editing.error='Changes were not saved. Your draft is preserved. Retry, or Cancel to return to the saved transaction.';render();}
  };
 }
 return {table,bind,leave,isEditing:()=>!!editing};
}
