/**
 * Negative controls for step 2 (verification-standard.md, "Before trusting the harness"): a copy of an object's committed
 * expected results with case 1 corrupted, in memory only. Agreed tests generated from it must fail case 1 on both engines.
 */
import type { ExpectedFile } from "./generate.js";

/** A canonical cell changed to a different value of the same kind, so it still loads into the same column type. */
export function corruptCell(cell: string): string | undefined {
  const [kind, ...rest] = cell.split(":");
  const v = rest.join(":");
  switch (kind) {
    // same length, last character changed: a longer value would not fit the expected table's column, and SQL Server
    // would raise a truncation error instead of an assertion failure (seen 2026-11-18 on nvarchar(16))
    case "s": return v.length ? `s:${v.slice(0, -1)}${v.endsWith("X") ? "Y" : "X"}` : "s:X";
    case "n": {
      const m = v.match(/^(-?)(\d+)(\.\d+)?$/);
      if (!m) return undefined;
      return `n:${m[1]}${(BigInt(m[2]) + 1n).toString()}${m[3] ?? ""}`;   // integer part + 1 (magnitude), scale kept
    }
    case "b": return v === "1" ? "b:0" : "b:1";
    case "d": case "t": return `${kind}:${String(Number(v.slice(0, 4)) + 1).padStart(4, "0")}${v.slice(4)}`;
    case "x": return `x:${v.length ? (v[0] === "0" ? "1" : "0") + v.slice(1) : "00"}`;
    default: return undefined;   // NULL (∅) and unknown kinds are not changed in place
  }
}

/** Result sets: case 1's first non-NULL value. State objects: case 1's outcome. Otherwise an extra all-NULL row. */
export function corruptExpected(expected: ExpectedFile): { file: ExpectedFile; what: string } {
  const file = JSON.parse(JSON.stringify(expected)) as ExpectedFile;
  const c = file.cases[0];
  if (!c) throw new Error("no cases to corrupt");
  if (c.outcome !== undefined) {
    const was = c.outcome;
    c.outcome = was === "completed" ? "raised" : "completed";
    return { file, what: `case 1 expected outcome "${was}" -> "${c.outcome}"` };
  }
  if (c.raised !== undefined) {
    // a declared result error expected: expect completion with no rows instead
    const was = c.raised;
    delete c.raised;
    c.rows = [];
    return { file, what: `case 1 expected outcome "${was}" -> "completed" with no rows` };
  }
  for (const [r, row] of (c.rows ?? []).entries()) {
    for (const [i, cell] of row.entries()) {
      const bad = corruptCell(cell);
      if (bad && bad !== cell) {
        row[i] = bad;
        return { file, what: `case 1 expected value row ${r + 1}, column ${c.columns?.[i]?.name ?? i + 1}: ${cell} -> ${bad}` };
      }
    }
  }
  const width = c.columns?.length ?? 0;
  c.rows = [...(c.rows ?? []), Array.from({ length: width }, () => "∅")];
  return { file, what: "case 1 expected result gains an extra all-NULL row" };
}
