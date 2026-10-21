import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
// Opt-in TOTP with backup codes; failed codes lock the account after repeated attempts.
export const twoFactorPlugin=twoFactor({issuer:'Ledger',trustDeviceMaxAge:60*60*24*30});
// The plugin only asks for the code after a password sign-in. Google creates its session in /callback/google (or in
// /sign-in/social when given a Google ID token), so the plugin's own check runs there too: for an account with two-step
// verification on, it removes the new session and starts the same pending sign-in (short-lived cookie, attempt limit,
// trusted devices skip it) that /two-factor/verify-totp and /verify-backup-code finish. The callback is a browser
// redirect, so its answer becomes a redirect to the code form.
const [challenge]=twoFactorPlugin.hooks.after;
export const googleTwoFactor={id:'google-two-factor',hooks:{after:[
  {matcher:ctx=>ctx.path==='/callback/:id'||ctx.path==='/sign-in/social',handler:challenge.handler},
  {matcher:ctx=>ctx.path==='/callback/:id',handler:createAuthMiddleware(async ctx=>{
    if((ctx.context.returned as {twoFactorRedirect?:boolean}|undefined)?.twoFactorRedirect)throw ctx.redirect('/login?twofactor=1');})},
]}} satisfies BetterAuthPlugin;
