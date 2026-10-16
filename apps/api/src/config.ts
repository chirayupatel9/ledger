const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`${key} is required`); return value; };
const origin = required('APP_ORIGIN');
if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
if (!local && !origin.startsWith('https://')) throw new Error('Public deployments require HTTPS');
const secret = required('AUTH_SECRET');
if (secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 random characters');
const mailEnabled = process.env.MAIL_DELIVERY_ENABLED !== 'false';
// Email can be on for password resets while public signup stays closed.
const signupEnabled = mailEnabled && process.env.SIGNUP_ENABLED === 'true';
if (mailEnabled && !local && (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD)) throw new Error('Configure production SMTP credentials before public deployment');
export const config = {
  origin, secret, local, mailEnabled, signupEnabled, databaseURL: required('DATABASE_URL'),
  port: Number(process.env.PORT || 3001), smtpHost: required('SMTP_HOST'),
  smtpPort: Number(process.env.SMTP_PORT || 587), smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD,
  mailFrom: required('MAIL_FROM'), googleId: process.env.GOOGLE_CLIENT_ID, googleSecret: process.env.GOOGLE_CLIENT_SECRET,
};
