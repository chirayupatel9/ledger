import type { NextConfig } from 'next';
import path from 'node:path';
import {prepareAssets} from './asset-build.mjs';
const assetBase=prepareAssets(path.join(process.cwd(),'public'));
const config:NextConfig={output:'standalone',poweredByHeader:false,env:{NEXT_PUBLIC_LEDGER_ASSET_BASE:assetBase},async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'}]}]}};
export default config;
