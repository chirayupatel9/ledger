import {headers} from 'next/headers';
// Server-side session lookup. Caddy sets X-Real-IP from the visitor; forwarding it keeps auth rate limits per visitor
// instead of one shared bucket for every page load.
export async function currentSession(){
 const h=await headers(),ip=h.get('x-real-ip');
 const r=await fetch((process.env.API_INTERNAL_URL||'http://api:3001')+'/api/auth/get-session',{headers:{cookie:h.get('cookie')||'',...(ip?{'x-real-ip':ip}:{})},cache:'no-store'});
 if(!r.ok)throw new Error('Authentication service unavailable');
 return r.json();
}
