import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';

// Google sign-in for an account with two-step verification on: the real Better Auth pipeline with Ledger's two-step
// plugins (two-factor.ts) and account linking, on an in-memory database, with Google's token endpoint answered locally.
// The callback is the one a browser reaches after Google consent.
const api=createRequire(new URL('../apps/api/package.json',import.meta.url)),load=name=>import(pathToFileURL(api.resolve(name)));
const [{betterAuth},{memoryAdapter},{twoFactorPlugin,googleTwoFactor}]=await Promise.all([load('better-auth'),load('better-auth/adapters/memory'),import('../apps/api/dist/apps/api/src/two-factor.js')]);
const origin='http://localhost:5800',db={user:[],session:[],account:[],verification:[],twoFactor:[]};
const auth=betterAuth({appName:'Ledger',baseURL:origin,secret:randomBytes(32).toString('hex'),database:memoryAdapter(db),trustedOrigins:[origin],
 emailAndPassword:{enabled:true},rateLimit:{enabled:false},plugins:[twoFactorPlugin,googleTwoFactor],
 account:{accountLinking:{enabled:true,trustedProviders:[],requireLocalEmailVerified:true,allowDifferentEmails:false}},
 socialProviders:{google:{clientId:'test-client',clientSecret:'test-secret',verifyIdToken:async()=>true}}});

// Google's answer: an ID token for whichever address is signing in. Any other outgoing request fails the test.
let googleEmail='';
const part=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken=email=>[part({alg:'RS256',typ:'JWT'}),part({iss:'https://accounts.google.com',aud:'test-client',sub:'google-'+email,email,email_verified:true,name:'Google QA',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
globalThis.fetch=async url=>{if(String(url)!=='https://oauth2.googleapis.com/token')throw Error('Unexpected request to '+url);return Response.json({access_token:'google-access',token_type:'Bearer',expires_in:3600,id_token:idToken(googleEmail)});};

function totp(uri,offset=0){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of new URL(uri).searchParams.get('secret').replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offset));const h=createHmac('sha1',key).update(counter).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');}
// A browser: keeps cookies (an expired one is dropped) and does not follow redirects.
function browser(){const jar=new Map();return {jar,async request(path,{method='GET',body}={}){
 const res=await auth.handler(new Request(origin+path,{method,headers:{origin,...(jar.size?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
 const cookies=res.headers.getSetCookie();
 for(const cookie of cookies){const [pair,...attributes]=cookie.split(';'),i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);if(!value||attributes.some(a=>/^\s*max-age=0\s*$/i.test(a)))jar.delete(name);else jar.set(name,value);}
 const text=await res.text();let data=null;try{data=JSON.parse(text)}catch{}
 return {status:res.status,location:res.headers.get('location'),cookies,data};
}};}
const signedIn=async b=>(await b.request('/api/auth/get-session')).data?.user?.email;
async function google(b,email){googleEmail=email;
 const start=await b.request('/api/auth/sign-in/social',{method:'POST',body:{provider:'google',callbackURL:'/',errorCallbackURL:'/login?via=google'}});assert.equal(start.status,200);
 return b.request('/api/auth/callback/google?code=consent&state='+new URL(start.data.url).searchParams.get('state'));}
async function account(email){const password=randomBytes(18).toString('base64url'),b=browser();
 assert.equal((await b.request('/api/auth/sign-up/email',{method:'POST',body:{email,password,name:'Google QA'}})).status,200);
 db.user.find(u=>u.email===email).emailVerified=true;return {email,password};}
const sessionsOf=email=>db.session.filter(s=>s.userId===db.user.find(u=>u.email===email).id).length;

const plain=await account('google-plain@example.test'),guarded=await account('google-guarded@example.test');let uri,backupCodes;
test.before(async()=>{
 const b=browser();assert.equal((await b.request('/api/auth/sign-in/email',{method:'POST',body:guarded})).status,200);
 ({totpURI:uri,backupCodes}=(await b.request('/api/auth/two-factor/enable',{method:'POST',body:{password:guarded.password}})).data);
 assert.equal((await b.request('/api/auth/two-factor/verify-totp',{method:'POST',body:{code:totp(uri)}})).status,200);
 assert.equal(db.user.find(u=>u.email===guarded.email).twoFactorEnabled,true);
});

test('Ledger uses the Google two-step check alongside the two-factor plugin',()=>{
 assert.match(readFileSync(new URL('../apps/api/src/auth.ts',import.meta.url),'utf8'),/plugins:\[twoFactorPlugin,googleTwoFactor\]/);
});

test('Google sign-in without two-step verification signs straight in',async()=>{
 const b=browser(),res=await google(b,plain.email);
 assert.equal(res.status,302);assert.equal(res.location,'/');assert.equal(await signedIn(b),plain.email);
});

test('Google sign-in for a two-step account leaves no session and asks for the code',async()=>{
 const before=sessionsOf(guarded.email),b=browser(),res=await google(b,guarded.email);
 assert.equal(res.status,302);assert.equal(res.location,'/login?twofactor=1');
 const session=res.cookies.filter(c=>c.startsWith('better-auth.session_token='));
 assert.ok(session.length&&session.every(c=>/^better-auth\.session_token=;/.test(c)&&/Max-Age=0/i.test(c)),'only an expired session cookie is sent, never the new token');
 assert.equal(sessionsOf(guarded.email),before,'the session the callback created is deleted');
 assert.equal(await signedIn(b),undefined);assert.ok(b.jar.has('better-auth.two_factor'),'pending two-step sign-in');
 assert.equal(db.account.filter(a=>a.providerId==='google'&&a.userId===db.user.find(u=>u.email===guarded.email).id).length,1,'Google is linked to the account');
 // The code form finishes it, like a password sign-in: a wrong code is refused, the right one signs in.
 const wrong=await b.request('/api/auth/two-factor/verify-totp',{method:'POST',body:{code:totp(uri,5)}});assert.equal(wrong.status,401);assert.equal(await signedIn(b),undefined);
 assert.equal((await b.request('/api/auth/two-factor/verify-totp',{method:'POST',body:{code:totp(uri)}})).status,200);assert.equal(await signedIn(b),guarded.email);
});

test('a backup code also finishes a Google sign-in',async()=>{
 const b=browser();assert.equal((await google(b,guarded.email)).location,'/login?twofactor=1');
 assert.equal((await b.request('/api/auth/two-factor/verify-backup-code',{method:'POST',body:{code:backupCodes[0]}})).status,200);assert.equal(await signedIn(b),guarded.email);
});

test('a trusted device skips the code after Google sign-in, as after a password',async()=>{
 const b=browser();await google(b,guarded.email);
 assert.equal((await b.request('/api/auth/two-factor/verify-totp',{method:'POST',body:{code:totp(uri),trustDevice:true}})).status,200);
 const trusted=b.jar.get('better-auth.trust_device');assert.ok(trusted);
 assert.equal((await b.request('/api/auth/sign-out',{method:'POST',body:{}})).status,200);assert.equal(await signedIn(b),undefined);
 const res=await google(b,guarded.email);assert.equal(res.status,302);assert.equal(res.location,'/');assert.equal(await signedIn(b),guarded.email);
 assert.ok(b.jar.get('better-auth.trust_device')&&b.jar.get('better-auth.trust_device')!==trusted,'the trust is renewed');
 // Another device is still asked.
 assert.equal((await google(browser(),guarded.email)).location,'/login?twofactor=1');
});

test('Google ID-token sign-in and password sign-in are challenged too',async()=>{
 const b=browser(),res=await b.request('/api/auth/sign-in/social',{method:'POST',body:{provider:'google',idToken:{token:idToken(guarded.email)}}});
 assert.equal(res.status,200);assert.equal(res.data.twoFactorRedirect,true);assert.equal(res.data.token,undefined);assert.equal(await signedIn(b),undefined);
 const plainToken=await browser().request('/api/auth/sign-in/social',{method:'POST',body:{provider:'google',idToken:{token:idToken(plain.email)}}});assert.equal(typeof plainToken.data.token,'string');
 const password=browser(),login=await password.request('/api/auth/sign-in/email',{method:'POST',body:guarded});
 assert.equal(login.data.twoFactorRedirect,true);assert.equal(await signedIn(password),undefined);
});
