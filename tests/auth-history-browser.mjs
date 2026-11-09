// Live checks for signing in and the browser history: after signing in, Back leaves the app instead of showing the
// sign-in form again; /login sends someone already signed in to the workspace (or to ?next=); once signed out, /login
// shows the form again. Uses a disposable operator-provisioned account that is deleted afterwards.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'History QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
function operator(create){return new Promise((resolve,reject)=>{const args=create?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',`import {pool} from './apps/api/dist/apps/api/src/database.js';let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);if(!/^bank-qa-[a-f0-9-]+@example.test$/.test(email))throw Error('Unexpected email');await pool.query('DELETE FROM "user" WHERE email=$1',[email]);await pool.end();`];const child=spawn('sudo',['-n','docker','compose','exec','-T','api',...args],{stdio:['pipe','ignore','pipe']});child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Test account operation failed')));child.stdin.end(JSON.stringify(user));});}
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
try{
 await operator(true);created=true;
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});
 const form=page.locator('form').filter({has:page.getByLabel('Email address')});
 const workspace=async()=>{await page.locator('#page-content').waitFor();assert.ok(!new URL(page.url()).pathname.startsWith('/login'),`not on the sign-in page: ${page.url()}`);};

 // 1. Arrive from somewhere else, open the app signed out (sent to /login), sign in with the form.
 await page.goto('data:text/html,<title>Elsewhere</title><h1 id="elsewhere">Somewhere else</h1>');
 await page.goto(base+'/');await page.waitForURL(/\/login\?next=/);
 await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill(user.password);
 await page.getByRole('button',{name:'Sign in'}).click();await page.waitForURL(u=>!u.pathname.startsWith('/login'));await workspace();

 // 2. Back goes to where the visit started, not to the sign-in form; Forward returns to the workspace, still signed in.
 await page.goBack({waitUntil:'load'});
 assert.equal(await form.count(),0,`Back after signing in showed the sign-in form again (${page.url()})`);
 await page.locator('#elsewhere').waitFor();
 await page.goForward();await workspace();

 // 3. Opening /login while signed in goes to the workspace, or to a safe ?next= page.
 await page.goto(base+'/login');await workspace();assert.equal(new URL(page.url()).pathname,'/');
 await page.goto(base+'/login?next=%2Fsettings');await workspace();assert.equal(new URL(page.url()).pathname,'/settings');
 await page.goto(base+'/login?next=https%3A%2F%2Fevil.example');await workspace();assert.equal(new URL(page.url()).origin,new URL(base).origin,'an outside ?next= is ignored');

 // 4. Signed out, /login shows the form again.
 assert.equal((await context.request.post(base+'/api/auth/sign-out',{headers:{Origin:base}})).status(),200);
 await page.goto(base+'/login');await page.getByLabel('Email address').waitFor();assert.equal(new URL(page.url()).pathname,'/login');
 assert.deepEqual(problems,[]);
 console.log('PASS: after signing in, Back leaves the app instead of showing the sign-in form and Forward returns signed in; /login sends a signed-in visitor to the workspace or a safe ?next=; signed out, /login shows the form; no CSP violations.');
}finally{await browser.close();if(created)await operator(false).catch(()=>{});}
