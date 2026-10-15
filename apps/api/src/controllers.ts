import { Controller, Get, Put, Post, Req, Res, Param, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
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
 @Get('config') config(){return {google:!!(config.googleId&&config.googleSecret),signup:config.mailEnabled,recovery:config.mailEnabled};}
}
@Controller('api')
@UseGuards(SessionGuard)
export class LedgerController{
 constructor(private readonly ledger:LedgerService){}
 @Get('ledger') async load(@Req() req:UserRequest){return {...await this.ledger.load(req.user.id),user:{name:req.user.name,email:req.user.email}};}
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
