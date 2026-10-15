export const accountTypes=['Savings','Current','Credit card','Loan','Wallet','Investment','Other'];
export const accountKey=name=>String(name||'').trim().replace(/\s+/g,' ').toLowerCase();
function legacyId(name){let a=2166136261,b=5381;for(const c of name){a=Math.imul(a^c.codePointAt(0),16777619);b=Math.imul(b,33)^c.codePointAt(0);}return `legacy-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;}
// Upgrade only records without an account ID. Unknown explicit IDs remain invalid.
export function upgradeAccounts(input){
 const accounts=(input.accounts||[]).map(a=>({...a})),byId=new Map(accounts.map(a=>[a.id,a])),byName=new Map(accounts.map(a=>[accountKey(a.name),a]));
 const resolve=name=>{const key=accountKey(name);if(byName.has(key))return byName.get(key);let id=legacyId(key);while(byId.has(id))id+='-1';const a={id,name:String(name||'').trim(),bank:'',type:'Other',last4:'',currency:'INR',archived:false};accounts.push(a);byId.set(id,a);byName.set(key,a);return a;};
 const statements=(input.statements||[]).map(s=>{const a=s.accountId?byId.get(s.accountId):resolve(s.account);return {...s,accountId:s.accountId||a?.id,account:a?.name||s.account};});
 const statementMap=new Map(statements.map(s=>[s.id,s]));
 const transactions=(input.transactions||[]).map(t=>{const sid=statementMap.get(t.statementId)?.accountId;const a=byId.get(t.accountId||sid)||(!t.accountId&&!sid?resolve(t.account):undefined);return {...t,accountId:t.accountId||a?.id,account:a?.name||t.account};});
 return {...input,schemaVersion:2,accounts,statements,transactions};
}
export function renameAccount(state,id,changes){
 const account=state.accounts.find(a=>a.id===id);if(!account)throw Error('Bank account not found.');
 Object.assign(account,changes);for(const record of [...state.statements,...state.transactions])if(record.accountId===id)record.account=account.name;
}
export function reassignStatement(state,id,accountId){
 const account=state.accounts.find(a=>a.id===accountId),statement=state.statements.find(s=>s.id===id);
 if(!account||!statement)throw Error('Statement or bank account not found.');
 for(const record of [statement,...state.transactions.filter(t=>t.statementId===id)]){record.accountId=accountId;record.account=account.name;}
}
