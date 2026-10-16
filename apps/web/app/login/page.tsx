import {safeReturnTo} from '../../public/workspace-routing.js';
import AuthScreen from '../auth-screen';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){const q=await searchParams;return <AuthScreen mode='login' returnTo={safeReturnTo(q.next)} linkError={!!q.error}/>;}
