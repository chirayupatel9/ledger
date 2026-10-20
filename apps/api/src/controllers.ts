import { Controller, Get, Put, Post, Delete, Req, Res, Param, Body, UseGuards, UseInterceptors, UploadedFile, HttpException } from '@nestjs/common';
import { enqueueMail, enqueueText, reservedAddress } from './mail.js';
import { cleanImportReport, importReportEmail } from '../../../packages/domain/import-report.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { SessionGuard, rateLimit, type UserRequest } from './security.js';
import { LedgerService } from './ledger.js';
import { pool } from './database.js';
import { config } from './config.js';
@Controller('api')
export class PublicController{
 @Get('health') async health(){await pool.query('SELECT 1');return {status:'ok'};}
 @Get('config') config(){return {google:!!(config.googleId&&config.googleSecret),signup:config.signupEnabled,signupMode:config.signupEnabled?config.signupMode:'closed',recovery:config.mailEnabled};}
}
@Controller('api')
@UseGuards(SessionGuard)
export class LedgerController{
 constructor(private readonly ledger:LedgerService){}
 @Get('ledger') async load(@Req() req:UserRequest){return {...await this.ledger.load(req.user.id),user:{name:req.user.name,email:req.user.email,twoFactorEnabled:!!req.user.twoFactorEnabled,owner:await isOwner(req.user.id)}};}
 @Put('ledger') async save(@Req() req:UserRequest,@Body() body:unknown,@Res() res:Response){
  const result=await this.ledger.save(req.user.id,body);const {conflict,...data}=result;
  return res.status(conflict?409:200).json(conflict?{...data,error:'Your ledger changed on another device. Review the latest data and retry.'}:data);
 }
 @Get('activity') activity(@Req() req:UserRequest){return this.ledger.activity(req.user.id);}
 @Post('files')
 @UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:1,fieldSize:100,parts:2}}))
 async upload(@Req() req:UserRequest,@Body('id') id:string,@UploadedFile() file:Express.Multer.File){await rateLimit('upload:'+req.user.id,30,3600);return this.ledger.upload(req.user.id,id,file);}
 @Get('files/:id') async download(@Req() req:UserRequest,@Param('id') id:string,@Res() res:Response){
  const file=await this.ledger.download(req.user.id,id);
  res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);res.send(file.data);
 }
}
const isOwner=async(id:string)=>!!(await pool.query('SELECT 1 FROM workspace_owners WHERE user_id=$1',[id])).rowCount;
// The workspace owner manages who may sign up. Invitations only allow an address to create its own, separate ledger.
@Controller('api/invites')
@UseGuards(SessionGuard)
export class InvitesController{
 private async list(){const {rows}=await pool.query('SELECT i.email,i.created_at AS "invitedAt",i.accepted_at AS "acceptedAt",(u.id IS NOT NULL) AS "hasAccount" FROM signup_invites i LEFT JOIN "user" u ON lower(u.email)=i.email ORDER BY i.created_at DESC');
  return {invites:rows,signupMode:config.signupEnabled?config.signupMode:'closed',mailEnabled:config.mailEnabled};}
 private async owner(req:UserRequest){if(!await isOwner(req.user.id))throw new HttpException('Only the workspace owner can manage invitations.',403);}
 @Get() async get(@Req() req:UserRequest){await this.owner(req);return this.list();}
 @Post() async add(@Req() req:UserRequest,@Body('email') raw:unknown){
  await this.owner(req);const email=typeof raw==='string'?raw.trim().toLowerCase():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpException('Enter a valid email address.',400);
  if((await pool.query('SELECT 1 FROM "user" WHERE lower(email)=$1',[email])).rowCount)throw new HttpException('That email address already has an account.',409);
  const {rowCount}=await pool.query('INSERT INTO signup_invites(email,invited_by) VALUES($1,$2) ON CONFLICT DO NOTHING',[email,req.user.id]);
  const emailed=!!rowCount&&config.mailEnabled&&config.signupEnabled;
  if(emailed)await enqueueMail(email,'You are invited to Ledger',`${config.origin}/signup?email=${encodeURIComponent(email)}`,`${req.user.name||'Someone'} invited you to Ledger, a private workspace for your bank statements and bookkeeping. Create your account with this email address; your ledger is separate and private to you.`);
  return {...await this.list(),emailed};
 }
 @Delete(':email') async remove(@Req() req:UserRequest,@Param('email') email:string){await this.owner(req);await pool.query('DELETE FROM signup_invites WHERE email=$1',[String(email).toLowerCase()]);return this.list();}
}
// A statement the browser could not read (or only partly read) is described to the operator by email, once per file.
@Controller('api/import-failures')
@UseGuards(SessionGuard)
export class ImportFailuresController{
 @Post() async report(@Req() req:UserRequest,@Body() body:unknown){
  const report=cleanImportReport(body);if(!report)throw new HttpException('Invalid report.',400);
  if(!config.importAlertEmail||!config.mailEnabled)return {reported:false};
  if((await pool.query("SELECT 1 FROM import_failures WHERE user_id=$1 AND file_hash=$2 AND kind=$3 AND created_at>now()-interval '7 days'",[req.user.id,report.fileHash,report.kind])).rowCount)return {reported:true};
  try{await rateLimit('import-failure:'+req.user.id,20,86400);}catch{return {reported:false};}
  await pool.query("DELETE FROM import_failures WHERE created_at<now()-interval '30 days'");
  await pool.query('INSERT INTO import_failures(user_id,file_hash,kind) VALUES($1,$2,$3)',[req.user.id,report.fileHash,report.kind]);
  const mail=importReportEmail(report,{reporter:{name:req.user.name,email:req.user.email}});
  // Reports from test accounts are recorded but never sent.
  await enqueueText(config.importAlertEmail,mail.subject,mail.body,{suppress:reservedAddress(req.user.email)});
  return {reported:true};
 }
}
