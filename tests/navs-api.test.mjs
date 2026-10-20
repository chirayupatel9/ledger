import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {navFile} from './fixtures/amfi-navs.mjs';

// The API's NAV job against a stubbed AMFI source (a local server) with the database calls captured.
let reply={status:200,body:navFile};
const source=http.createServer((req,res)=>{res.writeHead(reply.status,{'Content-Type':'text/plain'});res.end(reply.body);});
await new Promise(r=>source.listen(0,'127.0.0.1',r));
Object.assign(process.env,{APP_ORIGIN:'http://localhost:5800',AUTH_SECRET:'x'.repeat(40),DATABASE_URL:'postgresql://nobody@127.0.0.1:1/none',SMTP_HOST:'localhost',MAIL_FROM:'ledger@example.test',MAIL_DELIVERY_ENABLED:'false',AMFI_NAV_URL:`http://127.0.0.1:${source.address().port}/NAVAll.txt`});
const {pool}=await import('../apps/api/dist/apps/api/src/database.js');
const {updateNavs,ledgerNavs,findSchemes}=await import('../apps/api/dist/apps/api/src/navs.js');
let table=[],queries=[];
pool.query=async(sql,params)=>{queries.push(sql);
 if(/^INSERT INTO fund_navs/.test(sql)){const [codes,isins,names,plans,options,amcs,categories,navs,dates]=params;table=codes.map((code,i)=>({code,isins:isins[i]?isins[i].split(' '):[],name:names[i],plan:plans[i],option:options[i],amc:amcs[i],category:categories[i],nav:+navs[i],date:dates[i],updated_at:new Date()}));return {rows:[],rowCount:table.length};}
 if(/^SELECT code,isins/.test(sql))return {rows:table};
 throw Error('unexpected query');};
test.after(()=>source.close());

test('the NAV job downloads, parses and stores the latest NAV per scheme, then answers for a ledger',async()=>{
 assert.equal(await updateNavs(),24);
 const insert=queries.find(q=>q.startsWith('INSERT'));assert.match(insert,/ON CONFLICT\(code\) DO UPDATE[\s\S]*WHERE EXCLUDED\.nav_date>=fund_navs\.nav_date/,'an older NAV never replaces a newer one');
 assert.deepEqual(table.find(s=>s.code===118954),{code:118954,isins:['INF179K01VL5','INF179K01VM3'],name:'HDFC Flexi Cap Fund',plan:'Direct Plan',option:'IDCW Option',amc:'HDFC Mutual Fund',category:'Equity Scheme - Flexi Cap Fund',nav:87.425,date:'2026-10-19',updated_at:table.find(s=>s.code===118954).updated_at});
 const state={accounts:[{id:'i',type:'Investment'}],transactions:[{accountId:'i',category:'Investments',date:'2026-10-01',amount:100000,description:'Purchase · Parag Parikh Flexi Cap Fund - Direct Plan - Growth · Folio 1 · 1.0 units @ ₹90'}],fundMatches:[]};
 const r=await ledgerNavs(state);assert.equal(r.available,true);assert.match(r.updatedAt,/^\d{4}-\d{2}-\d{2}T/);
 assert.deepEqual(r.schemes.map(x=>[x.scheme,x.match?.code,x.source]),[['Parag Parikh Flexi Cap Fund - Direct Plan - Growth',122639,'name']]);
 assert.deepEqual((await findSchemes('hdfc flexi direct idcw')).map(s=>s.code),[118954]);
});

test('a failed or empty download is an error (retried by the scheduler) and leaves stored NAVs alone',async()=>{
 const before=table;
 reply={status:503,body:'Service unavailable'};await assert.rejects(updateNavs(),e=>e.status===503);
 reply={status:200,body:'<html>Maintenance</html>'};await assert.rejects(updateNavs(),/no schemes/);
 assert.equal(table,before);reply={status:200,body:navFile};
});
