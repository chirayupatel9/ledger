'use client';
import {useEffect} from 'react';
// Registers the service worker and keeps the browser's install prompt for Settings → "Ledger on your phone".
export default function Pwa(){
 useEffect(()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  const keep=(e:Event)=>{e.preventDefault();(window as any).__ledgerInstall=e;window.dispatchEvent(new Event('ledger-installable'));};
  window.addEventListener('beforeinstallprompt',keep);return()=>window.removeEventListener('beforeinstallprompt',keep);
 },[]);
 return null;
}
