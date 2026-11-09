'use client';
import {useEffect} from 'react';
import {loadingHTML} from '../public/loading.js';
const assetBase=process.env.NEXT_PUBLIC_LEDGER_ASSET_BASE;
export default function Workspace({nonce}:{nonce?:string}){useEffect(()=>{const script=document.createElement('script');script.type='module';script.src=assetBase+'/app.js';document.body.appendChild(script);return()=>{script.remove()}},[]);return <><link rel="stylesheet" href={assetBase+'/styles.css'}/><div id="app" dangerouslySetInnerHTML={{__html:loadingHTML('Opening your ledger…',nonce)}}/><dialog id="modal"/><div id="toast" role="status"/></>}
