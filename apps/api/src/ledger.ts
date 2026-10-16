import { Injectable, HttpException } from '@nestjs/common';
import { pool, transaction } from './database.js';
import { validateLedger } from '../../../packages/domain/ledger-validation.js';
import type { PoolClient } from 'pg';
const shape=(row:any)=>({state:row.state,revision:row.revision,updatedAt:row.updated_at.toISOString()});
async function lock(client:PoolClient,owner:string){
 await client.query('INSERT INTO ledgers(owner) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
 const {rows}=await client.query('SELECT * FROM ledgers WHERE owner=$1 FOR UPDATE',[owner]);return rows[0];
}
@Injectable()
export class LedgerService{
 async load(owner:string){
  await pool.query('INSERT INTO ledgers(owner) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
  const {rows}=await pool.query('SELECT * FROM ledgers WHERE owner=$1',[owner]);return shape(rows[0]);
 }
 async save(owner:string,input:any){
  if(!input||!Number.isSafeInteger(input.revision)||input.revision<0)throw new HttpException('Missing ledger revision. Refresh and retry.',400);
  let state:ReturnType<typeof validateLedger>;
  return transaction(async client=>{
   const before=await lock(client,owner);
   if(before.revision!==input.revision)return {conflict:true,...shape(before)};
   if(before.state.schemaVersion===2&&!Array.isArray(input.state?.accounts))throw new HttpException('This page uses an older ledger format. Reload the page before saving.',400);
   state=validateLedger(input.state);
   const {rows:files}=await client.query('SELECT id FROM files WHERE owner=$1',[owner]);
   const owned=new Set(files.map(f=>f.id));
   if(state.statements.some(s=>s.fileId&&!owned.has(s.fileId)))throw new HttpException('An original file is missing or belongs to another account.',400);
   const retained=new Set(state.statements.map(s=>s.fileId).filter(Boolean));
   const removed=new Set<string>(before.state.statements.map((s:any)=>s.fileId).filter((id:string)=>id&&!retained.has(id)));
   if(state.initialized&&!state.transactions.length&&!state.statements.length&&!state.rules.length)for(const f of files)removed.add(f.id);
   const {rows}=await client.query('UPDATE ledgers SET state=$2,revision=revision+1,updated_at=now() WHERE owner=$1 RETURNING *',[owner,JSON.stringify(state)]);
   if(removed.size)await client.query('DELETE FROM files WHERE owner=$1 AND id=ANY($2::text[])',[owner,[...removed]]);
   await client.query('INSERT INTO activity(owner,action,detail) VALUES($1,$2,$3)',[owner,typeof input.action==='string'?input.action.slice(0,100):'Ledger updated',JSON.stringify({transactions:state.transactions.length,statements:state.statements.length,revision:rows[0].revision})]);
   return {conflict:false,...shape(rows[0])};
  });
 }
 async upload(owner:string,id:string,file:Express.Multer.File){
  if(!file||!id||!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new HttpException('Select a statement file.',400);
  if(!file.size)throw new HttpException('The statement file is empty.',400);
  const ext=file.originalname.match(/\.(pdf|csv|tsv|xlsx|xls)$/i)?.[1].toLowerCase();
  if(!ext)throw new HttpException('Only PDF, CSV, TSV, XLS, and XLSX files are supported.',400);
  if(ext==='pdf'&&file.buffer.subarray(0,5).toString()!=='%PDF-')throw new HttpException('This file does not appear to be a PDF.',400);
  if(ext==='xlsx'&&file.buffer.subarray(0,4).toString('hex')!=='504b0304')throw new HttpException('This file does not appear to be an XLSX workbook.',400);
  return transaction(async client=>{
   await lock(client,owner); // Serializes quota checks and ledger saves for this owner.
   const prior=await client.query('SELECT id,name,mime,size FROM files WHERE owner=$1 AND id=$2',[owner,id]);if(prior.rowCount)return prior.rows[0];
   const usage=await client.query('SELECT count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM files WHERE owner=$1',[owner]);
   if(usage.rows[0].count>=2000||Number(usage.rows[0].bytes)+file.size>1024**3)throw new HttpException('Account storage limit reached (1 GiB / 2,000 files).',413);
   const name=file.originalname.replace(/[\r\n\x00-\x1f]/g,'').slice(0,255),mime=({pdf:'application/pdf',csv:'text/csv',tsv:'text/tab-separated-values',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel'} as Record<string,string>)[ext];
   await client.query('INSERT INTO files(owner,id,name,mime,size,data) VALUES($1,$2,$3,$4,$5,$6)',[owner,id,name,mime,file.size,file.buffer]);
   return {id,name,mime,size:file.size};
  });
 }
 async download(owner:string,id:string){
  const {rows}=await pool.query('SELECT name,mime,data FROM files WHERE owner=$1 AND id=$2',[owner,id]);
  if(!rows[0])throw new HttpException('Statement not found.',404);return rows[0];
 }
 async activity(owner:string){const {rows}=await pool.query('SELECT id,at,action,detail::text FROM activity WHERE owner=$1 ORDER BY at DESC,id DESC LIMIT 50',[owner]);return {events:rows};}
}
