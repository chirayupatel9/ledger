import WorkspacePage,{destination} from './workspace-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 return <WorkspacePage returnTo={destination('/',await searchParams)}/>;
}
