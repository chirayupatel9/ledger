import {safeReturnTo} from '../../public/workspace-routing.js';
import {redirect} from 'next/navigation';
import AuthScreen from '../auth-screen';
import {currentSession} from '../session';
export const dynamic='force-dynamic';
// Google sign-in failures come back as /login?via=google&error=<code>. An account with two-step verification on comes
// back as /login?twofactor=1 to enter its code.
const googleErrors:Record<string,string>={NOT_INVITED:'Sign-up is by invitation, and this Google account’s email address has not been invited.',SIGNUP_CLOSED:'No Ledger account uses this Google address, and new accounts are not being created.',signup_disabled:'No Ledger account uses this Google address, and new accounts are not being created.',account_not_linked:'An account with this email address already exists. Sign in with your password instead.'};
// Someone already signed in (Back after signing in, a bookmark, a return from Google) goes straight to the workspace. A
// pending two-step code has no session yet, and an unverified address cannot use the workspace: both still get the form.
async function signedIn(){try{return !!(await currentSession())?.user?.emailVerified;}catch{return false;}}
export default async function Page({searchParams}:{searchParams:Promise<{error?:string;next?:string;via?:string;twofactor?:string}>}){const q=await searchParams;if(await signedIn())redirect(safeReturnTo(q.next));const google=q.via==='google'&&q.error?googleErrors[q.error]||'Google sign-in did not complete. Please retry.':undefined;return <AuthScreen mode='login' returnTo={safeReturnTo(q.next)} linkError={!google&&!!q.error} googleError={google} twoFactor={q.twofactor==='1'}/>;}
