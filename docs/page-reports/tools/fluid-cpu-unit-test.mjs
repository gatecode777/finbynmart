// Fluid CPU rules (docs/performance/FLUID_CPU_AUDIT.md): the shared /api/auth/me helper shares and forgets correctly, the per-request resolvers are request-scoped and keyed by account,
// no public page is force-dynamic, every <Link> opts out of prefetch, and no timer polls the server.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/fluid-cpu-unit-test.mjs
import fs from "node:fs";
import path from "node:path";
const root = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let fails = 0; const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

// 1. the helper (fetch is replaced; there is no window here, so the AUTH_EVENT listener is not installed)
let calls = 0, mode = "ok"; const realFetch = globalThis.fetch;
globalThis.fetch = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); if (mode === "fail") return { ok: false, json: async () => ({}) }; return { ok: true, json: async () => ({ user: { name: "A", role: "buyer" } }) }; };
const { fetchMe } = await import("../../../src/lib/client/me.ts");
const [a, b, c] = await Promise.all([fetchMe(), fetchMe(), fetchMe()]);
check("three concurrent callers share ONE request", calls === 1 && a === b && b === c && a?.role === "buyer", `calls=${calls}`);
await fetchMe(); check("a second call inside 30 s makes no request", calls === 1);
await fetchMe(true); check("force (back/forward restore) asks again", calls === 2);
const realNow = Date.now; Date.now = () => realNow() + 31_000; await fetchMe(); Date.now = realNow; check("after 30 s it asks again", calls === 3);
mode = "fail"; Date.now = () => realNow() + 100_000; await fetchMe().catch(() => {}); const failedCalls = calls; await fetchMe().catch(() => {}); Date.now = realNow;
check("a failed answer is never remembered (the next call asks again)", calls === failedCalls + 1);
globalThis.fetch = realFetch;

// 2. request-scoped resolvers, keyed by account
check("getCurrentUser is React cache() (one read per request, never shared across requests)", /export const getCurrentUser = cache\(readCurrentUser\)/.test(read("src/lib/auth/session.ts")));
check("resolveSupplierContext and getAdminPermissions are cache() functions keyed by the account id argument", /export const resolveSupplierContext = cache\(readSupplierContext\)/.test(read("src/lib/supplier/company.ts")) && /export const getAdminPermissions = cache\(readAdminPermissions\)/.test(read("src/lib/admin/permissions.ts")) && /readSupplierContext\(userId: string\)/.test(read("src/lib/supplier/company.ts")) && /readAdminPermissions\(userId: string\)/.test(read("src/lib/admin/permissions.ts")));

// 3. rendering, prefetch, polling
for (const p of ["src/app/page.tsx", "src/app/help/page.tsx", "src/app/[page]/page.tsx"]) check(`${p} is not force-dynamic`, !/force-dynamic/.test(read(p)));
check("the catch-all route prerenders only the information pages", /return \[\.\.\.INFO_PAGE_MAP\.keys\(\)\]/.test(read("src/app/[page]/page.tsx")));
const files = [...walk("src/components"), ...walk("src/app")].filter((f) => f.endsWith(".tsx"));
const bare = files.flatMap((f) => (read(f).match(/<Link(?![A-Za-z])(?![^>]*prefetch=)/g) ?? []).map(() => f));
check("every <Link> has a prefetch prop (prefetch={false})", bare.length === 0, bare.slice(0, 3).join(", "));
const timers = files.filter((f) => /setInterval\(/.test(read(f)));
check("no component polls the server on a timer (setInterval)", timers.length === 0, timers.join(", "));
const focus = files.filter((f) => /api\//.test(read(f)) && /addEventListener\("(focus|visibilitychange)"/.test(read(f)));
check("no component refetches an API on window focus or tab visibility", focus.length === 0, focus.join(", "));
check("the saved-items store asks who is signed in first, so a signed-out visitor makes no wishlist/compare request", /fetchMe()/.test(read("src/components/ui/WishlistButton/wishlistStore.ts")) && /me === null/.test(read("src/components/ui/WishlistButton/wishlistStore.ts")));
check("robots.ts keeps crawlers off /api/ and the portals", /"\/api\/"/.test(read("src/app/robots.ts")) && /"\/buyer\/"/.test(read("src/app/robots.ts")));
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
