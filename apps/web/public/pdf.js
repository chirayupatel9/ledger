import {parseDate,parseMoney,classify,findPeriod,cardAmount,cardBalance,looksLikeCardStatement} from './core.js';
import {looksLikeCAS,parseCASLines} from './cas.js';
export function extractPageLines(items){const lines=[];for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={y,items:[]};lines.push(line)}line.items.push({text:item.str.trim(),x:item.transform[4],width:item.width||0})}return lines.sort((a,b)=>b.y-a.y).map(l=>({...l,items:l.items.sort((a,b)=>a.x-b.x)}));}
// Opening balance is the first one printed; per-page closing balances end with the statement's final closing balance.
const summaryAmount=(text,label)=>{const all=[...text.matchAll(new RegExp(label+String.raw`\s*(?:balance|bal\.?)?\s*:?\s*(?:₹|rs\.?|inr)?\s*(-?[\d,]+\.\d{2}(?:\s*(?:cr|dr)\.?)?)`,'gi'))],m=label==='closing'?all.at(-1):all[0];return m?parseMoney(m[1]):null;};
const rowDate=/^(\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3,9})[-/ ,.]\s*\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})(?=\s|$|\|)/;
// Some card PDFs draw ₹ with a font that extracts as a backtick.
const moneyToken=/^(?:[+-]\s*)?(?:₹|`|rs\.?|inr)?\s*\(?[\d,]+\.\d{2}\)?(?:\s*(?:cr|dr|c|d)\.?)?$/i,signToken=/^(?:cr|dr|c|d)\.?$/i;
// Inside a known Amount column, whole-rupee values ("7903 Dr.") are amounts too.
const columnValue=/^(?:[+-]\s*)?(?:₹|`|rs\.?|inr)?\s*\(?\d[\d,]*(?:\.\d{1,2})?\)?(?:\s*(?:cr|dr|c|d)\.?)?$/i;
const lineText=line=>line.items.map(x=>x.text).join(' ');
// The amount is the rightmost money value on the row; a separate Cr/Dr/C/D or leading + belongs to it.
function rowAmount(items){for(let k=items.length-1;k>=0;k--){const t=items[k].text.trim();
 if(signToken.test(t)&&k>0&&moneyToken.test(items[k-1].text.trim()))return {index:k-1,raw:items[k-1].text.trim()+' '+t};
 if(moneyToken.test(t))return {index:k,raw:(items[k-1]?.text.trim()==='+'?'+':'')+t};
 if(t.length>3)return null;}return null;}
// Summary figures sit beside their label ("Total Dues : 10,000.00") or in a row of values under a row of labels.
const cardLabels={openingHint:/^(?:previous|opening|last statement)(?: statement)? ?(?:balance|due|dues|outstanding)\b/i,closingHint:/^(?:total (?:amount |payment )?(?:due|dues|outstanding)|closing balance|current outstanding)\b/i};
function cardSummary(lines){
 const found={},center=i=>i.x+(i.width||0)/2;
 for(let li=0;li<lines.length;li++){const items=lines[li].items;
  for(let k=0;k<items.length;k++)for(let span=1;span<=3&&k+span<=items.length;span++){
   const label=items.slice(k,k+span).map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
   for(const [key,re] of Object.entries(cardLabels)){if(key in found||!re.test(label))continue;
    let raw=label.match(/((?:[+-]\s*)?[\d,]+\.\d{2}(?:\s*(?:cr|dr|c|d)\.?)?)\s*$/i)?.[1];
    if(!raw){const after=items.slice(k+span),i=after.findIndex(x=>moneyToken.test(x.text.trim()));if(i>=0)raw=after[i].text.trim()+(signToken.test(after[i+1]?.text.trim()||'')?' '+after[i+1].text.trim():'');}
    if(!raw){const at=(center(items[k])+center(items[k+span-1]))/2;let best=null;
     for(const below of lines.slice(li+1,li+5))for(const [i,v] of below.items.entries()){if(!moneyToken.test(v.text.trim()))continue;const d=Math.abs(center(v)-at);if(d<=90&&(!best||d<best.d))best={d,raw:v.text.trim()+(signToken.test(below.items[i+1]?.text.trim()||'')?' '+below.items[i+1].text.trim():'')}}
     raw=best?.raw;}
    if(raw)found[key]=cardBalance(raw.replace(/^`\s*/,''));
   }
  }
 }
 return found;
}
const noiseColumn=/reward|points|categor|intl|foreign|forex|ser\.? ?no|serial|^ref|^pi$|time/i;
// Header words close together form one column label ("Amount (INR)", "Reward Points").
function headerColumns(items){const cols=[];for(const i of items){const text=i.text.trim(),end=i.x+(i.width||text.length*4),last=cols.at(-1);if(last&&i.x-last.end<14){last.label+=' '+text;last.end=end;}else cols.push({x:i.x,end,label:text});}
 return cols.map(c=>({x:c.x,label:c.label,ref:/\bref(?:erence)?\b|ser\.? ?no|serial/i.test(c.label),amount:/amount/i.test(c.label)&&!/intl|foreign/i.test(c.label),date:/date/i.test(c.label),noise:noiseColumn.test(c.label)&&!(/amount/i.test(c.label)&&!/intl|foreign/i.test(c.label))}));}
// The value under the Amount header, with a Cr/Dr token beside it; the last number in the column wins.
function columnAmount(items,columns){const i=columns.findIndex(c=>c.amount);if(i<0)return undefined;const lo=columns[i].x-45,hi=columns[i+1]?columns[i+1].x-5:Infinity;let found=null;
 items.forEach((it,k)=>{const t=it.text.trim();if(it.x>=lo&&it.x<hi&&columnValue.test(t)&&!/^\d{6,}$/.test(t))found={index:k,raw:t.replace(/^`\s*/,'')+(signToken.test(items[k+1]?.text.trim()||'')&&items[k+1].x<hi?' '+items[k+1].text.trim():'')};});return found;}
// Credit card statements: one amount column, charges unsigned or Dr, credits Cr/C/+/−. Balances are owed (negative).
export function parseCardLines(pages,account,rules=[]){
 const transactions=[],invalid=[],all=pages.flat();let columns=null,datedRows=0;
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){const lines=pages[pageIndex];
  for(let li=0;li<lines.length;li++){const items=lines[li].items,joined=lineText(lines[li]);
   if(/\bdate\b/i.test(joined)&&/amount/i.test(joined)&&/description|details|particulars|transaction|merchant/i.test(joined)){columns=headerColumns(items);continue;}
   const dateColumn=columns?.find(c=>c.date),start=items.findIndex((it,k)=>rowDate.test(items.slice(k).map(x=>x.text).join(' '))&&(dateColumn?Math.abs(it.x-dateColumn.x)<=40:k===0));if(start<0)continue;
   const row=items.slice(start),dateMatch=row.map(x=>x.text).join(' ').match(rowDate),date=parseDate(dateMatch[1]);if(!date)continue;datedRows++;
   const inColumn=columns&&columnAmount(row,columns),at=inColumn===undefined?rowAmount(row):inColumn,amount=at&&cardAmount(at.raw);
   let rest=dateMatch[1];const words=[];let ref,descLeft;
   if(columns)row.forEach(item=>{const t=item.text.trim(),c=[...columns].reverse().find(c=>item.x>=c.x-12);if(c?.ref&&/^[A-Za-z0-9-]{6,40}$/.test(t)&&/\d{6}/.test(t))ref??=t;});
   row.slice(0,at?at.index:row.length).forEach(item=>{let t=item.text.trim();
    if(rest){if(rest.startsWith(t)){rest=rest.slice(t.length).trimStart();return;}if(t.startsWith(rest)){t=t.slice(rest.length).trim();rest='';}else rest='';}
    const column=columns&&[...columns].reverse().find(c=>item.x>=c.x-12);
    if(column?.noise||!t||/^\|$|^\|?\s*\d{1,2}:\d{2}(?::\d{2})?\s*\|?$/.test(t))return;
    // pdf.js can merge the serial/reference number into the narration's text run.
    const lead=t.match(/^(\d{6,})\s+(.+)$/);if(lead){if(columns?.some(c=>c.ref))ref??=lead[1];t=lead[2];}
    words.push(t);descLeft??=item.x;});
   while(words.length&&/^\d{6,}$/.test(words[0]))words.shift();
   while(words.length&&(/^[+-]?\d{1,6}$/.test(words.at(-1))||moneyToken.test(words.at(-1))||/^[A-Z]{3}$/.test(words.at(-1))))words.pop();
   let description=words.join(' ').replace(/^\|?\s*\d{1,2}:\d{2}(?::\d{2})?\s*\|?\s*/,'').replace(/\s*\|\s*/g,' ').replace(/\s+/g,' ').trim();
   const left=descLeft??row.find(i=>!rowDate.test(i.text))?.x??0,right=at?row[at.index].x:Infinity;
   for(let end=li+1;end<lines.length&&end<li+3;end++){const next=lines[end],text=lineText(next);if(next.items.some(i=>rowDate.test(i.text.trim()))||rowAmount(next.items)||/total|page |statement|summary|\bdate\b|amount|reward|domestic|international/i.test(text))break;const parts=next.items.filter(i=>i.x>=left-12&&i.x<right-12).map(i=>i.text.trim()).filter(Boolean);if(!parts.length)break;description+=' '+parts.join(' ');}
   if(/^(?:opening|previous|closing) balance|^total\b/i.test(description))continue;
   if(!description||!amount){invalid.push(`page ${pageIndex+1}, line ${li+1}`);continue;}
   transactions.push({id:crypto.randomUUID(),date,description,amount,account,...(ref?{ref}:{}),...classify(description,amount,rules,{card:true}),review:true});
  }
 }
 const warnings=['Credit card statement: purchases and charges are money out; payments, refunds and cashback are money in. Bill payments are marked as transfers. All rows are marked for review.'];
 if(!datedRows)warnings.push('No dated rows found. This may be a scanned PDF or an unsupported layout.');
 const text=all.map(lineText).join(' ');
 return {transactions,invalid,warnings,layout:'card',cardLike:true,period:findPeriod(text),...cardSummary(all)};
}
export function parsePDFLines(pages,account,rules=[],{card=false}={}){
 const text=pages.flat().map(lineText).join(' '),cardLike=looksLikeCardStatement(text);
 if(looksLikeCAS(text))return {...parseCASLines(pages,account),cardLike:false};
 const numbered=parseNumberedBankLines(pages,account,rules);
 if(numbered)return {...numbered,cardLike:false};
 // Separate debit and credit columns are parsed as a bank table, even on a card account.
 const bankTable=pages.flat().some(l=>{const t=lineText(l);return /\bdate\b/i.test(t)&&/debit|withdrawal/i.test(t)&&/credit|deposit/i.test(t)});
 if((card||cardLike)&&!bankTable)return parseCardLines(pages,account,rules);
 return {...parseBankLines(pages,account,rules),cardLike};
}
// Numbered transaction-history PDFs put the date/amount baseline between narration lines.
// Recognise the complete header, then use column positions and row boundaries, not reading order.
function numberedHeader(lines){
 for(let i=0;i<lines.length;i++){
  const top=lines[i],debit=top.items.find(x=>/^withdrawal$/i.test(x.text)),credit=top.items.find(x=>/^deposit$/i.test(x.text)),balance=top.items.find(x=>/^balance$/i.test(x.text));
  if(!debit||!credit||!balance)continue;
  const block=lines.slice(i,i+4).filter(l=>top.y-l.y<=20).flatMap(l=>l.items),find=re=>block.find(x=>re.test(x.text));
  const serial=find(/^s\s*no\.?$/i),date=find(/^date$/i),cheque=find(/^cheque number$/i),remarks=find(/^transaction remarks$/i);
  if(serial&&date&&cheque&&remarks&&debit.x<credit.x&&credit.x<balance.x)
   return {bottom:Math.min(...lines.slice(i,i+4).filter(l=>top.y-l.y<=20).map(l=>l.y)),serial,date,left:cheque.x+cheque.width,right:debit.x-12,columns:{debit,credit,balance}};
 }
 return null;
}
function parseNumberedBankLines(pages,account,rules){
 if(!pages.some(lines=>numberedHeader(lines)))return null;
 const transactions=[],invalid=[],warnings=[];let previousSerial=null;
 for(const [pageIndex,lines] of pages.entries()){
  const header=numberedHeader(lines);
  if(!header){invalid.push(`page ${pageIndex+1}: numbered table header missing`);continue;}
  const anchors=[];
  for(const [li,line] of lines.entries()){
   if(line.y>=header.bottom)continue;
   const serial=line.items.find(i=>Math.abs(i.x-header.serial.x)<25&&/^\d+$/.test(i.text));
   const date=line.items.find(i=>Math.abs(i.x-header.date.x)<25&&rowDate.test(i.text));
   if(!serial||!date)continue;
   anchors.push({li,line,serial:Number(serial.text),date:parseDate(date.text)});
  }
  const descriptionItems=line=>line.items.filter(i=>i.x>=header.left&&i.x<header.right);
  const start=a=>a.li>0&&lines[a.li-1].y<header.bottom&&lines[a.li-1].y-a.line.y<=8&&descriptionItems(lines[a.li-1]).length? a.li-1:a.li;
  for(const [ai,a] of anchors.entries()){
   const location=`page ${pageIndex+1}, row ${a.serial}`;
   if(previousSerial!==null&&a.serial!==previousSerial+1)warnings.push(`Numbered rows are not consecutive at ${location}. Check for missing or repeated pages.`);
   previousSerial=a.serial;
   const values={};let ambiguous=false;
   for(const item of a.line.items){
    if(item.x<header.right||!columnValue.test(item.text))continue;
    // Values are right-aligned. Using their left edge misreads large deposits as withdrawals.
    const end=item.x+item.width,nearest=Object.entries(header.columns).sort(([,x],[,y])=>Math.abs(end-x.x-x.width)-Math.abs(end-y.x-y.width))[0];
    if(Math.abs(end-nearest[1].x-nearest[1].width)>30)continue;
    if(values[nearest[0]]!==undefined)ambiguous=true;
    values[nearest[0]]=parseMoney(item.text);
   }
   const words=[],stop=anchors[ai+1]?start(anchors[ai+1]):lines.length;
   let lastY=null;
   for(let j=start(a);j<stop;j++){
    const line=lines[j];
    if(lastY!==null&&lastY-line.y>18)break; // Don't absorb the page footer into the final narration.
    const parts=descriptionItems(line).map(i=>i.text);
    if(j!==a.li&&!parts.length)break;
    words.push(...parts);lastY=line.y;
   }
   const description=words.join(' ').replace(/\s+/g,' ').trim(),debit=Math.abs(values.debit||0),credit=Math.abs(values.credit||0),amount=credit-debit;
   if(!a.date||ambiguous||!description||!amount||(debit&&credit)||!Number.isSafeInteger(values.balance)){invalid.push(location);continue;}
   transactions.push({id:crypto.randomUUID(),date:a.date,description,amount,balance:values.balance,account,...classify(description,amount,rules),review:true});
  }
 }
 if(!transactions.length)warnings.push('No numbered transactions could be read. Check the original statement.');
 warnings.push('PDF extraction is provisional. All PDF transactions are marked for review.');
 const text=pages.flat().map(lineText).join(' ');
 return {transactions,invalid,warnings,period:findPeriod(text),openingHint:summaryAmount(text,'opening'),closingHint:summaryAmount(text,'closing')};
}
function parseBankLines(pages,account,rules){const transactions=[],invalid=[],warnings=[],text=[];let headers=null,datedRows=0;
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
// Which bank or card issuer a statement is from, judged by the name printed first on its first page (narrations on later
// lines often mention other banks). Only used to describe a statement that could not be read.
const issuers=[['HDFC Bank',/\bHDFC\s*BANK\b/i],['ICICI Bank',/\bICICI\s*BANK\b/i],['SBI Card',/\bSBI\s*CARD\b/i],['State Bank of India',/\bSTATE\s+BANK\s+OF\s+INDIA\b/i],['Axis Bank',/\bAXIS\s*BANK\b/i],['Kotak Mahindra Bank',/\bKOTAK\b/i],['Yes Bank',/\bYES\s*BANK\b/i],['IDFC FIRST Bank',/\bIDFC\s*FIRST\b/i],['IndusInd Bank',/\bINDUSIND\b/i],['Bank of Baroda',/\bBANK\s+OF\s+BARODA\b/i],['Punjab National Bank',/\bPUNJAB\s+NATIONAL\s+BANK\b/i],['Canara Bank',/\bCANARA\s+BANK\b/i],['Union Bank of India',/\bUNION\s+BANK\s+OF\s+INDIA\b/i],['Bank of India',/\bBANK\s+OF\s+INDIA\b/i],['IDBI Bank',/\bIDBI\b/i],['Federal Bank',/\bFEDERAL\s+BANK\b/i],['South Indian Bank',/\bSOUTH\s+INDIAN\s+BANK\b/i],['Indian Bank',/\bINDIAN\s+BANK\b/i],['RBL Bank',/\bRBL\s*BANK\b/i],['AU Small Finance Bank',/\bAU\s+SMALL\s+FINANCE\b/i],['Standard Chartered',/\bSTANDARD\s+CHARTERED\b/i],['HSBC',/\bHSBC\b/i],['American Express',/\bAMERICAN\s+EXPRESS\b/i],['CAMS',/\bCAMS\b/],['KFintech',/\bKFIN/i]];
export function statementIssuer(pages){const text=(pages[0]||[]).map(l=>l.items.map(i=>i.text).join(' ')).join('\n');let best=null;for(const [name,re] of issuers){const at=text.search(re);if(at>=0&&(!best||at<best.at))best={name,at};}return best?.name||'';}
export async function readPDF(buffer,password,account,rules,options={}){const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;const task=pdfjs.getDocument({data:buffer,password:password||undefined,isEvalSupported:false,useSystemFonts:true});let doc;try{doc=await task.promise;if(doc.numPages>150)throw Object.assign(Error('Please split statements longer than 150 pages before importing.'),{name:'LimitError'});const pages=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p),content=await page.getTextContent();pages.push(extractPageLines(content.items));page.cleanup()}return {...parsePDFLines(pages,account,rules,options),pages:pages.length,issuer:statementIssuer(pages)}}finally{if(doc)await doc.destroy();else await task.destroy();}}
