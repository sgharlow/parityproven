import { describe, it, expect } from "vitest";
import { corruptCell, corruptExpected } from "./controls.js";
import type { ExpectedFile } from "./generate.js";

const file = (cases: ExpectedFile["cases"]): ExpectedFile =>
  ({ object: "dbo.x", database: "db", capturedFrom: "", capturedAt: "", review: "", cases }) as ExpectedFile;

describe("corruptCell", () => {
  it("changes each kind to a different value of the same kind", () => {
    expect(corruptCell("s:Approved")).toBe("s:ApproveX");
    expect(corruptCell("s:Pending approval")).toHaveLength("s:Pending approval".length);   // fits the same nvarchar(n)
    expect(corruptCell("s:00000X")).toBe("s:00000Y");
    expect(corruptCell("s:")).toBe("s:X");
    expect(corruptCell("n:7")).toBe("n:8");
    expect(corruptCell("n:-5")).toBe("n:-6");
    expect(corruptCell("n:12.3400")).toBe("n:13.3400");   // scale kept, so a decimal(p,s) column cannot round it back
    expect(corruptCell("n:99999999999999999999")).toBe("n:100000000000000000000");
    expect(corruptCell("b:1")).toBe("b:0");
    expect(corruptCell("t:2004-06-30T23:59:59.997000")).toBe("t:2005-06-30T23:59:59.997000");
    expect(corruptCell("d:2003-07-01")).toBe("d:2004-07-01");
    expect(corruptCell("x:0a")).toBe("x:1a");
    expect(corruptCell("x:")).toBe("x:00");
  });
  it("leaves NULL alone", () => {
    expect(corruptCell("∅")).toBeUndefined();
  });
});

describe("corruptExpected", () => {
  it("corrupts case 1's first non-NULL value and nothing else; the original is untouched", () => {
    const original = file([
      { label: "a", columns: [{ name: "x", sqlServerType: "int" }, { name: "y", sqlServerType: "int" }], rows: [["∅", "n:1"]] },
      { label: "b", columns: [{ name: "x", sqlServerType: "int" }], rows: [["n:5"]] },
    ]);
    const { file: bad, what } = corruptExpected(original);
    expect(bad.cases[0].rows).toEqual([["∅", "n:2"]]);
    expect(bad.cases[1].rows).toEqual([["n:5"]]);
    expect(original.cases[0].rows).toEqual([["∅", "n:1"]]);
    expect(what).toContain("column y: n:1 -> n:2");
  });
  it("flips a state object's outcome", () => {
    expect(corruptExpected(file([{ label: "a", outcome: "completed", tables: {} }])).file.cases[0].outcome).toBe("raised");
    expect(corruptExpected(file([{ label: "a", outcome: "raised: x", tables: {} }])).file.cases[0].outcome).toBe("completed");
  });
  it("turns an expected declared result error into an expected completion with no rows", () => {
    const raised = file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }], raised: "raised: maximum recursion" }]);
    const { file: bad, what } = corruptExpected(raised);
    expect(bad.cases[0].raised).toBeUndefined();
    expect(bad.cases[0].rows).toEqual([]);
    expect(raised.cases[0].raised).toBe("raised: maximum recursion");
    expect(what).toContain('"raised: maximum recursion" -> "completed"');
  });
  it("adds an all-NULL row when there is no value to change", () => {
    const empty = file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }, { name: "y", sqlServerType: "int" }], rows: [] }]);
    expect(corruptExpected(empty).file.cases[0].rows).toEqual([["∅", "∅"]]);
    const nulls = file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }], rows: [["∅"]] }]);
    expect(corruptExpected(nulls).file.cases[0].rows).toEqual([["∅"], ["∅"]]);
  });
});
