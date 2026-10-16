import {parseDate,parseMoney,classify,findPeriod} from './core.js';
export function extractPageLines(items){const lines=[];for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={y,items:[]};lines.push(line)}line.items.push({text:item.str.trim(),x:item.transform[4],width:item.width||0})}return lines.sort((a,b)=>b.y-a.y).map(l=>({...l,items:l.items.sort((a,b)=>a.x-b.x)}));}
// Opening balance is the first one printed; per-page closing balances end with the statement's final closing balance.
const summaryAmount=(text,label)=>{const all=[...text.matchAll(new RegExp(label+String.raw`\s*(?:balance|bal\.?)?\s*:?\s*(?:₹|rs\.?|inr)?\s*(-?[\d,]+\.\d{2}(?:\s*(?:cr|dr)\.?)?)`,'gi'))],m=label==='closing'?all.at(-1):all[0];return m?parseMoney(m[1]):null;};
export function parsePDFLines(pages,account,rules=[]){const transactions=[],invalid=[],warnings=[],text=[];let headers=null,datedRows=0;
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){const lines=pages[pageIndex];
  for(let li=0;li<lines.length;li++){const line=lines[li],joined=line.items.map(x=>x.text).join(' ');text.push(joined);
   if(/debit|withdrawal/i.test(joined)&&/credit|deposit/i.test(joined)){
    const debit=line.items.find(x=>/debit|withdrawal/i.test(x.text)),credit=line.items.find(x=>/credit|deposit/i.test(x.text)),balance=line.items.find(x=>/balance/i.test(x.text));
    if(debit&&credit&&Math.abs(debit.x-credit.x)>25)headers={debit:debit.x,credit:credit.x,...(balance?{balance:balance.x}:{})};continue;
   }
   const dateMatch=joined.match(/^(\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3,9})[-/ ,.]\s*\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})(?=\s|$)/);
   if(!dateMatch)continue;const date=parseDate(dateMatch[1]);if(!date)continue;datedRows++;
   if(!headers){invalid.push(`page ${pageIndex+1}, line ${li+1}`);continue;}
   const cols=Object.entries(headers).sort((a,b)=>a[1]-b[1]),values={};let descriptionParts=[];
   for(const item of line.items){const raw=item.text.trim(),num=parseMoney(raw);if(num!==null&&/\d+\.\d{2}(?:\s*(?:cr|dr)\.?)?$/i.test(raw)){
     const col=cols.find(([name,x],i)=>item.x>=x-18&&(i===cols.length-1||item.x<cols[i+1][1]-18));if(col){if(values[col[0]]!==undefined){values.ambiguous=true}else values[col[0]]=num;continue;}}
     if(item.x<cols[0][1]-18)descriptionParts.push(raw);
   }
   let description=descriptionParts.join(' ').replace(dateMatch[1],'').trim().replace(/^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*/,'');
   let end=li+1;while(end<lines.length&&end<li+4){const next=lines[end],text=next.items.map(i=>i.text).join(' ');if(/^(?:\d{1,2}[-/ .]|\d{4}[-/])/.test(text)||/opening|closing|balance|total|page |statement|date|withdrawal|credit|debit/i.test(text))break;const parts=next.items.filter(i=>i.x>65&&i.x<cols[0][1]-18).map(i=>i.text);if(parts.length)description+=' '+parts.join(' ');else break;end++;}
   const debit=Math.abs(values.debit||0),credit=Math.abs(values.credit||0),amount=credit-debit;
   if(values.ambiguous||!description||!amount||(debit&&credit)){invalid.push(`page ${pageIndex+1}, line ${li+1}`);continue;}
   transactions.push({id:crypto.randomUUID(),date,description:description.trim(),amount,account,...(values.balance!==undefined?{balance:values.balance}:{}),...classify(description,amount,rules),review:true});
  }
 }
 if(!datedRows)warnings.push('No dated rows found. This may be a scanned PDF or an unsupported date layout.');
 if(!headers)warnings.push('No distinct debit and credit columns were found. Please use a CSV export for this layout.');
 warnings.push('PDF extraction is provisional. All PDF transactions are marked for review.');
 const all=text.join(' ');
 return {transactions,invalid,warnings,period:findPeriod(all),openingHint:summaryAmount(all,'opening'),closingHint:summaryAmount(all,'closing')};}
export async function readPDF(buffer,password,account,rules){const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;const task=pdfjs.getDocument({data:buffer,password:password||undefined,isEvalSupported:false,useSystemFonts:true});let doc;try{doc=await task.promise;if(doc.numPages>150)throw Error('Please split statements longer than 150 pages before importing.');const pages=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p),content=await page.getTextContent();pages.push(extractPageLines(content.items));page.cleanup()}return parsePDFLines(pages,account,rules)}finally{if(doc)await doc.destroy();else await task.destroy();}}
