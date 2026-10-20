// The loading screen shown while Ledger opens: the server-rendered first paint, session checks and retries. It carries
// its own styles so it looks right before the app's stylesheet arrives. If loading drags on, a reload link appears.
// On first paint it applies the theme this device last used, so a dark-theme ledger does not flash light.
const theme=`<script>try{var t=localStorage.getItem('ledger.theme');if((t==='dark'||t==='light')&&!document.documentElement.dataset.theme)document.documentElement.dataset.theme=t}catch(e){}</script>`;
const css=`.ls{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#f5f6f3;color:#24342e;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center}
.ls-brand{display:flex;align-items:flex-end;gap:12px}
.ls-mark{display:flex;align-items:flex-end;gap:4px;height:38px}
.ls-mark i{display:block;width:9px;border-radius:2.5px;background:#2c6554;transform-origin:bottom;animation:ls-rise 1.2s ease-in-out infinite}
.ls-mark i:nth-child(1){height:22px;opacity:.7;animation-delay:-.4s}
.ls-mark i:nth-child(2){height:38px}
.ls-mark i:nth-child(3){height:29px;opacity:.85;animation-delay:-.8s}
.ls-word{font-family:Manrope,'DM Sans',system-ui,sans-serif;font-size:30px;line-height:1;font-weight:800;letter-spacing:-1.4px;color:#173b32}
.ls-word span{color:#6f9a4c}
.ls-msg{margin:6px 0 0;font-size:14px;color:#5f6b66}
.ls-slow{margin:0;max-width:320px;font-size:13px;line-height:1.5;color:#88918d;opacity:0;animation:ls-show .4s 8s forwards}
.ls-slow a{color:#2c6554;font-weight:600}

:root[data-theme=dark] .ls{background:#0f1714;color:#dce6e0}:root[data-theme=dark] .ls-mark i{background:#8fc9ac}:root[data-theme=dark] .ls-word{color:#eef4f0}:root[data-theme=dark] .ls-word span{color:#c5df9d}:root[data-theme=dark] .ls-msg{color:#93a39b}:root[data-theme=dark] .ls-slow{color:#7f9187}:root[data-theme=dark] .ls-slow a{color:#8fc9ac}
@keyframes ls-rise{0%,100%{transform:scaleY(.45)}50%{transform:scaleY(1)}}
@keyframes ls-show{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.ls-mark i{animation:ls-pulse 2.4s ease-in-out infinite}@keyframes ls-pulse{50%{opacity:.45}}}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function loadingHTML(message='Opening your ledger…'){
 return `<div class="ls" role="status" aria-live="polite">${theme}<style>${css}</style><div class="ls-brand" aria-hidden="true"><div class="ls-mark"><i></i><i></i><i></i></div><div class="ls-word">ledger<span>.</span></div></div><p class="ls-msg">${esc(message)}</p><p class="ls-slow">This is taking longer than usual. Check your connection, or <a href="">reload the page</a>.</p></div>`;
}
