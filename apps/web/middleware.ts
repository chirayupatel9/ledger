import {NextResponse, type NextRequest} from 'next/server';

// Content-Security-Policy with a per-request nonce, so script-src can drop 'unsafe-inline': Next adds the nonce to its
// own inline bootstrap scripts when it finds one on the request's CSP header, and the first-paint theme script carries
// it too (see app/workspace-page.tsx → app/workspace.tsx → public/loading.js). The app's own bundles load same-origin,
// so 'self' covers them without 'strict-dynamic'. Styles keep 'unsafe-inline' (out of scope; the finding is scripts).
// This is the single source of the policy; deploy/Caddyfile no longer sets it.
export function middleware(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data: blob:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce from the request's CSP header to nonce the scripts it renders.
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({request: {headers: requestHeaders}});
  response.headers.set('content-security-policy', csp);
  return response;
}

// Document routes only; static assets (hashed bundles, icons, the service worker, fonts) are served with their own
// long-lived caching and need no per-request nonce.
export const config = {
  matcher: [{source: '/((?!_next/static|_next/image|.*\\.(?:js|mjs|css|png|svg|ico|wasm|json|webmanifest|txt|map|gz|woff2?|traineddata)).*)'}],
};
