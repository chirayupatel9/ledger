import {currentSession} from './session';
import {redirect} from 'next/navigation';
import Workspace from './workspace';
import {safeReturnTo} from '../public/workspace-routing.js';
export default async function WorkspacePage({returnTo='/'}:{returnTo?:string}){
 const session=await currentSession();
 if(!session?.user?.emailVerified)redirect('/login?next='+encodeURIComponent(safeReturnTo(returnTo)));
 return <Workspace/>;
}
export function destination(path:string,query:Record<string,string|string[]|undefined>){
 const params=new URLSearchParams();
 for(const key of ['account','period'])if(typeof query[key]==='string')params.set(key,query[key]);
 return safeReturnTo(path+'?'+params);
}
