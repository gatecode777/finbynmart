// Page 75: static guards for the error boundaries. Runtime behaviour (production build, fault injection, recovery, HTTP statuses) was verified with temporary fixtures that are removed; see docs/page-designs/PAGE_75_ERROR_HANDLING.md.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let n = 0; const check = (name, ok) => { assert.ok(ok, name); n++; console.log("PASS ", name); };
const fb = read("src/components/error/ErrorFallback.tsx"), ge = read("src/app/global-error.tsx"), re = read("src/app/error.tsx");
check("the fallback depends on nothing from the application: only react, no CSS module, next/*, fonts, providers or other @/ imports", [...fb.matchAll(/^import .* from "([^"]+)"/gm)].every((m) => m[1] === "react") && !/\.module\.css|next\/|@\//.test(fb.replace(/\/\*[\s\S]*?\*\//g, "")));
check("global-error is a client component with its own html and body and imports only the fallback", /^"use client"/.test(ge) && /<html lang="en">/.test(ge) && /<body/.test(ge) && [...ge.matchAll(/^import .* from "([^"]+)"/gm)].every((m) => m[1] === "@/components/error/ErrorFallback"));
check("Try Again is wired: root boundary refreshes server data and calls reset; global calls reset then reloads; nothing retries automatically", /router\.refresh\(\); reset\(\)/.test(re) && /reset\(\); window\.location\.reload\(\)/.test(ge) && !/setInterval|setTimeout|useEffect/.test(re + ge) && /onClick=\{onRetry\}/.test(fb));
check("homepage and support links are plain anchors to existing routes", /href="\/">Go to Homepage/.test(fb) && /SUPPORT_HREF = "\/contact-us"/.test(fb) && fs.existsSync(path.join(root, "src/app/contact-us/page.tsx")));
check("copy matches the brief and nothing unsafe is rendered: no error.message/stack, no 'notified', 'saved' or '500' claim, only the digest as reference", /Something went wrong\./.test(fb) && /We couldn&rsquo;t load this page\. Please try again\./.test(fb) && /Unexpected error/.test(fb) && /check its status before submitting again/.test(fb) && !/error\.message|\.stack|notified|data is saved|>500</i.test(fb + ge + re) && /Reference: \{reference\}/.test(fb));
check("no remote asset or analytics: only the local logo", [...fb.matchAll(/src="([^"]+)"/g)].every((m) => m[1].startsWith("/images/brand/")) && !/https?:\/\//.test(fb.replace(/\/\*[\s\S]*?\*\//g, "")));
check("no temporary fault fixture remains", !fs.existsSync(path.join(root, "src/app/zz-fault")) && !fs.existsSync(path.join(root, ".fault")) && !/zz-fault|LayoutProbe/.test(read("src/app/layout.tsx")));
console.log(`\n${n} passed, 0 failed`);
