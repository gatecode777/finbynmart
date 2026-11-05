// Lets node-run unit tests import src modules that use the "@/..." alias and extensionless relative imports.
// Usage: node --import ./docs/page-reports/tools/alias-register.mjs <test file>
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, "src", specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  // extensionless relative imports between src modules ("./profileRules")
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && context.parentURL?.includes("/src/") && path.extname(specifier) === "") {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
      if (fs.existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
