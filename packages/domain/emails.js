// Ledger's emails: one branded layout (HTML with a plain-text alternative) shared by every message. Table-based with
// inline styles so it renders the same in Gmail, Outlook and phone mail apps. Everything dynamic is escaped.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color={brand:'#072d59',accent:'#fd6e88',button:'#072d59',text:'#0e2746',muted:'#5f7189',line:'#d9e9f2',page:'#eef8fd',soft:'#dbf2fc'};
const font="'Manrope','Segoe UI',Helvetica,Arial,sans-serif";
// A paragraph is a string or a list of strings and {b:'bold text'} pieces.
const pieces=p=>Array.isArray(p)?p:[p];
const html=p=>pieces(p).map(x=>typeof x==='string'?esc(x):`<strong style="color:${color.brand}">${esc(x.b)}</strong>`).join('');
const text=p=>pieces(p).map(x=>typeof x==='string'?x:x.b).join('');
export function renderEmail({origin='',preheader='',eyebrow='',heading,paragraphs=[],button,notice,facts=[],footnote=''}){
 const host=origin?new URL(origin).host:'';
 const para=p=>`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${color.text}">${html(p)}</p>`;
 const factRows=facts.map(([k,v])=>`<tr><td style="padding:9px 14px 9px 0;border-top:1px solid ${color.line};font-size:13px;color:${color.muted};white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-top:1px solid ${color.line};font-size:14px;color:${color.text};word-break:break-word">${esc(v)}</td></tr>`).join('');
 const body=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${color.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${color.page}">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${color.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${font}">
<tr><td style="background:${color.brand};border-radius:12px 12px 0 0;padding:22px 32px"><a href="${esc(origin)}" style="text-decoration:none;font-family:${font};font-size:24px;font-weight:800;letter-spacing:-1px;color:#ffffff">ledger<span style="color:${color.accent}">.</span></a></td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px 32px 28px;border:1px solid ${color.line};border-top:0">
${eyebrow?`<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${color.button}">${esc(eyebrow)}</p>`:''}
<h1 style="margin:0 0 18px;font-family:${font};font-size:24px;line-height:1.3;font-weight:750;letter-spacing:-0.5px;color:${color.brand}">${esc(heading)}</h1>
${paragraphs.map(para).join('')}
${button?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td style="border-radius:8px;background:${color.button}"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 26px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button.label)} &rarr;</a></td></tr></table>`:''}
${facts.length?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border-bottom:1px solid ${color.line}">${factRows}</table>`:''}
${notice?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="background:${color.soft};border-left:3px solid ${color.button};border-radius:6px;padding:12px 16px;font-size:14px;line-height:1.55;color:${color.text}">${html(notice)}</td></tr></table>`:''}
${button?`<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${color.muted}">Button not working? Paste this link into your browser:</p><p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${esc(button.url)}" style="color:${color.button}">${esc(button.url)}</a></p>`:''}
${footnote?`<p style="margin:0;padding-top:16px;border-top:1px solid ${color.line};font-size:12px;line-height:1.55;color:${color.muted}">${html(footnote)}</p>`:''}
</td></tr>
<tr><td align="center" style="padding:18px 12px 0;font-size:12px;line-height:1.6;color:${color.muted}">Ledger &middot; your private bookkeeping workspace${host?` &middot; <a href="${esc(origin)}" style="color:${color.muted}">${esc(host)}</a>`:''}</td></tr>
</table></td></tr></table></body></html>`;
 const plain=[heading,'',...paragraphs.flatMap(p=>[text(p),'']),
  ...(button?[`${button.label}:`,button.url,'']:[]),
  ...(facts.length?[...facts.map(([k,v])=>`${k}: ${v}`),'']:[]),
  ...(notice?[text(notice),'']:[]),
  ...(footnote?[text(footnote),'']:[]),
  '—',`Ledger · your private bookkeeping workspace${host?` · ${origin}`:''}`].join('\n');
 return {html:body,text:plain};
}
export function verificationEmail({url,origin}){
 return {subject:'Verify your Ledger email',...renderEmail({origin,preheader:'Confirm your email address to finish setting up Ledger.',heading:'Verify your email address',
  paragraphs:['Confirm this is your email address to finish setting up your Ledger account.'],button:{label:'Verify email',url},
  footnote:'This link works for 1 hour. If you didn’t create a Ledger account, you can ignore this email.'})};
}
export function resetPasswordEmail({url,email,origin}){
 return {subject:'Reset your Ledger password',...renderEmail({origin,preheader:'Choose a new password for your Ledger account.',heading:'Reset your password',
  paragraphs:[['We received a request to reset the password for ',{b:email},'.'],'Choosing a new password signs you out of Ledger on your other devices.'],button:{label:'Choose a new password',url},
  footnote:'This link works for 1 hour. If you didn’t ask to reset your password, ignore this email and your password won’t change.'})};
}
export function invitationEmail({url,email,inviter,google=false,origin}){
 const who=String(inviter||'').trim()||'Someone';
 return {subject:`${who} invited you to Ledger`.replace(/[\r\n]+/g,' ').slice(0,160),...renderEmail({origin,preheader:'Create your account to bring your bank statements, cards and investments together.',eyebrow:'Invitation',heading:'You’re invited to Ledger',
  paragraphs:[[{b:who},' invited you to Ledger, a private workspace for your bank statements, credit cards and investments.'],'Your ledger is separate and private to you. Nobody else can see it, including the person who invited you.'],
  button:{label:'Create your account',url},notice:['Sign up with ',{b:email},google?'. You can choose a password or continue with Google.':'. The invitation only works for this address.'],
  footnote:'If you weren’t expecting this invitation, you can ignore this email.'})};
}
