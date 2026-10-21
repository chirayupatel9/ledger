// Tags: your own labels on transactions (a trip, a project, “reimbursable”), any number per transaction.
// A tag is up to 40 characters with no commas; tags match whatever their case, and the first spelling used is kept.
export const maxTags=20,maxTagLength=40;
export const cleanTag=s=>String(s??'').replace(/^[\s#]+/,'').replace(/[,\s]+/g,' ').trim().slice(0,maxTagLength).trim();
export const tagKey=s=>cleanTag(s).toLowerCase();
export const validTags=tags=>Array.isArray(tags)&&tags.length<=maxTags&&tags.every(g=>typeof g==='string'&&g&&cleanTag(g)===g)&&new Set(tags.map(g=>g.toLowerCase())).size===tags.length;
export const hasTag=(t,tag)=>(t.tags||[]).some(g=>g.toLowerCase()===tagKey(tag));
// Typed text such as “Goa trip, #reimbursable” → ['Goa trip','reimbursable'], using the spelling already in your ledger.
export function parseTags(text,known=[]){const spelling=new Map(known.map(g=>[g.toLowerCase(),g])),out=[];
 for(const part of String(text??'').split(',')){const g=cleanTag(part);if(g&&!out.some(x=>x.toLowerCase()===g.toLowerCase()))out.push(spelling.get(g.toLowerCase())||g);}
 return out;}
export function addTags(t,tags){const list=[...(t.tags||[])];for(const g of tags.map(cleanTag))if(g&&list.length<maxTags&&!list.some(x=>x.toLowerCase()===g.toLowerCase()))list.push(g);if(list.length)t.tags=list;else delete t.tags;return t;}
export function removeTag(t,tag){const list=(t.tags||[]).filter(g=>g.toLowerCase()!==tagKey(tag));if(list.length)t.tags=list;else delete t.tags;return t;}
// Every tag in use, most used first, with what it adds up to (spent counts expenses net of refunds; transfers only count).
export function tagSummary(transactions){const map=new Map();
 for(const t of transactions)for(const g of t.tags||[]){const k=g.toLowerCase();let s=map.get(k);if(!s)map.set(k,s={name:g,count:0,spent:0,received:0});s.count++;if(t.type==='Income')s.received+=t.amount;else if(t.type==='Expense'||t.type==='Refund')s.spent-=t.amount;}
 return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
export const allTags=transactions=>tagSummary(transactions).map(s=>s.name);
// Rename a tag everywhere; renaming to a tag you already use merges the two. Returns how many transactions changed.
export function renameTag(transactions,from,to){const name=cleanTag(to),key=tagKey(from);if(!name||!key)return 0;const existing=allTags(transactions).find(g=>g.toLowerCase()===name.toLowerCase()&&g.toLowerCase()!==key);let n=0;
 for(const t of transactions){const i=(t.tags||[]).findIndex(g=>g.toLowerCase()===key);if(i<0)continue;const list=[...t.tags];list[i]=existing||name;t.tags=list.filter((g,j)=>list.findIndex(x=>x.toLowerCase()===g.toLowerCase())===j);n++;}
 return n;}
export function deleteTag(transactions,tag){let n=0;for(const t of transactions)if(hasTag(t,tag)){removeTag(t,tag);n++;}return n;}
