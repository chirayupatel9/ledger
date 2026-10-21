// Small SVG and HTML charts for the dashboard, Reports and Investments. No chart library: the page loads only its own
// scripts. Callers pass colours and a formatter (format(value) for labels, format(value,true) for compact axis labels).
// Text and grid lines take the theme's colours from CSS (.kit), so charts work in light and dark mode.
//
// Interactive: every chart sits in a .kit-live wrapper. Hovering, tapping or using the arrow keys on a mark shows a
// tooltip; clicking it (or Enter, or the tooltip's button on a phone) opens the matching transactions through the
// drill handler given to enableCharts. Legends of charts with several series switch a series off and on.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=o=>esc(JSON.stringify(o));
const valid=v=>v!==null&&v!==undefined&&Number.isFinite(v);
function nice(min,max){
 if(min===max){max=min+1;}const span=max-min,raw=span/4,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw);
 const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;return {lo,hi,ticks:Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>lo+i*step)};
}
// A mark's tooltip ({t:title, r:[{c:colour,n:name,v:value,d:drill,a:active}], f:footer}), drill filters, column and
// whether the arrow keys stop on it.
export const markAttrs=({tip,drill,col,key=false})=>` data-tip="${json(tip)}"${drill?` data-drill="${json(drill)}"`:''}${col!==undefined?` data-col="${col}"`:''}${key?' data-k':''}`;
export const liveAttrs=(label,drill)=>`tabindex="0" role="group" aria-label="${esc(label)}. Use the arrow keys to read each value${drill?', and Enter to see those transactions':''}."`;
// Charts with switchable series are kept so a legend click can redraw them; hidden series are remembered by chart.
const specs=new Map(),hiddenByLabel=new Map();let seq=0;
function register(fn,spec){
 if(specs.size>80)for(const [k,v] of specs)if(Date.now()-v.at>10000&&!document.getElementById(k))specs.delete(k);
 const id=spec.id||`kit-${++seq}`;specs.set(id,{fn,spec:{...spec,id},at:Date.now()});return id;
}
const hiddenFor=label=>hiddenByLabel.get(label)||new Set();
function toggles(series,hidden){
 if(series.length<2)return legend(series);
 return `<div class="kit-legend">${series.map(s=>`<button type="button" class="kit-toggle${hidden.has(s.name)?' off':''}" data-series-toggle="${esc(s.name)}" aria-pressed="${!hidden.has(s.name)}" title="${hidden.has(s.name)?'Show':'Hide'} ${esc(s.name)}"><i style="background:${esc(s.color)}"></i>${esc(s.name)}</button>`).join('')}</div>`;
}
const allHidden='<p class="kit-empty">Everything is switched off. Turn a series back on below.</p>';
export function legend(series){return `<div class="kit-legend">${series.map(s=>`<span><i style="background:${esc(s.color)}"></i>${esc(s.name)}</span>`).join('')}</div>`;}
// Lines over months. A null value leaves a gap. Values may be negative (a zero line is drawn).
// titles: full names for the tooltip (labels are short axis labels); drill(i): filters for the month at i.
export function lineChart(spec){
 const {labels,titles=labels,series,format,height=210,label='Chart',drill,legend:withLegend=false}=spec;
 const W=640,H=height,L=64,R=14,T=14,B=28;if(!series.flatMap(s=>s.values).some(valid))return '';
 const id=register(lineChart,spec),hidden=hiddenFor(label),shown=series.filter(s=>!hidden.has(s.name)),all=shown.flatMap(s=>s.values).filter(valid);
 const foot=withLegend?toggles(series,hidden):'';
 if(!all.length)return `<div class="kit-live" id="${id}">${allHidden}${foot}</div>`;
 const {lo,hi,ticks}=nice(Math.min(0,...all),Math.max(0,...all)),x=i=>labels.length<2?(L+W-R)/2:L+i*(W-L-R)/(labels.length-1),y=v=>T+(hi-v)/(hi-lo)*(H-T-B),half=labels.length<2?(W-L-R)/2:(W-L-R)/(labels.length-1)/2;
 let svg=ticks.map(t=>`<line class="grid${t===0?' zero':''}" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(format(t,true))}</text>`).join('');
 svg+=labels.map((l,i)=>`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`).join('');
 for(const s of shown){let d='',open=false;s.values.forEach((v,i)=>{if(!valid(v)){open=false;return;}d+=`${open?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;open=true;});
  svg+=`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.bold?3:2}" ${s.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
  svg+=s.values.map((v,i)=>valid(v)?`<circle class="kit-pt" data-col="${i}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${s.bold?3.5:2.5}" fill="${esc(s.color)}"/>`:'').join('');}
 // One invisible column per month on top: hovering anywhere above a month shows every line's value there.
 svg+=labels.map((l,i)=>{const from=Math.max(L-8,x(i)-half),to=Math.min(W-R+8,x(i)+half);return `<rect class="kit-hit" x="${from.toFixed(1)}" y="${T}" width="${(to-from).toFixed(1)}" height="${H-T-B}"${markAttrs({tip:{t:titles[i],r:shown.map(s=>({c:s.color,n:s.name,v:valid(s.values[i])?format(s.values[i]):'—'}))},drill:drill?.(i),col:i,key:true})}/>`;}).join('');
 return `<div class="kit-live" id="${id}" ${liveAttrs(label,!!drill)}><svg class="kit" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>${foot}</div>`;
}
// Stacked bars over months (positive values). drill(i) for a month, drill(i,series) for one part of it.
export function stackedBars(spec){
 const {labels,titles=labels,series,format,height=210,label='Chart',drill,legend:withLegend=false}=spec;
 const W=640,H=height,L=64,R=14,T=16,B=28;if(!series.some(s=>s.values.some(v=>v>0)))return '';
 const id=register(stackedBars,spec),hidden=hiddenFor(label),shown=series.filter(s=>!hidden.has(s.name)),totals=labels.map((_,i)=>shown.reduce((v,s)=>v+Math.max(0,s.values[i]||0),0));
 const foot=withLegend?toggles(series,hidden):'';
 if(!totals.some(Boolean))return `<div class="kit-live" id="${id}">${allHidden}${foot}</div>`;
 const {hi,ticks}=nice(0,Math.max(...totals)),step=(W-L-R)/labels.length,bar=Math.min(46,step*.6),y=v=>T+(hi-v)/hi*(H-T-B);
 let svg=ticks.map(t=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(format(t,true))}</text>`).join('');
 labels.forEach((l,i)=>{const x=L+i*step+(step-bar)/2,rows=a=>shown.filter(s=>s.values[i]>0).map(s=>({c:s.color,n:s.name,v:format(s.values[i]),d:drill?.(i,s),a:s===a})),tip=a=>({t:titles[i],r:rows(a),f:`Total ${format(totals[i])}`});let top=0;
  svg+=`<rect class="kit-hit" x="${(L+i*step).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H-T-B}"${markAttrs({tip:tip(null),drill:drill?.(i),col:i,key:true})}/>`;
  for(const s of shown){const v=Math.max(0,s.values[i]||0);if(!v)continue;svg+=`<rect class="kit-seg" x="${x.toFixed(1)}" y="${y(top+v).toFixed(1)}" width="${bar.toFixed(1)}" height="${(y(top)-y(top+v)).toFixed(1)}" fill="${esc(s.color)}"${markAttrs({tip:tip(s),drill:drill?.(i,s),col:i})}/>`;top+=v;}
  svg+=`<text x="${(x+bar/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`;});
 return `<div class="kit-live kit-fade" id="${id}" ${liveAttrs(label,!!drill)}><svg class="kit" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>${foot}</div>`;
}
// Bars side by side for each month (money in and money out). footer(i) adds a line under the tooltip.
export function groupedBars(spec){
 const {labels,titles=labels,series,format,height=225,label='Chart',drill,footer,legend:withLegend=true}=spec;
 const W=640,H=height,L=58,R=10,T=14,B=28;if(!series.some(s=>s.values.some(v=>v>0)))return '';
 const id=register(groupedBars,spec),hidden=hiddenFor(label),shown=series.filter(s=>!hidden.has(s.name)),foot=withLegend?toggles(series,hidden):'';
 const top=Math.max(0,...shown.flatMap(s=>s.values));if(!top)return `<div class="kit-live" id="${id}">${allHidden}${foot}</div>`;
 const {hi,ticks}=nice(0,top),step=(W-L-R)/labels.length,group=Math.min(60,step*.62),bar=Math.max(4,(group-4*(shown.length-1))/shown.length),y=v=>T+(hi-v)/hi*(H-T-B);
 let svg=ticks.map(t=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(format(t,true))}</text>`).join('');
 labels.forEach((l,i)=>{const x=L+i*step+(step-group)/2,tip=a=>({t:titles[i],r:shown.map(s=>({c:s.color,n:s.name,v:format(s.values[i]||0),d:drill?.(i,s),a:s===a})),...(footer?{f:footer(i)}:{})});
  svg+=`<rect class="kit-hit" x="${(L+i*step).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H-T-B}"${markAttrs({tip:tip(null),drill:drill?.(i),col:i,key:true})}/>`;
  shown.forEach((s,j)=>{const v=Math.max(0,s.values[i]||0),h=y(0)-y(v);if(!v)return;svg+=`<rect class="kit-seg" x="${(x+j*(bar+4)).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${esc(s.color)}"${markAttrs({tip:tip(s),drill:drill?.(i,s),col:i})}/>`;});
  svg+=`<text x="${(L+i*step+step/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`;});
 return `<div class="kit-live kit-fade" id="${id}" ${liveAttrs(label,!!drill)}><svg class="kit" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>${foot}</div>`;
}
// Rows with a label, value and bar. A row with drill filters is a button that opens those transactions.
const row=(i,inner)=>i.drill?`<button type="button" class="kit-bar kit-go" data-drill="${json(i.drill)}" title="See these transactions">${inner}</button>`:`<div class="kit-bar">${inner}</div>`;
// Horizontal bars with a label and value on each row.
export function barList(items,{format,color='var(--green)'}){
 const max=Math.max(0,...items.map(i=>i.value));if(!max)return '';
 return `<div class="kit-bars">${items.map(i=>row(i,`<div class="kit-bar-head"><span>${esc(i.label)}${i.sub?`<small> · ${esc(i.sub)}</small>`:''}</span><b>${esc(format(i.value))}</b></div><div class="kit-track"><i style="width:${Math.max(1,i.value/max*100).toFixed(1)}%;background:${esc(i.color||color)}"></i></div>`)).join('')}</div>`;
}
// Progress towards a limit (tax deductions).
export function progressList(items,{format}){
 return `<div class="kit-bars">${items.map(i=>{const pct=i.limit?Math.min(100,i.value/i.limit*100):null;return `<div class="kit-bar"><div class="kit-bar-head"><span>${esc(i.label)}</span><b>${esc(format(i.value))}${i.limit?`<small> of ${esc(format(i.limit))}</small>`:''}</b></div>${pct===null?'':`<div class="kit-track"><i class="${pct>=100?'full':''}" style="width:${Math.max(pct?1:0,pct).toFixed(1)}%"></i></div>`}${i.note?`<small class="kit-note">${esc(i.note)}</small>`:''}</div>`;}).join('')}</div>`;
}
// A calendar of daily spending: one column per week (Monday at the top), darker for more. A day with spending opens
// that day's transactions.
export function heatmap({days,max,format,label='Spending calendar'}){
 const cell=13,gap=3,L=24,T=18,weeks=days.length/7,W=L+weeks*(cell+gap),H=T+7*(cell+gap)+4,level=v=>!v?0:Math.min(4,Math.ceil(v/max*4));
 const long=d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});
 let svg=['M','','W','','F','',''].map((d,i)=>d?`<text x="${L-6}" y="${T+i*(cell+gap)+cell-2}" text-anchor="end">${d}</text>`:'').join('');
 let month='';days.forEach((d,i)=>{const col=Math.floor(i/7),row=i%7,m=d.date.slice(0,7);
  if(row===0&&m!==month){month=m;svg+=`<text x="${L+col*(cell+gap)}" y="${T-6}">${new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'short'})}</text>`;}
  if(!d.future)svg+=`<rect class="heat l${level(d.value)}" x="${L+col*(cell+gap)}" y="${T+row*(cell+gap)}" width="${cell}" height="${cell}" rx="3"${markAttrs({tip:{t:long(d.date),r:[{n:'Spent',v:d.value?format(d.value):'Nothing'}]},drill:d.value?{day:d.date}:null,key:true})}/>`;});
 return `<div class="kit-scroll kit-live" data-grid="7" ${liveAttrs(label+'. Left and right move by a week, up and down by a day',true)}><svg class="kit kit-heat" viewBox="0 0 ${W} ${H}" style="width:${W}px;max-width:none" aria-hidden="true">${svg}</svg></div>`;
}
// Opening balance, then each step in or out, to the closing balance. Rows, so long labels fit on a phone.
export function waterfall({opening,steps,closing,format}){
 let run=opening??0;const rows=[...(opening!==null?[{label:'Opening balance',from:0,to:opening,kind:'total',value:opening}]:[]),...steps.map(s=>{const from=run;run+=s.value;return {...s,from,to:run};}),...(closing!==null?[{label:'Closing balance',from:0,to:closing,kind:'total',value:closing}]:[])];
 const lo=Math.min(0,...rows.flatMap(r=>[r.from,r.to])),hi=Math.max(0,...rows.flatMap(r=>[r.from,r.to])),span=hi-lo||1,pos=v=>(v-lo)/span*100;
 return `<div class="kit-bars kit-fall">${rows.map(r=>row(r,`<div class="kit-bar-head"><span>${esc(r.label)}</span><b class="${r.kind}">${esc((r.kind==='up'?'+':r.kind==='down'?'−':'')+format(Math.abs(r.value)))}</b></div><div class="kit-track"><i class="${r.kind}" style="left:${pos(Math.min(r.from,r.to)).toFixed(2)}%;width:${Math.max(.6,Math.abs(pos(r.to)-pos(r.from))).toFixed(2)}%"></i></div>`)).join('')}</div>`;
}
// Parts of a whole as a ring, with a legend beside it. A part with drill filters opens its transactions.
export function donut(parts,{format,label='Breakdown',centre=''}){
 const total=parts.reduce((v,p)=>v+Math.max(0,p.value),0);if(!total)return '';let offset=0;const share=p=>`${Math.round(Math.max(0,p.value)/total*100)}%`;
 const rings=parts.map((p,i)=>{const len=Math.max(0,p.value)/total*314.16,out=`<circle cx="70" cy="70" r="50" fill="none" stroke="${esc(p.color)}" stroke-width="18" stroke-dasharray="${Math.max(0,len-2)} ${314.16-Math.max(0,len-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"${markAttrs({tip:{t:p.label,r:[{c:p.color,n:'Amount',v:format(p.value)},{n:'Share',v:share(p)}]},drill:p.drill,col:i,key:true})}/>`;offset+=len;return out;}).join('');
 return `<div class="kit-donut kit-live kit-fade" ${liveAttrs(label,parts.some(p=>p.drill))}><svg viewBox="0 0 140 140" aria-hidden="true">${rings}<text x="70" y="75" text-anchor="middle" class="kit-centre">${esc(centre)}</text></svg><div class="kit-legend kit-legend-list">${parts.map((p,i)=>`<${p.drill?'button type="button"':'span'} data-for="${i}" data-col="${i}"><i style="background:${esc(p.color)}"></i>${esc(p.label)}<b>${esc(format(p.value))} · ${share(p)}</b></${p.drill?'button':'span'}>`).join('')}</div></div>`;
}

// ---- Interaction ----
// keyMode: the tooltip follows the keyboard until the mouse really moves (scrolling fires hover events under a still pointer).
let tipEl=null,current=null,pinned=false,lastPointer='mouse',onDrill=()=>{},enabled=false,keyMode=false,lastXY='';
const parse=s=>{try{return s?JSON.parse(s):null}catch{return null}};
function box(){if(!tipEl){tipEl=document.createElement('div');tipEl.className='kit-tip';tipEl.setAttribute('role','status');tipEl.setAttribute('aria-live','polite');tipEl.hidden=true;document.body.append(tipEl);}return tipEl;}
function draw(mark,mode){
 const t=parse(mark.dataset.tip),drill=mark.dataset.drill,pin=mode==='pin';if(!t)return;
 box().innerHTML=`<b class="kit-tip-title">${esc(t.t)}</b>${(t.r||[]).map(r=>{const inner=`${r.c?`<i style="background:${esc(r.c)}"></i>`:''}<span>${esc(r.n)}</span><b>${esc(r.v)}</b>`;return pin&&r.d?`<button type="button" class="kit-tip-row${r.a?' on':''}" data-tip-drill="${json(r.d)}">${inner}</button>`:`<div class="kit-tip-row${r.a?' on':''}">${inner}</div>`;}).join('')}${t.f?`<small>${esc(t.f)}</small>`:''}${drill?pin?`<button type="button" class="kit-tip-go" data-tip-drill="${esc(drill)}">See these transactions ›</button>`:`<small class="kit-tip-hint">${mode==='key'?'Press Enter':'Click'} to see these transactions</small>`:''}`;
 tipEl.classList.toggle('pinned',pin);tipEl.hidden=false;
}
function place(x,y){const b=box(),w=b.offsetWidth,h=b.offsetHeight,m=8;let left=x-w/2,top=y-h-12;if(top<m)top=y+18;b.style.left=Math.max(m,Math.min(innerWidth-w-m,left))+'px';b.style.top=Math.max(m,Math.min(innerHeight-h-m,top))+'px';}
const anchor=mark=>{const r=mark.getBoundingClientRect(),pts=mark.classList.contains('kit-hit')?[...mark.closest('.kit-live').querySelectorAll(`.kit-pt[data-col="${mark.dataset.col}"],.kit-seg[data-col="${mark.dataset.col}"]`)].map(p=>p.getBoundingClientRect().top):[];return [r.left+r.width/2,pts.length?Math.min(...pts):r.top];};
function activate(mark,mode,ev){
 const wrap=mark.closest('.kit-live');if(!wrap)return;keyMode=mode==='key';if(current&&current!==mark)deactivate();current=mark;pinned=mode==='pin';
 wrap.classList.add('kit-active');wrap.querySelectorAll('.on').forEach(e=>e.classList.remove('on'));mark.classList.add('on');
 if(mark.dataset.col!==undefined)wrap.querySelectorAll(`[data-col="${mark.dataset.col}"]`).forEach(e=>e.classList.add('on'));
 draw(mark,mode);if(ev&&mode==='hover')place(ev.clientX,ev.clientY);else place(...anchor(mark));
}
export function hideChartTip(){if(current){const wrap=current.closest('.kit-live');wrap?.classList.remove('kit-active');wrap?.querySelectorAll('.on').forEach(e=>e.classList.remove('on'));}current=null;pinned=false;if(tipEl)tipEl.hidden=true;}
const deactivate=hideChartTip;
const drillTo=d=>{if(!d)return;hideChartTip();onDrill(d);};
function toggleSeries(button){
 const wrap=button.closest('.kit-live'),entry=specs.get(wrap?.id);if(!entry)return;const name=button.dataset.seriesToggle,label=entry.spec.label||'Chart',h=new Set(hiddenFor(label));
 if(h.has(name))h.delete(name);else h.add(name);hiddenByLabel.set(label,h);hideChartTip();wrap.outerHTML=entry.fn(entry.spec);
 document.getElementById(entry.spec.id)?.querySelector(`[data-series-toggle="${CSS.escape(name)}"]`)?.focus();
}
export function enableCharts(drill){
 onDrill=drill;if(enabled)return;enabled=true;
 const markAt=t=>t?.closest?.('.kit-live [data-tip]');
 document.addEventListener('pointerdown',e=>{lastPointer=e.pointerType||'mouse';},true);
 document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse'||pinned||keyMode)return;const m=markAt(e.target);if(m){activate(m,'hover',e);return;}
  const f=e.target.closest?.('.kit-live [data-for]');if(f){const target=f.closest('.kit-live').querySelector(`[data-tip][data-col="${f.dataset.for}"]`);if(target)activate(target,'hover');}});
 document.addEventListener('pointermove',e=>{const xy=e.clientX+','+e.clientY;if(xy===lastXY)return;lastXY=xy;if(keyMode){keyMode=false;const m=markAt(e.target);if(m&&e.pointerType==='mouse'&&!pinned)activate(m,'hover',e);return;}if(e.pointerType==='mouse'&&!pinned&&current&&markAt(e.target)===current)place(e.clientX,e.clientY);});
 document.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse'||pinned||keyMode||!current)return;const to=e.relatedTarget;if(to?.closest?.('.kit-live')===current.closest('.kit-live')&&(markAt(to)||to.closest('[data-for]')))return;deactivate();});
 document.addEventListener('click',e=>{
  const go=e.target.closest?.('[data-tip-drill]');if(go){drillTo(parse(go.dataset.tipDrill));return;}
  const toggle=e.target.closest?.('[data-series-toggle]');if(toggle){toggleSeries(toggle);return;}
  const rowButton=e.target.closest?.('.kit-go[data-drill]');if(rowButton){drillTo(parse(rowButton.dataset.drill));return;}
  const f=e.target.closest?.('.kit-live [data-for]');if(f){const m=f.closest('.kit-live').querySelector(`[data-tip][data-col="${f.dataset.for}"]`);if(m?.dataset.drill)drillTo(parse(m.dataset.drill));else if(m)activate(m,'pin');return;}
  const m=markAt(e.target);
  if(m){if(lastPointer!=='mouse'){if(current===m&&pinned)deactivate();else activate(m,'pin');return;}if(m.dataset.drill)drillTo(parse(m.dataset.drill));return;}
  if(current&&!e.target.closest?.('.kit-tip'))deactivate();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&current){deactivate();return;}
  const wrap=e.target.closest?.('.kit-live');if(!wrap||e.target!==wrap)return;const keys=[...wrap.querySelectorAll('[data-k]')];if(!keys.length)return;
  if(e.key==='Enter'||e.key===' '){if(current&&wrap.contains(current)&&current.dataset.drill){e.preventDefault();drillTo(parse(current.dataset.drill));}return;}
  const grid=+wrap.dataset.grid||0,step={ArrowRight:grid||1,ArrowLeft:-(grid||1),ArrowDown:1,ArrowUp:-1,Home:-1,End:1}[e.key];if(step===undefined)return;e.preventDefault();
  const at=current&&wrap.contains(current)?keys.indexOf(current):-1,next=e.key==='Home'?0:e.key==='End'?keys.length-1:at<0?(step>0?0:keys.length-1):Math.max(0,Math.min(keys.length-1,at+step));
  if(grid)keys[next].scrollIntoView?.({block:'nearest',inline:'nearest'});activate(keys[next],'key');
 });
 document.addEventListener('focusout',e=>{if(current&&e.target===current.closest('.kit-live')&&!pinned)deactivate();});
 addEventListener('scroll',()=>{if(!current)return;if(!current.isConnected)deactivate();else if(pinned||!current.matches(':hover'))place(...anchor(current));},{passive:true,capture:true});
 addEventListener('resize',deactivate);
}
