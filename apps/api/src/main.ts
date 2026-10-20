import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { config } from './config.js';
import { LedgerService } from './ledger.js';
import { SessionGuard, Errors } from './security.js';
import { LedgerController, PublicController, InvitesController, ImportFailuresController } from './controllers.js';
import { pool } from './database.js';
import { startMailer } from './mail.js';
@Module({controllers:[PublicController,LedgerController,InvitesController,ImportFailuresController],providers:[LedgerService,SessionGuard]})
class AppModule{}
const app=await NestFactory.create(AppModule,{bodyParser:false,logger:['error','warn','log']});
app.use(helmet({contentSecurityPolicy:false,strictTransportSecurity:config.local?false:undefined}));
app.use((_req:any,res:any,next:any)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
app.getHttpAdapter().getInstance().all('/api/auth/*splat',toNodeHandler(auth));
app.use(express.json({limit:'12mb',strict:true}));
app.useGlobalFilters(new Errors());
app.enableShutdownHooks();
await app.listen(config.port,'0.0.0.0');
const stopMailer=config.mailEnabled?startMailer():()=>{};
const cleanup=setInterval(()=>pool.query("DELETE FROM request_limits WHERE expires_at < now()-interval '1 day'").catch(()=>{}),3600000);cleanup.unref();
process.once('SIGTERM',()=>{stopMailer();clearInterval(cleanup);void pool.end();});
