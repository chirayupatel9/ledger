// Live checks that a signed-in app stops showing data the moment its session ends: when the session is revoked
// server-side (sign out elsewhere, change password, lost device), the open tab's next request returns 401 and the app
// leaves for the sign-in page instead of keeping the ledger on screen; and signing out clears the on-device copies
// (the legacy ledger.v1 and any shared item in Cache Storage). Disposable operator-provisioned account, deleted after.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'https://ledger.chirayupatel.dev';
const user={name:'Session QA',email:`bank-qa-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
// op('create') makes the account; op('revoke') deletes its sessions; op('delete') removes the account. Each runs in the
// API container, which is the only thing with database access, mirroring the other live suites.
const DELETE_BY_EMAIL=action=>[
 "import {pool} from './apps/api/dist/apps/api/src/database.js';",
 "let s='';for await(const c of process.stdin)s+=c;const {email}=JSON.parse(s);",
 "if(!/^bank-qa-[a-f0-9-]+@example[.]test$/.test(email))throw Error('Unexpected email');",
 'const u=await pool.query(\'SELECT id FROM "user" WHERE email=$1\',[email]);',
 'if(u.rowCount)await pool.query('+action+',[u.rows[0].id]);',
 'await pool.end();',
].join('');
const SCRIPTS={
 revoke:DELETE_BY_EMAIL('\'DELETE FROM session WHERE "userId"=$1\''),
 delete:DELETE_BY_EMAIL('\'DELETE FROM "user" WHERE id=$1\''),
};
function op(kind){
 const argv=kind==='create'?['node','apps/api/dist/apps/api/src/create-account.js']:['node','--input-type=module','-e',SCRIPTS[kind]];
 return new Promise((resolve,reject)=>{const c=spawn('sudo',['-n','docker','compose','exec','-T','api',...argv],{stdio:['pipe','ignore','pipe']});c.stderr.on('data',()=>{});c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(Error('operator '+kind+' failed')));c.stdin.end(JSON.stringify(user));});
}
const browser=await chromium.launch({headless:true}),problems=[];let created=false;
const signIn=async page=>{await page.goto(base+'/login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign in'}).click();await page.locator('#page-content').waitFor();};
try{
 await op('create');created=true;
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>problems.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))problems.push('csp: '+m.text())});

 // 1. Session revoked while the tab stays open: the next request leaves for the sign-in page, nothing stays on screen.
 await signIn(page);
 await op('revoke');
 await page.locator('[data-action="refresh"]').first().click();
 await page.waitForURL(/\/login/,{timeout:10000});
 assert.equal(new URL(page.url()).pathname,'/login','a revoked session lands on the sign-in page');
 assert.equal(await page.locator('form').filter({has:page.getByLabel('Email address')}).count(),1,'the sign-in form is shown');

 // 2. Signing out clears the on-device copies (legacy ledger and any shared item).
 const ctx2=await browser.newContext(),page2=await ctx2.newPage();await signIn(page2);
 await page2.evaluate(async()=>{try{localStorage.setItem('ledger.v1','{"transactions":[{"id":1}]}')}catch{}const c=await caches.open('ledger-share');await c.put('/share/probe',new Response('{}'))});
 await page2.locator('[data-action="settings"]').first().click();await page2.locator('#signout').click();await page2.waitForURL(/\/login/);
 assert.equal(await page2.evaluate(()=>{try{return localStorage.getItem('ledger.v1')}catch{return null}}),null,'the legacy ledger copy is cleared on sign-out');
 assert.equal(await page2.evaluate(async()=>{try{return !!(await (await caches.open('ledger-share')).match('/share/probe'))}catch{return false}}),false,'shared items are cleared on sign-out');

 assert.deepEqual(problems,[]);
 console.log('PASS: a revoked session ejects the open tab to the sign-in form (no data left on screen); sign-out clears the legacy ledger copy and shared items from the device; no CSP violations.');
}finally{await browser.close();if(created)await op('delete').catch(()=>{});}
