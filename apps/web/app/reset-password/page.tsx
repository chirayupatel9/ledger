import AuthScreen from '../auth-screen';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){const q=await searchParams;return <AuthScreen mode='reset' linkError={!!q.error}/>;}
