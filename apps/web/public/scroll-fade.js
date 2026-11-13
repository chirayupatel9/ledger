// Scroll-edge fade — a reusable, scroll-aware edge fade for any scroll container.
//
// A background shadow (styles.css) is painted *behind* the content, so it is hidden
// by dense table cells or an opaque SVG. This instead masks the element's OWN rendered
// pixels, so the cue works over anything. An edge fades only while there is more content
// beyond it; the mask for an edge is rewritten only when that edge is crossed, so plain
// scrolling never touches layout. New scrollers (modals, re-rendered views) are picked up
// by a MutationObserver, and size changes by a ResizeObserver, so nothing has to be wired
// up at each call site. If this module never runs, the containers just keep a hard edge.

const SELECTOR = '.table-wrap,.kit-scroll';
const FADE = 26; // px: width of the fade ramp at an active edge

const tracked = new WeakSet();
const dirty = new Set();
let ro = null, frame = 0;

function setRamp(el, prop, on) {
  const v = on ? FADE + 'px' : '0px';
  if (el.style.getPropertyValue(prop) !== v) el.style.setProperty(prop, v);
}

function paint(el) {
  // scrollWidth/Height read forces layout, so this runs batched in a frame, never per scroll event.
  const ex = el.scrollWidth - el.clientWidth;
  const ey = el.scrollHeight - el.clientHeight;
  setRamp(el, '--fade-l', ex > 1 && el.scrollLeft > 1);
  setRamp(el, '--fade-r', ex > 1 && el.scrollLeft < ex - 1);
  setRamp(el, '--fade-t', ey > 1 && el.scrollTop > 1);
  setRamp(el, '--fade-b', ey > 1 && el.scrollTop < ey - 1);
}

function schedule(el) {
  dirty.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
}

function flush() {
  frame = 0;
  for (const el of dirty) if (el.isConnected) paint(el);
  dirty.clear();
}

function track(el) {
  if (tracked.has(el)) return;
  tracked.add(el);
  el.classList.add('sfade');
  el.addEventListener('scroll', () => schedule(el), { passive: true });
  if (ro) ro.observe(el);
  schedule(el);
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches && root.matches(SELECTOR)) track(root);
  if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(track);
}

export function initScrollFade() {
  if (ro || typeof document === 'undefined') return; // run once
  // CSS mask-composite is required to intersect the two axis layers; bail out (hard edge) without it.
  if (!(window.CSS && (CSS.supports('mask-composite', 'intersect') || CSS.supports('-webkit-mask-composite', 'source-in')))) return;
  ro = new ResizeObserver(entries => { for (const e of entries) schedule(e.target); });
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) scan(n);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}
