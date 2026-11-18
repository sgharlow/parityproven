// Assembles the published site in _site/: web/ and receipts/ only, at the same paths (/web/..., /receipts/...).
// Netlify runs this as its build command and publishes _site/, so nothing else in the repository is served.
// No dependencies and no databases: receipts/ is committed (receipts:build needs the restored databases' inventories
// and full git history, which Netlify does not have).
//   node scripts/build-site.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const dir of ["web", "receipts"]) {
  const src = join(root, dir);
  if (!existsSync(src)) throw new Error(`${dir}/ is missing; the site cannot be built without it`);
  cpSync(src, join(out, dir), { recursive: true });
}
const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(join(d, e.name)) : 1), 0);
console.log(`_site/: web/ ${count(join(out, "web"))} files, receipts/ ${count(join(out, "receipts"))} files`);
