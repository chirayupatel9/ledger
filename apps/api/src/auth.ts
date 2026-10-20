import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { pool } from './database.js';
import { config } from './config.js';
import { enqueueMail } from './mail.js';
const notInvited=()=>new APIError('FORBIDDEN',{code:'NOT_INVITED',message:'Sign-up is by invitation. This email address has not been invited.'});
const invited=async(email:string)=>!!(await pool.query('SELECT 1 FROM signup_invites WHERE email=$1',[email.trim().toLowerCase()])).rowCount;
export const auth=betterAuth({
  appName:'Ledger',baseURL:config.origin,secret:config.secret,database:pool,trustedOrigins:[config.origin],
  disabledPaths:config.mailEnabled?(config.signupEnabled?[]:['/sign-up/email']):['/sign-up/email','/request-password-reset','/reset-password','/send-verification-email','/verify-email'],
  emailAndPassword:{enabled:true,disableSignUp:!config.signupEnabled,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,
    revokeSessionsOnPasswordReset:true,sendResetPassword:config.mailEnabled?async({user,url})=>enqueueMail(user.email,'Reset your Ledger password',url):undefined},
  emailVerification:{sendOnSignUp:config.signupEnabled,sendOnSignIn:config.mailEnabled,autoSignInAfterVerification:false,
    sendVerificationEmail:config.mailEnabled?async({user,url})=>enqueueMail(user.email,'Verify your Ledger email',url):undefined},
  socialProviders:config.googleId&&config.googleSecret?{google:{clientId:config.googleId,clientSecret:config.googleSecret,disableSignUp:config.signupMode==='closed'}}:{},
  account:{accountLinking:{enabled:false}},
  // Better Auth answers failed sign-ups with a decoy success (so emails cannot be probed); tell uninvited people plainly instead.
  hooks:{before:createAuthMiddleware(async ctx=>{if(ctx.path==='/sign-up/email'&&config.signupMode==='invite'&&!await invited(String(ctx.body?.email||'')))throw notInvited();})},
  // The sign-up mode is enforced where every new account is created (email or Google), not just on the form.
  // Operator-provisioned accounts (create-account.ts) are written directly and skip this.
  databaseHooks:{user:{create:{
    before:async(user)=>{if(config.signupMode==='closed')throw new APIError('FORBIDDEN',{code:'SIGNUP_CLOSED',message:'New accounts are not being created.'});if(config.signupMode==='invite'&&!await invited(user.email))throw notInvited();return {data:user};},
    after:async(user)=>{await pool.query('UPDATE signup_invites SET accepted_at=now() WHERE email=lower($1) AND accepted_at IS NULL',[user.email]);},
  }}},
  // Opt-in TOTP with backup codes; failed codes lock the account after repeated attempts.
  plugins:[twoFactor({issuer:'Ledger',trustDeviceMaxAge:60*60*24*30})],
  session:{expiresIn:60*60*24*7,updateAge:60*60*12,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:100,customRules:{
    '/sign-in/email':{window:60,max:10},'/sign-up/email':{window:60,max:5},'/request-password-reset':{window:60,max:5}}},
  advanced:{useSecureCookies:config.origin.startsWith('https://'),ipAddress:{ipAddressHeaders:['x-real-ip']},
    defaultCookieAttributes:{httpOnly:true,sameSite:'lax'}},
});
