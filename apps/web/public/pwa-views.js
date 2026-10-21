// Settings → "Ledger on your phone": install it as an app (the browser's own prompt on Android and desktop Chrome;
// Share → Add to Home Screen on iPhone). Installed on Android, Ledger also appears in the share menu.
export function createPwaViews({icon}){
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const iphone=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 function card(){
  const how=installed()?'<p class="notice success">Ledger is installed on this device.</p>':window.__ledgerInstall?'<button class="btn primary" id="install-app">'+icon('download',14)+' Install Ledger</button>':iphone()?'<p>On iPhone or iPad: open Ledger in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>':'<p>On your phone: open Ledger in Chrome, then choose <b>Install app</b> (or <b>Add to Home screen</b>) from the ⋮ menu.</p>';
  return `<div class="card settings-card" id="pwa-card"><div class="card-head"><div><h2>Ledger on your phone</h2><p class="sub">Install Ledger as an app: it opens full screen from your home screen, with <b>Add</b> for UPI messages and bill photos.</p></div></div><div class="settings-body">${how}<p class="sub">On Android, an installed Ledger appears when you share: share a bank SMS or a bill photo straight to it.</p></div></div>`;
 }
 function bind(){
  const button=document.querySelector('#install-app');
  if(button)button.onclick=async()=>{const prompt=window.__ledgerInstall;if(!prompt)return;prompt.prompt();await prompt.userChoice.catch(()=>{});window.__ledgerInstall=null;const el=document.querySelector('#pwa-card');if(el){el.outerHTML=card();bind();}};
 }
 window.addEventListener('ledger-installable',()=>{const el=document.querySelector('#pwa-card');if(el){el.outerHTML=card();bind();}});
 return {card,bind};
}
