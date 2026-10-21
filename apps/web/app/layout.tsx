import type { Metadata, Viewport } from 'next';
import Pwa from './pwa';
export const metadata: Metadata = {title:'Ledger — Your money, understood',description:'Your private, synced workspace for bank statements and bookkeeping.',applicationName:'Ledger',
 icons:{icon:'/favicon.svg',apple:'/icons/apple-touch-icon.png'},appleWebApp:{capable:true,title:'Ledger',statusBarStyle:'default'},formatDetection:{telephone:false}};
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#173b32'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}<Pwa/></body></html>}
