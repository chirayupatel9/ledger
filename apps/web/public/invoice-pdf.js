import {extractPageLines} from './pdf.js';
// PDF invoices (Amazon, Swiggy, utilities…): the text is read straight from the PDF; a scanned PDF with no text is read
// with the on-device OCR instead. The first page is drawn as a preview. Everything happens in the browser.
async function open(data){
 const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
 try{return await pdfjs.getDocument({data,isEvalSupported:false,useSystemFonts:true}).promise;}
 catch(e){throw Error(e?.name==='PasswordException'?'This PDF is password-protected. Save a copy without the password, or take a photo of the invoice.':'This PDF could not be opened.');}
}
async function draw(doc,width){
 const page=await doc.getPage(1),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(3,width/base.width)});
 const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
 const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
 await page.render({canvasContext:context,viewport}).promise;page.cleanup();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('The PDF preview could not be drawn.')),'image/jpeg',.85));
}
// Up to the first three pages: invoices put the total on the first page or two.
export async function readInvoicePDF(file,onProgress=()=>{}){
 const doc=await open(new Uint8Array(await file.arrayBuffer()));
 try{
  const lines=[];for(let p=1;p<=Math.min(3,doc.numPages);p++){const page=await doc.getPage(p);lines.push(...extractPageLines((await page.getTextContent()).items).map(l=>l.items.map(i=>i.text).join(' ')));page.cleanup();}
  let text=lines.join('\n');const preview=await draw(doc,1200);
  if(text.replace(/\s/g,'').length<20){onProgress({step:'This PDF is a scan, reading it',percent:0});const {readImageText}=await import('./ocr.js');text=await readImageText(await draw(doc,2000),onProgress);}
  return {text,preview,pages:doc.numPages};
 }finally{await doc.destroy();}
}
export async function previewPDF(blob){const doc=await open(new Uint8Array(await blob.arrayBuffer()));try{return await draw(doc,1200);}finally{await doc.destroy();}}
