import nodemailer from 'nodemailer';
import { pool, transaction } from './database.js';
import { config } from './config.js';
export async function enqueueMail(to: string, subject: string, url: string) {
  await pool.query('INSERT INTO mail_outbox(recipient,subject,body) VALUES ($1,$2,$3)', [to,subject,`${subject}\n\nOpen this link to continue:\n${url}\n\nIf you did not request this, ignore this email.`]);
}
export function startMailer() {
  const transport = nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,
    auth:config.smtpUser?{user:config.smtpUser,pass:config.smtpPassword}:undefined,
    connectionTimeout:10000,socketTimeout:15000,requireTLS:!config.local&&!config.smtpSecure});
  let running=false;
  const timer=setInterval(async()=>{if(running)return;running=true;
    try { await transaction(async client=>{
      const {rows}=await client.query('SELECT * FROM mail_outbox WHERE next_attempt <= now() AND attempts < 8 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1');
      const mail=rows[0];if(!mail)return;
      try {await transport.sendMail({from:config.mailFrom,to:mail.recipient,subject:mail.subject,text:mail.body});await client.query('DELETE FROM mail_outbox WHERE id=$1',[mail.id]);}
      catch {await client.query("UPDATE mail_outbox SET attempts=attempts+1,next_attempt=now()+interval '1 minute' * power(2,attempts) WHERE id=$1",[mail.id]);console.error('Email delivery failed; queued for retry');}
    }); } catch {console.error('Email queue unavailable');} finally {running=false;}
  },1500);timer.unref();return ()=>{clearInterval(timer);transport.close()};
}
