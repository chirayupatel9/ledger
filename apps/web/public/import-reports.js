// When a statement cannot be read, or is only partly read, the operator is told what kind of file it was so the parser
// can be extended. Only a description is sent (file name, type, size, bank account, column names and the error), never
// rows or amounts. The same file is reported once.
export const reportedNote='Ledger’s administrator has been told this statement format could not be read, so support can be added. Its transactions were not shared.';
const typeOf=name=>/\.pdf$/i.test(name)?'PDF':/\.xlsx?$/i.test(name)?'Excel':/\.(csv|tsv)$/i.test(name)?'CSV':'Other';
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export function createImportReporter({api}){
 const sent=new Map();
 // Resolves true when the report was accepted (or had already been sent); never throws.
 async function report(kind,{file,bankAccount,message,warnings=[],headers=[],extracted,invalid,pages,issuer}){
  try{
   const fileHash=hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),key=fileHash+':'+kind;
   if(!sent.has(key))sent.set(key,api('/api/import-failures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,fileHash,fileName:file.name,fileType:typeOf(file.name),fileSize:file.size,accountName:bankAccount?.name,accountType:bankAccount?.type,message,warnings:warnings.filter(w=>!/provisional/i.test(w)),headers,extracted,invalid,pages,issuer})}).then(r=>!!r?.reported,()=>{sent.delete(key);return false}));
   return await sent.get(key);
  }catch{return false}
 }
 // Shows the note in an element once the report is accepted, if that element still shows the same thing.
 function reportInto(el,kind,details){const shown=el?.textContent;report(kind,details).then(ok=>{if(ok&&el?.isConnected&&el.textContent===shown){if(el.hidden){el.textContent=reportedNote;el.hidden=false}else el.textContent+=' '+reportedNote}});}
 return {report,reportInto};
}
