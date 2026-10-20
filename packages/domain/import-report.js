// A statement that could not be read (or was only partly read) is reported to the operator so the parser can be extended.
// Only a description travels: file name, type, size, bank account, column names and the error. Never rows or amounts.
const kinds={
 unreadable:['could not read a statement','Ledger could not read this statement.'],
 empty:['found no transactions in a statement','No transactions could be read.'],
 partial:['only partly read a statement','Some rows could not be read and were left out.'],
 unsupported:['could not open a statement file','This file type is not supported.'],
};
const types=['PDF','Excel','CSV','Other'];
const text=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<1e9?v:undefined;
const list=(v,n,max)=>(Array.isArray(v)?v:[]).slice(0,n).map(x=>text(x,max)).filter(Boolean);
// Server-side validation of what the browser sends; returns null when the report is unusable.
export function cleanImportReport(raw){
 if(!raw||typeof raw!=='object')return null;
 const kind=Object.hasOwn(kinds,raw.kind)?raw.kind:null,fileHash=typeof raw.fileHash==='string'&&/^[0-9a-f]{64}$/.test(raw.fileHash)?raw.fileHash:null,fileName=text(raw.fileName,200);
 if(!kind||!fileHash||!fileName)return null;
 return {kind,fileHash,fileName,fileType:types.includes(raw.fileType)?raw.fileType:'Other',fileSize:count(raw.fileSize),pages:count(raw.pages),
  accountName:text(raw.accountName,80),accountType:text(raw.accountType,40),issuer:text(raw.issuer,60),message:text(raw.message,300),
  warnings:list(raw.warnings,5,200),headers:list(raw.headers,30,60),extracted:count(raw.extracted),invalid:count(raw.invalid)};
}
const size=b=>b===undefined?'':b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(1)} MB`;
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
export function importReportEmail(r,{reporter={},when=new Date()}={}){
 const extension=(r.fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1]||'').toLowerCase(),
  label=r.fileType==='Other'?(extension?`.${extension} file`:'unknown file type'):r.issuer?`${r.issuer} ${r.fileType}`:`${r.fileType} statement`;
 const subject=`Ledger ${kinds[r.kind][0]}: ${label}`.replace(/[\r\n]+/g,' ').slice(0,160);
 const facts=[
  ['What happened',r.message||kinds[r.kind][1]],
  ...r.warnings.map(w=>['Parser note',w]),
  ...(r.extracted!==undefined||r.invalid!==undefined?[['Rows',[r.extracted!==undefined&&`${r.extracted} read`,r.invalid!==undefined&&`${r.invalid} could not be read`].filter(Boolean).join(', ')]]:[]),
  ...(r.headers.length?[['Columns found',r.headers.join(' · ')]]:[]),
  ['File',`${r.fileName} (${[r.fileType==='Other'?label:r.fileType,r.pages!==undefined&&plural(r.pages,'page'),size(r.fileSize)].filter(Boolean).join(', ')})`],
  ...(r.issuer?[['Looks like',r.issuer]]:[]),
  ...(r.accountName?[['Imported into',r.accountName+(r.accountType?` (${r.accountType})`:'')]]:[]),
  ['Imported by',[reporter.name,reporter.email&&`<${reporter.email}>`].filter(Boolean).join(' ')||'Unknown'],
  ['When',when.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST'],
 ];
 const body=[`Ledger ${kinds[r.kind][0]} during an import, so its parser may need updating.`,'',...facts.map(([k,v])=>`${k}: ${v}`),'',
  'The statement is not attached and was not saved. Share the original file to have the parser updated.'].join('\n');
 return {subject,body};
}
