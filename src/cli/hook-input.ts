/**
 * File path for a CLI started by a Kiro command hook.
 *
 * A Kiro command hook receives its context as JSON on stdin (the hook file cannot rely on shell placeholders such as
 * %FILE%, which pwsh does not expand). A CLI that is given a usable path argument uses it; otherwise it reads stdin and
 * takes the first string anywhere in the JSON that matches `pattern` (the same pattern as the hook's matcher).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";

/** Hook runs are logged here (gitignored) so a hook firing can be observed, not assumed. */
const HOOK_LOG = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".tmp", "hook-runs.log");

function logHookRun(parsed: unknown, file: string | undefined): void {
  if (!parsed || typeof parsed !== "object") return;
  const event = (parsed as Record<string, unknown>).hook_event_name;
  if (typeof event !== "string") return; // not a Kiro hook payload
  try {
    mkdirSync(dirname(HOOK_LOG), { recursive: true });
    const cli = basename(process.argv[1] ?? "unknown");
    appendFileSync(HOOK_LOG, `${new Date().toISOString()}\t${event}\t${cli}\t${file ?? "(no matching path)"}\n`, "utf-8");
  } catch {
    // logging must never break the hook's real work
  }
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** A path from argv (when it is a real path, not an unexpanded placeholder), else from the hook's stdin JSON. */
export function hookFilePath(arg: string | undefined, pattern: RegExp): string | undefined {
  if (arg && !/^%\w+%$|^\$\w+$/.test(arg) && existsSync(arg)) return arg;
  if (process.stdin.isTTY) return arg;
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    return arg;
  }
  if (!raw.trim()) return arg;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw.trim();
  }
  const found = strings(parsed).find((s) => pattern.test(s.replace(/\\/g, "/")));
  logHookRun(parsed, found);
  return found ?? arg;
}
