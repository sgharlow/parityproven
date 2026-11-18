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
  it("changes a value inside a JSON document and keeps it valid JSON", () => {
    expect(corruptCell('s:{"Items":[{"id":1,"name":"a"}]}')).toBe('s:{"Items":[{"id":2,"name":"a"}]}');
    expect(corruptCell('s:[{"x":"q"}]')).toBe('s:[{"x":"qX"}]');
    expect(corruptCell('s:{"Items":[]}')).toBe('s:{"Items":[],"corrupted":"X"}');
    expect(corruptCell("s:[]")).toBe('s:["X"]');
    expect(corruptCell("s:{not json")).toBe("s:{not jsoX");   // not JSON: the ordinary text corruption
    for (const doc of ['{"a":[1,{"b":null}]}', '[true]']) JSON.parse(corruptCell(`s:${doc}`)!.slice(2));
  });
  it("moves a geography point along x, keeping it a valid point", () => {
    expect(corruptCell("g:POINT(-122.25 47.5)")).toBe("g:POINT(-121.25 47.5)");
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
  it("targets a named column: the first non-NULL value in the first case that has one, and says which case", () => {
    const cols = [{ name: "id", sqlServerType: "int" }, { name: "loc", sqlServerType: "nvarchar(max)" }];
    const f = file([
      { label: "a", columns: cols, rows: [["n:1", "∅"]] },
      { label: "b", columns: cols, rows: [["n:2", "∅"], ["n:3", "g:POINT(0.5 -1.75)"]] },
    ]);
    const r = corruptExpected(f, "loc");
    expect(r.caseIndex).toBe(1);
    expect(r.file.cases[1].rows).toEqual([["n:2", "∅"], ["n:3", "g:POINT(1.5 -1.75)"]]);
    expect(r.file.cases[0].rows).toEqual([["n:1", "∅"]]);
    expect(r.what).toContain("case 2 expected value row 2, column loc");
    expect(() => corruptExpected(f, "nope")).toThrow(/no result column/);
    expect(() => corruptExpected(file([{ label: "a", columns: cols, rows: [["n:1", "∅"]] }]), "loc")).toThrow(/no non-NULL value/);
  });
  it("untargeted controls corrupt case 1 (caseIndex 0)", () => {
    expect(corruptExpected(file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }], rows: [["n:1"]] }])).caseIndex).toBe(0);
  });
  it("adds an all-NULL row when there is no value to change", () => {
    const empty = file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }, { name: "y", sqlServerType: "int" }], rows: [] }]);
    expect(corruptExpected(empty).file.cases[0].rows).toEqual([["∅", "∅"]]);
    const nulls = file([{ label: "a", columns: [{ name: "x", sqlServerType: "int" }], rows: [["∅"]] }]);
    expect(corruptExpected(nulls).file.cases[0].rows).toEqual([["∅"], ["∅"]]);
  });
});
describe("corruptExpected on state objects", () => {
  it("--control-column changes the first non-NULL value of that column in a state table", () => {
    const f = file([
      { label: "empty", outcome: "completed", tables: { "w.t": { columns: ["A", "B"], rows: [] } } },
      { label: "rows", outcome: "completed", tables: { "w.t": { columns: ["A", "B"], rows: [["n:1", "∅"], ["n:2", "n:4.50"]] } } },
    ] as ExpectedFile["cases"]);
    const c = corruptExpected(f, "B");
    expect(c.caseIndex).toBe(1);
    expect(c.file.cases[1].tables!["w.t"].rows[1][1]).toBe("n:5.50");
    expect(f.cases[1].tables!["w.t"].rows[1][1]).toBe("n:4.50");   // the original is untouched
  });
  it("a case with state observation queries gets the first query value corrupted", () => {
    const f = file([{ label: "q", outcome: "completed", tables: {}, queries: [{ label: "next", columns: [{ name: "V", sqlServerType: "int" }], rows: [["n:11"]] }] }] as ExpectedFile["cases"]);
    const c = corruptExpected(f);
    expect(c.file.cases[0].queries![0].rows[0][0]).toBe("n:12");
    expect(c.file.cases[0].outcome).toBe("completed");
  });
});
