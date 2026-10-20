import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspaceLocation,workspaceURL,safeReturnTo} from '../apps/web/public/workspace-routing.js';
test('workspace links retain account and reporting period',()=>{
 const url=workspaceURL('transactions','legacy-hdfc','fy-2026');
 assert.equal(url,'/transactions?account=legacy-hdfc&period=fy-2026');
 assert.deepEqual(readWorkspaceLocation('/transactions',url.slice(url.indexOf('?'))),{page:'transactions',account:'legacy-hdfc',period:'fy-2026'});
 assert.equal(safeReturnTo(url),url);
 assert.equal(safeReturnTo('/accounts'),'/accounts');assert.equal(safeReturnTo('/investments'),'/investments');
});
test('login destinations reject external or unsupported paths and discard unsafe filters',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/accounts/../login','/accounts#evil','/login','/accounts.evil.test',undefined,['/accounts']])assert.equal(safeReturnTo(value),'/');
 assert.equal(safeReturnTo('/reports?account=%3Cscript%3E&period=2026-13&next=https://evil.test'),'/reports');
 assert.equal(safeReturnTo('/accounts?account=a&unexpected=value'),'/accounts?account=a');
});
