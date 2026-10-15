import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Workspace from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){const h=await headers();const r=await fetch((process.env.API_INTERNAL_URL||'http://api:3001')+'/api/auth/get-session',{headers:{cookie:h.get('cookie')||''},cache:'no-store'});if(!r.ok)throw new Error('Authentication service unavailable');const session=await r.json();if(!session?.user?.emailVerified)redirect('/login');return <Workspace/>;}
