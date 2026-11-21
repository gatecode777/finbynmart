"use client";

import { useEffect, useRef } from "react";

/**
 * The unexpected-error fallback (Page 75), shared by src/app/error.tsx (inside a healthy layout) and src/app/global-error.tsx (a failed root layout).
 * It deliberately depends on NOTHING from the application: no CSS modules or globals, no next/link, next/image, fonts, providers, session, database or network.
 * Its own CSS is inline, colours are literal (the root tokens may not be loaded), the links are plain anchors (a full page load works when client navigation does not),
 * and the only asset is the local logo, whose alt text keeps the brand readable if it fails. Nothing from the error object is rendered except the digest, a hash
 * Next.js also writes to the server log, which lets a person match the two. No message, stack, account detail or invented incident id is ever shown.
 */
export const SUPPORT_HREF = "/contact-us";

const CSS = `
.fberr{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#183a38;line-height:1.5;background:#fff}
.fberr *,.fberr *::before,.fberr *::after{box-sizing:border-box}
.fberr--page{min-height:100vh;display:flex;flex-direction:column;background:linear-gradient(180deg,#fff 0%,#f3f9f8 100%)}
.fberr__brand{padding:16px 24px;border-bottom:1px solid #dce8e5;background:#fff}
.fberr__brand a{display:inline-block;color:#04534f;font-weight:700;font-size:1.25rem;text-decoration:none}
.fberr__brand img{display:block;height:40px;width:auto;max-width:100%}
.fberr__main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 16px}
.fberr--inline .fberr__main{padding:48px 16px}
.fberr__card{width:100%;max-width:36rem;text-align:center}
.fberr__icon{width:72px;height:72px;margin:0 auto 16px;display:block}
.fberr__label{margin:0 0 8px;font-size:.8125rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4a5f5d}
.fberr__title{margin:0 0 12px;font-size:clamp(1.75rem,1.2rem + 2.5vw,2.75rem);line-height:1.15;color:#04534f;overflow-wrap:anywhere}
.fberr__title:focus{outline:none}
.fberr__text{margin:0 0 24px;font-size:1.0625rem}
.fberr__actions{display:flex;flex-direction:column;gap:12px;margin:0 0 20px}
.fberr__btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border-radius:8px;border:2px solid #04534f;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.fberr__btn--primary{background:#fdb304;border-color:#fdb304;color:#183a38}
.fberr__btn--primary:hover{background:#eaa300;border-color:#eaa300}
.fberr__btn--secondary{background:#fff;color:#04534f}
.fberr__btn--secondary:hover{background:#eaf5f3}
.fberr__btn:focus-visible,.fberr__link:focus-visible,.fberr__brand a:focus-visible{outline:3px solid #04534f;outline-offset:3px}
.fberr__link{color:#04534f;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.fberr__note{margin:24px 0 0;padding:12px 16px;border-radius:8px;background:#fff7e5;border:1px solid #fce29e;font-size:.9375rem;text-align:left}
.fberr__ref{margin:16px 0 0;font-size:.8125rem;color:#4a5f5d;overflow-wrap:anywhere}
@media (min-width:600px){.fberr__actions{flex-direction:row;justify-content:center}.fberr__btn{min-width:11rem}}
`;

export function ErrorFallback({ onRetry, reference, standalone = false }: { onRetry: () => void; reference?: string; standalone?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // move focus to the message once when the fallback appears, so keyboard and screen-reader users land on it (no live region: no repeated announcement)
    heading.current?.focus();
    try { console.error("[ui-error] fallback shown", reference ? { digest: reference } : {}); } catch { /* logging must never break the fallback */ }
  }, [reference]);

  return (
    <div className={`fberr ${standalone ? "fberr--page" : "fberr--inline"}`}>
      <style>{CSS}</style>
      <title>Unexpected error | Finbyn Mart</title>
      {standalone ? (
        <header className="fberr__brand">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a plain anchor does a full page load, which works when client navigation does not */}
          <a href="/" aria-label="Finbyn Mart, home">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image depends on the application runtime; this fallback must not */}
            <img src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" height={40} />
          </a>
        </header>
      ) : null}
      <main className="fberr__main" {...(standalone ? { id: "main-content" } : {})}>
        <div className="fberr__card">
          <svg className="fberr__icon" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
            <circle cx="36" cy="36" r="34" fill="#eaf5f3" stroke="#04534f" strokeWidth="2" />
            <path d="M36 20v20" stroke="#04534f" strokeWidth="5" strokeLinecap="round" />
            <circle cx="36" cy="50" r="3.5" fill="#fdb304" />
          </svg>
          <p className="fberr__label">Unexpected error</p>
          <h1 className="fberr__title" tabIndex={-1} ref={heading}>Something went wrong.</h1>
          <p className="fberr__text">We couldn&rsquo;t load this page. Please try again.</p>
          <div className="fberr__actions">
            <button type="button" className="fberr__btn fberr__btn--primary" onClick={onRetry}>Try Again</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above: deliberate full page load */}
            <a className="fberr__btn fberr__btn--secondary" href="/">Go to Homepage</a>
          </div>
          <p><a className="fberr__link" href={SUPPORT_HREF}>Contact Support</a></p>
          <p className="fberr__note">If you were submitting a request, check its status before submitting again.</p>
          {reference ? <p className="fberr__ref">Reference: {reference}</p> : null}
        </div>
      </main>
    </div>
  );
}
