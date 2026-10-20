const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`${key} is required`); return value; };
const origin = required('APP_ORIGIN');
if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
if (!local && !origin.startsWith('https://')) throw new Error('Public deployments require HTTPS');
const secret = required('AUTH_SECRET');
if (secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 random characters');
const mailEnabled = process.env.MAIL_DELIVERY_ENABLED !== 'false';
// Email can be on for password resets while sign-up stays closed. SIGNUP_MODE: closed (default), invite (allow-list) or open.
const signupMode = (process.env.SIGNUP_MODE || (process.env.SIGNUP_ENABLED === 'true' ? 'open' : 'closed')) as 'closed' | 'invite' | 'open';
if (!['closed', 'invite', 'open'].includes(signupMode)) throw new Error('SIGNUP_MODE must be closed, invite or open');
const signupEnabled = mailEnabled && signupMode !== 'closed';
// Where reports of statements that could not be read are emailed (optional).
const importAlertEmail = (process.env.IMPORT_ALERT_EMAIL || '').trim();
if (importAlertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(importAlertEmail)) throw new Error('IMPORT_ALERT_EMAIL must be an email address');
if (mailEnabled && !local && (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD)) throw new Error('Configure production SMTP credentials before public deployment');
export const config = {
  origin, secret, local, mailEnabled, signupMode, signupEnabled, importAlertEmail, databaseURL: required('DATABASE_URL'),
  port: Number(process.env.PORT || 3001), smtpHost: required('SMTP_HOST'),
  smtpPort: Number(process.env.SMTP_PORT || 587), smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD,
  mailFrom: required('MAIL_FROM'), googleId: process.env.GOOGLE_CLIENT_ID, googleSecret: process.env.GOOGLE_CLIENT_SECRET,
};
