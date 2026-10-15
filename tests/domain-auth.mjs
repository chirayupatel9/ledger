import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='https://ledger.chirayupatel.dev';
function operator(script,input){return new Promise((resolve,reject)=>{
 const args=script==='create'?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js'; let s='';for await(const c of process.stdin)s+=c; const email=JSON.parse(s).email;if(!/^domain-qa-[a-f0-9-]+@example.test$/.test(email))throw Error('Invalid test account');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`];
 const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','pipe']});
 child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Operator test action failed')));child.stdin.end(JSON.stringify(input));
});}
const owner=JSON.parse(readFileSync('.secrets/owner-login.json','utf8'));
const temporary={email:`domain-qa-${randomUUID()}@example.test`,name:'Temporary domain QA',password:randomBytes(24).toString('base64url')};
const changed=randomBytes(24).toString('base64url');
const browser=await chromium.launch({headless:true});let created=false;
try{
 const ownerContext=await browser.newContext(),page=await ownerContext.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const login=await page.goto(base+'/login');assert.equal(login.status(),200);assert.ok(await login.securityDetails());
 assert.equal(await page.getByRole('button',{name:'Continue with Google'}).count(),0);
 assert.equal(await page.locator('a[href="/signup"]').count(),0);assert.equal(await page.locator('a[href="/forgot-password"]').count(),0);
 await page.getByLabel('Email address').fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);
 await page.getByRole('button',{name:'Sign in',exact:false}).click();await page.locator('[data-action="settings"]').waitFor();
 const cookies=await ownerContext.cookies();const session=cookies.find(c=>c.name.includes('session_token'));assert.ok(session);assert.equal(session.secure,true);assert.equal(session.httpOnly,true);assert.equal(session.sameSite,'Lax');
 const ledger=await ownerContext.request.get(base+'/api/ledger');assert.equal(ledger.status(),200);assert.equal((await ledger.json()).user.email,owner.email);
 await page.locator('[data-action="settings"]').click();await page.getByRole('link',{name:'Change password'}).click();await page.getByLabel('Current password',{exact:true}).waitFor();
 await page.goto(base+'/');await page.locator('[data-action="settings"]').click();await page.locator('#signout').click();await page.waitForURL('**/login');
 assert.equal((await ownerContext.request.get(base+'/api/ledger')).status(),401);
 assert.deepEqual(errors,[]);await ownerContext.close();
 await operator('create',temporary);created=true;
 const context=await browser.newContext(),tab=await context.newPage();await tab.goto(base+'/login');
 await tab.getByLabel('Email address').fill(temporary.email);await tab.getByLabel('Password',{exact:true}).fill(temporary.password);await tab.getByRole('button',{name:'Sign in',exact:false}).click();await tab.locator('[data-action="settings"]').waitFor();
 const other=await browser.newContext();assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:temporary.password}})).status(),200);
 await tab.goto(base+'/change-password');await tab.getByLabel('Current password',{exact:true}).fill(temporary.password);await tab.getByLabel('New password',{exact:true}).fill(changed);await tab.getByLabel('Confirm password').fill(changed);await tab.getByRole('button',{name:'Update password'}).click();await tab.waitForURL(base+'/');
 assert.equal((await other.request.get(base+'/api/ledger')).status(),401,'Password change revokes other sessions');
 assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:temporary.password}})).status(),401,'Old password rejected');
 assert.equal((await other.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:temporary.email,password:changed}})).status(),200);
 for(const path of ['sign-up/email','request-password-reset','send-verification-email']){const r=await other.request.post(base+'/api/auth/'+path,{headers:{Origin:base},data:{email:temporary.email,name:'Test',password:changed}});assert.ok([400,403,404].includes(r.status()),'Email-dependent route must be disabled');}
 const csrf=await other.request.put(base+'/api/ledger',{headers:{Origin:'https://attacker.invalid'},data:{}});assert.equal(csrf.status(),403);
 await context.close();await other.close();
 console.log('PASS: live HTTPS, owner login/logout, Secure/HttpOnly/SameSite cookies, Google/signup/recovery hidden and disabled, password-change UI, old-password rejection, other-session revocation, CSRF.');
}finally{await browser.close();if(created)await operator('delete',temporary);}
