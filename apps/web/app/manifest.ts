import type {MetadataRoute} from 'next';
// Ledger as a phone app: installable, with an Add shortcut, and (on Android) a share target for UPI messages and bill
// photos. public/sw.js receives the shared items; app/share/route.ts answers if the service worker is not running yet.
export default function manifest():MetadataRoute.Manifest{
 return {name:'Ledger',short_name:'Ledger',description:'Your private workspace for bank statements, SIPs and bookkeeping.',id:'/',start_url:'/',scope:'/',display:'standalone',orientation:'portrait',
  background_color:'#f5f6f3',theme_color:'#173b32',categories:['finance','productivity'],
  icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],
  shortcuts:[{name:'Add a UPI message or bill',short_name:'Add',url:'/?capture=1',icons:[{src:'/icons/icon-192.png',sizes:'192x192'}]},{name:'Transactions',url:'/transactions'},{name:'Investments',url:'/investments'}],
  share_target:{action:'/share',method:'POST',enctype:'multipart/form-data',params:{title:'title',text:'text',url:'url',files:[{name:'files',accept:['image/jpeg','image/png','image/webp','image/*','application/pdf','.pdf']}]}},
 } as MetadataRoute.Manifest;
}
