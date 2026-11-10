import {parseBankMessage,parseReceiptText,findMatches,accountsFor,enrichFromMessage,newFromPhone} from './capture.js';
import {parseMoney} from './core.js';
import {transactionLabel} from './transaction-labels.js';
import {fmtDate,istDate} from './format.js';
import {btn,field,input,select,pill} from './ui.js';
// "Add" on the phone bar: a UPI or bank message, or a photo of a bill, matched to its transaction or added as a new one
// (see capture.js). Bills can also wait in an inbox until the statement with their payment is imported.
export function createCaptureViews({getState,save,render,toast,modal,bindModal,esc,icon,money,api,upload}){
 let draft=null;
 const $=s=>document.querySelector(s),state=()=>getState();
 const accountOptions=selected=>`<option value="">Any account</option>${(state().accounts||[]).filter(a=>!a.archived).map(a=>`<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.name)}${a.last4?` ·${esc(a.last4)}`:''}</option>`).join('')}`;
 const amountText=v=>Number.isSafeInteger(v)&&v?(Math.abs(v)/100).toFixed(2):'';
 const slug=s=>String(s||'bill').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'bill';
 function choose(){
  draft=null;const waiting=state().receipts||[];
  modal('Add to your ledger',`<div class="capture-choices">
   <button class="capture-choice" data-capture="message">${icon('message',22)}<span><b>UPI or bank message</b><small>Paste an SMS or app notification. Ledger finds the payment, or adds it until your statement arrives.</small></span></button>
   <button class="capture-choice" data-capture="photo">${icon('camera',22)}<span><b>Bill or invoice</b><small>Take a photo of a bill, or choose a photo or PDF invoice. It is read on this device and attached to its payment.</small></span></button>
   <button class="capture-choice" data-capture="statement">${icon('upload',22)}<span><b>Bank statement</b><small>Import a PDF, Excel or CSV statement.</small></span></button></div>
   ${waiting.length?`<h3 class="capture-heading">Bills waiting for their payment</h3><div class="capture-inbox">${waiting.map(r=>`<div class="report-line"><span>${esc(r.merchant||r.name)}<small class="sub"> · ${r.date?fmtDate(r.date):'no date'}</small></span><span>${r.total?money(r.total):''} ${btn(`Find payment`,{data:{'inbox':r.id}})}</span></div>`).join('')}</div>`:''}`);
  bindModal();
  document.querySelectorAll('[data-capture]').forEach(el=>el.onclick=()=>el.dataset.capture==='message'?messageStep():el.dataset.capture==='photo'?photoStep():($('#modal').close(),upload()));
  document.querySelectorAll('[data-inbox]').forEach(el=>el.onclick=()=>fromInbox(el.dataset.inbox));
 }
 function messageStep(text=''){
  modal('UPI or bank message',`<form id="capture-message" class="capture-form"><label class="field">Message<textarea class="input" name="text" rows="6" maxlength="2000" required placeholder="Paste the SMS or app notification, for example: Sent Rs.450.00 From HDFC Bank A/C *4821 To SWIGGY On 20/10/26 Ref 628512345678">${esc(text)}</textarea></label>
   <p class="sub">Read on this device. Ledger keeps the amount, date, account, payee and UPI reference, not the message itself.</p></form>`,
   `${btn(`Back`,{type:'button',data:{'capture-back':true}})}${navigator.clipboard?.readText?btn(`Paste`,{type:'button',data:{'paste':true}}):''}${btn(`Read message`,{variant:'primary',type:'submit',attrs:{form:'capture-message'}})}`);
  bindModal();$('[data-capture-back]').onclick=choose;
  const paste=$('[data-paste]');if(paste)paste.onclick=async()=>{try{const t=await navigator.clipboard.readText();if(t)$('#capture-message textarea').value=t;}catch{toast('Allow pasting, or long-press the box and paste.');}};
  $('#capture-message').onsubmit=e=>{e.preventDefault();readMessage(new FormData(e.target).get('text'));};
  if(!text)setTimeout(()=>$('#capture-message textarea')?.focus(),50);
 }
 function readMessage(text){
  const p=parseBankMessage(text,{today:istDate()});
  if(!p.amount){toast('No amount found in this message. Check it is a bank or UPI message.');return;}
  draft={kind:'message',text,parsed:p,amount:p.amount,direction:p.direction||'debit',date:p.date||istDate(),payee:p.payee||'',ref:p.ref,channel:p.channel,accountId:accountsFor(state(),p.last4)[0]?.id||'',choice:null};
  review();
 }
 function photoStep(){
  modal('Bill or invoice',`<div class="capture-photo"><label class="btn primary capture-camera">${icon('camera',18)} Take a photo<input type="file" accept="image/*" capture="environment" data-photo></label><label class="btn">${icon('upload',16)} Choose a photo or PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" data-photo></label></div>
   <p class="sub">The bill is read on this device. The photo or PDF is saved privately with the payment as its receipt.</p>`,`${btn(`Back`,{type:'button',data:{'capture-back':true}})}`);
  bindModal();$('[data-capture-back]').onclick=choose;
  document.querySelectorAll('[data-photo]').forEach(el=>el.onchange=()=>{const f=el.files?.[0];if(f)readPhoto(f);});
 }
 // A photo is shrunk to JPEG and read with OCR; a PDF invoice is read from its text (OCR only if it is a scan) and kept as
 // the original PDF. Either way the receipt shows a picture of the bill.
 const isPDF=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name||'');
 async function readPhoto(file){
  const pdf=isPDF(file),progress=p=>{const el=$('#capture-progress');if(el)el.textContent=`${p.step}… ${p.percent}%`;};
  modal('Reading the bill',`<div class="capture-reading"><span class="spinner" aria-hidden="true"></span><p id="capture-progress" role="status">${pdf?'Reading the PDF…':'Preparing the photo…'}</p></div>`);bindModal();
  try{
   let blob,preview,mime,text='';
   if(pdf){if(file.size>20*1024*1024)throw Error('Please choose a PDF smaller than 20 MB.');const {readInvoicePDF}=await import('./invoice-pdf.js');const r=await readInvoicePDF(file,progress);blob=file;preview=r.preview;mime='application/pdf';text=r.text;}
   else{const {shrinkImage,readImageText}=await import('./ocr.js');blob=preview=await shrinkImage(file);mime='image/jpeg';try{text=await readImageText(blob,progress);}catch{text='';}}
   const r=parseReceiptText(text,{today:istDate()});
   draft={kind:'receipt',blob,mime,url:URL.createObjectURL(preview),amount:r.total?-r.total:null,date:r.date||istDate(),payee:r.merchant||'',accountId:'',unread:!r.total,choice:null};
   review();
  }catch(e){toast(e.message||'This bill could not be read.');photoStep();}
 }
 // The picture to show for a stored receipt: the photo itself, or the first page of a PDF.
 const picture=async blob=>blob.type==='application/pdf'?(await import('./invoice-pdf.js')).previewPDF(blob):blob;
 async function fromInbox(id){
  const r=(state().receipts||[]).find(x=>x.id===id);if(!r)return;
  draft={kind:'receipt',inboxId:r.id,fileId:r.fileId,name:r.name,url:null,amount:r.total?-r.total:null,date:r.date||istDate(),payee:r.merchant||'',accountId:'',choice:null};
  review();
  try{const res=await fetch('/api/files/'+encodeURIComponent(r.fileId),{credentials:'same-origin'});if(res.ok&&draft?.inboxId===id){draft.url=URL.createObjectURL(await picture(await res.blob()));const img=$('#capture-preview');if(img)img.src=draft.url;}}catch{}
 }
 const matches=()=>{const d=draft;if(!Number.isSafeInteger(d.amount)||!d.amount)return [];
  return (d.kind==='message'?findMatches(state(),{amount:d.amount,date:d.date,last4:d.parsed.last4,ref:d.ref,accountId:d.accountId||undefined})
   :findMatches(state(),{amount:d.amount,date:d.date,accountId:d.accountId||undefined,days:5,tolerance:100}).filter(m=>!(m.t.receipts||[]).some(x=>x.id===d.fileId))).slice(0,6);};
 function options(){
  const d=draft,list=matches(),choices=[...list.map(m=>m.t.id),'new',...(d.kind==='receipt'&&!d.inboxId?['later']:[])];
  if(!choices.includes(d.choice))d.choice=list[0]?.t.id||(d.kind==='receipt'&&!d.inboxId?'later':'new');
  const row=(value,title,sub,badge='')=>`<label class="capture-option"><input type="radio" name="capture-choice" value="${esc(value)}" ${d.choice===value?'checked':''}><span><b>${title}</b>${sub?`<small class="sub">${sub}</small>`:''}</span>${badge}</label>`;
  return `${list.length?`<p class="capture-heading">${list.length===1?'This looks like the payment':'Which payment is it?'}</p>`:`<p class="sub">${Number.isSafeInteger(d.amount)&&d.amount?`No transaction for ${money(Math.abs(d.amount))} around ${fmtDate(d.date)} yet. ${d.kind==='message'?'It is added now and replaced by the statement’s row when you import it.':'Keep the bill until the statement with its payment is imported, or add it as a new payment.'}`:'Enter the amount to find the payment.'}</p>`}
   ${list.map(m=>row(m.t.id,esc(transactionLabel(m.t,state().titleRules||[]).title),`${esc(m.t.account)} · ${fmtDate(m.t.date)} · ${money(m.t.amount)}`,m.sure?pill(`Same UPI reference`,'ok'):'')).join('')}
   ${row('new',d.kind==='message'?'Add as a new payment':'Add as a new payment with this bill',d.accountId?'':'Choose its account above')}
   ${d.kind==='receipt'&&!d.inboxId?row('later','Keep it for later','Matched when the statement with this payment is imported'):''}`;
 }
 function review(){
  const d=draft,isMessage=d.kind==='message';
  modal(isMessage?'Check the payment':'Check the bill',`<form id="capture-review" class="capture-form">
   ${isMessage?`<p class="capture-quote">${esc(d.text.slice(0,240))}${d.text.length>240?'…':''}</p>`:`<img id="capture-preview" class="capture-preview" alt="The bill" ${d.url?`src="${d.url}"`:''}>${d.unread?'<p class="notice">The total could not be read from this photo. Enter it below.</p>':''}`}
   <div class="form-grid capture-fields">${[isMessage?field('Money',select({name:'direction'},`<option value="debit" ${d.amount<0?'selected':''}>Paid</option><option value="credit" ${d.amount>0?'selected':''}>Received</option>`)):'',
    field('Amount (₹)',input({name:'amount',inputmode:'decimal',required:true,value:amountText(d.amount),placeholder:'0.00'})),
    field('Date',input({type:'date',name:'date',required:true,value:d.date,max:istDate()})),
    isMessage?'':`<label class="field wide">Shop<input class="input" name="payee" maxlength="160" value="${esc(d.payee)}"></label>`,
    `<label class="field${isMessage?'':' wide'}">Account<select class="input" name="account">${accountOptions(d.accountId)}</select></label>`,
    isMessage?`<label class="field wide">Paid to / from<input class="input" name="payee" maxlength="160" value="${esc(d.payee)}"></label>`:''].join('')}</div>
   ${isMessage&&d.ref?`<p class="sub">UPI reference ${esc(d.ref)}</p>`:''}
   <div id="capture-options" class="capture-options">${options()}</div><p class="notice error" role="alert" hidden id="capture-error"></p></form>`,
   `${btn(`Back`,{type:'button',data:{'capture-back':true}})}${btn(`Save`,{variant:'primary',type:'submit',id:'capture-save',attrs:{form:'capture-review'}})}`);
  bindModal();$('[data-capture-back]').onclick=()=>isMessage?messageStep(d.text):d.inboxId?choose():photoStep();
  const form=$('#capture-review');
  const sync=()=>{const f=new FormData(form),v=parseMoney(String(f.get('amount')||'').replace(/^-/,''));d.amount=v?(isMessage&&f.get('direction')==='credit'?Math.abs(v):-Math.abs(v)):null;d.date=String(f.get('date')||'')||istDate();d.payee=String(f.get('payee')||'').trim();d.accountId=String(f.get('account')||'');d.choice=f.get('capture-choice')||d.choice;$('#capture-options').innerHTML=options();};
  form.oninput=e=>{if(e.target.name==='capture-choice'){d.choice=e.target.value;return;}sync();};
  form.onsubmit=async e=>{e.preventDefault();sync();await commit();};
 }
 async function storePhoto(){const d=draft;if(d.fileId)return {id:d.fileId,name:d.name,addedAt:new Date().toISOString()};
  const id=crypto.randomUUID(),pdf=d.mime==='application/pdf',name=`bill-${d.date}-${slug(d.payee)}.${pdf?'pdf':'jpg'}`,form=new FormData();form.append('file',new File([d.blob],name,{type:pdf?'application/pdf':'image/jpeg'}));form.append('id',id);
  await api('/api/files',{method:'POST',body:form});d.fileId=id;d.name=name;return {id,name,addedAt:new Date().toISOString()};}
 async function commit(){
  const d=draft,s=state(),error=$('#capture-error'),fail=m=>{error.textContent=m;error.hidden=false;};
  if(!Number.isSafeInteger(d.amount)||!d.amount)return fail('Enter the amount.');
  const button=$('#capture-save');button.disabled=true;button.innerHTML='<span class="spinner" aria-hidden="true"></span> Saving…';
  try{
   let message;
   if(d.kind==='message'){
    const t=s.transactions.find(x=>x.id===d.choice);
    if(t){enrichFromMessage(t,{ref:d.ref,payee:d.payee});message=`Added to ${transactionLabel(t,s.titleRules||[]).title} on ${fmtDate(t.date)}`;}
    else{if(!d.accountId)return fail('Choose the account this payment was made from.');s.transactions.push(newFromPhone(s,{accountId:d.accountId,amount:d.amount,date:d.date,payee:d.payee,ref:d.ref,channel:d.channel,source:'message'}));message='Payment added. Your statement will replace it when you import it.';}
    if(!await save(t?'Details added from a UPI message':'Payment added from a UPI message'))return;
   }else{
    if(d.choice==='new'&&!d.accountId)return fail('Choose the account this payment was made from.');
    const receipt=await storePhoto(),t=s.transactions.find(x=>x.id===d.choice);
    if(t){if((t.receipts||[]).length>=5)return fail('This payment already has 5 receipts.');t.receipts=[...(t.receipts||[]),receipt];const label=transactionLabel(t,s.titleRules||[]);if(!t.displayName&&d.payee&&label.source!=='Your label'&&/payment|transfer|transaction|purchase|card|upi|pos/i.test(label.title))t.displayName=d.payee.slice(0,160);message=`Bill attached to ${transactionLabel(t,s.titleRules||[]).title} on ${fmtDate(t.date)}`;}
    else if(d.choice==='new'){s.transactions.push({...newFromPhone(s,{accountId:d.accountId,amount:d.amount,date:d.date,payee:d.payee,source:'receipt'}),receipts:[receipt]});message='Payment added with its bill.';}
    else{s.receipts=[...(s.receipts||[]),{id:crypto.randomUUID(),fileId:receipt.id,name:receipt.name,addedAt:receipt.addedAt,...(d.payee?{merchant:d.payee.slice(0,120)}:{}),total:Math.abs(d.amount),date:d.date}];message='Bill kept. Find it under Add when its payment arrives.';}
    if(d.inboxId&&d.choice!=='later')s.receipts=(s.receipts||[]).filter(r=>r.id!==d.inboxId);
    if(!await save(t?'Receipt attached':d.choice==='new'?'Payment added from a bill':'Receipt kept for later'))return;
   }
   if(d.url)URL.revokeObjectURL(d.url);draft=null;$('#modal').close();render();toast(message);
  }catch(e){fail(e.message||'Not saved. Please retry.');}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Save';}}
 }
 // Receipts on a transaction: shown from the private file store, removable.
 async function viewReceipts(id){
  const t=state().transactions.find(x=>x.id===id);if(!t?.receipts?.length)return;
  modal(t.receipts.length>1?'Receipts':'Receipt',`<div class="receipt-list">${t.receipts.map(r=>`<figure class="receipt-item" data-receipt-item="${esc(r.id)}"><img alt="Receipt ${esc(r.name)}"><figcaption><span>${esc(r.name)}</span><span><a class="btn" download="${esc(r.name)}" hidden>Download</a> ${btn(`Remove`,{data:{'remove-receipt':r.id}})}</span></figcaption></figure>`).join('')}</div>`);bindModal();
  for(const r of t.receipts){try{const res=await fetch('/api/files/'+encodeURIComponent(r.id),{credentials:'same-origin'});if(!res.ok)continue;const file=await res.blob(),item=document.querySelector(`[data-receipt-item="${CSS.escape(r.id)}"]`);if(!item)continue;item.querySelector('img').src=URL.createObjectURL(await picture(file));const a=item.querySelector('a');a.href=URL.createObjectURL(file);if(file.type==='application/pdf')a.textContent='Download PDF';a.hidden=false;}catch{}}
  document.querySelectorAll('[data-remove-receipt]').forEach(el=>el.onclick=async()=>{if(!confirm('Remove this receipt? The photo or PDF is deleted.'))return;t.receipts=t.receipts.filter(r=>r.id!==el.dataset.removeReceipt);if(!t.receipts.length)delete t.receipts;if(await save('Receipt removed')){$('#modal').close();render();toast('Receipt removed');}});
 }
 function inboxStrip(){const n=(state().receipts||[]).length;return n?`<div class="review-strip"><div class="review-icon">${icon('camera',18)}</div><div><b>${n} bill${n>1?'s are':' is'} waiting for ${n>1?'their payments':'its payment'}.</b><p>Once the statement with ${n>1?'them':'it'} is imported, match ${n>1?'each bill':'the bill'} to its payment.</p></div>${btn(`Match bills ${icon('chevron',12)}`,{action:'capture'})}</div>`:'';}
 // Something shared to Ledger from another app (Android): the service worker keeps it until the page picks it up.
 async function openShared(id){
  try{const cache=await caches.open('ledger-share'),meta=await cache.match('/share/'+id);if(!meta)throw Error();const data=await meta.json();let file=null;
   if(data.files?.length){const r=await cache.match(`/share/${id}/file/0`);if(r){const b=await r.blob();file=new File([b],data.files[0].name||'shared.jpg',{type:b.type||data.files[0].type});}}
   for(const k of await cache.keys())if(new URL(k.url).pathname.startsWith('/share/'+id))await cache.delete(k);
   if(file)readPhoto(file);else if(data.text?.trim()){messageStep(data.text);readMessage(data.text);}else choose();
  }catch{toast('That shared item could not be opened. Please share it again.');}
 }
 return {open:choose,openShared,viewReceipts,inboxStrip};
}
