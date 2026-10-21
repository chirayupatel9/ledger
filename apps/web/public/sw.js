// Ledger's service worker: makes the app installable, shows an offline page, keeps the bill reader (OCR engine) and icons
// cached, and receives UPI messages and photos shared from other apps. It never caches /api responses or pages, so no
// financial data is stored offline by it.
const STATIC='ledger-static-v1',SHARE='ledger-share';
self.addEventListener('install',e=>{e.waitUntil(caches.open(STATIC).then(c=>c.addAll(['/icons/icon-192.png','/favicon.svg'])).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('ledger-static-')&&k!==STATIC)await caches.delete(k);await self.clients.claim();})());});
const offline=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ledger is offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6f3;color:#24342e;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px}b{display:block;font-size:30px;font-weight:800;letter-spacing:-1.4px;color:#173b32;margin-bottom:14px}b span{color:#6f9a4c}p{margin:0 0 18px;color:#5f6b66;max-width:320px;line-height:1.5}button{border:0;border-radius:8px;background:#2c6554;color:#fff;font:inherit;font-weight:600;padding:12px 22px}</style></head>
<body><main><b>ledger<span>.</span></b><p>You're offline. Ledger needs a connection to open your private ledger.</p><button onclick="location.reload()">Try again</button></main></body></html>`;
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(url.origin!==location.origin)return;
 if(req.method==='POST'&&url.pathname==='/share'){e.respondWith(receiveShare(req));return;}
 if(req.method!=='GET'||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){e.respondWith(fetch(req).catch(()=>new Response(offline,{headers:{'Content-Type':'text/html; charset=utf-8'}})));return;}
 // The OCR engine lives at a versioned path and never changes there.
 if(url.pathname.startsWith('/ocr/')||url.pathname.startsWith('/icons/'))e.respondWith(caches.open(STATIC).then(async c=>{const hit=await c.match(req);if(hit)return hit;const res=await fetch(req);if(res.ok)await c.put(req,res.clone());return res;}));
});
// Shared text and one photo are kept on the device until the page picks them up (capture-views.js openShared).
async function receiveShare(req){
 try{const form=await req.formData(),id=crypto.randomUUID(),cache=await caches.open(SHARE);
  const files=form.getAll('files').filter(f=>f&&typeof f!=='string'&&f.size).slice(0,1);
  await cache.put(`/share/${id}`,new Response(JSON.stringify({text:[form.get('title'),form.get('text'),form.get('url')].filter(v=>typeof v==='string'&&v.trim()).join('\n'),files:files.map(f=>({name:f.name,type:f.type}))}),{headers:{'Content-Type':'application/json'}}));
  for(const [i,f] of files.entries())await cache.put(`/share/${id}/file/${i}`,new Response(f,{headers:{'Content-Type':f.type||'application/octet-stream'}}));
  return Response.redirect(`/?shared=${id}`,303);
 }catch{return Response.redirect('/?shared=unavailable',303);}
}
