import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Ledger — Your money, understood',description:'Your private, synced workspace for bank statements and bookkeeping.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
