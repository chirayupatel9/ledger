// Reusable UI builders — one source of truth for the markup the pages share, so a button, form field, pill, empty
// state or dialog footer is written the same way everywhere and can be restyled in a single place. These are pure
// string builders: they take data and return HTML, holding no DOM or app state. `esc` is the app's one HTML escaper
// and lives here so every builder (and its callers) share it.
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Render an attribute list from a {name: value} map: true -> bare attribute, null/undefined/false -> omitted,
// anything else -> name="escaped value". Insertion order is preserved (attribute order never affects rendering).
const attrs=o=>Object.entries(o).map(([k,v])=>v==null||v===false?'':v===true?` ${k}`:` ${k}="${esc(v)}"`).join('');

// Button. `label` is trusted inner HTML (e.g. an icon followed by text). Options: variant ('primary'|'danger'|…),
// type, id, action (sets data-action), disabled, data ({'bank-edit': id} -> data-bank-edit="id"; true -> bare),
// and attrs ({} of any extra attributes). Mirrors the existing `<button class="btn …">` markup exactly.
export const btn=(label,o={})=>{
 const a={class:'btn'+(o.variant?' '+o.variant:''),type:o.type,id:o.id,'data-action':o.action,disabled:o.disabled?true:null};
 for(const [k,v] of Object.entries(o.data||{}))a['data-'+k]=v;
 Object.assign(a,o.attrs||{});
 return `<button${attrs(a)}>${label}</button>`;
};

// The footer of a confirm dialog (passed to modal() as its third argument): a Cancel button that closes the dialog,
// followed by the confirm button(s) you have already built with btn(). Pass cancel:false to drop the Cancel button.
export const modalFoot=(confirm,{cancel='Cancel'}={})=>(cancel?btn(cancel,{action:'close'}):'')+[].concat(confirm).join('');

// A labelled form control: <label class="field">label + control</label>. `control` is built with input()/select().
export const field=(label,control)=>`<label class="field">${label}${control}</label>`;
// <input class="input" …> — pass the rest as a {name: value} map (required:true -> bare `required`, etc.).
export const input=o=>`<input${attrs({class:'input',...o})}>`;
// <select class="input" …>options</select> — build `optionsHtml` with options().
export const select=(o,optionsHtml)=>`<select${attrs({class:'input',...o})}>${optionsHtml}</select>`;
// <option> list. Items are plain strings, or {value, label}: with a value the option carries it and `selected`
// matches the value; without one the option's text is both shown and matched. Text and value are escaped.
export const options=(items,selected)=>items.map(i=>{
 const hasVal=i&&typeof i==='object'&&'value'in i,value=hasVal?i.value:i,label=hasVal?(i.label??i.value):i;
 return `<option${hasVal?` value="${esc(value)}"`:''}${(hasVal?value:label)===selected?' selected':''}>${esc(label)}</option>`;
}).join('');

// A small status pill. `text` is escaped; `variant` adds a modifier class (e.g. 'review', 'ok').
export const pill=(text,variant='')=>`<span class="pill${variant?' '+variant:''}">${esc(text)}</span>`;

// A centered empty state: an icon, a heading, supporting text (trusted HTML), and an optional call-to-action button.
export const emptyState=({icon='',title='',body='',action=''})=>`<div class="empty">${icon}<h3>${esc(title)}</h3>${body}${action?'<br>'+action:''}</div>`;
