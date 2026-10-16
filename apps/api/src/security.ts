import { CanActivate, ExecutionContext, Injectable, HttpException, Catch, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { config } from './config.js';
import { pool } from './database.js';
export type UserRequest=Request & { user:{id:string;email:string;name:string;twoFactorEnabled?:boolean|null} };
export async function rateLimit(key:string,max:number,seconds:number){
 const {rows}=await pool.query(`INSERT INTO request_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.expires_at<=now() THEN 1 ELSE request_limits.hits+1 END,
 expires_at=CASE WHEN request_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE request_limits.expires_at END RETURNING hits`,[key,seconds]);
 if(rows[0].hits>max)throw new HttpException('Too many requests. Please wait and retry.',429);
}
@Injectable()
export class SessionGuard implements CanActivate{
 async canActivate(context:ExecutionContext){
  const req=context.switchToHttp().getRequest<UserRequest>();
  const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
  if(!session?.user)throw new HttpException('Please sign in.',401);
  if(!session.user.emailVerified)throw new HttpException('Verify your email before opening your ledger.',403);
  req.user=session.user;
  if(!['GET','HEAD'].includes(req.method)){
   if(req.headers.origin!==config.origin)throw new HttpException('Request origin rejected.',403);
   await rateLimit('write:'+session.user.id,90,60);
  }
  return true;
 }
}
@Catch()
export class Errors implements ExceptionFilter{
 catch(error:any,host:ArgumentsHost){
  const res=host.switchToHttp().getResponse<Response>();
  const status=error instanceof HttpException?error.getStatus():error.status||500;
  if(status>=500)console.error('Request failed',{type:error.constructor?.name,code:error.code});
  res.status(status).json({error:status>=500?'The service could not complete this request. Please retry.':error.message});
 }
}
