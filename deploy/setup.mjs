import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const content=`APP_ORIGIN=http://localhost:5800\nSITE_ADDRESS=:80\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nAUTH_SECRET=${randomBytes(48).toString('hex')}\nSMTP_HOST=mailpit\nSMTP_PORT=1025\nSMTP_SECURE=false\nMAIL_FROM=Ledger <noreply@ledger.local>\n`;
try{writeFileSync(new URL('../.env',import.meta.url),content,{flag:'wx',mode:0o600});console.log('Created private .env with unique local secrets. Start: sudo docker compose --profile local up -d --build');}
catch(e){if(e.code==='EEXIST'){console.log('.env already exists; preserved existing settings.');}else throw e;}
