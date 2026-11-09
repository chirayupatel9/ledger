import { Injectable, HttpException } from '@nestjs/common';
import { pool, transaction } from './database.js';
import { validateLedger } from '../../../packages/domain/ledger-validation.js';
import type { PoolClient } from 'pg';
const shape=(row:any)=>({state:row.state,revision:row.revision,updatedAt:row.updated_at.toISOString()});
// Files are statement originals and receipt photos (on transactions, or waiting in the receipts inbox).
const fileIds=(s:any):string[]=>[...(s?.statements||[]).map((x:any)=>x.fileId),...(s?.transactions||[]).flatMap((t:any)=>(t.receipts||[]).map((r:any)=>r.id)),...(s?.receipts||[]).map((r:any)=>r.fileId)].filter(Boolean);
// How many earlier versions of a ledger are kept for undo. Files you remove are still deleted straight away.
export const keptVersions=30;
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
  return transaction(async client=>{
   const before=await lock(client,owner);
   if(before.revision!==input.revision)return {conflict:true,...shape(before)};
   if(before.state.schemaVersion===2&&!Array.isArray(input.state?.accounts))throw new HttpException('This page uses an older ledger format. Reload the page before saving.',400);
   // Older open tabs and older exports must not silently erase newer account preferences/rules.
   const keep=(key:string)=>input.state?.[key]===undefined?before.state[key]:input.state[key];
   return this.commit(client,owner,before,{...input.state,preferences:keep('preferences'),titleRules:keep('titleRules'),customCategories:keep('customCategories'),categoryOverrides:keep('categoryOverrides'),fundMatches:keep('fundMatches'),receipts:keep('receipts'),recurringDismissed:keep('recurringDismissed'),tagRules:keep('tagRules'),budgets:keep('budgets')},typeof input.action==='string'?input.action.slice(0,100):'Ledger updated');
  });
 }
 // Undo: put back the ledger as it was before a change (the latest, or an earlier one together with everything after
 // it). The restore is a change of its own, so it can be undone too.
 async restore(owner:string,input:any){
  if(!input||!Number.isSafeInteger(input.revision)||!Number.isSafeInteger(input.to))throw new HttpException('Choose a change to undo.',400);
  return transaction(async client=>{
   const before=await lock(client,owner);
   if(before.revision!==input.revision)return {conflict:true,...shape(before)};
   const {rows:[version]}=await client.query('SELECT action,state FROM ledger_versions WHERE owner=$1 AND revision=$2',[owner,input.to]);
   if(!version)throw new HttpException(`That change is no longer in your history. Ledger keeps the last ${keptVersions}.`,404);
   // Undoing an undo is a redo, and undoing a redo is an undo of the original change.
   const latest=input.to===before.revision-1,prior=String(version.action),plain=prior.replace(/^(?:Undo|Redo): /,''),action=!latest?'Restored to before: '+prior:prior.startsWith('Undo: ')?'Redo: '+plain:'Undo: '+plain;
   // A statement original or receipt photo you removed was deleted then; the rest comes back without it.
   const {rows:files}=await client.query('SELECT id FROM files WHERE owner=$1',[owner]),owned=new Set(files.map((f:any)=>f.id)),state=structuredClone(version.state);let missing=0;
   for(const st of state.statements||[])if(st.fileId&&!owned.has(st.fileId)){delete st.fileId;missing++;}
   for(const t of state.transactions||[])if(t.receipts?.length){const kept=t.receipts.filter((r:any)=>owned.has(r.id));missing+=t.receipts.length-kept.length;if(kept.length)t.receipts=kept;else delete t.receipts;}
   if(Array.isArray(state.receipts)){const kept=state.receipts.filter((r:any)=>!r.fileId||owned.has(r.fileId));missing+=state.receipts.length-kept.length;state.receipts=kept;}
   return {...await this.commit(client,owner,before,state,action.slice(0,100)),undid:plain,missingFiles:missing};
  });
 }
 async history(owner:string){
  const {rows:[ledger]}=await pool.query('SELECT revision FROM ledgers WHERE owner=$1',[owner]);
  const {rows}=await pool.query('SELECT revision,action,at FROM ledger_versions WHERE owner=$1 ORDER BY revision DESC LIMIT $2',[owner,keptVersions]);
  return {revision:ledger?.revision??0,changes:rows.map(r=>({before:r.revision,revision:r.revision+1,action:r.action,at:r.at.toISOString()}))};
 }
 private async commit(client:PoolClient,owner:string,before:any,input:any,action:string){
  const state=validateLedger(input);
  const {rows:files}=await client.query('SELECT id FROM files WHERE owner=$1',[owner]);
  const owned=new Set(files.map(f=>f.id));
  if(fileIds(state).some(f=>!owned.has(f)))throw new HttpException('An original file or receipt is missing or belongs to another account.',400);
  const retained=new Set(fileIds(state));
  const removed=new Set<string>(fileIds(before.state).filter((id:string)=>!retained.has(id)));
  const {rows}=await client.query('UPDATE ledgers SET state=$2,revision=revision+1,updated_at=now() WHERE owner=$1 RETURNING *',[owner,JSON.stringify(state)]);
  if(state.initialized&&!state.transactions.length&&!state.statements.length&&!state.rules.length&&!state.receipts.length){
   // Starting over deletes every file and the history with them.
   for(const f of files)removed.add(f.id);await client.query('DELETE FROM ledger_versions WHERE owner=$1',[owner]);
  }else{
   await client.query('INSERT INTO ledger_versions(owner,revision,action,state) VALUES($1,$2,$3,$4) ON CONFLICT (owner,revision) DO UPDATE SET action=excluded.action,at=now(),state=excluded.state',[owner,before.revision,action,JSON.stringify(before.state)]);
   await client.query('DELETE FROM ledger_versions WHERE owner=$1 AND revision NOT IN (SELECT revision FROM ledger_versions WHERE owner=$1 ORDER BY revision DESC LIMIT $2)',[owner,keptVersions]);
  }
  if(removed.size)await client.query('DELETE FROM files WHERE owner=$1 AND id=ANY($2::text[])',[owner,[...removed]]);
  await client.query('INSERT INTO activity(owner,action,detail) VALUES($1,$2,$3)',[owner,action,JSON.stringify({transactions:state.transactions.length,statements:state.statements.length,revision:rows[0].revision})]);
  // Keep the newest 500 changes per account (only the last 50 are ever shown) so the log cannot grow without bound.
  await client.query('DELETE FROM activity WHERE owner=$1 AND id NOT IN (SELECT id FROM activity WHERE owner=$1 ORDER BY id DESC LIMIT 500)',[owner]);
  return {conflict:false,...shape(rows[0]),action};
 }
 async upload(owner:string,id:string,file:Express.Multer.File){
  if(!file||!id||!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new HttpException('Select a statement file.',400);
  if(!file.size)throw new HttpException('The statement file is empty.',400);
  const ext=file.originalname.match(/\.(pdf|csv|tsv|xlsx|xls|jpe?g|png|webp)$/i)?.[1].toLowerCase().replace('jpeg','jpg');
  if(!ext)throw new HttpException('Only PDF, CSV, TSV, XLS, XLSX and photos (JPG, PNG, WebP) are supported.',400);
  const head=file.buffer.subarray(0,12);
  if((ext==='jpg'&&head.subarray(0,3).toString('hex')!=='ffd8ff')||(ext==='png'&&head.subarray(0,4).toString('hex')!=='89504e47')||(ext==='webp'&&(head.subarray(0,4).toString()!=='RIFF'||head.subarray(8,12).toString()!=='WEBP')))throw new HttpException('This file does not appear to be a photo.',400);
  if(ext==='pdf'&&file.buffer.subarray(0,5).toString()!=='%PDF-')throw new HttpException('This file does not appear to be a PDF.',400);
  if(ext==='xlsx'&&file.buffer.subarray(0,4).toString('hex')!=='504b0304')throw new HttpException('This file does not appear to be an XLSX workbook.',400);
  return transaction(async client=>{
   await lock(client,owner); // Serializes quota checks and ledger saves for this owner.
   const prior=await client.query('SELECT id,name,mime,size FROM files WHERE owner=$1 AND id=$2',[owner,id]);if(prior.rowCount)return prior.rows[0];
   const usage=await client.query('SELECT count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM files WHERE owner=$1',[owner]);
   if(usage.rows[0].count>=2000||Number(usage.rows[0].bytes)+file.size>1024**3)throw new HttpException('Account storage limit reached (1 GiB / 2,000 files).',413);
   const name=file.originalname.replace(/[\r\n\x00-\x1f]/g,'').slice(0,255),mime=({pdf:'application/pdf',csv:'text/csv',tsv:'text/tab-separated-values',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',jpg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[ext];
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
