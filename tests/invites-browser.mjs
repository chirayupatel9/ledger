// Live checks for invite-only sign-up: only invited addresses can create an account, only the workspace owner manages
// invitations, and an invited person gets a separate ledger. Uses disposable .test accounts (mail to them is never sent).
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const person=name=>({name,email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')});
const owner=person('Invite Owner'),member=person('Plain Member'),invited=person('Invited Friend'),stranger=person('Not Invited'),pending=person('Pending Friend');
// Operator helpers run inside the API container and only ever touch bank-qa-*@example.test rows.
function operator(script,input){return new Promise((resolve,reject)=>{let out='';const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...script],{stdio:['pipe','pipe','pipe']});child.stdout.on('data',d=>out+=d);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error('Operator step failed')));child.stdin.end(JSON.stringify(input));});}
const create=u=>operator(['node','apps/api/dist/apps/api/src/create-account.js'],u);
const sql=(query,params)=>operator(['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {query,params}=JSON.parse(s);if(!params.every(p=>/^bank-qa-[a-f0-9-]+@example\\.test$/.test(p)))throw Error('Unexpected email');const r=await pool.query(query,params);console.log(JSON.stringify(r.rows));await pool.end();`],{query,params}).then(JSON.parse);
const browser=await chromium.launch({headless:true}),problems=[],cleanup=[];
const watch=page=>{page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});};
const signIn=async(ctx,u)=>assert.equal((await ctx.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:u.email,password:u.password}})).status(),200);
try{
 for(const u of [owner,member]){await create(u);cleanup.push(u);}
 await sql('INSERT INTO workspace_owners(user_id) SELECT id FROM "user" WHERE email=$1',[owner.email]);
 const config=await(await (await browser.newContext()).request.get(base+'/api/config')).json();assert.equal(config.signupMode,'invite');assert.equal(config.signup,true);

 // 1. The owner invites from Settings; a plain member cannot see or use invitations.
 const ownerCtx=await browser.newContext(),page=await ownerCtx.newPage();watch(page);await signIn(ownerCtx,owner);
 await page.goto(base+'/settings');const card=page.locator('#invites-card');await card.locator('#invite-form').waitFor();
 for(const u of [invited,pending]){await card.locator('#invite-form [name="email"]').fill(u.email);await card.getByRole('button',{name:'Invite'}).click();await card.locator(`[data-invite="${u.email}"]`).waitFor();cleanup.push(u);}
 assert.match(await card.locator(`[data-invite="${invited.email}"]`).innerText(),/Invited/);
 const sent=await sql('SELECT subject,suppressed FROM mail_outbox WHERE recipient=$1',[invited.email]);assert.deepEqual(sent,[{subject:'Invite Owner invited you to Ledger',suppressed:true}],'invitation recorded but never sent to a .test address');
 const memberCtx=await browser.newContext();await signIn(memberCtx,member);assert.equal((await memberCtx.request.get(base+'/api/invites')).status(),403);
 assert.equal((await memberCtx.request.post(base+'/api/invites',{headers:{Origin:base},data:{email:stranger.email}})).status(),403);
 const memberPage=await memberCtx.newPage();watch(memberPage);await memberPage.goto(base+'/settings');await memberPage.locator('#preferences-form').waitFor();assert.equal(await memberPage.locator('#invites-card').count(),0);await memberCtx.close();

 // 2. An address that was not invited cannot sign up, through the form or the API.
 const anon=await browser.newContext(),signup=await anon.newPage();watch(signup);await signup.goto(base+'/signup');
 assert.match(await signup.locator('.auth-small').first().innerText(),/Sign-up is by invitation/);
 const fill=async u=>{await signup.getByLabel('Full name').fill(u.name);await signup.getByLabel('Email address').fill(u.email);await signup.getByLabel('Password',{exact:true}).fill(u.password);await signup.getByLabel('Confirm password').fill(u.password);await signup.getByRole('button',{name:'Create account'}).click();};
 await fill(stranger);await signup.locator('.auth-error').getByText('has not been invited').waitFor();
 assert.equal((await sql('SELECT id FROM "user" WHERE email=$1',[stranger.email])).length,0);
 const api=await anon.request.post(base+'/api/auth/sign-up/email',{headers:{Origin:base},data:{name:stranger.name,email:stranger.email,password:stranger.password}});assert.equal(api.status(),403);assert.match((await api.json()).message,/not been invited/);
 // A refused Google sign-up comes back to the login page with a readable reason.
 await signup.goto(base+'/login?via=google&error=NOT_INVITED&error_description=x');await signup.locator('.auth-error').getByText('has not been invited').waitFor();

 // 3. The invited address signs up from its invitation link, verifies, and gets an empty ledger of its own.
 await signup.goto(base+'/signup?email='+encodeURIComponent(invited.email));assert.equal(await signup.getByLabel('Email address').inputValue(),invited.email);
 await signup.getByLabel('Full name').fill(invited.name);await signup.getByLabel('Password',{exact:true}).fill(invited.password);await signup.getByLabel('Confirm password').fill(invited.password);await signup.getByRole('button',{name:'Create account'}).click();
 await signup.getByRole('heading',{name:'Check your inbox'}).waitFor();
 const [verify]=await sql("SELECT body FROM mail_outbox WHERE recipient=$1 AND subject ILIKE '%verify%'",[invited.email]);const link=verify.body.match(/https:\/\/\S+/)[0];
 await signup.goto(link);await signIn(anon,invited);const own=await(await anon.request.get(base+'/api/ledger')).json();
 assert.equal(own.user.email,invited.email);assert.equal(own.user.owner,false);assert.equal(own.state.transactions.length,0,'a separate, empty ledger');
 assert.equal((await anon.request.get(base+'/api/invites')).status(),403);await anon.close();

 // 4. The owner sees who joined and can withdraw a pending invitation.
 await page.reload();await card.locator(`[data-invite="${invited.email}"]`).getByText('Joined',{exact:true}).waitFor();
 page.once('dialog',d=>d.accept());await card.locator(`[data-invite-remove="${pending.email}"]`).click();await card.locator(`[data-invite="${pending.email}"]`).waitFor({state:'detached'});
 const anon2=await browser.newContext();assert.equal((await anon2.request.post(base+'/api/auth/sign-up/email',{headers:{Origin:base},data:{name:pending.name,email:pending.email,password:pending.password}})).status(),403,'a withdrawn invitation no longer works');await anon2.close();
 assert.deepEqual(problems,[]);
 console.log('PASS: invite-only sign-up (owner invites in Settings, non-owners blocked, uninvited form and API sign-up refused, Google refusal explained, invitation link prefill, verification, separate empty ledger, joined status, withdrawn invitation refused), test mail never sent, no CSP violations.');
}finally{
 await browser.close();
 const emails=[owner,member,invited,stranger,pending].map(u=>u.email);
 for(const e of emails){await sql('DELETE FROM mail_outbox WHERE recipient=$1',[e]).catch(()=>{});await sql('DELETE FROM signup_invites WHERE email=$1',[e]).catch(()=>{});await sql('DELETE FROM "user" WHERE email=$1',[e]).catch(()=>{});}
}
