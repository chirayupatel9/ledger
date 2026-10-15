import assert from 'node:assert/strict';
import {upgradeAccounts} from '../packages/domain/accounts.js';
import {setTimeout as sleep} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_ORIGIN||'http://localhost:5800', inbox=process.env.TEST_INBOX||'http://localhost:5801';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Integration tests create local test accounts; use a local instance.');
const password='Local test password '+randomUUID(),nextPassword='Reset password '+randomUUID(),run=randomUUID();
function client(){const jar=new Map();return {jar,async request(path,{method='GET',body,origin=base,headers={}}={}){
 const response=await fetch(new URL(path,base),{method,redirect:'manual',headers:{Origin:origin,...(jar.size?{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(';');const i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,data,headers:response.headers};
}}}
async function emailLink(email,subject){for(let i=0;i<30;i++){
 const response=await fetch(inbox+'/api/v1/search?query='+encodeURIComponent('to:'+email));const data=await response.json();
 const message=data.messages?.find(m=>m.Subject===subject);if(message){const m=await(await fetch(inbox+'/api/v1/message/'+message.ID)).json();const url=m.Text.match(/https?:\/\/[^\s]+/)?.[0];assert.ok(url);return url;}
 await sleep(1000);
}throw Error('Expected verification/reset email did not arrive in local SMTP inbox');}
async function account(name){const c=client(),email=`${name}-${run}@example.test`;
 assert.equal((await c.request('/api/auth/sign-up/email',{method:'POST',body:{name,email,password,callbackURL:'/login'}})).status,200);
 assert.equal((await c.request('/api/ledger')).status,401,'Unverified signup must not access financial data');
 const url=await emailLink(email,'Verify your Ledger email');
 const verified=await c.request(url);assert.equal(verified.status,302);
 const login=await c.request('/api/auth/sign-in/email',{method:'POST',body:{email,password}});assert.equal(login.status,200);
 assert.match(login.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/i);
 return {c,email};
}
const a=await account('alice'),b=await account('bob');
assert.equal((await client().request('/api/ledger',{headers:{'x-user-id':'alice','x-auth-request-email':a.email}})).status,401);
const fileId=randomUUID(),statementId=randomUUID();const form=new FormData();form.append('id',fileId);form.append('file',new Blob(['Date,Description,Debit,Credit\n01/10/2026,Swiggy,500,\n']), 'hdfc.csv');
assert.equal((await a.c.request('/api/files',{method:'POST',body:form})).status,201);
assert.equal((await b.c.request('/api/files/'+fileId)).status,404);
const original=await a.c.request('/api/files/'+fileId);assert.equal(original.status,200);assert.match(original.data,/Swiggy/);
const state=upgradeAccounts({initialized:true,rules:[],statements:[{id:statementId,fileId,name:'hdfc.csv',account:'HDFC',count:1,created:new Date().toISOString()}],transactions:[{id:randomUUID(),statementId,date:'2026-10-01',description:'Swiggy',amount:-50000,account:'HDFC',category:'Food & dining',type:'Expense',review:false}]});
assert.equal((await a.c.request('/api/ledger',{method:'PUT',body:{revision:0,state},origin:'https://attacker.invalid'})).status,403);
assert.equal((await b.c.request('/api/ledger',{method:'PUT',body:{revision:0,state}})).status,400,'Cross-account file references must fail');
const saved=await a.c.request('/api/ledger',{method:'PUT',body:{revision:0,state}});assert.equal(saved.status,200);assert.equal(saved.data.revision,1);
assert.equal((await b.c.request('/api/ledger')).data.state.transactions.length,0);
const concurrent=await Promise.all([1,2].map(()=>a.c.request('/api/ledger',{method:'PUT',body:{revision:1,state}})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
assert.equal((await a.c.request('/api/activity')).data.events.length,2);
const another=client();assert.equal((await another.request('/api/auth/sign-in/email',{method:'POST',body:{email:a.email,password}})).status,200);assert.equal((await another.request('/api/ledger')).data.state.transactions.length,1);
assert.equal((await a.c.request('/api/auth/request-password-reset',{method:'POST',body:{email:a.email,redirectTo:base+'/reset-password'}})).status,200);
const resetLink=await emailLink(a.email,'Reset your Ledger password');const resetRedirect=await client().request(resetLink);assert.equal(resetRedirect.status,302);
const token=new URL(resetRedirect.headers.get('location'),base).searchParams.get('token');assert.ok(token);
const reset=await client().request('/api/auth/reset-password',{method:'POST',body:{token,newPassword:nextPassword}});assert.equal(reset.status,200);
assert.equal((await another.request('/api/ledger')).status,401,'Password reset must revoke other sessions');
assert.equal((await client().request('/api/auth/sign-in/email',{method:'POST',body:{email:a.email,password}})).status,401,'Old password must fail');
const final=client();assert.equal((await final.request('/api/auth/sign-in/email',{method:'POST',body:{email:a.email,password:nextPassword}})).status,200);
assert.equal((await final.request('/api/auth/reset-password',{method:'POST',body:{token,newPassword:password}})).status,400,'Reset tokens must be single use');
const beforeClear=await final.request('/api/ledger');
assert.equal((await final.request('/api/ledger',{method:'PUT',body:{revision:beforeClear.data.revision,state:{schemaVersion:2,accounts:[],initialized:true,transactions:[],statements:[],rules:[]}}})).status,200);
assert.equal((await final.request('/api/files/'+fileId)).status,404,'Clearing ledger must delete originals');
assert.equal((await final.request('/api/auth/sign-out',{method:'POST',body:{}})).status,200);
assert.equal((await final.request('/api/ledger')).status,401);
console.log('PASS: real PostgreSQL signup, SMTP verification/reset, sessions, logout, two-user isolation, originals, atomic conflicts, CSRF, token reuse rejection and deletion.');
