import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LEDGER_URL||'http://localhost:5800',email=`browser-${randomUUID()}@example.test`,password='Browser test '+randomUUID();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base+'/signup');
 await page.getByLabel('Full name').fill('Browser QA');
 await page.getByLabel('Email address').fill(email);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByLabel('Confirm password').fill(password);
 await page.getByRole('button',{name:'Create account'}).click();
 await page.getByRole('heading',{name:'Check your inbox'}).waitFor();
 let link;
 for(let i=0;i<30;i++){
  const data=await(await fetch('http://localhost:5801/api/v1/search?query='+encodeURIComponent('to:'+email))).json();
  if(data.messages?.[0]){const message=await(await fetch('http://localhost:5801/api/v1/message/'+data.messages[0].ID)).json();link=message.Text.match(/https?:\/\/[^\s]+/)?.[0];break;}
  await sleep(1000);
 }
 assert.ok(link,'Verification email must arrive');await page.goto(link);
 await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:false}).click();
 await page.locator('[data-action="upload"]').first().waitFor();
 await page.locator('[data-action="upload"]').first().click();
 await page.getByLabel('Account name',{exact:true}).fill('HDFC QA');
 await page.locator('#bank-form button[type="submit"]').click();
 await page.locator('#file-input').waitFor({state:'attached'});
 await page.locator('#file-input').setInputFiles({name:'statement.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Debit,Credit\n01/10/2026,Salary,,100000\n02/10/2026,Swiggy,500,\n')});
 await page.locator('#map-next').click();await page.locator('#commit-import').click();
 await page.waitForFunction(()=>!document.querySelector('#modal').open);
 const data=await page.evaluate(async()=>await(await fetch('/api/ledger')).json());
 assert.equal(data.state.transactions.length,2);assert.equal(data.state.statements.length,1);
 await page.reload();await page.locator('[data-action="upload"]').first().waitFor();
 const persisted=await page.evaluate(async()=>await(await fetch('/api/ledger')).json());assert.equal(persisted.state.transactions.length,2);
 mkdirSync('playwright-results',{recursive:true});await page.screenshot({path:'playwright-results/dashboard.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'playwright-results/mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile dashboard must fit viewport');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-action="settings"]').click();await page.locator('#signout').click();
 await page.waitForURL('**/login');
 await page.goto(base+'/');await page.waitForURL('**/login');
 await page.screenshot({path:'playwright-results/login.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: browser signup, SMTP verification, login, CSV preview/import, persisted reload, mobile layout and logout; no JavaScript errors.');
}finally{await browser.close();}
