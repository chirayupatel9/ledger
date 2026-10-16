import {upgradeAccounts,accountKey,accountTypes} from './accounts.js';
import {categories,parseDate} from './core.js';
import {taxTagIds} from './tax.js';
export type LedgerState={schemaVersion:number;accounts:any[];transactions:any[];statements:any[];rules:any[];initialized:boolean};
export class InputError extends Error{status=400}
const fail=(m:string):never=>{throw new InputError(m)};
const string=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(v);
const paise=(v:unknown)=>v===undefined||(Number.isSafeInteger(v)&&Math.abs(v as number)<=1e14);
const day=(v:unknown)=>v===undefined||(typeof v==='string'&&parseDate(v)===v);
export function validateLedger(input:any):LedgerState{
 if(!input||!Array.isArray(input.transactions)||!Array.isArray(input.statements)||!Array.isArray(input.rules))fail('Invalid ledger data.');
 if(input.transactions.length>25000||input.statements.length>2000||input.rules.length>500)fail('This ledger exceeds the supported limit (25,000 transactions, 2,000 statements, 500 rules).');
 if(input.accounts!==undefined&&!Array.isArray(input.accounts))fail('Invalid bank accounts.');
 if(input.accounts?.some((a:any)=>!a||typeof a!=='object'))fail('Invalid bank account.');
 if(input.statements.some((s:any)=>!s)||input.transactions.some((t:any)=>!t))fail('Invalid ledger records.');
 input=upgradeAccounts(input);
 if(input.accounts.length>200)fail('This ledger supports up to 200 bank accounts.');
 const aids=new Set<string>(),names=new Set<string>();
 const accounts=input.accounts.map((a:any)=>{
  if(!id(a.id)||aids.has(a.id)||!string(a.name,160)||!a.name.trim()||names.has(accountKey(a.name))||!string(a.bank,100)||!accountTypes.includes(a.type)||!string(a.last4,4)||!/^(?:[0-9]{4})?$/.test(a.last4)||a.currency!=='INR'||typeof a.archived!=='boolean')fail('Invalid bank account. Use a unique name, INR, and four digits or leave the ending blank.');
  aids.add(a.id);names.add(accountKey(a.name));return {id:a.id,name:a.name.trim(),bank:a.bank.trim(),type:a.type,last4:a.last4,currency:'INR',archived:a.archived};
 });
 const accountMap=new Map<string,any>(accounts.map((a:any)=>[a.id,a]));
 const sids=new Set<string>();
 const statements=input.statements.map((s:any)=>{if(!s||!id(s.id)||sids.has(s.id)||!string(s.name,255)||!string(s.account,160)||!s.account.trim()||!aids.has(s.accountId)||!Number.isInteger(s.count)||s.count<0||!string(s.created,40)||!Number.isFinite(Date.parse(s.created))||(s.fileId&&!id(s.fileId)))fail('Invalid statement metadata.');
  if(!day(s.from)||!day(s.to)||(s.from===undefined)!==(s.to===undefined)||(s.from&&s.from>s.to)||!paise(s.opening)||!paise(s.closing))fail('Invalid statement period or balance.');
  sids.add(s.id);return {id:s.id,name:s.name,account:accountMap.get(s.accountId).name,accountId:s.accountId,count:s.count,created:s.created,...(s.fileId?{fileId:s.fileId}:{}),...(s.migrated?{migrated:true}:{}),...(s.from?{from:s.from,to:s.to}:{}),...(s.opening!==undefined?{opening:s.opening}:{}),...(s.closing!==undefined?{closing:s.closing}:{})}});
 const statementMap=new Map<string,any>(statements.map((s:any)=>[s.id,s]));
 const tids=new Set<string>();const counts:Record<string,number>={};
 const transactions=input.transactions.map((t:any)=>{
  if(!t||!id(t.id)||tids.has(t.id)||!string(t.date,10)||parseDate(t.date)!==t.date||!string(t.description,4000)||!t.description.trim()||!string(t.account,160)||!t.account.trim()||!aids.has(t.accountId)||statementMap.get(t.statementId)?.accountId!==t.accountId||!Number.isSafeInteger(t.amount)||t.amount===0||Math.abs(t.amount)>1e14||!categories.includes(t.category)||!['Income','Expense','Transfer','Refund'].includes(t.type)||!sids.has(t.statementId)||(t.note!==undefined&&!string(t.note,4000))||(t.displayName!==undefined&&!string(t.displayName,160))||!paise(t.balance)||(t.taxTag!==undefined&&t.taxTag!==''&&!taxTagIds.includes(t.taxTag)))fail('Invalid transaction. Check dates, amounts, categories, and statement references.');
  if((t.type==='Expense'&&t.amount>0)||(['Income','Refund'].includes(t.type)&&t.amount<0))fail('Transaction type does not match its amount direction.');
  tids.add(t.id);counts[t.statementId]=(counts[t.statementId]||0)+1;return {id:t.id,date:t.date,description:t.description,amount:t.amount,account:accountMap.get(t.accountId).name,accountId:t.accountId,category:t.category,type:t.type,review:!!t.review,statementId:t.statementId,...(t.note?{note:t.note}:{}),...(t.displayName?.trim()?{displayName:t.displayName.trim()}:{}),...(t.balance!==undefined?{balance:t.balance}:{}),...(t.taxTag?{taxTag:t.taxTag}:{})};
 });
 for(const s of statements)s.count=counts[s.id]||0;
 const rules=input.rules.map((r:any)=>{if(!r||!string(r.keyword,200)||!r.keyword.trim()||!categories.includes(r.category))fail('Invalid category rule.');return {keyword:r.keyword.trim(),category:r.category}});
 return {schemaVersion:2,accounts,transactions,statements,rules,initialized:!!input.initialized};
}
