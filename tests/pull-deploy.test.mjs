import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {execFile,execFileSync} from 'node:child_process';
import {latestPassing,decide} from '../deploy/pull-deploy.mjs';

const repo='chirayupatel9/ledger',a='a'.repeat(40),b='b'.repeat(40);
const run=(over={})=>({event:'push',head_branch:'main',status:'completed',conclusion:'success',repository:{full_name:repo},head_sha:a,run_number:7,...over});

test('only a successful push run on main of this repository counts, newest first',()=>{
 assert.deepEqual(latestPassing({workflow_runs:[run({event:'pull_request',head_sha:b}),run({head_branch:'feature',head_sha:b}),run({conclusion:'failure',head_sha:b}),run({repository:{full_name:'someone/fork'},head_sha:b}),run({head_sha:'not-a-sha'}),run(),run({head_sha:b,run_number:6})]},{repo}),{sha:a,run:7});
 assert.equal(latestPassing({workflow_runs:[]},{repo}),null);
 assert.equal(latestPassing({message:'API rate limit exceeded'},{repo}),null);
});

test('deploys a new passing commit once; never an older one, and never retries a failure by itself',()=>{
 assert.equal(decide({candidate:undefined}).deploy,false);
 assert.equal(decide({candidate:a,deployed:a}).deploy,false);
 assert.equal(decide({candidate:a,deployed:b,includedInDeployed:true}).deploy,false,'production already runs something newer');
 assert.equal(decide({candidate:a,deployed:b,attempted:a}).deploy,false,'already failed once');
 assert.equal(decide({candidate:a,deployed:b,attempted:a,retry:true}).deploy,true);
 assert.equal(decide({candidate:a,deployed:`${b}-dirty`}).deploy,true);
 assert.equal(decide({candidate:a,deployed:''}).deploy,true);
});

// End to end: the real script against a fake GitHub API and a throwaway git repository whose deploy/deploy.sh only
// records what it was asked to deploy (and fails while a "fail" file exists).
test('the timer script deploys what passed CI, once, through the deploy script of that commit',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ledger-pull-deploy-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 // Git ignores this machine's own settings (signing, filters, URL rewrites), so the sandbox behaves the same everywhere.
 const env={...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_COUNT:'0',GIT_AUTHOR_NAME:'T',GIT_AUTHOR_EMAIL:'t@example.test',GIT_COMMITTER_NAME:'T',GIT_COMMITTER_EMAIL:'t@example.test'};
 const git=(cwd,...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8'}).trim();
 const origin=join(root,'origin.git'),work=join(root,'work'),state=join(root,'state');
 git(root,'init','-q','--bare',origin);git(root,'clone','-q',origin,work);git(work,'checkout','-q','-b','main');mkdirSync(join(work,'deploy'));
 const commit=label=>{writeFileSync(join(work,'deploy/deploy.sh'),`#!/bin/sh\n# ${label}\necho "${label} $*" >> "$LEDGER_DEPLOY_STATE/calls"\n[ -f "$LEDGER_DEPLOY_STATE/fail" ] && exit 1\necho "$2" > "$LEDGER_DEPLOY_STATE/deployed"\n`);git(work,'add','-A');git(work,'commit','-qm',label);git(work,'push','-q','origin','main');return git(work,'rev-parse','HEAD');};
 const first=commit('first');
 let runs=[run({head_sha:first,run_number:1})];const requests=[];
 const server=createServer((req,res)=>{requests.push(req.url);res.setHeader('content-type','application/json');res.end(JSON.stringify({workflow_runs:runs}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const pull=(...args)=>new Promise(done=>execFile(process.execPath,[resolve('deploy/pull-deploy.mjs'),...args],{env:{...env,HOME:root,LEDGER_DIR:work,LEDGER_DEPLOY_STATE:state,LEDGER_GITHUB_API:`http://127.0.0.1:${server.address().port}`}},(e,stdout)=>done({code:e?e.code:0,stdout})));
 const calls=()=>existsSync(join(state,'calls'))?readFileSync(join(state,'calls'),'utf8').trim().split('\n'):[];
 const file=f=>readFileSync(join(state,f),'utf8').trim();

 assert.equal((await pull()).code,0);
 assert.deepEqual(calls(),[`first --ci ${first}`],'the commit\'s own deploy.sh ran once, for that commit');
 assert.match(requests[0],/\/repos\/chirayupatel9\/ledger\/actions\/workflows\/ci\.yml\/runs\?branch=main&event=push&status=success/);
 assert.equal(file('deployed'),first);
 assert.equal((await pull()).code,0);assert.equal(calls().length,1,'nothing new: nothing deployed');

 const second=commit('second');runs=[run({head_sha:second,run_number:2}),...runs];writeFileSync(join(state,'fail'),'');
 assert.equal((await pull()).code,1,'a failed deploy fails the timer run');
 assert.equal(calls().length,2);assert.equal(file('deployed'),first);assert.equal(file('attempted'),second);
 const quiet=await pull();assert.equal(quiet.code,0);assert.equal(calls().length,2,'a failed commit is not retried by itself');
 assert.match(quiet.stdout,/not trying it again/);
 assert.equal((await pull()).stdout,'','the same outcome is reported once, not on every run');
 rmSync(join(state,'fail'));
 assert.equal((await pull('--retry')).code,0);assert.deepEqual(calls().at(-1),`second --ci ${second}`);assert.equal(file('deployed'),second);

 runs=[run({head_sha:first,run_number:3})];
 assert.equal((await pull()).code,0);assert.equal(calls().length,3,'never goes back to an older commit');
 const third=commit('third');runs=[run({head_sha:third,run_number:4})];
 assert.match((await pull('--dry-run')).stdout,new RegExp(`Would deploy ${third}`));assert.equal(calls().length,3,'a dry run deploys nothing');
 runs=[run({head_sha:third,event:'pull_request'})];
 assert.equal((await pull()).code,0);assert.equal(calls().length,3,'a pull request run never deploys');
 assert.ok(!existsSync(join(state,'deploy-run.sh')),'the copy of deploy.sh is removed afterwards');
});
