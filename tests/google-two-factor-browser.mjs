// Live check that Google sign-in asks for Ledger's two-step code, with a disposable account only (never the owner's).
// Google itself is not involved: a one-off process in the API container runs the production sign-in handler with
// Google's token endpoint answered in that process, so the callback is the real /api/auth/callback/google with the live
// database and secret. The browser then finishes the sign-in on the live site.
// Checks: without two-step verification Google signs straight in; with it, the callback leaves no session and sends the
// browser to the code form, which refuses a wrong code and signs in with the right one; a trusted device skips the code.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={email:`domain-qa-${randomUUID()}@example.test`,name:'Temporary Google QA',password:randomBytes(24).toString('base64url')};
// Operator steps run inside the API container and only ever touch domain-qa-*@example.test accounts.
function operator(args,input){return new Promise((resolve,reject)=>{let out='';
 const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','pipe','pipe']});
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));
});}
const guard=`let s='';for await(const c of process.stdin)s+=c;const input=JSON.parse(s);if(!/^domain-qa-[a-f0-9-]+@example\\.test$/.test(input.email))throw Error('Invalid test account');`;
// One Google sign-in through the production handler: start it, then return from Google with a code. The token
// endpoint answer is an ID token for the test address. Returns the callback's status, Location and Set-Cookie headers,
// and the cookies a browser holds afterwards.
const google=cookies=>operator(['node','--input-type=module','-e',`import {auth} from './apps/api/dist/apps/api/src/auth.js';import {pool} from './apps/api/dist/apps/api/src/database.js';${guard}
 const origin=process.env.APP_ORIGIN,now=Math.floor(Date.now()/1000),part=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const id_token=[part({alg:'RS256',typ:'JWT'}),part({iss:'https://accounts.google.com',aud:'ledger-live-test',sub:'qa-'+input.email,email:input.email,email_verified:true,name:'Temporary Google QA',iat:now,exp:now+300}),'unsigned'].join('.');
 globalThis.fetch=async url=>{if(String(url)!=='https://oauth2.googleapis.com/token')throw Error('Unexpected request');return Response.json({access_token:'qa',token_type:'Bearer',expires_in:300,id_token});};
 const jar=new Map(input.cookies);
 const send=async(path,init={})=>{const r=await auth.handler(new Request(origin+'/api/auth'+path,{...init,headers:{origin,'content-type':'application/json',cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}}));
  for(const c of r.headers.getSetCookie()){const [pair,...attrs]=c.split(';'),i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);if(!value||attrs.some(a=>/^\\s*max-age=0\\s*$/i.test(a)))jar.delete(name);else jar.set(name,value);}return r;};
 const start=await(await send('/sign-in/social',{method:'POST',body:JSON.stringify({provider:'google',callbackURL:'/',errorCallbackURL:'/login?via=google'})})).json();
 const callback=await send('/callback/google?code=qa&state='+new URL(start.url).searchParams.get('state'));
 console.log(JSON.stringify({status:callback.status,location:callback.headers.get('location'),set:callback.headers.getSetCookie(),cookies:[...jar]}));await pool.end();`],{email:user.email,cookies}).then(out=>JSON.parse(out.split('\n').pop()));
const create=()=>operator(['node','apps/api/dist/apps/api/src/create-account.js'],user);
const remove=()=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';${guard}
 await pool.query('DELETE FROM verification WHERE value IN (SELECT id FROM "user" WHERE email=$1)',[input.email]);await pool.query('DELETE FROM mail_outbox WHERE recipient=$1',[input.email]);await pool.query('DELETE FROM "user" WHERE email=$1',[input.email]);await pool.end();`],{email:user.email});
function totp(uri){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of new URL(uri).searchParams.get('secret').replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');}
const browser=await chromium.launch({headless:true}),problems=[];
const watch=page=>{page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});};
// A browser holding the cookies the callback left.
const browserWith=async cookies=>{const context=await browser.newContext();await context.addCookies(cookies.map(([name,value])=>({name,value,url:base,secure:true,httpOnly:true,sameSite:'Lax'})));return context;};
const ledgerOf=async context=>{const r=await context.request.get(base+'/api/ledger');return r.status()===200?(await r.json()).user.email:r.status();};
const sessionCookie=name=>name.includes('session_token');
try{
 await create();

 // 1. Without two-step verification, Google signs straight in.
 const first=await google([]);assert.equal(first.status,302);assert.equal(first.location,'/');
 const plain=await browserWith(first.cookies);assert.equal(await ledgerOf(plain),user.email,'Google sign-in opens the account');await plain.close();

 // 2. Turn on two-step verification (API, with the password).
 const owner=await browser.newContext();
 assert.equal((await owner.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:user.email,password:user.password}})).status(),200);
 const {totpURI}=await(await owner.request.post(base+'/api/auth/two-factor/enable',{headers:{Origin:base},data:{password:user.password}})).json();
 assert.equal((await owner.request.post(base+'/api/auth/two-factor/verify-totp',{headers:{Origin:base},data:{code:totp(totpURI)}})).status(),200);
 assert.equal((await(await owner.request.get(base+'/api/auth/get-session')).json()).user.twoFactorEnabled,true);await owner.close();

 // 3. Now the Google callback leaves no session and sends the browser to the code form.
 const second=await google([]);assert.equal(second.status,302);assert.equal(second.location,'/login?twofactor=1');
 const sent=second.set.filter(c=>sessionCookie(c.split('=')[0]));assert.ok(sent.length&&sent.every(c=>/^[^=]+=;/.test(c)&&/Max-Age=0/i.test(c)),'only an expired session cookie is sent');
 assert.ok(!second.cookies.some(([name])=>sessionCookie(name)));assert.ok(second.cookies.some(([name])=>name.endsWith('two_factor')),'pending two-step sign-in');
 const pending=await browserWith(second.cookies);assert.equal(await ledgerOf(pending),401,'Google alone must not open the ledger');
 const page=await pending.newPage();watch(page);await page.goto(base+second.location);
 await sleep(10500);// the two-step endpoints allow 3 requests per 10 s; step 2 used two
 await page.getByLabel('Authentication code').fill('000000');await page.getByRole('button',{name:'Verify and sign in'}).click();await page.locator('.auth-error').waitFor();
 assert.equal(await ledgerOf(pending),401);
 await page.getByLabel('Authentication code').fill(totp(totpURI));await page.getByLabel('Trust this device for 30 days').check();
 await page.getByRole('button',{name:'Verify and sign in'}).click();await page.waitForURL(base+'/');await page.locator('[data-action="settings"]').first().waitFor();
 assert.equal(await ledgerOf(pending),user.email,'the code finishes the Google sign-in');
 const trust=(await pending.cookies()).filter(c=>c.name.endsWith('trust_device')).map(c=>[c.name,c.value]);assert.equal(trust.length,1);await pending.close();

 // 4. A device trusted for 30 days skips the code after Google, as after a password.
 const third=await google(trust);assert.equal(third.status,302);assert.equal(third.location,'/');
 const trusted=await browserWith(third.cookies);assert.equal(await ledgerOf(trusted),user.email);await trusted.close();
 assert.deepEqual(problems,[]);
 console.log('PASS: Google sign-in through the production callback (Google token endpoint simulated): plain account signs straight in; two-step account gets no session, only an expired session cookie, and the code form at /login?twofactor=1; wrong code refused; right code signs in; trusted device skips the code; no CSP violations.');
}finally{await browser.close();await remove().catch(()=>{});}
