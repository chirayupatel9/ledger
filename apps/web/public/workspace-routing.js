export const sections=['overview','accounts','transactions','statements','categories','reports'];
export function readWorkspaceLocation(pathname,search=''){
 const section=pathname.replace(/^\//,'');
 const query=new URLSearchParams(search);
 const account=query.get('account')||'all',period=query.get('period')||'all';
 return {page:sections.includes(section)?section:'overview',account:/^[a-zA-Z0-9_-]{1,100}$/.test(account)?account:'all',period:/^(all|fy-\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(period)?period:'all'};
}
export function workspaceURL(page,account='all',period='all'){
 const query=new URLSearchParams();
 if(account!=='all')query.set('account',account);
 if(period!=='all')query.set('period',period);
 return (sections.includes(page)&&page!=='overview'?'/'+page:'/')+(query.size?'?'+query:'');
}
// Only known workspace paths and filter parameters can be login destinations.
export function safeReturnTo(value){
 if(typeof value!=='string'||!/^\/(?:accounts|transactions|statements|categories|reports)?(?:\?|$)/.test(value))return '/';
 const url=new URL(value,'https://ledger.invalid');
 if(url.origin!=='https://ledger.invalid')return '/';
 const route=readWorkspaceLocation(url.pathname,url.search);
 return workspaceURL(route.page,route.account,route.period);
}
