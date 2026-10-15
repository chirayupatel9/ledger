import { getMigrations } from 'better-auth/db/migration';
import {upgradeAccounts} from '../../../packages/domain/accounts.js';
import { auth } from './auth.js';
import { pool } from './database.js';
// Pinned Better Auth owns its schema; all Ledger schema changes are versioned below.
const client=await pool.connect();
try {
 await client.query('SELECT pg_advisory_lock(74639201)');
 const {runMigrations}=await getMigrations(auth.options);await runMigrations();
 await client.query('BEGIN');
 await client.query('CREATE TABLE IF NOT EXISTS ledger_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 const existing=await client.query('SELECT version FROM ledger_migrations WHERE version=1');
 if(!existing.rowCount){await client.query(`
 CREATE TABLE ledgers(owner text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),state jsonb NOT NULL DEFAULT '{"transactions":[],"statements":[],"rules":[],"initialized":false}',updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE files(owner text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,id text NOT NULL,name text NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=20971520),data bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,id));
 CREATE TABLE activity(id bigserial PRIMARY KEY,owner text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,at timestamptz NOT NULL DEFAULT now(),action text NOT NULL,detail jsonb NOT NULL);
 CREATE INDEX activity_owner_at ON activity(owner,at DESC);
 CREATE TABLE request_limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
 CREATE TABLE mail_outbox(id bigserial PRIMARY KEY,recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt timestamptz NOT NULL DEFAULT now());
 INSERT INTO ledger_migrations(version) VALUES(1);
 `);}
 const accountsMigration=await client.query('SELECT version FROM ledger_migrations WHERE version=2');
 if(!accountsMigration.rowCount){
  const owners=await client.query('SELECT owner FROM ledgers');
  for(const {owner} of owners.rows){
   const {rows}=await client.query('SELECT state FROM ledgers WHERE owner=$1 FOR UPDATE',[owner]);
   await client.query('UPDATE ledgers SET state=$2,revision=revision+1,updated_at=now() WHERE owner=$1',[owner,JSON.stringify(upgradeAccounts(rows[0].state))]);
  }
  await client.query(`ALTER TABLE ledgers ALTER COLUMN state SET DEFAULT '{"schemaVersion":2,"accounts":[],"transactions":[],"statements":[],"rules":[],"initialized":false}'::jsonb`);
  await client.query('INSERT INTO ledger_migrations(version) VALUES(2)');
 }
 await client.query('COMMIT');console.log('Database migrations complete');
} catch(error){await client.query('ROLLBACK');throw error;}finally{await client.query('SELECT pg_advisory_unlock(74639201)');client.release();await pool.end();}
