import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,utimesSync,statSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('deploy/backup-loop.sh');
function sandbox(t){
 const root=mkdtempSync(join(tmpdir(),'ledger-backup-test-')),dir=join(root,'backups'),bin=join(root,'bin');mkdirSync(dir);mkdirSync(bin);t.after(()=>rmSync(root,{recursive:true,force:true}));
 // Exercise the real loop with fake database commands, without touching a real database.
 writeFileSync(join(bin,'pg_dump'),'#!/bin/sh\n[ "${FAIL_DUMP:-}" != 1 ] || exit 1\nprintf "synthetic-dump" > "$3"\n',{mode:0o700});
 writeFileSync(join(bin,'pg_restore'),'#!/bin/sh\nexit 0\n',{mode:0o700});
 const run=(mode='once',env={})=>spawnSync('sh',[script,mode],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,BACKUP_DIR:dir,BACKUP_INTERVAL_HOURS:'24',BACKUP_KEEP:'14',OFFSITE_DIR:'',OFFSITE_KEY_FILE:'',...env}});
 const seed=age=>{const path=join(dir,'scheduled-old.dump'),when=new Date(Date.now()-age*3600000);writeFileSync(path,'old-dump');utimesSync(path,when,when);return path;};
 return {root,dir,run,seed};
}
test('backup is due at 24 hours while health retains its two-hour grace period',t=>{
 const {dir,seed,run}=sandbox(t);seed(23.9);assert.equal(run().status,0);assert.equal(readdirSync(dir).length,1);
 seed(24.1);assert.equal(run('check').status,0,'24-hour-old dump remains healthy during grace');assert.equal(run().status,0);assert.equal(readdirSync(dir).filter(f=>f.endsWith('.dump')).length,2,'a new dump is created before the grace window expires');
});
test('failed dump keeps the old backup, remains due, and fails health after grace',t=>{
 const {dir,seed,run}=sandbox(t);seed(26.1);assert.notEqual(run('check').status,0);assert.equal(run('once',{FAIL_DUMP:'1'}).status,0);assert.deepEqual(readdirSync(dir),['scheduled-old.dump']);assert.equal(run().status,0);assert.equal(run('check').status,0);
});
test('missing drive is not created; drive copies retain dump age and manual backups',t=>{
 const {root,dir,seed,run}=sandbox(t),drive=join(root,'drive');const original=seed(10);
 const missing=run('once',{OFFSITE_DIR:drive});assert.match(missing.stderr,/missing or read-only/);assert.notEqual(run('check',{OFFSITE_DIR:drive}).status,0);
 mkdirSync(drive);writeFileSync(join(dir,'ledger-manual.dump'),'manual');assert.equal(run('once',{OFFSITE_DIR:drive}).status,0);
 assert.equal(readFileSync(join(drive,'scheduled-old.dump'),'utf8'),'old-dump');assert.ok(Math.abs(statSync(original).mtimeMs-statSync(join(drive,'scheduled-old.dump')).mtimeMs)<1);
 assert.equal(readFileSync(join(drive,'ledger-manual.dump'),'utf8'),'manual');assert.equal(run('check',{OFFSITE_DIR:drive}).status,0);
});

test('mount recovery preserves the disk and other mounts, and is idempotent',()=>{
 const result=spawnSync('python3',['-B','-c',String.raw`
import importlib.util
spec=importlib.util.spec_from_file_location('mount_config','deploy/configure-backup-mount.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
other='# existing mounts\nUUID=system / ext4 defaults 0 1\n'
original=other+'UUID=backup /mnt/backup ext4 defaults,noatime,nofail,x-systemd.device-timeout=10s 0 2\n'
updated=module.configure(original)
assert updated.startswith(other)
assert 'UUID=backup /mnt/backup ext4 ' in updated
assert 'x-systemd.automount' in updated and 'x-systemd.device-timeout=60s' in updated
assert module.configure(updated)==updated
for invalid in [other, original+original]:
    try: module.configure(invalid)
    except ValueError: pass
    else: raise AssertionError('Ambiguous/missing mount must be refused')
print('PASS')
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/);
});
