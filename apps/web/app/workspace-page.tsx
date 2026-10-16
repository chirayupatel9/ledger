import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Workspace from './workspace';
import {safeReturnTo} from '../public/workspace-routing.js';
export default async function WorkspacePage({returnTo='/'}:{returnTo?:string}){
 const h=await headers();
 const r=await fetch((process.env.API_INTERNAL_URL||'http://api:3001')+'/api/auth/get-session',{headers:{cookie:h.get('cookie')||''},cache:'no-store'});
 if(!r.ok)throw new Error('Authentication service unavailable');
 const session=await r.json();
 if(!session?.user?.emailVerified)redirect('/login?next='+encodeURIComponent(safeReturnTo(returnTo)));
 return <Workspace/>;
}
export function destination(path:string,query:Record<string,string|string[]|undefined>){
 const params=new URLSearchParams();
 for(const key of ['account','period'])if(typeof query[key]==='string')params.set(key,query[key]);
 return safeReturnTo(path+'?'+params);
}
