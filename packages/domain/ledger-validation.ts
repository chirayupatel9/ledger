import {upgradeAccounts,accountKey,accountTypes} from './accounts.js';
import {categories,parseDate} from './core.js';
import {taxTagIds} from './tax.js';
import {normalizeTransfers} from './transfers.js';
import {defaultPreferences} from './preferences.js';
export type LedgerState={schemaVersion:number;accounts:any[];transactions:any[];statements:any[];rules:any[];initialized:boolean;preferences:any;titleRules:any[];customCategories:any[];categoryOverrides:Record<string,any>;fundMatches:{scheme:string;code:number|null}[]};
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
 // Relabelled built-ins and your own categories. Every name and label shown must be unique (case-insensitive).
 if(input.categoryOverrides!==undefined&&(!input.categoryOverrides||typeof input.categoryOverrides!=='object'||Array.isArray(input.categoryOverrides)))fail('Invalid category settings.');
 if(input.customCategories!==undefined&&!Array.isArray(input.customCategories))fail('Invalid categories.');
 if(input.customCategories?.length>100)fail('Up to 100 custom categories are supported.');
 const hex=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),shown=new Set<string>(categories.map((c:string)=>c.toLowerCase())),cids=new Set<string>();
 const categoryOverrides:Record<string,any>={};
 for(const [name,o] of Object.entries(input.categoryOverrides||{}) as [string,any][]){
  if(!categories.includes(name)||!o||typeof o!=='object'||(o.label!==undefined&&(!string(o.label,40)||!o.label.trim()))||(o.color!==undefined&&!hex(o.color))||(o.hidden!==undefined&&typeof o.hidden!=='boolean')||(o.hidden&&['Uncategorized','Transfers'].includes(name)))fail('Invalid category settings.');
  const label=o.label?.trim().replace(/\s+/g,' ');
  if(label&&label!==name){if(shown.has(label.toLowerCase()))fail('Another category already uses that name.');shown.add(label.toLowerCase());}
  const clean={...(label&&label!==name?{label}:{}),...(o.color?{color:o.color.toLowerCase()}:{}),...(o.hidden?{hidden:true}:{})};if(Object.keys(clean).length)categoryOverrides[name]=clean;
 }
 const customCategories=(input.customCategories||[]).map((c:any)=>{
  if(!c||!id(c.id)||cids.has(c.id)||!string(c.name,40)||!c.name.trim()||!hex(c.color)||!['expense','income'].includes(c.kind)||(c.hidden!==undefined&&typeof c.hidden!=='boolean'))fail('Invalid custom category. Use a name up to 40 characters and a colour.');
  const name=c.name.trim().replace(/\s+/g,' ');if(shown.has(name.toLowerCase()))fail('Another category already uses that name.');
  shown.add(name.toLowerCase());cids.add(c.id);return {id:c.id,name,color:c.color.toLowerCase(),kind:c.kind,...(c.hidden?{hidden:true}:{})};
 });
 const allowed=new Set<string>([...categories,...customCategories.map((c:any)=>c.name)]);
 const transactions=input.transactions.map((t:any)=>{
  if(!t||!id(t.id)||tids.has(t.id)||!string(t.date,10)||parseDate(t.date)!==t.date||!string(t.description,4000)||!t.description.trim()||!string(t.account,160)||!t.account.trim()||!aids.has(t.accountId)||statementMap.get(t.statementId)?.accountId!==t.accountId||!Number.isSafeInteger(t.amount)||t.amount===0||Math.abs(t.amount)>1e14||!allowed.has(t.category)||!['Income','Expense','Transfer','Refund'].includes(t.type)||!sids.has(t.statementId)||(t.note!==undefined&&!string(t.note,4000))||(t.displayName!==undefined&&!string(t.displayName,160))||!paise(t.balance)||(t.taxTag!==undefined&&t.taxTag!==''&&!taxTagIds.includes(t.taxTag))||(t.transferId!==undefined&&!id(t.transferId))||(t.ref!==undefined&&!(typeof t.ref==='string'&&/^[A-Za-z0-9-]{1,40}$/.test(t.ref))))fail('Invalid transaction. Check dates, amounts, categories, and statement references.');
  if((t.type==='Expense'&&t.amount>0)||(['Income','Refund'].includes(t.type)&&t.amount<0))fail('Transaction type does not match its amount direction.');
  tids.add(t.id);counts[t.statementId]=(counts[t.statementId]||0)+1;return {id:t.id,date:t.date,description:t.description,amount:t.amount,account:accountMap.get(t.accountId).name,accountId:t.accountId,category:t.category,type:t.type,review:!!t.review,statementId:t.statementId,...(t.note?{note:t.note}:{}),...(t.displayName?.trim()?{displayName:t.displayName.trim()}:{}),...(t.balance!==undefined?{balance:t.balance}:{}),...(t.taxTag?{taxTag:t.taxTag}:{}),...(t.transferId?{transferId:t.transferId}:{}),...(t.ref?{ref:t.ref}:{})};
 });
 // A link survives only as two Transfer legs of equal and opposite amounts in different accounts.
 normalizeTransfers(transactions);
 for(const s of statements)s.count=counts[s.id]||0;
 const rules=input.rules.map((r:any)=>{if(!r||!string(r.keyword,200)||!r.keyword.trim()||!allowed.has(r.category))fail('Invalid category rule.');return {keyword:r.keyword.trim(),category:r.category}});
 if(input.preferences!==undefined&&(!input.preferences||typeof input.preferences!=='object'||Array.isArray(input.preferences)))fail('Invalid display preferences.');
 const preferences={...defaultPreferences,...input.preferences};
 if(Object.keys(preferences).some(k=>!Object.hasOwn(defaultPreferences,k))||!['light','dark','system'].includes(preferences.theme)||![14,16,18,20,22].includes(preferences.fontSize)||!['sans','system','serif'].includes(preferences.fontFamily)||!['comfortable','compact'].includes(preferences.density)||['showChart','showCategories','showRecent','showBalances','showLabelSource','expandNarration'].some(k=>typeof preferences[k]!=='boolean'))fail('Invalid display preferences.');
 if(input.titleRules!==undefined&&!Array.isArray(input.titleRules))fail('Invalid title rules.');
 if(input.titleRules?.length>500)fail('Up to 500 title rules are supported.');
 const ruleIds=new Set(),matches=new Set();
 const titleRules=(input.titleRules||[]).map((r:any)=>{
  if(!r||!id(r.id)||ruleIds.has(r.id)||!['contains','exact'].includes(r.mode)||!string(r.keyword,200)||!r.keyword.trim()||!string(r.title,160)||!r.title.trim())fail('Invalid title rule. Use a match and a title up to 160 characters.');
  const keyword=r.keyword.trim().replace(/\s+/g,' '),key=r.mode+':'+keyword.toLowerCase();
  if(matches.has(key))fail('A title rule already uses that match. Edit the existing rule.');
  ruleIds.add(r.id);matches.add(key);return {id:r.id,mode:r.mode,keyword,title:r.title.trim()};
 });
 // The AMFI scheme you chose for a fund scheme in your reports (code null: do not match it). One choice per scheme name.
 if(input.fundMatches!==undefined&&!Array.isArray(input.fundMatches))fail('Invalid fund matches.');
 if(input.fundMatches?.length>500)fail('Up to 500 fund matches are supported.');
 const schemes=new Set<string>();
 const fundMatches=(input.fundMatches||[]).map((m:any)=>{
  if(!m||!string(m.scheme,300)||!m.scheme.trim()||(m.code!==null&&!(Number.isSafeInteger(m.code)&&m.code>0&&m.code<1e8)))fail('Invalid fund match. Choose a scheme from the list.');
  const scheme=m.scheme.trim().replace(/\s+/g,' ');if(schemes.has(scheme.toLowerCase()))fail('A fund is matched twice. Refresh and retry.');
  schemes.add(scheme.toLowerCase());return {scheme,code:m.code};
 });
 return {schemaVersion:2,accounts,transactions,statements,rules,initialized:!!input.initialized,preferences,titleRules,customCategories,categoryOverrides,fundMatches};
}
