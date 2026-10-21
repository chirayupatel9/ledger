// Something shared to Ledger before its service worker is running (the first launch after installing): ask to share
// again. Normally public/sw.js answers POST /share itself and keeps the shared item on the device.
export function POST(){return new Response(null,{status:303,headers:{Location:'/?shared=unavailable','Cache-Control':'no-store'}});}
export function GET(){return new Response(null,{status:303,headers:{Location:'/','Cache-Control':'no-store'}});}
