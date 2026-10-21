// Live authentication checks on the public domain, with a disposable account only (never the owner's login):
// HTTPS, sign-in options that match the server's settings (Google, invite-only sign-up, password reset), secure session
// cookies, sign-out, password change revoking other sessions, uninvited sign-up refused, Google sign-in starting at
// Google with the right callback, password reset answering without revealing accounts, and CSRF protection.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
function operator(script,input){return new Promise((resolve,reject)=>{
 const args=script==='create'?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js'; let s='';for await(const c of process.stdin)s+=c; const emails=JSON.parse(s).emails;if(!emails.every(e=>/^domain-qa-[a-f0-9-]+@example.test$/.test(e)))throw Error('Invalid test account');for(const e of emails){await pool.query('DELETE FROM mail_outbox WHERE recipient=$1',[e]);await pool.query('DELETE FROM "user" WHERE email=$1',[e]);}await pool.end();`];
 const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','pipe']});
 child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator test action failed')));child.stdin.end(JSON.stringify(input));
});}
const person=()=>({email:`domain-qa-${randomUUID()}@example.test`,name:'Temporary domain QA',password:randomBytes(24).toString('base64url')});
const temporary=person(),stranger=person(),changed=randomBytes(24).toString('base64url');
const browser=await chromium.launch({headless:true});let created=false;
try{
 const options=await(await (await browser.newContext()).request.get(base+'/api/config')).json();

 // 1. The sign-in page over HTTPS shows exactly the options the server has turned on.
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const login=await page.goto(base+'/login');assert.equal(login.status(),200);assert.ok(await login.securityDetails(),'served over HTTPS');
 assert.equal(await page.getByRole('button',{name:'Continue with Google'}).count(),options.google?1:0,'Google button follows the server setting');
 assert.equal(await page.locator('a[href="/signup"]').count(),options.signup?1:0,'sign-up link follows the server setting');
 assert.equal(await page.locator('a[href="/forgot-password"]').count(),options.recovery?1:0,'password reset link follows the server setting');
 if(options.signupMode==='invite')assert.match(await page.locator('a[href="/signup"]').locator('..').innerText(),/Have an invitation\?/);

 // 2. Sign in with a disposable account: secure session cookie, own ledger, Change password reachable, sign-out ends the session.
 await operator('create',temporary);created=true;
 await page.getByLabel('Email address').fill(temporary.email);await page.getByLabel('Password',{exact:true}).fill(temporary.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('[data-action="settings"]').first().waitFor();
 const session=(await context.cookies()).find(c=>c.name.includes('session_token'));assert.ok(session);assert.equal(session.secure,true);assert.equal(session.httpOnly,true);assert.equal(session.sameSite,'Lax');
 const ledger=await context.request.get(base+'/api/ledger');assert.equal(ledger.status(),200);assert.equal((await ledger.json()).user.email,temporary.email);
 await page.locator('[data-action="settings"]').first().click();await page.getByRole('link',{name:'Change password'}).click();await page.getByLabel('Current password',{exact:true}).waitFor();
 await page.goto(base+'/');await page.locator('[data-action="settings"]').first().click();await page.locator('#signout').click();await page.waitForURL('**/login');
 assert.equal((await context.request.get(base+'/api/ledger')).status(),401,'signed out');

 // 3. Changing the password signs out other sessions and retires the old password.
 await page.getByLabel('Email address').fill(temporary.email);await page.getByLabel('Password',{exact:true}).fill(temporary.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('[data-action="settings"]').first().waitFor();
 const other=await browser.newContext();assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:temporary.password}})).status(),200);
 await page.goto(base+'/change-password');await page.getByLabel('Current password',{exact:true}).fill(temporary.password);await page.getByLabel('New password',{exact:true}).fill(changed);await page.getByLabel('Confirm password').fill(changed);await page.getByRole('button',{name:'Update password'}).click();await page.waitForURL(base+'/');
 assert.equal((await other.request.get(base+'/api/ledger')).status(),401,'password change revokes other sessions');
 assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:temporary.password}})).status(),401,'old password rejected');
 assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:changed}})).status(),200);

 // 4. Sign-up, Google sign-in and password reset behave as configured.
 const anon=await browser.newContext();
 const signup=await anon.request.post(base+'/api/auth/sign-up/email',{headers:{Origin:base},data:{email:stranger.email,name:stranger.name,password:stranger.password}});
 if(options.signupMode==='invite'){assert.equal(signup.status(),403);assert.match((await signup.json()).message,/not been invited/);}
 else if(!options.signup)assert.ok([400,403,404].includes(signup.status()),'sign-up is closed');
 if(options.google){
  const start=await anon.request.post(base+'/api/auth/sign-in/social',{headers:{Origin:base},data:{provider:'google',callbackURL:'/',errorCallbackURL:'/login?via=google'}});assert.equal(start.status(),200);
  const url=new URL((await start.json()).url);assert.equal(url.host,'accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),base+'/api/auth/callback/google');
 }
 const reset=email=>anon.request.post(base+'/api/auth/request-password-reset',{headers:{Origin:base},data:{email,redirectTo:base+'/reset-password'}});
 if(options.recovery){
  const known=await reset(temporary.email),unknown=await reset(stranger.email);assert.equal(known.status(),200);assert.equal(unknown.status(),200);
  assert.deepEqual(await known.json(),await unknown.json(),'the answer does not reveal whether an account exists');
 }else assert.ok([400,403,404].includes((await reset(temporary.email)).status()),'password reset is off');

 // 5. Writes from another site are refused.
 assert.equal((await other.request.put(base+'/api/ledger',{headers:{Origin:'https://attacker.invalid'},data:{}})).status(),403);
 assert.deepEqual(errors,[]);await context.close();await other.close();await anon.close();
 console.log(`PASS: live HTTPS; sign-in page matches server settings (Google ${options.google?'on':'off'}, sign-up ${options.signupMode}, reset ${options.recovery?'on':'off'}); disposable-account sign-in with Secure/HttpOnly/SameSite cookie; sign-out; password change revokes other sessions and the old password; uninvited sign-up refused; Google sign-in starts at Google with the right callback; password reset does not reveal accounts; CSRF refused.`);
}finally{await browser.close();await operator('delete',{emails:[temporary.email,stranger.email]}).catch(()=>{});}
