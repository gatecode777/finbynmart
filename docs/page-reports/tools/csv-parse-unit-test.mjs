// The catalogue CSV parser has a fast path (line split) and a fallback (state machine). This proves the result is IDENTICAL to the original state machine on every seed file and on edge cases.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/csv-parse-unit-test.mjs
import fs from "node:fs";
import { parseCSV } from "../../../src/lib/catalog/csv.ts";

function reference(text) { // the original implementation, kept here as the oracle
  const rows = []; let row = []; let cur = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])));
}
let fails = 0; const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, extra); };
const same = (text) => JSON.stringify(parseCSV(text)) === JSON.stringify(reference(text));
for (const f of ["products.csv", "product_sizes.csv", "sellers.csv", "categories.csv"]) {
  const text = fs.readFileSync(new URL(`../../../db/seed/${f}`, import.meta.url), "utf8");
  const t0 = performance.now(); const fast = parseCSV(text); const t1 = performance.now(); reference(text); const t2 = performance.now();
  check(`${f}: identical to the original parser (${fast.length} rows)`, JSON.stringify(fast) === JSON.stringify(reference(text)), `new ${(t1 - t0).toFixed(0)} ms, original ${(t2 - t1).toFixed(0)} ms`);
}
check("CRLF, quoted comma, doubled quote, empty line, no trailing newline", same('a,b,c\r\n1,"x, y",3\r\n4,"he said ""hi""",6\r\n,,\r\n7,8,9'));
check("a quoted field that spans lines uses the fallback", same('a,b\n1,"line1\nline2"\n2,3'));
check("empty text", same(""));
check("header only", same("a,b,c\n"));
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
