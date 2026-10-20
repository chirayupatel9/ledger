import {currentSession} from '../session';
import {redirect} from 'next/navigation';
import AuthScreen from '../auth-screen';
export const dynamic='force-dynamic';
export default async function Page(){const session=await currentSession();if(!session?.user?.emailVerified)redirect('/login');return <AuthScreen mode='security' twoFactorEnabled={!!session.user.twoFactorEnabled}/>;}
