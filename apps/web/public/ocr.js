// Reads the text of a bill photo on this device with Tesseract. The engine (about 7 MB with the English model) is served
// from a fixed folder and loaded only the first time a bill is read; the photo is not sent anywhere to be read.
const base='/ocr/tesseract-7.0.0/';
let ready=null;
function engine(onProgress){
 ready??=(async()=>{const mod=await import(base+'tesseract.esm.min.js'),createWorker=mod.createWorker||mod.default.createWorker;
  return createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:true,workerBlobURL:false,logger:m=>engine.progress?.(m)});})().catch(e=>{ready=null;throw e;});
 engine.progress=m=>onProgress(m.status==='recognizing text'?{step:'Reading the bill',percent:Math.round(m.progress*100)}:{step:'Getting the reader ready (first time only)',percent:Math.round((m.progress||0)*100)});
 return ready;
}
export async function readImageText(image,onProgress=()=>{}){const worker=await engine(onProgress);const {data}=await worker.recognize(image);return data.text||'';}
// Photos are resized and saved as JPEG before reading and storing: phone photos are often 4–12 MB.
export async function shrinkImage(file,max=2000){
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>null);if(!bitmap)throw Error('This photo could not be opened. Try a JPG or PNG.');
 const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('This photo could not be saved.')),'image/jpeg',.85));
}
