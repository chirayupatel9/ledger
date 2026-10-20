import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {renderEmail,verificationEmail,resetPasswordEmail,invitationEmail} from '../packages/domain/emails.js';
import {istDate,fmtDate,fmtDateTime} from '../apps/web/public/format.js';

const origin='https://ledger.example.com';

test('emails carry a branded HTML version and a plain-text one with the link',()=>{
 const url=origin+'/api/auth/verify-email?token=abc&callbackURL=%2Flogin';
 const m=verificationEmail({url,origin});
 assert.equal(m.subject,'Verify your Ledger email');
 assert.match(m.html,/^<!doctype html>/);assert.match(m.html,/ledger<span style="color:#c5df9d">\.<\/span>/);
 assert.ok(m.html.includes(`href="${url.replace(/&/g,'&amp;')}"`),'the button link is escaped for HTML');
 assert.equal(m.text.match(/https:\/\/\S+/)[0],url,'the first link in the text version is the action link');
 assert.match(m.text,/^Verify your email address$/m);assert.match(m.text,/works for 1 hour/);
 const reset=resetPasswordEmail({url:origin+'/reset?token=x',email:'asha@example.com',origin});
 assert.equal(reset.subject,'Reset your Ledger password');assert.match(reset.html,/<strong[^>]*>asha@example\.com<\/strong>/);assert.match(reset.text,/password for asha@example\.com\./);
});

test('invitations name the inviter and the invited address, escaped',()=>{
 const m=invitationEmail({url:origin+'/signup?email=asha%40example.com',email:'asha@example.com',inviter:'Ravi <b>K</b>',google:true,origin});
 assert.equal(m.subject,'Ravi <b>K</b> invited you to Ledger');
 assert.ok(m.html.includes('Ravi &lt;b&gt;K&lt;/b&gt;')&&!m.html.includes('<b>K</b>'),'names never become markup');
 assert.match(m.text,/continue with Google/);assert.match(m.text,/^Create your account:\nhttps:\/\/ledger\.example\.com\/signup\?email=asha%40example\.com$/m);
 const plain=invitationEmail({url:origin+'/signup',email:'asha@example.com',inviter:'',origin});
 assert.equal(plain.subject,'Someone invited you to Ledger');assert.match(plain.text,/only works for this address/);
 assert.doesNotMatch(renderEmail({heading:'Hi'}).html,/undefined/);
});

test('Ledger dates follow Indian Standard Time whatever the device time zone',()=>{
 assert.equal(istDate('2026-03-31T18:29:59Z'),'2026-03-31');assert.equal(istDate('2026-03-31T18:30:00Z'),'2026-04-01','05:30 ahead of UTC');
 assert.equal(istDate(new Date('2026-10-20T20:00:00Z')),'2026-10-21');
 assert.match(fmtDateTime('2026-10-20T20:00:00Z'),/21 Oct 2026.*1:30\s?am/i);
 // Run in a far-west time zone: calendar dates must not slip a day.
 const out=execFileSync(process.execPath,['--input-type=module','-e',`import {fmtDate,istDate} from './apps/web/public/format.js';console.log(fmtDate('2026-04-01'),'|',istDate('2026-10-20T20:00:00Z'))`],{env:{...process.env,TZ:'America/Los_Angeles'},cwd:new URL('..',import.meta.url)}).toString().trim();
 assert.equal(out,'01 Apr 2026 | 2026-10-21');assert.equal(fmtDate('2026-04-01'),'01 Apr 2026');
});

test('the loading screen is self-styled, escapes its message and offers a reload when slow',async()=>{
 const {loadingHTML}=await import('../apps/web/public/loading.js');
 const html=loadingHTML('<b>Checking</b>');
 assert.match(html,/^<div class="ls" role="status" aria-live="polite"><script>try\{var t=localStorage\.getItem\('ledger\.theme'\)/);assert.match(html,/<style>[^<]*:root\[data-theme=dark\] \.ls\{/);assert.ok(html.includes('&lt;b&gt;Checking&lt;/b&gt;'));
 assert.match(html,/<a href="">reload the page<\/a>/);assert.match(html,/prefers-reduced-motion/);assert.match(loadingHTML(),/Opening your ledger…/);
});
