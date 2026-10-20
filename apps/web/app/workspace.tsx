'use client';
import {useEffect} from 'react';
const assetBase=process.env.NEXT_PUBLIC_LEDGER_ASSET_BASE;
export default function Workspace(){useEffect(()=>{const script=document.createElement('script');script.type='module';script.src=assetBase+'/app.js';document.body.appendChild(script);return()=>{script.remove()}},[]);return <><link rel="stylesheet" href={assetBase+'/styles.css'}/><div id="app"><div style={{padding:60,fontFamily:'sans-serif'}}>Loading your private ledger…</div></div><dialog id="modal"/><div id="toast" role="status"/></>}
