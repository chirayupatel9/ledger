import { pool } from './database.js';
import { parseNavFile, indexSchemes, navsForLedger, searchSchemes, nextNavUpdate } from '../../../packages/domain/navs.js';
// Official NAVs from AMFI, downloaded on a schedule (nextNavUpdate) and at startup when the last update is over 20 hours old.
// A failed download is retried with backoff (1 minute doubling to an hour) and never holds up or stops the API.
// The browser cannot fetch AMFI itself (connect-src 'self'), so the Investments page asks /api/navs for its own schemes.
const source=process.env.AMFI_NAV_URL||'https://www.amfiindia.com/spages/NAVAll.txt';
type Index=ReturnType<typeof indexSchemes>;
let cached:{index:Index;updatedAt:string|null;at:number}|null=null,loading:Promise<{index:Index;updatedAt:string|null;at:number}>|null=null,generation=0;
export async function updateNavs(){
 const response=await fetch(source,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'Ledger self-hosted bookkeeping'}});
 if(!response.ok)throw Object.assign(new Error('AMFI NAV download failed'),{status:response.status});
 if(Number(response.headers.get('content-length'))>50*1024*1024)throw new Error('AMFI NAV file is too large');
 const {schemes}=parseNavFile(await response.text());if(!schemes.length)throw new Error('AMFI NAV file has no schemes');
 const col=(pick:(s:any)=>unknown)=>schemes.map(pick);
 await pool.query(`INSERT INTO fund_navs(code,isins,name,plan,option,amc,category,nav,nav_date,updated_at)
  SELECT code,coalesce(string_to_array(nullif(isins,''),' '),'{}'),name,plan,option,amc,category,nav,nav_date,now() FROM unnest($1::int[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::numeric[],$9::date[]) AS u(code,isins,name,plan,option,amc,category,nav,nav_date)
  ON CONFLICT(code) DO UPDATE SET isins=EXCLUDED.isins,name=EXCLUDED.name,plan=EXCLUDED.plan,option=EXCLUDED.option,amc=EXCLUDED.amc,category=EXCLUDED.category,nav=EXCLUDED.nav,nav_date=EXCLUDED.nav_date,updated_at=now()
  WHERE EXCLUDED.nav_date>=fund_navs.nav_date`,
  [col(s=>s.code),col(s=>s.isins.join(' ')),col(s=>s.name),col(s=>s.plan),col(s=>s.option),col(s=>s.amc),col(s=>s.category),col(s=>String(s.nav)),col(s=>s.date)]);
 generation++;cached=null;loading=null;return schemes.length;
}
// Every scheme, indexed for matching (about 14,000 rows), reloaded after an update or an hour. A load that started before
// an update is not kept.
async function schemes(){
 if(cached&&Date.now()-cached.at<3600000)return cached;
 const started=generation;
 loading??=pool.query('SELECT code,isins,name,plan,option,amc,category,nav::float8 AS nav,nav_date::text AS date,updated_at FROM fund_navs').then(({rows})=>{
  const updatedAt=rows.reduce((v:Date|null,r:any)=>!v||r.updated_at>v?r.updated_at:v,null),loaded={index:indexSchemes(rows.map(({updated_at,...s}:any)=>s)),updatedAt:updatedAt?.toISOString()||null,at:Date.now()};
  if(started===generation)cached=loaded;return loaded;
 }).finally(()=>{if(started===generation)loading=null;});
 return loading;
}
export async function ledgerNavs(state:any){const {index,updatedAt}=await schemes();return {updatedAt,available:index.list.length>0,schemes:navsForLedger(state,index)};}
export async function findSchemes(query:string){return searchSchemes(query,(await schemes()).index);}
export function startNavUpdates(){
 let timer:NodeJS.Timeout|undefined,attempt=0;
 const later=(ms:number)=>{clearTimeout(timer);timer=setTimeout(run,ms);timer.unref();};
 async function run(){
  try{const n=await updateNavs();attempt=0;console.log(`Fund NAVs updated from AMFI (${n} schemes)`);later(nextNavUpdate().getTime()-Date.now());}
  catch(error:any){const wait=Math.min(3600000,60000*2**attempt++);console.error('Fund NAV update failed; will retry',{type:error?.name,status:error?.status,code:error?.cause?.code||error?.code,minutes:wait/60000});later(wait);}
 }
 pool.query('SELECT max(updated_at) AS at FROM fund_navs').then(({rows})=>later(!rows[0].at||Date.now()-rows[0].at.getTime()>20*3600000?5000:nextNavUpdate().getTime()-Date.now())).catch(()=>later(60000));
 return ()=>clearTimeout(timer);
}
