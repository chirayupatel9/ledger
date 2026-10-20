import test from 'node:test';
import assert from 'node:assert/strict';
import {readPDF} from '../apps/web/public/pdf.js';
import {matchFundRows} from '../apps/web/public/cas.js';
import {guessMapping,mapRows} from '../packages/domain/core.js';
import {summarizeInvestments} from '../packages/domain/investments.js';
import {transactionLabel} from '../packages/domain/transaction-labels.js';
import {taxTagFor} from '../packages/domain/tax.js';
import {readSpreadsheet} from '../apps/web/public/spreadsheet.js';
import {makePDF} from './fixtures/card-statements.mjs';
import {casPages,casRuns,casPassword} from './fixtures/cas-statement.mjs';
import {fundReport} from './fixtures/fund-report.mjs';
const parse=(pages,password)=>readPDF(new Uint8Array(makePDF(pages,{password})),password,'Mutual funds',[]);
const shape=r=>r.transactions.map(t=>[t.date,t.amount,t.category,t.type,t.description]);
const edit=(pages,from,to)=>pages.map(items=>items.map(i=>i[2]===from?[i[0],i[1],to,...i.slice(3)]:i));

test('a CAS PDF becomes fund report rows: stamp duty in the purchase and as its own charge, redemptions net of STT',async()=>{
 const r=await parse(casPages);
 assert.equal(r.layout,'cas');assert.equal(r.cardLike,false);assert.equal(r.issuer,'CAMS');assert.deepEqual(r.invalid,[]);
 assert.deepEqual(r.period,{from:'2026-05-01',to:'2026-10-20'});
 assert.equal(r.transactions.length,22);
 assert.deepEqual(shape(r).slice(0,2),[
  ['2026-05-10',2500000,'Investments','Transfer','SIP Purchase · Alpha Flexi Cap Fund - Regular Growth · ISIN INF000A01AA1 · Folio 111/01 · 13.512 units @ ₹1850.10'],
  ['2026-05-10',-125,'Taxes','Expense','Stamp duty · Alpha Flexi Cap Fund - Regular Growth · ISIN INF000A01AA1 · Folio 111/01']]);
 const find=re=>shape(r).find(t=>re.test(t[4]));
 assert.deepEqual(find(/^Purchase · Alpha/),['2026-09-21',20000000,'Investments','Transfer','Purchase · Alpha Flexi Cap Fund - Regular Growth · ISIN INF000A01AA1 · Folio 111/01 · 98.110 units @ ₹2038.43']);
 assert.deepEqual(find(/^Switch In/),['2026-08-10',5000000,'Investments','Transfer','Switch In · Beta Mid Cap Fund - Regular Growth · ISIN INF000B01BB2 · Folio 222/02 · 106.355 units @ ₹470.10'],'a wrapped scheme name is joined');
 assert.deepEqual(find(/^Switch Out/),['2026-08-10',-5000000,'Investments','Transfer','Switch Out · Beta Liquid Fund - Regular Growth · ISIN INF000B01CC3 · Folio 222/02 · 18.000 units @ ₹2777.7778']);
 assert.deepEqual(find(/^Redemption/),['2026-09-30',-2999970,'Investments','Transfer','Redemption · Beta Mid Cap Fund - Regular Growth · ISIN INF000B01BB2 · Folio 222/02 · 61.200 units @ ₹490.20']);
 assert.deepEqual(find(/^STT/),['2026-09-30',-30,'Taxes','Expense','STT · Beta Mid Cap Fund - Regular Growth · ISIN INF000B01BB2 · Folio 222/02']);
 assert.deepEqual(find(/^Dividend Reinvestment/),['2026-08-20',13863,'Investments','Transfer','Dividend Reinvestment · Gamma Large and Mid Cap Fund - Direct Plan - IDCW · ISIN INF000G01DD4 · Folio 333/03 · 1.261 units @ ₹109.94']);
 assert.equal(r.transactions.filter(t=>/Address/i.test(t.description)).length,0,'notes are not transactions');
 assert.ok(r.transactions.every(t=>t.account==='Mutual funds'&&t.review===(t.category==='Investments')));
 assert.equal(transactionLabel(r.transactions[0]).title,'Alpha Flexi Cap Fund · SIP Purchase');assert.equal(transactionLabel(r.transactions.find(t=>/^STT/.test(t.description))).title,'Beta Mid Cap Fund · STT');
 assert.equal(taxTagFor(r.transactions.find(t=>/^STT/.test(t.description))),null,'STT is not income tax');
 assert.match(r.warnings.join(' '),/4 schemes in 3 folios/);
});
test('each scheme’s units, read back from the rows, are checked against its closing unit balance',async()=>{
 const r=await parse(casPages);
 assert.deepEqual(r.cas.map(s=>[s.scheme,s.folio,s.opening,s.units,s.closing,s.ok,s.breaks]),[
  ['Alpha Flexi Cap Fund - Regular Growth','111/01',0,1633220,1633220,true,0],['Beta Mid Cap Fund - Regular Growth','222/02',0,997370,997370,true,0],
  ['Beta Liquid Fund - Regular Growth','222/02',200000,20000,20000,true,0],['Gamma Large and Mid Cap Fund - Direct Plan - IDCW','333/03',0,936780,936780,true,0]]);
 // A row lost in extraction breaks the running balance and the closing check.
 const missing=await parse(casPages.map(items=>items.filter(i=>i[1]!==500)));
 assert.deepEqual(missing.cas.map(s=>s.ok),[false,true,true,true]);assert.equal(missing.cas[0].units,1633220-132930);assert.equal(missing.cas[0].breaks,1);
 const misread=await parse(edit(casPages,'Closing Unit Balance: 99.737','Closing Unit Balance: 99.000'));assert.equal(misread.cas[1].ok,false);
 assert.deepEqual(r.cas.map(s=>s.isin),['INF000A01AA1','INF000B01BB2','INF000B01CC3','INF000G01DD4']);
 // An ISIN printed on the line after its label is still found.
 const split=structuredClone(casPages),at=split[2].findIndex(i=>i[2].startsWith('G7LMD-'));
 split[2].splice(at,1,[40,612,'G7LMD-Gamma Large and Mid Cap Fund - Direct Plan - IDCW - ISIN:'],[40,606,'INF000G01DD4(Advisor: DIRECT) Registrar : CAMS']);
 assert.deepEqual(shape(await parse(split)),shape(r));
});
test('the same CAS as single text runs, or password-protected, reads identically',async()=>{
 const plain=shape(await parse(casPages));
 assert.deepEqual(shape(await parse(casRuns)),plain);
 assert.deepEqual(shape(await parse(casPages,casPassword)),plain);
 await assert.rejects(readPDF(new Uint8Array(makePDF(casPages,{password:casPassword})),'wrong','Mutual funds',[]),e=>e.name==='PasswordException');
});
test('direction follows the units: unbracketed redemptions and purchase reversals',async()=>{
 let pages=edit(edit(casPages,'(30,000.00)','30,000.00'),'(61.200)','61.200');
 assert.deepEqual(shape(await parse(pages)).find(t=>/^Redemption/.test(t[4])).slice(0,2),['2026-09-30',-2999970]);
 pages=structuredClone(casPages);const at=pages[2].findIndex(i=>i[2]==='15-Jul-2026');
 pages[2].splice(at,2,[40,562,'15-Jul-2026'],[96,562,'*** Purchase Reversal ***'],[300,562,'(9,999.50)'],[360,562,'(92.417)'],[425,562,'108.20'],[495,562,'0.000']);
 pages[2]=edit(edit([pages[2]],'93.678','1.261'),'Closing Unit Balance: 93.678','Closing Unit Balance: 1.261')[0];
 const r=await parse(pages),rev=r.transactions.find(t=>/reversal/i.test(t.description));
 assert.equal(rev.description,'Purchase reversal · Gamma Large and Mid Cap Fund - Direct Plan - IDCW · ISIN INF000G01DD4 · Folio 333/03 · 92.417 units @ ₹108.20');assert.equal(rev.amount,-999950);
 assert.equal(r.cas[3].ok,true);assert.equal(transactionLabel(rev).title,'Reversal · Gamma Large and Mid Cap Fund · Purchase');
});
test('payouts and unreadable rows are reported, not guessed',async()=>{
 const pages=structuredClone(casPages);
 pages[2].push([40,544,'25-Sep-2026'],[96,544,'IDCW Paid @ Rs. 2.00 per unit'],[300,544,'187.36'],[40,538,'26-Sep-2026'],[96,538,'Load reversal'],[300,538,'5.00']);
 pages[0].push([40,452,'11-Jul-2026'],[96,452,'Bonus'],[360,452,'2.000'],[495,452,'41.832']);
 const r=await parse(pages);
 assert.deepEqual(r.invalid,['page 1, line 26']);
 assert.match(r.warnings.join(' '),/1 IDCW \(dividend\) payout was left out/);assert.match(r.warnings.join(' '),/1 row with an amount but no units was left out/);
 assert.equal(r.transactions.length,22);
});
test('CAS rows feed the Investments page: full units, SIPs, and units carried in flagged as incomplete',async()=>{
 const {transactions}=await parse(casPages);
 const state={accounts:[{id:'mf',name:'Mutual funds',type:'Investment'}],statements:[{id:'s',accountId:'mf',from:'2026-05-01',to:'2026-10-20'}],transactions:transactions.map(t=>({...t,accountId:'mf'}))};
 const s=summarizeInvestments(state,{today:'2026-10-20'}),fund=name=>s.funds.find(f=>f.scheme.startsWith(name));
 assert.deepEqual(['Alpha','Beta Mid','Beta Liquid','Gamma'].map(n=>[fund(n).units,fund(n).incomplete]),[[1633220,false],[997370,false],[-180000,true],[936780,false]]);
 assert.equal(fund('Alpha').paid,32500000);assert.equal(fund('Alpha').stamp,1625);assert.equal(fund('Beta Mid').redeemed,2999970);
 assert.equal(fund('Alpha').value,Math.round(1633220*2038.43/100));
 assert.deepEqual(s.sips.map(x=>[x.name,x.count,x.amount]),[['Alpha Flexi Cap Fund - Regular Growth',5,2500000],['Beta Mid Cap Fund - Regular Growth',1,2500000]]);
});
test('rows already imported from a fund report are duplicates, and the CAS takes the report’s scheme names',async()=>{
 const data=await readSpreadsheet(fundReport()),report=mapRows(data,guessMapping(data.headers),'Mutual funds',[],{investment:true}).transactions.map(t=>({...t,accountId:'mf'}));
 const cas=(await parse(casPages)).transactions.map(t=>({...t,accountId:'mf'})),matched=matchFundRows(report,cas);
 assert.deepEqual(matched.filter(t=>t.duplicate).map(t=>[t.date,t.amount]),[['2026-07-10',2500000],['2026-07-10',-125],['2026-09-21',20000000],['2026-09-21',-1000],['2026-07-10',2500000],['2026-07-10',-125],['2026-09-30',-2999970]]);
 assert.equal(matched[0].description,'SIP Purchase · Alpha Flexi Cap Fund - Regular Plan - Growth · ISIN INF000A01AA1 · Folio 111/01 · 13.512 units @ ₹1850.10');
 assert.equal(matched[1].description,'Stamp duty · Alpha Flexi Cap Fund - Regular Plan - Growth · ISIN INF000A01AA1 · Folio 111/01');
 assert.ok(matched.find(t=>/^Switch Out/.test(t.description)).description.includes('Beta Liquid Fund - Regular Growth'),'schemes the report does not have keep their CAS names');
 assert.deepEqual(matchFundRows(report.map(t=>({...t,accountId:'other'})),cas).filter(t=>t.duplicate),[],'another account is not a duplicate');
 // Together: one fund per scheme, with the CAS filling in the months the report does not cover.
 const kept=[...report,...matched.filter(t=>!t.duplicate)],s=summarizeInvestments({accounts:[{id:'mf',name:'Mutual funds',type:'Investment'}],statements:[],transactions:kept},{today:'2026-10-20'});
 const alpha=s.funds.filter(f=>/^Alpha/.test(f.scheme));assert.equal(alpha.length,1);assert.equal(alpha[0].units,1633220);
 assert.equal(s.funds.find(f=>/^Beta Mid/.test(f.scheme)).units,997370);
});
