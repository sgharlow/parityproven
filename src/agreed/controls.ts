/**
 * Negative controls for step 2 (verification-standard.md, "Before trusting the harness"): a copy of an object's committed
 * expected results with case 1 corrupted, in memory only. Agreed tests generated from it must fail case 1 on both engines.
 */
import type { ExpectedFile } from "./generate.js";

/** The corrupted copy, which case was corrupted (its test must fail), and what was changed. */
export interface Corrupted { file: ExpectedFile; caseIndex: number; what: string }

/**
 * A JSON object or array with its first primitive value changed (strings gain "X", numbers gain 1, booleans flip, null
 * becomes "X"); an empty container gains an element. Undefined when the text is not a JSON object or array.
 */
export function corruptJson(text: string): string | undefined {
  if (!/^\s*[[{]/.test(text)) return undefined;
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return undefined; }
  const change = (v: unknown): unknown =>
    typeof v === "string" ? `${v}X` : typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : "X";
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] !== null && typeof node[i] === "object") { if (walk(node[i])) return true; } else { node[i] = change(node[i]); return true; }
      }
      return false;
    }
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        if (o[k] !== null && typeof o[k] === "object") { if (walk(o[k])) return true; } else { o[k] = change(o[k]); return true; }
      }
    }
    return false;
  };
  if (!walk(doc)) {
    if (Array.isArray(doc)) doc.push("X"); else (doc as Record<string, unknown>).corrupted = "X";
  }
  return JSON.stringify(doc);
}

/** A canonical cell changed to a different value of the same kind, so it still loads into the same column type. */
export function corruptCell(cell: string): string | undefined {
  const [kind, ...rest] = cell.split(":");
  const v = rest.join(":");
  switch (kind) {
    case "s": {
      // a JSON document stays valid JSON (a value inside it changes), so the comparison fails, not the parser
      const json = corruptJson(v);
      if (json !== undefined) return `s:${json}`;
      // same length, last character changed: a longer value would not fit the expected table's column, and SQL Server
      // would raise a truncation error instead of an assertion failure (seen 2026-11-18 on nvarchar(16))
      return v.length ? `s:${v.slice(0, -1)}${v.endsWith("X") ? "Y" : "X"}` : "s:X";
    }
    case "n": {
      const m = v.match(/^(-?)(\d+)(\.\d+)?$/);
      if (!m) return undefined;
      return `n:${m[1]}${(BigInt(m[2]) + 1n).toString()}${m[3] ?? ""}`;   // integer part + 1 (magnitude), scale kept
    }
    case "b": return v === "1" ? "b:0" : "b:1";
    case "d": case "t": return `${kind}:${String(Number(v.slice(0, 4)) + 1).padStart(4, "0")}${v.slice(4)}`;
    case "x": return `x:${v.length ? (v[0] === "0" ? "1" : "0") + v.slice(1) : "00"}`;
    case "g": {
      // a point moved by 1 along x: still a valid point, so it loads and compares like the original
      const m = v.match(/^POINT\((\S+) (\S+)\)$/);
      return m ? `g:POINT(${Number(m[1]) + 1} ${m[2]})` : undefined;
    }
    default: return undefined;   // NULL (∅) and unknown kinds are not changed in place
  }
}

/**
 * A targeted control: the first non-NULL value of `column` in the first case that has one, so a newly supported type
 * (geography, xml) is itself seen failing, not just a neighbouring id. That case's test must then fail.
 */
function corruptColumn(expected: ExpectedFile, column: string): Corrupted {
  const file = JSON.parse(JSON.stringify(expected)) as ExpectedFile;
  for (const [k, c] of file.cases.entries()) {
    const i = (c.columns ?? []).findIndex((x) => x.name === column);
    if (i < 0) throw new Error(`no result column "${column}" in case ${k + 1}`);
    for (const [r, row] of (c.rows ?? []).entries()) {
      const bad = corruptCell(row[i]);
      if (row[i] !== "∅" && bad && bad !== row[i]) {
        const was = row[i];
        row[i] = bad;
        return { file, caseIndex: k, what: `case ${k + 1} expected value row ${r + 1}, column ${column}: ${was} -> ${bad}` };
      }
    }
  }
  throw new Error(`no non-NULL value of "${column}" to corrupt`);
}

/** Result sets: case 1's first non-NULL value. State objects: case 1's outcome. Otherwise an extra all-NULL row. */
export function corruptExpected(expected: ExpectedFile, column?: string): Corrupted {
  if (column !== undefined) return corruptColumn(expected, column);
  const file = JSON.parse(JSON.stringify(expected)) as ExpectedFile;
  const c = file.cases[0];
  if (!c) throw new Error("no cases to corrupt");
  if (c.outcome !== undefined) {
    const was = c.outcome;
    c.outcome = was === "completed" ? "raised" : "completed";
    return { file, caseIndex: 0, what: `case 1 expected outcome "${was}" -> "${c.outcome}"` };
  }
  if (c.raised !== undefined) {
    // a declared result error expected: expect completion with no rows instead
    const was = c.raised;
    delete c.raised;
    c.rows = [];
    return { file, caseIndex: 0, what: `case 1 expected outcome "${was}" -> "completed" with no rows` };
  }
  for (const [r, row] of (c.rows ?? []).entries()) {
    for (const [i, cell] of row.entries()) {
      const bad = corruptCell(cell);
      if (bad && bad !== cell) {
        row[i] = bad;
        return { file, caseIndex: 0, what: `case 1 expected value row ${r + 1}, column ${c.columns?.[i]?.name ?? i + 1}: ${cell} -> ${bad}` };
      }
    }
  }
  const width = c.columns?.length ?? 0;
  c.rows = [...(c.rows ?? []), Array.from({ length: width }, () => "∅")];
  return { file, caseIndex: 0, what: "case 1 expected result gains an extra all-NULL row" };
}
