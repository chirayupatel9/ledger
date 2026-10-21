import {defaultPreferences,preferencesFor,titleRuleMatches} from './preferences.js';
import {transactionLabel,automaticTitle,sameTitle} from './transaction-labels.js';
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
 let settingsDraft=null,settingsBase=null,titleDraft=null,ruleDraft=null,groupDraft=null,error='',query='',limit=100,busy=false;const open=new Set();
 const current=()=>preferencesFor(getState().preferences),rules=()=>getState().titleRules||[];
 const signature=r=>JSON.stringify(r);
 const dirty=()=>settingsDraft&&signature(settingsDraft)!==settingsBase||titleDraft&&titleDraft.value!==titleDraft.before||ruleDraft&&signature(ruleDraft.value)!==ruleDraft.before||groupDraft&&groupDraft.value!==groupDraft.before;
 function discard(){settingsDraft=settingsBase=titleDraft=ruleDraft=groupDraft=null;error='';applyAppearance(current());}
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
   <h3>Dashboard components</h3><div class="preference-checks">${check('showChart','Cash-flow chart',p.showChart)}${check('showCategories','Spending categories chart',p.showCategories)}${check('showRecent','Recent transactions',p.showRecent)}${check('showInsights','What changed (insight notes)',p.showInsights)}${check('showNetWorth','Net worth',p.showNetWorth)}${check('showUpcoming','Coming up (payments due)',p.showUpcoming)}${check('showCategoryTrend','Spending by category each month',p.showCategoryTrend)}${check('showSavingsTrend','Savings rate',p.showSavingsTrend)}${check('showTax','Tax-saving progress',p.showTax)}</div>
   <h3>Transaction details</h3><div class="preference-checks">${check('showBalances','Running balances',p.showBalances)}${check('showLabelSource','Title source (suggested, rule, or yours)',p.showLabelSource)}${check('expandNarration','Expand original bank narrations',p.expandNarration)}</div>
   ${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save settings</button><button class="btn" type="button" id="preferences-cancel">Cancel changes</button><button class="btn" type="button" id="preferences-reset">Preview defaults</button></div></div></form>
   <div class="card settings-card"><div class="card-head"><h2>Manage your workspace</h2></div><div class="settings-body settings-links"><a class="btn" href="/titles" data-page="titles">Transaction titles & naming rules</a><a class="btn" href="/accounts" data-page="accounts">Bank accounts</a><a class="btn" href="/change-password">Change password</a><a class="btn" href="/security">Two-step verification</a><button class="btn" data-action="settings">Export, restore & account data</button></div></div>`;
 }
 function ruleForm(){
  if(!ruleDraft)return '';
  const d=ruleDraft.value;
  return `<form id="title-rule-form" class="settings-body"><h3>${ruleDraft.id?'Edit naming rule':'New naming rule'}</h3><div class="form-grid">
   <label class="field">Match<select class="input" name="mode">${options(Object.entries(modeLabel),d.mode)}</select></label>
   <label class="field">Text to match<input class="input" name="keyword" maxlength="200" required value="${esc(d.keyword)}" placeholder="e.g. netflixupi, or Self transfer"></label>
   <label class="field">Actual title<input class="input" name="title" maxlength="160" required value="${esc(d.title)}" placeholder="e.g. Netflix subscription"></label></div>
   <div id="title-rule-preview" class="notice" aria-live="polite"></div>${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save naming rule</button><button class="btn" type="button" data-title-cancel>Cancel</button></div></form>`;
 }
 function titleEditor(t){
  return `<form id="title-edit-form" class="title-editor"><label class="field">Actual transaction title<input class="input" name="title" maxlength="160" value="${esc(titleDraft.value)}" placeholder="${esc(transactionLabel({...t,displayName:''},rules()).title)}"></label><p class="sub">Leave blank to use your naming rules or the automatic suggestion.</p>${alert()}<div class="bank-actions"><button class="btn primary" type="submit">Save title</button><button class="btn" type="button" data-title-cancel>Cancel</button></div></form>`;
 }
 const modeLabel={contains:'Narration contains',exact:'Narration is exactly',title:'Automatic title is'};
 const matchesRule=(rule,t)=>rule.mode==='title'?!!rule.keyword?.trim()&&sameTitle(rule.keyword,automaticTitle(t)):titleRuleMatches(rule,t);
 // Every title once, with the transactions that carry it (all accounts and dates), most used first.
 function groups(){const map=new Map();
  for(const t of getState().transactions){const l=transactionLabel(t,rules()),k=l.title.toLowerCase();let g=map.get(k);if(!g)map.set(k,g={key:k,title:l.title,items:[],sources:new Set(),accounts:new Set(),out:0,in:0});g.items.push(t);g.sources.add(l.source);g.accounts.add(t.account);if(t.amount<0)g.out-=t.amount;else g.in+=t.amount;}
  return [...map.values()].sort((a,b)=>b.items.length-a.items.length||a.title.localeCompare(b.title));}
 function titleRow(t){const l=transactionLabel(t,rules());return `<div class="title-row" data-title-row="${t.id}"><div class="title-row-copy"><strong>${esc(l.title)}</strong><small>${fmtDate(t.date)} · ${esc(t.account)} · ${money(t.amount)} · ${esc(l.source)}</small><details><summary>Original bank narration</summary><p>${esc(t.description)}</p></details></div><button class="btn" data-edit-title="${t.id}">Edit this one</button>${titleDraft?.id===t.id?titleEditor(t):''}</div>`;}
 const pencil='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4"/></svg>';
 // Editing a title in place: the transactions under it (shown open) follow as you type, and all of them change on Save.
 function groupEditor(g){const n=g.items.length,follows=g.items.some(t=>!t.displayName?.trim());
  return `<form id="title-group-form" class="title-inline"><input class="input" name="title" maxlength="160" required value="${esc(groupDraft.value)}" aria-label="Title for ${n>1?`all ${n} transactions`:'this transaction'}" autocomplete="off"><div class="bank-actions"><button class="btn primary" type="submit">Save${n>1?` for all ${n}`:''}</button><button class="btn" type="button" data-title-cancel>Cancel</button></div><p class="sub">Every transaction below gets this title${follows?`, and so do ones you import later that would be called “${esc(g.title)}”`:''}. Choosing a title you already use puts them together. Enter saves, Esc cancels.</p>${alert()}</form>`;}
 function titleGroup(g){const n=g.items.length,shown=open.has(g.key),accounts=[...g.accounts],editing=groupDraft?.key===g.key;
  return `<article class="title-group" data-title-group="${esc(g.key)}"><div class="title-row">${editing?groupEditor(g):`<div class="title-row-copy"><button type="button" class="title-group-name" data-rename-group="${esc(g.key)}" title="Edit this title for ${n>1?`all ${n} transactions`:'this transaction'}"><strong>${esc(g.title)}</strong>${pencil}</button><small>${n} transaction${n===1?'':'s'} · ${esc(accounts.slice(0,3).join(', '))}${accounts.length>3?` +${accounts.length-3} more`:''}${g.out?` · ${money(g.out)} out`:''}${g.in?` · ${money(g.in)} in`:''} · ${esc([...g.sources].join(', '))}</small></div><div class="bank-actions"><button class="btn" data-rename-group="${esc(g.key)}">Edit title${n>1?` (all ${n})`:''}</button><button class="btn" data-open-group="${esc(g.key)}" aria-expanded="${shown}">${shown?'Hide':'Show'} transactions</button></div>`}</div>${shown?`<div class="title-group-items">${[...g.items].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,50).map(titleRow).join('')}${n>50?'<p class="sub title-more-note">The latest 50 are shown. Search to find an older one.</p>':''}</div>`:''}</article>`;}
 function titleRows(){
  const all=groups(),q=query.trim().toLowerCase(),list=q?all.filter(g=>g.title.toLowerCase().includes(q)||g.items.some(t=>[t.description,t.account].join(' ').toLowerCase().includes(q))):all,shown=list.slice(0,limit);
  const keep=g=>{if(g&&!shown.includes(g))shown.unshift(g);};
  if(groupDraft)keep(all.find(g=>g.key===groupDraft.key));
  if(titleDraft){const g=all.find(g=>g.items.some(t=>t.id===titleDraft.id));if(g){open.add(g.key);keep(g);}}
  return `<p class="sub title-count">${list.length} title${list.length===1?'':'s'} · ${list.reduce((v,g)=>v+g.items.length,0)} transactions</p>${shown.length?shown.map(titleGroup).join(''):'<div class="empty">No titles match. Import a statement or change your search.</div>'}${list.length>limit?'<div class="show-more"><button class="btn" id="titles-more">Show 100 more</button></div>':''}`;
 }
 // Rename every transaction with one title: your own titles change, naming rules that give it change, and the
 // automatic title gets a rule so later imports follow. A rule that would rename a title to itself is dropped.
 function renameGroup(g,to){
  const list=rules().map(r=>({...r})),automatic=g.items.some(t=>{const l=transactionLabel(t,rules());return l.source!=='Your label'&&l.source!=='Title rule';});
  for(const t of g.items)if(t.displayName?.trim())t.displayName=to;
  for(const r of list)if(sameTitle(r.title,g.title))r.title=to;
  if(automatic){const own=list.find(r=>r.mode==='title'&&sameTitle(r.keyword,g.title));if(own)own.title=to;else list.push({id:crypto.randomUUID(),mode:'title',keyword:g.title,title:to});}
  getState().titleRules=list.filter(r=>!(r.mode==='title'&&sameTitle(r.keyword,r.title)));
  return g.items.length;
 }
 function titlesPage(){
  return `<div class="card settings-card"><div class="card-head"><div><h2>Naming rules</h2><p class="sub">Apply to existing and future transactions. Individual corrections take priority; the first matching rule wins.</p></div><button class="btn primary" id="new-title-rule">Add naming rule</button></div>${rules().map((r,i)=>`<div class="title-rule-row"><div><strong>${esc(r.title)}</strong><p class="sub">${esc(modeLabel[r.mode]||r.mode)} “${esc(r.keyword)}”</p></div><div class="bank-actions"><button class="btn" data-rule-edit="${r.id}">Edit rule</button>${i?`<button class="btn" data-rule-up="${r.id}" aria-label="Move ${esc(r.title)} earlier">Move up</button>`:''}<button class="btn danger" data-rule-delete="${r.id}">Remove</button></div></div>`).join('')||'<p class="settings-body sub">Use part of a merchant name or UPI ID to replace a cryptic bank narration with a title you recognize.</p>'}${ruleForm()}</div>
   <div class="card"><div class="card-head"><div><h2>Your titles</h2><p class="sub">Each title once, with every transaction that has it. Rename one to change them all; open it to correct a single transaction. Changes appear in transactions, search, reports and CSV exports; original narrations stay intact.</p></div></div><div class="filters"><input class="input" id="title-search" aria-label="Search transaction titles" placeholder="Search title, bank narration or account…" value="${esc(query)}"></div><div id="title-results">${titleRows()}</div></div>`;
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
   const preview=()=>{const f=new FormData(ruleForm);ruleDraft.value={mode:f.get('mode'),keyword:f.get('keyword'),title:f.get('title')};const matches=getState().transactions.filter(t=>matchesRule(ruleDraft.value,t)),manual=matches.filter(t=>t.displayName?.trim()).length;
    document.querySelector('#title-rule-preview').innerHTML=`${matches.length} matching transactions across your accounts${manual?`; ${manual} individual title(s) will be preserved`:''}.${matches.length?`<ul>${matches.slice(0,3).map(t=>`<li>${esc(transactionLabel(t,rules()).title)} → ${esc(t.displayName||ruleDraft.value.title||'New title')}</li>`).join('')}</ul>`:''}`;
   };ruleForm.oninput=preview;preview();
   ruleForm.onsubmit=async e=>{e.preventDefault();const {id,value,before}=ruleDraft,old=rules().find(r=>r.id===id);if(id&&(!old||signature({mode:old.mode,keyword:old.keyword,title:old.title})!==before)){error='This rule changed elsewhere. Cancel and reopen it.';render();return;}
    const rule={id:id||crypto.randomUUID(),mode:value.mode,keyword:value.keyword.trim(),title:value.title.trim()};
    if(!rule.keyword||!rule.title)return;
    getState().titleRules=id?rules().map(r=>r.id===id?rule:r):[...rules(),rule];await persist('Naming rule saved');
   };
  }
  const redraw=()=>{document.querySelector('#title-results').innerHTML=titleRows();bind();};
  document.querySelectorAll('[data-open-group]').forEach(el=>el.onclick=()=>{const k=el.dataset.openGroup;if(open.has(k))open.delete(k);else open.add(k);redraw();document.querySelector(`[data-open-group="${CSS.escape(k)}"]`)?.focus();});
  document.querySelectorAll('[data-rename-group]').forEach(el=>el.onclick=()=>{if(!leave())return;const g=groups().find(g=>g.key===el.dataset.renameGroup);if(!g)return;groupDraft={key:g.key,value:g.title,before:g.title};open.add(g.key);render();const input=document.querySelector('#title-group-form input');input?.focus();input?.select();});
  const rename=document.querySelector('#title-group-form');
  if(rename){const inner=[...document.querySelectorAll(`[data-title-group="${CSS.escape(groupDraft.key)}"] .title-group-items .title-row-copy strong`)];
   rename.oninput=()=>{groupDraft.value=rename.elements.title.value;const shown=groupDraft.value.trim().replace(/\s+/g,' ')||groupDraft.before;inner.forEach(s=>s.textContent=shown);};
   rename.onkeydown=e=>{if(e.key!=='Escape')return;e.preventDefault();const key=groupDraft.key;discard();render();document.querySelector(`[data-title-group="${CSS.escape(key)}"] .title-group-name`)?.focus();};rename.onsubmit=async e=>{e.preventDefault();const to=groupDraft.value.trim().replace(/\s+/g,' '),all=groups(),g=all.find(g=>g.key===groupDraft.key);
   if(!to){error='Enter a title.';render();return;}if(!g){error='These transactions changed elsewhere. Cancel and reopen the title.';render();return;}if(to===g.title){discard();render();return;}
   const target=all.find(x=>x.key===to.toLowerCase()&&x!==g),name=target?.title||to,n=renameGroup(g,name),wasOpen=open.delete(g.key);if(wasOpen)open.add(name.toLowerCase());
   await persist(target?`${n} transaction${n===1?'':'s'} moved to “${name}”`:`${n} transaction${n===1?'':'s'} renamed to “${name}”`);};}
  const search=document.querySelector('#title-search');
  if(search)search.oninput=()=>{query=search.value;limit=100;redraw();};
  if(document.querySelector('#titles-more'))document.querySelector('#titles-more').onclick=()=>{limit+=100;redraw();};
 }
 return {settingsPage,titlesPage,bind,leave,isEditing:()=>!!(settingsDraft||titleDraft||ruleDraft||groupDraft),apply:()=>applyAppearance(settingsDraft||current())};
}
