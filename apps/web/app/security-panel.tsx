'use client';
import {useState,type FormEvent} from 'react';
import {encode} from 'uqr';
type Reply={message?:string;totpURI?:string;backupCodes?:string[]};
async function call(path:string,body:Record<string,unknown>){
 const res=await fetch('/api/auth/two-factor/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json().catch(()=>({})) as Reply;
 if(!res.ok)throw Error(data.message||'That did not work. Please retry.');
 return data;
}
function QR({value}:{value:string}){
 const {data}=encode(value,{ecc:'M',border:2}),size=data.length;
 return <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff"/>{data.flatMap((row,y)=>row.map((on,x)=>on?<rect key={x+'-'+y} x={x} y={y} width="1" height="1" fill="#173b32"/>:null))}</svg>;
}
function Codes({codes}:{codes:string[]}){
 const download=()=>{const url=URL.createObjectURL(new Blob(['Ledger backup codes. Each code works once.\n\n'+codes.join('\n')+'\n'],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='ledger-backup-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <div className="backup-codes"><p className="auth-small">Save these backup codes somewhere safe. Each one signs you in once if you lose your phone. They will not be shown again.</p><ol>{codes.map(c=><li key={c}><code>{c}</code></li>)}</ol><button type="button" className="auth-secondary" onClick={download}>Download backup codes</button></div>;
}
export default function SecurityPanel({enabled:initial}:{enabled:boolean}){
 const [enabled,setEnabled]=useState(initial),[setup,setSetup]=useState<{uri:string;codes:string[]}|null>(null),[codes,setCodes]=useState<string[]|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function run(event:FormEvent<HTMLFormElement>,work:(f:FormData)=>Promise<void>){event.preventDefault();setError('');setMessage('');const f=new FormData(event.currentTarget);setBusy(true);try{await work(f)}catch(e){setError(e instanceof Error?e.message:'Unable to connect. Please retry.')}finally{setBusy(false)}}
 const start=(e:FormEvent<HTMLFormElement>)=>run(e,async f=>{const data=await call('enable',{password:f.get('password'),method:'totp'});if(!data.totpURI||!data.backupCodes)throw Error('Could not start setup. Please retry.');setSetup({uri:data.totpURI,codes:data.backupCodes})});
 const confirm=(e:FormEvent<HTMLFormElement>)=>run(e,async f=>{await call('verify-totp',{code:String(f.get('code')||'').replace(/\s+/g,'')});setEnabled(true);setSetup(null);setMessage('Two-step verification is on. You will be asked for a code each time you sign in on a new device.')});
 const regenerate=(e:FormEvent<HTMLFormElement>)=>run(e,async f=>{const data=await call('generate-backup-codes',{password:f.get('password')});setCodes(data.backupCodes||[]);setMessage('New backup codes created. Your old codes no longer work.');(e.target as HTMLFormElement).reset()});
 const disable=(e:FormEvent<HTMLFormElement>)=>run(e,async f=>{if(!window.confirm('Turn off two-step verification? Your ledger will be protected by your password only.'))return;await call('disable',{password:f.get('password')});setEnabled(false);setCodes(null);setMessage('Two-step verification is off.')});
 const secret=setup?new URL(setup.uri).searchParams.get('secret')?.replace(/(.{4})/g,'$1 ').trim():'';
 return <div className="security-panel">
  {error&&<div className="auth-error" role="alert">{error}</div>}
  {message&&<div className="auth-notice" role="status">{message}</div>}
  <p className="security-status">Status: <b>{enabled?'On':'Off'}</b></p>
  {!enabled&&!setup&&<form onSubmit={start}><p className="auth-small">You will need an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</p><label>Current password<input name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label><button className="auth-primary" disabled={busy}>{busy?'Please wait…':'Set up two-step verification'}<span aria-hidden="true">→</span></button></form>}
  {setup&&<form onSubmit={confirm}><p className="auth-small">1. Scan this code with your authenticator app, or enter the key manually.</p><QR value={setup.uri}/><p className="secret-key"><code>{secret}</code></p><Codes codes={setup.codes}/><p className="auth-small">2. Enter the 6-digit code your app shows to finish.</p><label>Authentication code<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} required disabled={busy} placeholder="123 456"/></label><button className="auth-primary" disabled={busy}>{busy?'Please wait…':'Turn on two-step verification'}<span aria-hidden="true">→</span></button></form>}
  {enabled&&<>{codes&&<Codes codes={codes}/>}<form onSubmit={regenerate}><label>Current password<input name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label><button className="auth-secondary" disabled={busy}>Create new backup codes</button></form><form onSubmit={disable}><label>Current password<input name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label><button className="auth-secondary danger" disabled={busy}>Turn off two-step verification</button></form></>}
  <p className="auth-switch"><a href="/">← Back to your ledger</a></p>
 </div>;
}
