// Run before any deploy of web/ (npm run predeploy:check). Fails while a page still has text marked for the owner to
// write ("[Steve:" placeholders or "DRAFT for Steve" markers), or a wording that claims-and-evidence.md forbids.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const FORBIDDEN = [/\[Steve:/, /DRAFT for Steve/, /behaves the same/i, /100% compatible/i, /production-ready/i, /guaranteed/i, /fully automated/i, /\bproved by\b/i];
let problems = 0;
for (const f of readdirSync("web").filter((x) => /\.(html|js)$/.test(x))) {
  readFileSync(join("web", f), "utf-8").split(/\r?\n/).forEach((line, i) => {
    for (const re of FORBIDDEN) {
      if (re.test(line)) { problems++; console.error(`web/${f}:${i + 1}: ${re} -> ${line.trim().slice(0, 120)}`); }
    }
  });
}
if (problems) { console.error(`\n${problems} problem(s): not ready to deploy.`); process.exit(1); }
console.log("web/: no placeholders or forbidden wording; ready to deploy.");
