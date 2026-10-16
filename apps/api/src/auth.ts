import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { pool } from './database.js';
import { config } from './config.js';
import { enqueueMail } from './mail.js';
export const auth=betterAuth({
  appName:'Ledger',baseURL:config.origin,secret:config.secret,database:pool,trustedOrigins:[config.origin],
  disabledPaths:config.mailEnabled?(config.signupEnabled?[]:['/sign-up/email']):['/sign-up/email','/request-password-reset','/reset-password','/send-verification-email','/verify-email'],
  emailAndPassword:{enabled:true,disableSignUp:!config.signupEnabled,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,
    revokeSessionsOnPasswordReset:true,sendResetPassword:config.mailEnabled?async({user,url})=>enqueueMail(user.email,'Reset your Ledger password',url):undefined},
  emailVerification:{sendOnSignUp:config.signupEnabled,sendOnSignIn:config.mailEnabled,autoSignInAfterVerification:false,
    sendVerificationEmail:config.mailEnabled?async({user,url})=>enqueueMail(user.email,'Verify your Ledger email',url):undefined},
  socialProviders:config.googleId&&config.googleSecret?{google:{clientId:config.googleId,clientSecret:config.googleSecret}}:{},
  account:{accountLinking:{enabled:false}},
  // Opt-in TOTP with backup codes; failed codes lock the account after repeated attempts.
  plugins:[twoFactor({issuer:'Ledger',trustDeviceMaxAge:60*60*24*30})],
  session:{expiresIn:60*60*24*7,updateAge:60*60*12,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:100,customRules:{
    '/sign-in/email':{window:60,max:10},'/sign-up/email':{window:60,max:5},'/request-password-reset':{window:60,max:5}}},
  advanced:{useSecureCookies:config.origin.startsWith('https://'),ipAddress:{ipAddressHeaders:['x-real-ip']},
    defaultCookieAttributes:{httpOnly:true,sameSite:'lax'}},
});
