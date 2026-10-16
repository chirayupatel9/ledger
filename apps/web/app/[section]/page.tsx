import {notFound} from 'next/navigation';
import WorkspacePage,{destination} from '../workspace-page';
import {sections} from '../../public/workspace-routing.js';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {section}=await params;
 if(section==='overview'||!sections.includes(section))notFound();
 return <WorkspacePage returnTo={destination('/'+section,await searchParams)}/>;
}
