// Small SVG and HTML charts for the dashboard, Reports and Investments. No chart library: the page loads only its own
// scripts. Callers pass colours and a formatter (format(value) for labels, format(value,true) for compact axis labels).
// Text and grid lines take the theme's colours from CSS (.kit), so charts work in light and dark mode.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nice(min,max){
 if(min===max){max=min+1;}const span=max-min,raw=span/4,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw);
 const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;return {lo,hi,ticks:Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>lo+i*step)};
}
export function legend(series){return `<div class="kit-legend">${series.map(s=>`<span><i style="background:${esc(s.color)}"></i>${esc(s.name)}</span>`).join('')}</div>`;}
// Lines over months. A null value leaves a gap. Values may be negative (a zero line is drawn).
export function lineChart({labels,series,format,height=210,label='Chart'}){
 const W=640,H=height,L=64,R=14,T=14,B=28,all=series.flatMap(s=>s.values).filter(v=>v!==null&&Number.isFinite(v));
 if(!all.length)return '';const {lo,hi,ticks}=nice(Math.min(0,...all),Math.max(0,...all)),x=i=>labels.length<2?(L+W-R)/2:L+i*(W-L-R)/(labels.length-1),y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
 let svg=ticks.map(t=>`<line class="grid${t===0?' zero':''}" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(format(t,true))}</text>`).join('');
 svg+=labels.map((l,i)=>`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`).join('');
 for(const s of series){let d='',open=false;s.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v)){open=false;return;}d+=`${open?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;open=true;});
  svg+=`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.bold?3:2}" ${s.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
  svg+=s.values.map((v,i)=>v===null||!Number.isFinite(v)?'':`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${s.bold?3.5:2.5}" fill="${esc(s.color)}"><title>${esc(s.name)} · ${esc(labels[i])}: ${esc(format(v))}</title></circle>`).join('');}
 return `<svg class="kit" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}
// Stacked bars over months (positive values).
export function stackedBars({labels,series,format,height=210,label='Chart'}){
 const W=640,H=height,L=64,R=14,T=16,B=28,totals=labels.map((_,i)=>series.reduce((v,s)=>v+Math.max(0,s.values[i]||0),0));
 if(!totals.some(Boolean))return '';const {hi,ticks}=nice(0,Math.max(...totals)),step=(W-L-R)/labels.length,bar=Math.min(46,step*.6),y=v=>T+(hi-v)/hi*(H-T-B);
 let svg=ticks.map(t=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(format(t,true))}</text>`).join('');
 labels.forEach((l,i)=>{const x=L+i*step+(step-bar)/2;let top=0;
  for(const s of series){const v=Math.max(0,s.values[i]||0);if(!v)continue;svg+=`<rect x="${x.toFixed(1)}" y="${y(top+v).toFixed(1)}" width="${bar.toFixed(1)}" height="${(y(top)-y(top+v)).toFixed(1)}" fill="${esc(s.color)}"><title>${esc(s.name)} · ${esc(l)}: ${esc(format(v))}</title></rect>`;top+=v;}
  svg+=`<text x="${(x+bar/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`;});
 return `<svg class="kit" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
}
// Horizontal bars with a label and value on each row.
export function barList(items,{format,color='var(--green)'}){
 const max=Math.max(0,...items.map(i=>i.value));if(!max)return '';
 return `<div class="kit-bars">${items.map(i=>`<div class="kit-bar"><div class="kit-bar-head"><span>${esc(i.label)}${i.sub?`<small> · ${esc(i.sub)}</small>`:''}</span><b>${esc(format(i.value))}</b></div><div class="kit-track"><i style="width:${Math.max(1,i.value/max*100).toFixed(1)}%;background:${esc(i.color||color)}"></i></div></div>`).join('')}</div>`;
}
// Progress towards a limit (tax deductions).
export function progressList(items,{format}){
 return `<div class="kit-bars">${items.map(i=>{const pct=i.limit?Math.min(100,i.value/i.limit*100):null;return `<div class="kit-bar"><div class="kit-bar-head"><span>${esc(i.label)}</span><b>${esc(format(i.value))}${i.limit?`<small> of ${esc(format(i.limit))}</small>`:''}</b></div>${pct===null?'':`<div class="kit-track"><i class="${pct>=100?'full':''}" style="width:${Math.max(pct?1:0,pct).toFixed(1)}%"></i></div>`}${i.note?`<small class="kit-note">${esc(i.note)}</small>`:''}</div>`;}).join('')}</div>`;
}
// A calendar of daily spending: one column per week (Monday at the top), darker for more.
export function heatmap({days,max,format,label='Spending calendar'}){
 const cell=13,gap=3,L=24,T=18,weeks=days.length/7,W=L+weeks*(cell+gap),H=T+7*(cell+gap)+4,level=v=>!v?0:Math.min(4,Math.ceil(v/max*4));
 let svg=['M','','W','','F','',''].map((d,i)=>d?`<text x="${L-6}" y="${T+i*(cell+gap)+cell-2}" text-anchor="end">${d}</text>`:'').join('');
 let month='';days.forEach((d,i)=>{const col=Math.floor(i/7),row=i%7,m=d.date.slice(0,7);
  if(row===0&&m!==month){month=m;svg+=`<text x="${L+col*(cell+gap)}" y="${T-6}">${new Date(m+'-15T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',month:'short'})}</text>`;}
  if(!d.future)svg+=`<rect class="heat l${level(d.value)}" x="${L+col*(cell+gap)}" y="${T+row*(cell+gap)}" width="${cell}" height="${cell}" rx="3"><title>${esc(new Date(d.date+'T00:00:00Z').toLocaleDateString('en-IN',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}))}: ${esc(d.value?format(d.value):'no spending')}</title></rect>`;});
 return `<div class="kit-scroll"><svg class="kit kit-heat" viewBox="0 0 ${W} ${H}" style="width:${W}px;max-width:none" role="img" aria-label="${esc(label)}">${svg}</svg></div>`;
}
// Opening balance, then each step in or out, to the closing balance. Rows, so long labels fit on a phone.
export function waterfall({opening,steps,closing,format}){
 let run=opening??0;const rows=[...(opening!==null?[{label:'Opening balance',from:0,to:opening,kind:'total',value:opening}]:[]),...steps.map(s=>{const from=run;run+=s.value;return {...s,from,to:run};}),...(closing!==null?[{label:'Closing balance',from:0,to:closing,kind:'total',value:closing}]:[])];
 const lo=Math.min(0,...rows.flatMap(r=>[r.from,r.to])),hi=Math.max(0,...rows.flatMap(r=>[r.from,r.to])),span=hi-lo||1,pos=v=>(v-lo)/span*100;
 return `<div class="kit-bars kit-fall">${rows.map(r=>`<div class="kit-bar"><div class="kit-bar-head"><span>${esc(r.label)}</span><b class="${r.kind}">${esc((r.kind==='up'?'+':r.kind==='down'?'−':'')+format(Math.abs(r.value)))}</b></div><div class="kit-track"><i class="${r.kind}" style="left:${pos(Math.min(r.from,r.to)).toFixed(2)}%;width:${Math.max(.6,Math.abs(pos(r.to)-pos(r.from))).toFixed(2)}%"></i></div></div>`).join('')}</div>`;
}
// Parts of a whole as a ring, with a legend beside it.
export function donut(parts,{format,label='Breakdown',centre=''}){
 const total=parts.reduce((v,p)=>v+Math.max(0,p.value),0);if(!total)return '';let offset=0;
 const rings=parts.map(p=>{const len=Math.max(0,p.value)/total*314.16,out=`<circle cx="70" cy="70" r="50" fill="none" stroke="${esc(p.color)}" stroke-width="18" stroke-dasharray="${Math.max(0,len-2)} ${314.16-Math.max(0,len-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"><title>${esc(p.label)}: ${esc(format(p.value))}</title></circle>`;offset+=len;return out;}).join('');
 return `<div class="kit-donut"><svg viewBox="0 0 140 140" role="img" aria-label="${esc(label)}">${rings}<text x="70" y="75" text-anchor="middle" class="kit-centre">${esc(centre)}</text></svg><div class="kit-legend kit-legend-list">${parts.map(p=>`<span><i style="background:${esc(p.color)}"></i>${esc(p.label)}<b>${esc(format(p.value))} · ${Math.round(Math.max(0,p.value)/total*100)}%</b></span>`).join('')}</div></div>`;
}
