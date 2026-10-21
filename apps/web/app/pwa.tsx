'use client';
import {useEffect} from 'react';
// Registers the service worker and keeps the browser's install prompt for Settings → "Ledger on your phone".
// Pages outside the workspace (sign-in, password, two-step) take the theme this device last used in Ledger.
export default function Pwa(){
 useEffect(()=>{
  try{const theme=localStorage.getItem('ledger.theme');if((theme==='dark'||theme==='light')&&!document.documentElement.dataset.theme)document.documentElement.dataset.theme=theme;}catch{}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  const keep=(e:Event)=>{e.preventDefault();(window as any).__ledgerInstall=e;window.dispatchEvent(new Event('ledger-installable'));};
  window.addEventListener('beforeinstallprompt',keep);return()=>window.removeEventListener('beforeinstallprompt',keep);
 },[]);
 return null;
}
