import {fmtDate,istDate} from './format.js';
import {btn,input,pill} from './ui.js';
// Settings → Invitations (workspace owner only). Invited addresses may create their own, separate ledger.
export function createInviteViews({api,isOwner,esc,icon,toast}){
 let data=null,error='',busy=false,draft='';
 const status=i=>i.hasAccount?pill('Joined','ok'):pill('Invited','review');
 function inner(){
  const mode=data?.signupMode,note=!data?'':mode==='invite'?(data.mailEnabled?'Each invitation is emailed with a link to create an account.':'Email is off, so invitations are not emailed; send people the sign-up link yourself.'):mode==='open'?'Sign-up is open to anyone, so this list is not required.':'Sign-up is closed on the server, so invited people cannot sign up yet.';
  return `<div class="card-head"><div><h2>Invitations</h2><p class="sub">Only these email addresses can create an account. Each person gets a separate, private ledger; they cannot see yours.</p></div></div><div class="settings-body">
   ${data?`<p class="sub">${esc(note)}</p>`:'<p class="sub"><span class="spinner" aria-hidden="true"></span> Loading invitations…</p>'}${error?`<p class="notice error" role="alert">${esc(error)}</p>`:''}
   ${data?`<form id="invite-form" class="invite-form">${input({type:'email',name:'email',maxlength:254,required:true,placeholder:'name@example.com','aria-label':'Email address to invite',value:draft})}${btn(`${busy?'<span class="spinner" aria-hidden="true"></span>':icon('plus',12)} Invite`,{variant:'primary',type:'submit',disabled:busy})}</form>`:''}
   ${data?.invites.length?`<div class="invite-list">${data.invites.map(i=>`<div class="invite-row" data-invite="${esc(i.email)}"><div><b>${esc(i.email)}</b><p class="sub">Invited ${fmtDate(istDate(i.invitedAt))}${i.acceptedAt?` · joined ${fmtDate(istDate(i.acceptedAt))}`:''}</p></div>${status(i)}${i.hasAccount?'':btn('Remove',{data:{'invite-remove':i.email}})}</div>`).join('')}</div>`:data?'<p class="sub">No invitations yet.</p>':''}</div>`;
 }
 const card=()=>isOwner()?`<div class="card settings-card" id="invites-card">${inner()}</div>`:'';
 function paint(){const el=document.querySelector('#invites-card');if(el){el.innerHTML=inner();wire();}}
 async function load(){try{data=await api('/api/invites');error='';}catch(e){error=e.message;}paint();}
 async function send(path,options,message,sent=()=>{}){busy=true;paint();try{data=await api(path,options);error='';sent();toast(message(data));}catch(e){error=e.message;}finally{busy=false;paint();}}
 function wire(){
  const form=document.querySelector('#invite-form');
  if(form){form.email.oninput=()=>draft=form.email.value;form.onsubmit=e=>{e.preventDefault();const email=String(new FormData(form).get('email')||'').trim();if(!email)return;draft=email;
   send('/api/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})},d=>d.emailed?`Invitation emailed to ${email}`:`${email} can now sign up`,()=>draft='');};}
  document.querySelectorAll('[data-invite-remove]').forEach(el=>el.onclick=()=>{const email=el.dataset.inviteRemove;if(!confirm(`Remove the invitation for ${email}? They will no longer be able to sign up.`))return;send('/api/invites/'+encodeURIComponent(email),{method:'DELETE'},()=>'Invitation removed');});
 }
 // The form appears once the list has loaded; what was typed survives redraws and a failed invite.
 function bind(){if(!document.querySelector('#invites-card'))return;if(data===null&&!busy)load();else wire();}
 return {card,bind};
}
