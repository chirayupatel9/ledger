import test from 'node:test';
import assert from 'node:assert/strict';
import {detectRecurring} from '../packages/domain/recurring.js';
let n=0;const t=(date,description,amount,accountId='hdfc')=>({id:'t'+(++n),date,description,amount,accountId,account:accountId.toUpperCase(),type:amount<0?'Expense':'Income',category:'Uncategorized'});
const find=(list,payee)=>list.find(s=>s.payee.toLowerCase().startsWith(payee.toLowerCase()));

test('monthly subscription with day drift is active, with next date and monthly cost',()=>{
 const s=find(detectRecurring(['2026-01-05','2026-02-04','2026-03-06','2026-04-05','2026-05-05'].map(d=>t(d,'NETFLIX.COM',-64900)).concat(t('2026-05-20','UPI-SWIGGY',-30000))),'Netflix');
 assert.deepEqual([s.cadence,s.count,s.typical,s.monthly,s.next,s.status,s.varies],['monthly',5,64900,64900,'2026-06-05','active',false]);
});
test('a payment that should have appeared inside the imported period is missing',()=>{
 const tx=['2026-01-05','2026-02-05','2026-03-05','2026-04-05'].map(d=>t(d,'SPOTIFY INDIA',-11900)).concat(t('2026-07-20','UPI-SWIGGY',-30000));
 assert.equal(find(detectRecurring(tx),'Spotify').status,'missing');
 assert.equal(find(detectRecurring(tx.filter(x=>x.date<'2026-05-01')),'Spotify').status,'active','no later statements, so not missing');
});
test('varying bills, salary, weekly, yearly premiums, and one skipped month are recognised',()=>{
 const list=detectRecurring([
  ...['2026-01-12','2026-02-11','2026-03-12','2026-04-13'].map((d,i)=>t(d,'BIL/ONL/000/TATA POWER',-[180000,240000,310000,150000][i])),
  ...['2026-01-31','2026-02-28','2026-03-31','2026-04-30'].map(d=>t(d,'SALARY ACME TECHNOLOGIES',15000000)),
  ...['2026-03-01','2026-03-08','2026-03-15','2026-03-22','2026-03-29'].map(d=>t(d,'MILK SUBSCRIPTION COUNTRY DELIGHT',-42000)),
  ...['2025-03-10','2026-03-12'].map(d=>t(d,'NACH-DR-STAR HEALTH INSURANCE',-2400000,'sbi')),
  ...['2026-01-10','2026-02-10','2026-04-10','2026-05-10'].map(d=>t(d,'YOUTUBE PREMIUM GOOGLE',-12900)),
 ]),by=p=>list.find(s=>s.payee.toLowerCase().includes(p));
 assert.deepEqual([by('tata').cadence,by('tata').varies],['monthly',true]);
 assert.deepEqual([by('salary').cadence,by('salary').direction],['monthly','in']);
 assert.equal(by('milk').cadence,'weekly');assert.equal(by('milk').monthly,Math.round(42000*30.44/7));
 assert.deepEqual([by('star').cadence,by('star').next],['yearly','2027-03-12']);
 assert.deepEqual([by('youtube').cadence,by('youtube').skipped],['monthly',1]);
 assert.equal(by('salary').next,'2026-05-30','month-end dates stay inside short months');
});
test('frequent orders, same-day repeats and generic channels at different amounts are not series',()=>{
 const orders=['2026-03-01','2026-03-03','2026-03-04','2026-03-09','2026-03-15','2026-03-16','2026-03-22','2026-03-30','2026-04-02','2026-04-11'].map(d=>t(d,'SWIGGY BANGALORE',-45000));
 const sameDay=['2026-03-01','2026-03-01','2026-03-01'].map(d=>t(d,'ZOMATO',-30000));
 const upi=['2026-01-05','2026-02-05','2026-03-05'].map((d,i)=>t(d,'UPI/DR/12345678901'+i+'/X/'+['A','B','C'][i],-[50000,70000,90000][i]));
 assert.deepEqual(detectRecurring([...orders,...sameDay,...upi]),[]);
 const rent=['2026-01-01','2026-02-01','2026-03-02'].map((d,i)=>t(d,'UPI/DR/99887766554'+i+'/LANDLORD/HDFC',-2500000));
 assert.equal(detectRecurring(rent).length,1,'same amount on a generic channel monthly is rent-like');
});
test('an expected payment between statements is uncovered, not missing',()=>{
 const tx=['2026-01-05','2026-02-05','2026-03-05'].map(d=>({...t(d,'SPOTIFY INDIA',-11900),statementId:'q1'})).concat({...t('2026-05-20','UPI-SWIGGY',-30000),statementId:'may'});
 const statements=[{id:'q1',accountId:'hdfc',from:'2026-01-01',to:'2026-03-31'},{id:'may',accountId:'hdfc',from:'2026-05-01',to:'2026-05-31'}];
 assert.equal(find(detectRecurring(tx,statements),'Spotify').status,'uncovered','April has no statement');
 statements.push({id:'apr',accountId:'hdfc',from:'2026-04-01',to:'2026-04-30'});assert.equal(find(detectRecurring(tx,statements),'Spotify').status,'missing');
});
