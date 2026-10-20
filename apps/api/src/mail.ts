import nodemailer from 'nodemailer';
import { pool, transaction } from './database.js';
import { config } from './config.js';
// Reserved test domains (.test, .invalid, .example, .localhost) can never receive mail: record the message but never send it.
export const reservedAddress=(email: string)=>/\.(?:test|invalid|example|localhost)$/i.test(email.split('@')[1]||'');
// Every email has a plain-text body and, from packages/domain/emails.js, a branded HTML version.
export async function enqueueEmail(to: string, {subject,text,html}:{subject:string;text:string;html?:string}, {suppress=false}={}) {
  await pool.query('INSERT INTO mail_outbox(recipient,subject,body,html,suppressed) VALUES ($1,$2,$3,$4,$5)', [to,subject,text,html||null,suppress||reservedAddress(to)]);
}
export function startMailer() {
  const transport = nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,
    auth:config.smtpUser?{user:config.smtpUser,pass:config.smtpPassword}:undefined,
    connectionTimeout:10000,socketTimeout:15000,requireTLS:!config.local&&!config.smtpSecure});
  let running=false;
  const timer=setInterval(async()=>{if(running)return;running=true;
    try { await transaction(async client=>{
      const {rows}=await client.query('SELECT * FROM mail_outbox WHERE NOT suppressed AND next_attempt <= now() AND attempts < 8 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1');
      const mail=rows[0];if(!mail)return;
      try {await transport.sendMail({from:config.mailFrom,to:mail.recipient,subject:mail.subject,text:mail.body,...(mail.html?{html:mail.html}:{})});await client.query('DELETE FROM mail_outbox WHERE id=$1',[mail.id]);}
      catch {await client.query("UPDATE mail_outbox SET attempts=attempts+1,next_attempt=now()+interval '1 minute' * power(2,attempts) WHERE id=$1",[mail.id]);console.error('Email delivery failed; queued for retry');}
    }); } catch {console.error('Email queue unavailable');} finally {running=false;}
  },1500);timer.unref();return ()=>{clearInterval(timer);transport.close()};
}
