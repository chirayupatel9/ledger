// Server-side deployment. The production server asks GitHub which is the newest commit on main whose "Ledger checks"
// run passed, and deploys it with deploy/deploy.sh --ci. A systemd timer runs this every few minutes
// (deploy/install-pull-deploy.sh); nothing on the server takes jobs from GitHub, so pull requests cannot reach it.
//   node deploy/pull-deploy.mjs            deploy if main has a newer commit that passed CI
//   node deploy/pull-deploy.mjs --dry-run  only say what it would do
//   node deploy/pull-deploy.mjs --retry    try again a commit whose deploy already failed
// Each commit is tried once: a failed deploy (deploy.sh rolls back and sends the phone alert) is not repeated every few
// minutes. Push a fix, or run with --retry once the cause is gone.
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const sha=/^[0-9a-f]{40}$/;

// The newest successful run of the workflow for a push to main of this repository, from GitHub's list of runs.
export function latestPassing(body,{repo,branch='main'}){
 const run=(body?.workflow_runs||[]).find(r=>r.event==='push'&&r.head_branch===branch&&r.status==='completed'&&r.conclusion==='success'&&r.repository?.full_name===repo&&sha.test(r.head_sha||''));
 return run?{sha:run.head_sha,run:run.run_number}:null;
}

// Whether to deploy the candidate, given what production runs and what was last tried.
export function decide({candidate,deployed,attempted,includedInDeployed,retry=false}){
 if(!candidate)return {deploy:false,reason:'No push to main has passed CI yet.'};
 if(candidate===deployed)return {deploy:false,reason:`Production runs ${candidate}, the newest commit that passed CI.`};
 if(includedInDeployed)return {deploy:false,reason:`Production runs ${deployed}, which already includes ${candidate}.`};
 if(candidate===attempted&&!retry)return {deploy:false,reason:`Deploying ${candidate} failed; not trying it again by itself. Push a fix, or run node deploy/pull-deploy.mjs --retry.`};
 return {deploy:true,reason:`Deploying ${candidate}.`};
}

async function main(){
 const env=process.env,args=process.argv.slice(2),dry=args.includes('--dry-run'),retry=args.includes('--retry');
 const repo=env.LEDGER_REPO||'chirayupatel9/ledger',dir=env.LEDGER_DIR||'/home/chirayu/code/ledger-selfhost';
 const state=env.LEDGER_DEPLOY_STATE||join(homedir(),'.local/state/ledger-deploy'),api=env.LEDGER_GITHUB_API||'https://api.github.com';
 const log=m=>console.log(`${new Date().toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'})} IST  ${m}`);
 const read=f=>{try{return readFileSync(join(state,f),'utf8').trim();}catch{return '';}};
 const write=(f,v)=>{mkdirSync(state,{recursive:true});writeFileSync(join(state,f),v+'\n');};
 // A timer runs this every few minutes: say each outcome once, not on every run.
 const note=m=>{if(dry||read('last-note')!==m){log(m);if(!dry)write('last-note',m);}};
 const git=(...a)=>spawnSync('git',['-C',dir,...a],{encoding:'utf8'});

 let body;
 try{
  const r=await fetch(`${api}/repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=5`,{headers:{Accept:'application/vnd.github+json','User-Agent':'ledger-pull-deploy'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`GitHub answered ${r.status}${r.headers.get('x-ratelimit-remaining')==='0'?' (hourly request limit reached; it resets within the hour)':''}`);
  body=await r.json();
 }catch(e){note(`Could not ask GitHub which commit passed CI: ${e.message}`);return 1;}

 const candidate=latestPassing(body,{repo}),deployed=read('deployed'),attempted=read('attempted');
 const included=!!candidate&&sha.test(deployed)&&candidate.sha!==deployed&&git('merge-base','--is-ancestor',candidate.sha,deployed).status===0;
 const step=decide({candidate:candidate?.sha,deployed,attempted,includedInDeployed:included,retry});
 if(!step.deploy){note(step.reason);return 0;}
 if(dry){log(`Would deploy ${candidate.sha} (CI run #${candidate.run} passed).`);return 0;}

 // Run the deploy script of the commit being deployed, from a copy: deploy.sh fast-forwards this checkout, and bash
 // must not read a script that changes under it.
 if(git('fetch','-q','origin','main').status!==0){note('Could not fetch origin/main.');return 1;}
 // Defence in depth: only ever run a commit that is actually on origin/main, before reading its deploy script.
 // GitHub's answer is already filtered to push-to-main runs, and deploy.sh checks this too, but verify it here as well.
 if(git('merge-base','--is-ancestor',candidate.sha,'origin/main').status!==0){note(`${candidate.sha} is not on origin/main; not deploying.`);return 1;}
 const script=git('show',`${candidate.sha}:deploy/deploy.sh`);
 if(script.status!==0){note(`${candidate.sha} has no deploy/deploy.sh.`);return 1;}
 write('attempted',candidate.sha);write('last-note','');
 const copy=join(state,'deploy-run.sh');writeFileSync(copy,script.stdout,{mode:0o700});
 log(`CI run #${candidate.run} passed for ${candidate.sha}; deploying it.`);
 const run=spawnSync('bash',[copy,'--ci',candidate.sha],{cwd:dir,stdio:'inherit',env:{...env,LEDGER_DIR:dir,LEDGER_DEPLOY_STATE:state}});
 rmSync(copy,{force:true});
 return run.status??1;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href)process.exitCode=await main();
