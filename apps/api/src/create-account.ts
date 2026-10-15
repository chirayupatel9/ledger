// Operator-only CLI. Reads JSON from stdin; never exposes a public registration bypass.
import {randomUUID} from 'node:crypto';
import {auth} from './auth.js';
import {pool,transaction} from './database.js';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('Input too large');}
try{
 const {email,name,password}=JSON.parse(input);
 if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof name!=='string'||!name.trim()||name.length>100||typeof password!=='string'||password.length<12||password.length>128)throw Error('Invalid account details');
 const context=await auth.$context;const hash=await context.password.hash(password),id=randomUUID();
 await transaction(async client=>{
  const existing=await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1)',[email]);
  if(existing.rowCount)throw Error('Account already exists; credentials were not changed');
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,name.trim(),email.trim().toLowerCase()]);
  await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
 });
 console.log('Operator-provisioned account created.');
}finally{await pool.end();}
