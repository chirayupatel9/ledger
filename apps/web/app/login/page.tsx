import {safeReturnTo} from '../../public/workspace-routing.js';
import AuthScreen from '../auth-screen';
export const dynamic='force-dynamic';
// Google sign-in failures come back as /login?via=google&error=<code>.
const googleErrors:Record<string,string>={NOT_INVITED:'Sign-up is by invitation, and this Google account’s email address has not been invited.',SIGNUP_CLOSED:'No Ledger account uses this Google address, and new accounts are not being created.',signup_disabled:'No Ledger account uses this Google address, and new accounts are not being created.',account_not_linked:'An account with this email address already exists. Sign in with your password instead.'};
export default async function Page({searchParams}:{searchParams:Promise<{error?:string;next?:string;via?:string}>}){const q=await searchParams,google=q.via==='google'&&q.error?googleErrors[q.error]||'Google sign-in did not complete. Please retry.':undefined;return <AuthScreen mode='login' returnTo={safeReturnTo(q.next)} linkError={!google&&!!q.error} googleError={google}/>;}
