// Push alerts through ntfy when the public site, the daily backup, the backup-drive copy or disk space fail,
// and again when they recover. Messages name the failing check only, never financial data.
// A machine that has lost power or network cannot report itself; that needs a check from elsewhere.
import {readdirSync,statSync,statfsSync} from 'node:fs';
const ntfy=process.env.NTFY_URL,site=process.env.APP_ORIGIN,hours=Number(process.env.BACKUP_INTERVAL_HOURS||24),drive=process.env.OFFSITE_DIR||'';
const every=Number(process.env.MONITOR_INTERVAL_MINUTES||5)*60000,remindAfter=12*3600000,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const newest=(dir,pattern)=>{try{return Math.max(0,...readdirSync(dir).filter(f=>pattern.test(f)).map(f=>statSync(`${dir}/${f}`).mtimeMs));}catch{return -1;}};
const freePercent=dir=>{try{const s=statfsSync(dir);return s.bavail/s.blocks*100;}catch{return null;}};
const fresh=t=>t>Date.now()-(hours+2)*3600000;
// Each check returns true when healthy, or a short reason.
const checks=[
 {id:'site',label:'Website',run:async()=>{for(let i=0;i<3;i++){try{if((await fetch(site+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)})).ok)return true;}catch{}await sleep(20000);}return `${site} is not responding.`;}},
 {id:'backup',label:'Daily backup',run:()=>fresh(newest('/backups',/^scheduled-.*\.dump$/))||`No new backup in over ${hours} hours. Check: sudo docker compose logs backup`},
 {id:'drive',label:'Backup drive copy',skip:!drive,run:()=>{const t=newest(drive,/^scheduled-.*\.dump(?:\.gpg)?$/);return t<0?'The backup drive is not mounted. Plug it in; copies catch up automatically.':fresh(t)||`No copy on the backup drive in over ${hours} hours.`;}},
 {id:'disk',label:'Server disk space',run:()=>{const f=freePercent('/backups');return f===null||f>=10||`Only ${f.toFixed(0)}% free on the server disk.`;}},
 {id:'drive-space',label:'Backup drive space',skip:!drive,run:()=>{const f=freePercent(drive);return f===null||f>=10||`Only ${f.toFixed(0)}% free on the backup drive.`;}},
];
async function notify(title,message,failing){
 try{const r=await fetch(ntfy,{method:'POST',body:message,headers:{Title:title,Priority:failing?'high':'default',Tags:failing?'warning':'white_check_mark'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(String(r.status));return true;}
 catch{console.error('Could not reach ntfy; will retry next check');return false;}
}
const state=new Map();
async function tick(){
 for(const c of checks){if(c.skip)continue;let result;try{result=await c.run();}catch(e){result=String(e.message||e);}
  const failing=result!==true,s=state.get(c.id)||{failing:false,sent:0};
  if(failing&&(!s.failing||Date.now()-s.sent>remindAfter)){if(await notify(`Ledger: ${c.label} needs attention`,result,true))s.sent=Date.now();}
  else if(!failing&&s.failing)await notify(`Ledger: ${c.label} is OK again`,`${c.label} has recovered.`,false);
  if(failing!==s.failing)console.log(new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),'IST',c.id,failing?'failing: '+result:'recovered');
  state.set(c.id,{...s,failing});
 }
}
if(process.argv[2]==='test'){process.exit(await notify('Ledger alerts are set up','You will get a message here if the website, backups or the backup drive need attention.',false)?0:1);}
if(!ntfy){console.log('NTFY_URL is not set; alerts are off.');await new Promise(()=>{});}
console.log(`Monitoring ${checks.filter(c=>!c.skip).map(c=>c.id).join(', ')} every ${every/60000} minutes.`);
for(;;){await tick();await sleep(every);}
