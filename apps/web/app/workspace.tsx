'use client';
import {useEffect} from 'react';
export default function Workspace(){useEffect(()=>{const script=document.createElement('script');script.type='module';script.src='/app.js';document.body.appendChild(script);return()=>{script.remove()}},[]);return <><link rel="stylesheet" href="/styles.css"/><div id="app"><div style={{padding:60,fontFamily:'sans-serif'}}>Loading your private ledger…</div></div><dialog id="modal"/><div id="toast" role="status"/></>}
