import {defaultPreferences,preferencesFor,titleRuleMatches} from './preferences.js';
import {transactionLabel} from './transaction-labels.js';
import {fmtDate} from './format.js';

export function applyAppearance(input){
 const p=preferencesFor(input),root=document.documentElement;
 root.style.fontSize=p.fontSize+'px';
 root.dataset.theme=p.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.theme;
 // Remembered on this device so the next loading screen opens in the same theme (loading.js).
 try{localStorage.setItem('ledger.theme',root.dataset.theme)}catch{}
 root.dataset.font=p.fontFamily;root.dataset.density=p.density;
 root.dataset.showBalances=String(p.showBalances);root.dataset.showLabelSource=String(p.showLabelSource);
}
export function createPreferencesViews({getState,rows,save,render,esc,money,toast}){
 let settingsDraft=null,settingsBase=null,titleDraft=null,ruleDraft=null,error='',query='',limit=100,busy=false;
 const current=()=>preferencesFor(getState().preferences),rules=()=>getState().titleRules||[];
 const signature=r=>JSON.stringify(r);
 const dirty=()=>settingsDraft&&signature(settingsDraft)!==settingsBase||titleDraft&&titleDraft.value!==titleDraft.before||ruleDraft&&signature(ruleDraft.value)!==ruleDraft.before;
 function discard(){settingsDraft=settingsBase=titleDraft=ruleDraft=null;error='';applyAppearance(current());}
 function leave(){if(busy)return false;if(dirty()&&!confirm('Discard your unsaved settings or title changes?'))return false;discard();return true;}
 addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyAppearance(settingsDraft||current()));
 const options=(values,value)=>values.map(([id,label])=>`<option value="${id}" ${String(value)===String(id)?'selected':''}>${label}</option>`).join('');
 const check=(name,label,value)=>`<label class="preference-check"><input type="checkbox" name="${name}" ${value?'checked':''}> ${label}</label>`;
 const alert=()=>error?`<p class="notice error" role="alert">${esc(error)}</p>`:'';
 function settingsPage(){
  const p=settingsDraft||current();
  return `<form id="preferences-form" class="card settings-card"><div class="card-head"><div><h2>Appearance</h2><p class="sub">Preview changes here, then save them to your account.</p></div></div><div class="settings-body"><div class="form-grid">
   <label class="field">Theme<select class="input" name="theme">${options([['light','Light'],['dark','Dark'],['system','Follow device']],p.theme)}</select></label>
   <label class="field">Font size<select class="input" name="fontSize">${options([[14,'Small · 14 px'],[16,'Default · 16 px'],[18,'Large · 18 px'],[20,'Larger · 20 px'],[22,'Largest · 22 px']],p.fontSize)}</select></label>
   <label class="field">Font family<select class="input" name="fontFamily">${options([['sans','Ledger sans'],['system','Device font'],['serif','Serif']],p.fontFamily)}</select></label>
   <label class="field">Row spacing<select class="input" name="density">${options([['comfortable','Comfortable'],['compact','Compact']],p.density)}</select></label></div>
   <div class="appearance-preview"><strong>Your ledger, your view</strong><p>Monthly groceries <b>${money(-125050)}</b></p><small>These preferences follow you across devices.</small></div>
   <h3>Dashboard components</h3><div class="preference-checks">${check('showChart','Cash-flow chart',p.showChart)}${check('showCategories','Spending categories chart',p.showCategories)}${check('showRecent','Recent transactions',p.showRecent)}</div>
   <h3>Transaction details</h3><div class="preference-checks">${check('showBalances','Running balances',p.showBalances)}${check('showLabelSource','Title source (suggested, rule, or yours)',p.showLabelSource)}${check('expandNarration','Expand original bank narrations',p.expandNarration)}</div>
   ${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save settings</button><button class="btn" type="button" id="preferences-cancel">Cancel changes</button><button class="btn" type="button" id="preferences-reset">Preview defaults</button></div></div></form>
   <div class="card settings-card"><div class="card-head"><h2>Manage your workspace</h2></div><div class="settings-body settings-links"><a class="btn" href="/titles" data-page="titles">Transaction titles & naming rules</a><a class="btn" href="/accounts" data-page="accounts">Bank accounts</a><a class="btn" href="/change-password">Change password</a><a class="btn" href="/security">Two-step verification</a><button class="btn" data-action="settings">Export, restore & account data</button></div></div>`;
 }
 function ruleForm(){
  if(!ruleDraft)return '';
  const d=ruleDraft.value;
  return `<form id="title-rule-form" class="settings-body"><h3>${ruleDraft.id?'Edit naming rule':'New naming rule'}</h3><div class="form-grid">
   <label class="field">Match original narration<select class="input" name="mode">${options([['contains','Contains text'],['exact','Exactly matches']],d.mode)}</select></label>
   <label class="field">Text to match<input class="input" name="keyword" maxlength="200" required value="${esc(d.keyword)}" placeholder="e.g. netflixupi"></label>
   <label class="field">Actual title<input class="input" name="title" maxlength="160" required value="${esc(d.title)}" placeholder="e.g. Netflix subscription"></label></div>
   <div id="title-rule-preview" class="notice" aria-live="polite"></div>${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save naming rule</button><button class="btn" type="button" data-title-cancel>Cancel</button></div></form>`;
 }
 function titleEditor(t){
  return `<form id="title-edit-form" class="title-editor"><label class="field">Actual transaction title<input class="input" name="title" maxlength="160" value="${esc(titleDraft.value)}" placeholder="${esc(transactionLabel({...t,displayName:''},rules()).title)}"></label><p class="sub">Leave blank to use your naming rules or the automatic suggestion.</p>${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save title</button><button class="btn" type="button" data-title-cancel>Cancel</button></div></form>`;
 }
 function titleRows(){
  const matching=rows().filter(t=>[t.description,transactionLabel(t,rules()).title,t.account].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
  const shown=matching.slice(0,limit);
  if(titleDraft&&!shown.some(t=>t.id===titleDraft.id)){const t=getState().transactions.find(t=>t.id===titleDraft.id);if(t)shown.unshift(t);}
  return `<p class="sub title-count">${matching.length} matching transactions</p>${shown.length?shown.map(t=>`<article class="title-row" data-title-row="${t.id}"><div class="title-row-copy"><strong>${esc(transactionLabel(t,rules()).title)}</strong><small>${fmtDate(t.date)} · ${esc(t.account)} · ${money(t.amount)} · ${esc(transactionLabel(t,rules()).source)}</small><details><summary>Original bank narration</summary><p>${esc(t.description)}</p></details></div><button class="btn" data-edit-title="${t.id}">Edit title</button>${titleDraft?.id===t.id?titleEditor(t):''}</article>`).join(''):'<div class="empty">No transactions match. Import a statement or change your filters.</div>'}${matching.length>limit?'<div class="show-more"><button class="btn" id="titles-more">Show 100 more</button></div>':''}`;
 }
 function titlesPage(){
  return `<div class="card settings-card"><div class="card-head"><div><h2>Naming rules</h2><p class="sub">Apply to existing and future transactions. Individual corrections take priority; the first matching rule wins.</p></div><button class="btn primary" id="new-title-rule">Add naming rule</button></div>${rules().map((r,i)=>`<div class="title-rule-row"><div><strong>${esc(r.title)}</strong><p class="sub">${r.mode==='exact'?'Exactly matches':'Contains'} “${esc(r.keyword)}”</p></div><div class="bank-actions"><button class="btn" data-rule-edit="${r.id}">Edit rule</button>${i?`<button class="btn" data-rule-up="${r.id}" aria-label="Move ${esc(r.title)} earlier">Move up</button>`:''}<button class="btn danger" data-rule-delete="${r.id}">Remove</button></div></div>`).join('')||'<p class="settings-body sub">Use part of a merchant name or UPI ID to replace a cryptic bank narration with a title you recognize.</p>'}${ruleForm()}</div>
   <div class="card"><div class="card-head"><div><h2>Correct individual titles</h2><p class="sub">Your changes appear in transactions, search, reports and CSV exports. Original narrations stay intact.</p></div></div><div class="filters"><input class="input" id="title-search" aria-label="Search transaction titles" placeholder="Search title, bank narration or account…" value="${esc(query)}"></div><div id="title-results">${titleRows()}</div></div>`;
 }
 async function persist(action,done){
  busy=true;let ok;try{ok=await save(action);}finally{busy=false;}
  if(ok){discard();done?.();render();toast(action);}
  else{error='Not saved. Your draft is still here. Retry, or cancel and reopen if another session changed it.';render();}
 }
 function bind(){
  const form=document.querySelector('#preferences-form');
  if(form){
   form.oninput=()=>{settingsBase??=signature(current());settingsDraft={...current()};const f=new FormData(form);
    for(const key of ['theme','fontFamily','density'])settingsDraft[key]=f.get(key);
    settingsDraft.fontSize=Number(f.get('fontSize'));
    for(const key of Object.keys(defaultPreferences).filter(k=>typeof defaultPreferences[k]==='boolean'))settingsDraft[key]=f.get(key)==='on';
    applyAppearance(settingsDraft);
   };
   form.onsubmit=async e=>{e.preventDefault();if(settingsBase&&settingsBase!==signature(current())){error='Settings changed in another session. Cancel changes and reopen the latest settings.';render();return;}getState().preferences={...(settingsDraft||current())};await persist('Display settings saved');};
   document.querySelector('#preferences-cancel').onclick=()=>{discard();render();};
   document.querySelector('#preferences-reset').onclick=()=>{settingsBase??=signature(current());settingsDraft={...defaultPreferences};applyAppearance(settingsDraft);render();};
  }
  const freshRule=()=>{if(!leave())return;const value={mode:'contains',keyword:'',title:''};ruleDraft={id:null,value,before:signature(value)};render();};
  if(document.querySelector('#new-title-rule'))document.querySelector('#new-title-rule').onclick=freshRule;
  document.querySelectorAll('[data-title-cancel]').forEach(el=>el.onclick=()=>{discard();render();});
  document.querySelectorAll('[data-edit-title]').forEach(el=>el.onclick=()=>{if(!leave())return;const t=getState().transactions.find(t=>t.id===el.dataset.editTitle);titleDraft={id:t.id,value:t.displayName||'',before:t.displayName||''};render();document.querySelector('#title-edit-form input').focus();});
  const edit=document.querySelector('#title-edit-form');
  if(edit){edit.oninput=()=>titleDraft.value=edit.elements.title.value;edit.onsubmit=async e=>{e.preventDefault();const t=getState().transactions.find(t=>t.id===titleDraft.id);if(!t||(t.displayName||'')!==titleDraft.before){error='This transaction changed elsewhere. Cancel and reopen its latest title.';render();return;}t.displayName=titleDraft.value.trim();await persist('Transaction title saved');};}
  document.querySelectorAll('[data-rule-edit]').forEach(el=>el.onclick=()=>{if(!leave())return;const r=rules().find(r=>r.id===el.dataset.ruleEdit);const {id,...value}=r;ruleDraft={id,value:{...value},before:signature(value)};render();});
  document.querySelectorAll('[data-rule-delete]').forEach(el=>el.onclick=async()=>{if(!leave()||!confirm('Remove this naming rule? Matching transactions will use the next rule or their automatic title.'))return;getState().titleRules=rules().filter(r=>r.id!==el.dataset.ruleDelete);await persist('Naming rule removed');});
  document.querySelectorAll('[data-rule-up]').forEach(el=>el.onclick=async()=>{if(!leave())return;const list=[...rules()],i=list.findIndex(r=>r.id===el.dataset.ruleUp);[list[i-1],list[i]]=[list[i],list[i-1]];getState().titleRules=list;await persist('Naming rule priority updated');});
  const ruleForm=document.querySelector('#title-rule-form');
  if(ruleForm){
   const preview=()=>{const f=new FormData(ruleForm);ruleDraft.value={mode:f.get('mode'),keyword:f.get('keyword'),title:f.get('title')};const matches=getState().transactions.filter(t=>titleRuleMatches(ruleDraft.value,t)),manual=matches.filter(t=>t.displayName?.trim()).length;
    document.querySelector('#title-rule-preview').innerHTML=`${matches.length} matching transactions across your accounts${manual?`; ${manual} individual title(s) will be preserved`:''}.${matches.length?`<ul>${matches.slice(0,3).map(t=>`<li>${esc(transactionLabel(t,rules()).title)} → ${esc(t.displayName||ruleDraft.value.title||'New title')}</li>`).join('')}</ul>`:''}`;
   };ruleForm.oninput=preview;preview();
   ruleForm.onsubmit=async e=>{e.preventDefault();const {id,value,before}=ruleDraft,old=rules().find(r=>r.id===id);if(id&&(!old||signature({mode:old.mode,keyword:old.keyword,title:old.title})!==before)){error='This rule changed elsewhere. Cancel and reopen it.';render();return;}
    const rule={id:id||crypto.randomUUID(),mode:value.mode,keyword:value.keyword.trim(),title:value.title.trim()};
    if(!rule.keyword||!rule.title)return;
    getState().titleRules=id?rules().map(r=>r.id===id?rule:r):[...rules(),rule];await persist('Naming rule saved');
   };
  }
  const search=document.querySelector('#title-search');
  if(search)search.oninput=()=>{query=search.value;limit=100;document.querySelector('#title-results').innerHTML=titleRows();bind();};
  if(document.querySelector('#titles-more'))document.querySelector('#titles-more').onclick=()=>{limit+=100;document.querySelector('#title-results').innerHTML=titleRows();bind();};
 }
 return {settingsPage,titlesPage,bind,leave,isEditing:()=>!!(settingsDraft||titleDraft||ruleDraft),apply:()=>applyAppearance(settingsDraft||current())};
}
